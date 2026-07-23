import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfigService } from '../shared/config/config.service';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
  AnthropicStreamEvent,
} from '../shared/anthropic-client/anthropic-client';
import { shapeError, ShapedError } from '../shared/api-error-handling';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { TurnEnvelope } from '../shared/envelope-builder/envelope-builder.types';
import { StreamResponseBuilderService } from '../shared/stream-response-builder/stream-response-builder.service';
import { GithubClient } from '../shared/github-provider/github-client';
import { DeepwikiConnectorService } from '../shared/deepwiki-connector/deepwiki-connector.service';
import { RunDto } from './dto/run.dto';

/** No env-configurable default elsewhere in the repo to defer to. */
const DEFAULT_MAX_TOKENS = 4096;

/** Backend-executed (custom) tool calls only — an mcp_tool_use never counts toward this, since it resolves inline and never advances the loop. */
const ITERATION_CAP = 10;

type MessageContentBlock = AnthropicMessage['content'][number];
type ToolUseBlock = Extract<MessageContentBlock, { type: 'tool_use' }>;
type AnthropicTool = Anthropic.Messages.Tool;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;

type CustomToolName = 'list_files' | 'read_file' | 'search';
export type AgentPlaygroundToolName = CustomToolName | 'ask_deepwiki';

const CUSTOM_TOOLS: AnthropicTool[] = [
  {
    name: 'list_files',
    description:
      "List files in the repository's file tree, optionally filtered to paths starting with a given prefix.",
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Optional path prefix to filter the file tree to, e.g. "src/app". Omit to list the whole tree.',
        },
      },
    },
  },
  {
    name: 'read_file',
    description:
      'Read the full text content of a single file in the repository, by its exact path.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The exact file path to read, e.g. "README.md"',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search',
    description:
      "Case-insensitive substring search over the repository's file paths (not file contents).",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Substring to search for within file paths',
        },
      },
      required: ['query'],
    },
  },
];

/** One earlier request/response pair in the loop. */
export interface TurnCall {
  request: AnthropicMessageParams;
  response: AnthropicMessage;
}

/** One tool call anywhere in the run, custom or MCP alike, in the order it happened. */
export interface ToolActivityEntry {
  tool: AgentPlaygroundToolName;
  input: unknown;
  result: unknown;
  isError: boolean;
}

export interface AgentPlaygroundEnvelope extends TurnEnvelope {
  calls: TurnCall[];
  toolActivity: ToolActivityEntry[];
  hitIterationCap: boolean;
  finalAnswer: string;
}

interface ExecutedTool {
  toolResultBlock: ToolResultBlockParam;
  displayResult: unknown;
  isError: boolean;
}

/** Loosely-typed view of a raw content block — `mcp_tool_use`/`mcp_tool_result` aren't part of the SDK's stable `ContentBlock` union yet. */
interface RawBlock {
  type: string;
  id?: string;
  tool_use_id?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
}

export type AgentPlaygroundStreamFrame =
  | { kind: 'stream-event'; event: AnthropicStreamEvent }
  | { kind: 'tool-call-start'; name: string; input: unknown }
  | {
      kind: 'tool-call-result';
      name: string;
      result: unknown;
      isError: boolean;
    }
  | { kind: 'turn-complete'; envelope: AgentPlaygroundEnvelope }
  | { kind: 'error'; shaped: ShapedError };

function buildSystemPrompt(repo: string): string {
  return (
    `You are investigating the GitHub repository ${repo}. Your goal is to figure out ` +
    'what this repository does and how it is structured. Decide your own steps using the ' +
    "tools available to you: list_files and search explore the repository's file tree, " +
    "read_file reads one file's full contents, and ask_deepwiki lets you ask questions " +
    "about the repository's own generated documentation. There is no fixed procedure to " +
    'follow — choose whichever tools, and however many calls, actually help you understand ' +
    'the repository. Before concluding, inspect your own findings: re-read a file or ' +
    're-check a prior tool result if doing so would confirm or correct what you have ' +
    'learned, rather than guessing. When you are confident in your understanding, reply ' +
    'with a concise summary of what the repository does and how it is structured.'
  );
}

@Injectable()
export class AgentPlaygroundService {
  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly modelConfig: ModelConfigService,
    private readonly envelopeBuilder: EnvelopeBuilderService,
    private readonly streamResponseBuilder: StreamResponseBuilderService,
    private readonly githubClient: GithubClient,
    private readonly deepwikiConnector: DeepwikiConnectorService,
    private readonly appConfig: AppConfigService,
  ) {}

  async run(dto: RunDto): Promise<AgentPlaygroundEnvelope> {
    void dto;
    let params = this.buildMessageParams();
    const calls: TurnCall[] = [];
    const toolActivity: ToolActivityEntry[] = [];
    let executedCustomToolCalls = 0;

    for (;;) {
      const response = await this.anthropicClient.createMessage(
        params,
        this.betas(),
      );
      this.recordMcpActivity(response, toolActivity);

      const toolUseBlocks = this.toolUseBlocksOf(response);
      const hitCap = executedCustomToolCalls >= ITERATION_CAP;

      if (
        response.stop_reason !== 'tool_use' ||
        toolUseBlocks.length === 0 ||
        hitCap
      ) {
        return this.buildEnvelope(
          params,
          response,
          calls,
          toolActivity,
          hitCap &&
            response.stop_reason === 'tool_use' &&
            toolUseBlocks.length > 0,
        );
      }

      calls.push({ request: params, response });
      const executed = await Promise.all(
        toolUseBlocks.map((block) => this.executeTool(block)),
      );
      executedCustomToolCalls += toolUseBlocks.length;
      this.recordCustomActivity(toolUseBlocks, executed, toolActivity);
      params = this.appendToolResults(
        params,
        response,
        executed.map((result) => result.toolResultBlock),
      );
    }
  }

  async *streamRun(dto: RunDto): AsyncGenerator<AgentPlaygroundStreamFrame> {
    void dto;
    let params = this.buildMessageParams();
    const calls: TurnCall[] = [];
    const toolActivity: ToolActivityEntry[] = [];
    let executedCustomToolCalls = 0;

    try {
      for (;;) {
        const events: AnthropicStreamEvent[] = [];
        for await (const event of this.anthropicClient.streamMessage(
          params,
          this.betas(),
        )) {
          events.push(event);
          yield { kind: 'stream-event', event };
        }
        const response = this.streamResponseBuilder.reconstructMessage(events);
        this.recordMcpActivity(response, toolActivity);

        const toolUseBlocks = this.toolUseBlocksOf(response);
        const hitCap = executedCustomToolCalls >= ITERATION_CAP;

        if (
          response.stop_reason !== 'tool_use' ||
          toolUseBlocks.length === 0 ||
          hitCap
        ) {
          const envelope = this.buildEnvelope(
            params,
            response,
            calls,
            toolActivity,
            hitCap &&
              response.stop_reason === 'tool_use' &&
              toolUseBlocks.length > 0,
          );
          yield { kind: 'turn-complete', envelope };
          return;
        }

        calls.push({ request: params, response });
        const toolResultBlocks: ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
          yield {
            kind: 'tool-call-start',
            name: block.name,
            input: block.input,
          };
          const executed = await this.executeTool(block);
          toolResultBlocks.push(executed.toolResultBlock);
          toolActivity.push({
            tool: block.name as AgentPlaygroundToolName,
            input: block.input,
            result: executed.displayResult,
            isError: executed.isError,
          });
          yield {
            kind: 'tool-call-result',
            name: block.name,
            result: executed.displayResult,
            isError: executed.isError,
          };
        }
        executedCustomToolCalls += toolUseBlocks.length;
        params = this.appendToolResults(params, response, toolResultBlocks);
      }
    } catch (exception) {
      yield { kind: 'error', shaped: shapeError(exception) };
    }
  }

  private buildEnvelope(
    params: AnthropicMessageParams,
    response: AnthropicMessage,
    calls: TurnCall[],
    toolActivity: ToolActivityEntry[],
    hitIterationCap: boolean,
  ): AgentPlaygroundEnvelope {
    return {
      ...this.envelopeBuilder.build(params, response),
      calls,
      toolActivity,
      hitIterationCap,
      finalAnswer: this.extractFinalAnswer(response),
    };
  }

  private recordMcpActivity(
    response: AnthropicMessage,
    toolActivity: ToolActivityEntry[],
  ): void {
    const blocks = response.content as unknown as RawBlock[];
    for (const block of blocks) {
      if (block.type !== 'mcp_tool_use') {
        continue;
      }
      const resultBlock = blocks.find(
        (candidate) =>
          candidate.type === 'mcp_tool_result' &&
          candidate.tool_use_id === block.id,
      );
      toolActivity.push({
        tool: 'ask_deepwiki',
        input: block.input,
        result: resultBlock?.content ?? null,
        isError: Boolean(resultBlock?.is_error),
      });
    }
  }

  private recordCustomActivity(
    toolUseBlocks: ToolUseBlock[],
    executed: ExecutedTool[],
    toolActivity: ToolActivityEntry[],
  ): void {
    toolUseBlocks.forEach((block, index) => {
      toolActivity.push({
        tool: block.name as AgentPlaygroundToolName,
        input: block.input,
        result: executed[index].displayResult,
        isError: executed[index].isError,
      });
    });
  }

  private toolUseBlocksOf(response: AnthropicMessage): ToolUseBlock[] {
    return response.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use',
    );
  }

  /** Reassigns rather than mutates `params` — each earlier `calls` entry must keep the request snapshot it was actually sent with. */
  private appendToolResults(
    params: AnthropicMessageParams,
    response: AnthropicMessage,
    toolResultBlocks: ToolResultBlockParam[],
  ): AnthropicMessageParams {
    return {
      ...params,
      messages: [
        ...params.messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResultBlocks },
      ],
    };
  }

  private async executeTool(block: ToolUseBlock): Promise<ExecutedTool> {
    switch (block.name) {
      case 'list_files':
        return this.executeListFiles(block);
      case 'read_file':
        return this.executeReadFile(block);
      case 'search':
        return this.executeSearch(block);
      default:
        throw new Error(`Unknown tool: ${block.name}`);
    }
  }

  private async executeListFiles(block: ToolUseBlock): Promise<ExecutedTool> {
    const prefix = (block.input as { path?: string }).path;
    const tree = await this.githubClient.getFileTree();
    const filtered = prefix
      ? tree.filter((entry) => entry.path.startsWith(prefix))
      : tree;
    return {
      toolResultBlock: {
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(filtered),
      },
      displayResult: filtered,
      isError: false,
    };
  }

  private async executeSearch(block: ToolUseBlock): Promise<ExecutedTool> {
    const query = (block.input as { query: string }).query.toLowerCase();
    const tree = await this.githubClient.getFileTree();
    const matches = tree.filter((entry) =>
      entry.path.toLowerCase().includes(query),
    );
    return {
      toolResultBlock: {
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(matches),
      },
      displayResult: matches,
      isError: false,
    };
  }

  /** A not-found (or otherwise unreadable) path is a resolvable-but-failed lookup, not a transport failure — same pattern as Live Tool-Use Console's not-found-location case. */
  private async executeReadFile(block: ToolUseBlock): Promise<ExecutedTool> {
    const path = (block.input as { path: string }).path;
    try {
      const file = await this.githubClient.getFileContent(path);
      return {
        toolResultBlock: {
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(file),
        },
        displayResult: file,
        isError: false,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Could not read "${path}"`;
      return {
        toolResultBlock: {
          type: 'tool_result',
          tool_use_id: block.id,
          content: message,
          is_error: true,
        },
        displayResult: message,
        isError: true,
      };
    }
  }

  private extractFinalAnswer(response: AnthropicMessage): string {
    return response.content
      .filter(
        (block): block is Extract<MessageContentBlock, { type: 'text' }> =>
          block.type === 'text',
      )
      .map((block) => block.text)
      .join('');
  }

  private betas(): string[] {
    return this.deepwikiConnector.buildRequestFragment().betas;
  }

  private buildMessageParams(): AnthropicMessageParams {
    const deepwiki = this.deepwikiConnector.buildRequestFragment();
    return {
      model: this.modelConfig.getModel('default'),
      max_tokens: DEFAULT_MAX_TOKENS,
      system: buildSystemPrompt(this.appConfig.githubTargetRepo),
      messages: [{ role: 'user', content: 'Begin your investigation.' }],
      tools: [...CUSTOM_TOOLS, ...deepwiki.tools],
      mcp_servers: deepwiki.mcpServers,
    } as unknown as AnthropicMessageParams;
  }
}
