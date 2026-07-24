import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../shared/config/config.service';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
} from '../shared/anthropic-client/anthropic-client';
import { ExternalApiError } from '../shared/api-error-handling';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { TurnEnvelope } from '../shared/envelope-builder/envelope-builder.types';
import { DeepwikiConnectorService } from '../shared/deepwiki-connector/deepwiki-connector.service';
import { ResearchQuestionDto } from './dto/research-question.dto';

const DEFAULT_MAX_SEARCHES = 5;

const RESEARCH_BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['claim', 'source'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'findings'],
  additionalProperties: false,
} as const;

export interface ResearchBrief {
  summary: string;
  findings: { claim: string; source: string }[];
}

export interface ResearchEnvelope extends TurnEnvelope {
  brief: ResearchBrief;
  searchesPerformed: number;
  mcpCallsPerformed: number;
}

interface RawBlock {
  type: string;
  name?: string;
}

@Injectable()
export class WebRepoResearchReporterService {
  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly modelConfig: ModelConfigService,
    private readonly envelopeBuilder: EnvelopeBuilderService,
    private readonly deepwikiConnector: DeepwikiConnectorService,
    private readonly appConfig: AppConfigService,
  ) {}

  async run(dto: ResearchQuestionDto): Promise<ResearchEnvelope> {
    const maxSearches = dto.maxSearches ?? DEFAULT_MAX_SEARCHES;
    const repo = this.appConfig.githubTargetRepo;
    const deepwiki = this.deepwikiConnector.buildRequestFragment();

    const params = {
      model: this.modelConfig.getModel('default'),
      max_tokens: this.modelConfig.getDefaultMaxTokens(),
      system:
        `You are researching the GitHub repository ${repo} and its ecosystem. ` +
        `Use the web search tool for current, external information and the DeepWiki ` +
        `tools (read_wiki_structure, read_wiki_contents, ask_question) for questions ` +
        `about ${repo}'s own codebase and documentation. Answer only the user's ` +
        `research question, citing your sources. If the user asks about anything ` +
        `unrelated to ${repo} or its ecosystem, politely decline and explain that ` +
        'you can only answer research questions about this repository.',
      messages: [{ role: 'user', content: dto.question }],
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: maxSearches,
        },
        ...deepwiki.tools,
      ],
      mcp_servers: deepwiki.mcpServers,
      output_config: {
        format: { type: 'json_schema', schema: RESEARCH_BRIEF_SCHEMA },
      },
    } as unknown as AnthropicMessageParams;

    const response = await this.anthropicClient.createMessage(
      params,
      deepwiki.betas,
    );

    const textBlock = response.content.find(
      (
        block,
      ): block is Extract<
        AnthropicMessage['content'][number],
        { type: 'text' }
      > => block.type === 'text',
    );
    if (!textBlock) {
      throw new ExternalApiError(
        'anthropic',
        'Structured response did not include a text block to parse',
      );
    }

    const brief = JSON.parse(textBlock.text) as ResearchBrief;

    return {
      ...this.envelopeBuilder.build(params, response),
      brief,
      searchesPerformed: this.countSearches(response),
      mcpCallsPerformed: this.countMcpCalls(response),
    };
  }

  private countSearches(response: AnthropicMessage): number {
    const blocks = response.content as unknown as RawBlock[];
    return blocks.filter(
      (block) =>
        block.type === 'server_tool_use' && block.name === 'web_search',
    ).length;
  }

  private countMcpCalls(response: AnthropicMessage): number {
    const blocks = response.content as unknown as RawBlock[];
    return blocks.filter((block) => block.type === 'mcp_tool_use').length;
  }
}
