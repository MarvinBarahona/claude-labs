import { Injectable, NotFoundException } from '@nestjs/common';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
} from '../shared/anthropic-client/anthropic-client';
import { ExternalApiError } from '../shared/api-error-handling';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { TurnEnvelope } from '../shared/envelope-builder/envelope-builder.types';
import { GithubClient } from '../shared/github-provider/github-client';
import { GithubIssue } from '../shared/github-provider/github-provider.types';
import { CachingLayerService } from '../shared/caching-layer/caching-layer.service';
import { RunDto } from './dto/run.dto';

/** No env-configurable default elsewhere in the repo to defer to. */
const DEFAULT_MAX_TOKENS = 4096;

/** One iteration = draft → refine → grade. */
const MAX_ITERATIONS = 3;

export type IssueCategory = 'bug' | 'feature-request' | 'question' | 'support';
export type GradingCriterion =
  'tone' | 'technical-accuracy' | 'policy-compliance';

const CRITERIA: GradingCriterion[] = [
  'tone',
  'technical-accuracy',
  'policy-compliance',
];

export interface IssueSummary {
  number: number;
  title: string;
}

export interface IssuesResponse {
  issues: IssueSummary[];
}

export interface GradingResult {
  criterion: GradingCriterion;
  pass: boolean;
  feedback: string;
}

/** One earlier request/response pair from this run's pipeline. */
export interface WorkflowGalleryCall {
  request: AnthropicMessageParams;
  response: AnthropicMessage;
}

export interface WorkflowGalleryEnvelope extends TurnEnvelope {
  calls: WorkflowGalleryCall[];
  route: IssueCategory;
  draft: string;
  grading: GradingResult[];
  iterations: number;
  passed: boolean;
  cache: { read: boolean; write: boolean };
}

const ROUTING_SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: ['bug', 'feature-request', 'question', 'support'],
    },
  },
  required: ['category'],
  additionalProperties: false,
} as const;

const GRADING_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    feedback: { type: 'string' },
  },
  required: ['pass', 'feedback'],
  additionalProperties: false,
} as const;

interface RoutingOutput {
  category: IssueCategory;
}

interface GradingOutput {
  pass: boolean;
  feedback: string;
}

/** Result of a draft-stage call, carrying its own user-message content so the refine call can replay it verbatim. */
interface DraftResult {
  text: string;
  userContent: string;
}

@Injectable()
export class WorkflowGalleryService {
  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly modelConfig: ModelConfigService,
    private readonly envelopeBuilder: EnvelopeBuilderService,
    private readonly githubClient: GithubClient,
    private readonly cachingLayer: CachingLayerService,
  ) {}

  async listIssues(): Promise<IssuesResponse> {
    const issues = await this.githubClient.getIssues({
      state: 'open',
      perPage: 100,
    });
    return {
      issues: issues.map((issue) => ({
        number: issue.number,
        title: issue.title,
      })),
    };
  }

  async run(dto: RunDto): Promise<WorkflowGalleryEnvelope> {
    const issues = await this.githubClient.getIssues({
      state: 'open',
      perPage: 100,
    });
    const issue = issues.find(
      (candidate) => candidate.number === dto.issueNumber,
    );
    if (!issue) {
      throw new NotFoundException(
        `No open issue found with number ${dto.issueNumber}`,
      );
    }

    const systemPrompt = this.buildSystemPrompt(issue);
    const allCalls: WorkflowGalleryCall[] = [];

    const route = await this.routeIssue(systemPrompt, allCalls);

    let iterations = 0;
    let feedback: string[] = [];
    let draft = '';
    let grading: GradingResult[] = [];
    let passed = false;

    for (;;) {
      iterations++;
      const drafted = await this.draftResponse(
        systemPrompt,
        route,
        feedback,
        allCalls,
      );
      draft = await this.refineResponse(
        systemPrompt,
        drafted.userContent,
        drafted.text,
        allCalls,
      );

      grading = await Promise.all(
        CRITERIA.map((criterion) =>
          this.gradeDraft(systemPrompt, draft, criterion, allCalls),
        ),
      );

      passed = grading.every((result) => result.pass);
      if (passed || iterations >= MAX_ITERATIONS) {
        break;
      }
      feedback = grading
        .filter((result) => !result.pass)
        .map((result) => result.feedback);
    }

    const lastCall = allCalls[allCalls.length - 1];
    const calls = allCalls.slice(0, -1);
    const envelopeBase = this.envelopeBuilder.build(
      lastCall.request,
      lastCall.response,
    );
    const cache = this.cachingLayer.readCacheStatus(envelopeBase.usage);

    return {
      ...envelopeBase,
      calls,
      route,
      draft,
      grading,
      iterations,
      passed,
      cache,
    };
  }

  private buildSystemPrompt(issue: GithubIssue): string {
    const body =
      issue.body && issue.body.trim().length > 0
        ? issue.body
        : '(no description provided)';
    return `You are triaging and drafting a response to a GitHub issue.\n\nIssue #${issue.number}: ${issue.title}\n\n${body}`;
  }

  private async routeIssue(
    systemPrompt: string,
    allCalls: WorkflowGalleryCall[],
  ): Promise<IssueCategory> {
    const params: AnthropicMessageParams = {
      model: this.modelConfig.getModel('classification'),
      max_tokens: DEFAULT_MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: 'Classify this GitHub issue into exactly one category.',
        },
      ],
      output_config: {
        format: { type: 'json_schema', schema: ROUTING_SCHEMA },
      },
    };

    const response = await this.anthropicClient.createMessage(params);
    allCalls.push({ request: params, response });
    const parsed = JSON.parse(
      this.parseTextBlock(response, 'routing'),
    ) as RoutingOutput;
    return parsed.category;
  }

  private async draftResponse(
    systemPrompt: string,
    route: IssueCategory,
    feedback: string[],
    allCalls: WorkflowGalleryCall[],
  ): Promise<DraftResult> {
    const userContent = this.buildDraftUserContent(route, feedback);
    const params = this.cachingLayer.markBreakpoints(
      {
        model: this.modelConfig.getModel('default'),
        max_tokens: DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      },
      [{ region: 'system' }],
    );

    const response = await this.anthropicClient.createMessage(params);
    allCalls.push({ request: params, response });
    const text = this.parseTextBlock(response, 'draft');
    return { text, userContent };
  }

  private buildDraftUserContent(
    route: IssueCategory,
    feedback: string[],
  ): string {
    const base = `Draft a reply to this issue, categorized as **${route}**. Write a clear, helpful response a maintainer could send as-is.`;
    if (feedback.length === 0) {
      return base;
    }
    const feedbackList = feedback.map((item) => `- ${item}`).join('\n');
    return `${base}\n\nThe previous draft did not pass review. Revise it to address this feedback:\n${feedbackList}`;
  }

  private async refineResponse(
    systemPrompt: string,
    draftUserContent: string,
    draftText: string,
    allCalls: WorkflowGalleryCall[],
  ): Promise<string> {
    const params = this.cachingLayer.markBreakpoints(
      {
        model: this.modelConfig.getModel('default'),
        max_tokens: DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages: [
          { role: 'user', content: draftUserContent },
          { role: 'assistant', content: draftText },
          {
            role: 'user',
            content:
              'Polish and refine this draft for clarity, tone, and completeness. Reply with only the refined response text.',
          },
        ],
      },
      [{ region: 'system' }],
    );

    const response = await this.anthropicClient.createMessage(params);
    allCalls.push({ request: params, response });
    return this.parseTextBlock(response, 'refine');
  }

  private async gradeDraft(
    systemPrompt: string,
    refinedDraft: string,
    criterion: GradingCriterion,
    allCalls: WorkflowGalleryCall[],
  ): Promise<GradingResult> {
    const params = this.cachingLayer.markBreakpoints(
      {
        model: this.modelConfig.getModel('default'),
        max_tokens: DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Grade the following drafted reply strictly against the "${criterion}" criterion. Reply with whether it passes and, if not, actionable feedback.\n\nDraft:\n${refinedDraft}`,
          },
        ],
        output_config: {
          format: { type: 'json_schema', schema: GRADING_SCHEMA },
        },
      },
      [{ region: 'system' }],
    );

    const response = await this.anthropicClient.createMessage(params);
    allCalls.push({ request: params, response });
    const parsed = JSON.parse(
      this.parseTextBlock(response, `${criterion} grading`),
    ) as GradingOutput;
    return { criterion, pass: parsed.pass, feedback: parsed.feedback };
  }

  private parseTextBlock(response: AnthropicMessage, stage: string): string {
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
        `${stage} response did not include a text block to parse`,
      );
    }
    return textBlock.text;
  }
}
