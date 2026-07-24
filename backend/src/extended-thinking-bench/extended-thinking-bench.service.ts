import { Injectable, NotFoundException } from '@nestjs/common';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
} from '../shared/anthropic-client/anthropic-client';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { TurnEnvelope } from '../shared/envelope-builder/envelope-builder.types';
import { GithubClient } from '../shared/github-provider/github-client';
import { GithubIssue } from '../shared/github-provider/github-provider.types';
import { RunDto } from './dto/run.dto';

export type ThinkingRunLabel =
  'thinking-off' | 'thinking-medium' | 'thinking-high';

/** Fixed comparison set — deliberately hardcoded rather than going through ModelConfigService.getThinkingEffort(), which returns one configured default, not several levels to compare at once (see the plan's "A deliberate non-dependency"). */
const RUN_LABELS: ThinkingRunLabel[] = [
  'thinking-off',
  'thinking-medium',
  'thinking-high',
];

export interface IssueSummary {
  number: number;
  title: string;
}

export interface IssuesResponse {
  issues: IssueSummary[];
}

export interface ExtendedThinkingBenchRun {
  label: ThinkingRunLabel;
  envelope: TurnEnvelope;
  latencyMs: number;
  answer: string;
  reasoningTrace: string | null;
}

export interface ExtendedThinkingBenchResult {
  issue: IssueSummary;
  runs: ExtendedThinkingBenchRun[];
}

type MessageContentBlock = AnthropicMessage['content'][number];

@Injectable()
export class ExtendedThinkingBenchService {
  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly modelConfig: ModelConfigService,
    private readonly envelopeBuilder: EnvelopeBuilderService,
    private readonly githubClient: GithubClient,
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

  async run(dto: RunDto): Promise<ExtendedThinkingBenchResult> {
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

    const prompt = this.buildPrompt(issue);
    const runs = await Promise.all(
      RUN_LABELS.map((label) => this.runOne(label, prompt)),
    );

    return {
      issue: { number: issue.number, title: issue.title },
      runs,
    };
  }

  private buildPrompt(issue: GithubIssue): string {
    const body =
      issue.body && issue.body.trim().length > 0
        ? issue.body
        : '(no description provided)';
    return `Draft a reply to this GitHub issue. Write a clear, thorough response a maintainer could send as-is, reasoning carefully about the right course of action before answering.\n\nIssue #${issue.number}: ${issue.title}\n\n${body}`;
  }

  private paramsFor(
    label: ThinkingRunLabel,
    prompt: string,
  ): AnthropicMessageParams {
    const base: AnthropicMessageParams = {
      model: this.modelConfig.getModel('default'),
      max_tokens: this.modelConfig.getDefaultMaxTokens(),
      messages: [{ role: 'user', content: prompt }],
    };

    if (label === 'thinking-off') {
      return base;
    }

    return {
      ...base,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: {
        effort: label === 'thinking-medium' ? 'medium' : 'high',
      },
    };
  }

  private async runOne(
    label: ThinkingRunLabel,
    prompt: string,
  ): Promise<ExtendedThinkingBenchRun> {
    const params = this.paramsFor(label, prompt);
    const startedAt = Date.now();
    const response = await this.anthropicClient.createMessage(params);
    const latencyMs = Date.now() - startedAt;
    const envelope = this.envelopeBuilder.build(params, response);

    return {
      label,
      envelope,
      latencyMs,
      answer: this.extractAnswer(response),
      reasoningTrace: this.extractReasoningTrace(response),
    };
  }

  private extractAnswer(response: AnthropicMessage): string {
    return response.content
      .filter(
        (block): block is Extract<MessageContentBlock, { type: 'text' }> =>
          block.type === 'text',
      )
      .map((block) => block.text)
      .join('');
  }

  private extractReasoningTrace(response: AnthropicMessage): string | null {
    const thinkingBlocks = response.content.filter(
      (block): block is Extract<MessageContentBlock, { type: 'thinking' }> =>
        block.type === 'thinking',
    );
    if (thinkingBlocks.length === 0) {
      return null;
    }
    return thinkingBlocks.map((block) => block.thinking).join('\n\n');
  }
}
