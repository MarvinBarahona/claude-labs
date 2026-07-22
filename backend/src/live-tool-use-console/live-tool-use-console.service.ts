import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
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
import { OpenMeteoClient } from './open-meteo-client';
import { TurnDto } from './dto/turn.dto';

/** No env-configurable default elsewhere in the repo to defer to. */
const DEFAULT_MAX_TOKENS = 4096;

/** Keeps the console demonstrating the tool-use loop rather than drifting into a general-purpose chat interface. */
const SYSTEM_PROMPT =
  "You can only discuss two things: the weather (via the get_weather tool) and this app's " +
  'configured GitHub repository (via the get_repo_stats tool). If the user asks about anything ' +
  'else, politely decline and explain that you can only answer questions about the repo or the weather.';

type MessageContentBlock = AnthropicMessage['content'][number];
type ToolUseBlock = Extract<MessageContentBlock, { type: 'tool_use' }>;
type AnthropicTool = Anthropic.Messages.Tool;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;

/** One earlier request/response pair in a multi-call tool-use loop. */
export interface TurnCall {
  request: AnthropicMessageParams;
  response: AnthropicMessage;
}

/** The non-streaming envelope, extended with every earlier call when the loop ran more than once. */
export type LiveToolUseEnvelope = TurnEnvelope & { calls?: TurnCall[] };

/** Both tools are offered on every call — this lab demonstrates the tool-use loop itself, not tool selection. */
const TOOLS: AnthropicTool[] = [
  {
    name: 'get_weather',
    description: 'Get the current weather conditions for a named location.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description:
            'City or place name, e.g. "Tokyo" or "San Francisco, CA"',
        },
      },
      required: ['location'],
    },
  },
  {
    name: 'get_repo_stats',
    description:
      "Get open issue count, latest commit, and latest release for the app's configured GitHub repository.",
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

interface ExecutedTool {
  toolResultBlock: ToolResultBlockParam;
  displayResult: unknown;
  isError: boolean;
}

/** One frame of the `/live-tool-use-console/turn` SSE stream, already shaped for the controller to serialize verbatim. */
export type LiveToolUseConsoleStreamFrame =
  | { kind: 'stream-event'; event: AnthropicStreamEvent }
  | { kind: 'tool-call-start'; name: string; input: unknown }
  | {
      kind: 'tool-call-result';
      name: string;
      result: unknown;
      isError: boolean;
    }
  | { kind: 'turn-complete'; envelope: LiveToolUseEnvelope }
  | { kind: 'error'; shaped: ShapedError };

@Injectable()
export class LiveToolUseConsoleService {
  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly modelConfig: ModelConfigService,
    private readonly envelopeBuilder: EnvelopeBuilderService,
    private readonly streamResponseBuilder: StreamResponseBuilderService,
    private readonly githubClient: GithubClient,
    private readonly openMeteoClient: OpenMeteoClient,
  ) {}

  async createTurn(dto: TurnDto): Promise<LiveToolUseEnvelope> {
    let params = this.buildMessageParams(dto);
    const calls: TurnCall[] = [];

    for (;;) {
      const response = await this.anthropicClient.createMessage(params);
      if (response.stop_reason !== 'tool_use') {
        const envelope: LiveToolUseEnvelope = this.envelopeBuilder.build(
          params,
          response,
        );
        if (calls.length > 0) {
          envelope.calls = calls;
        }
        return envelope;
      }

      calls.push({ request: params, response });
      const toolUseBlocks = this.toolUseBlocksOf(response);
      const executed = await Promise.all(
        toolUseBlocks.map((block) => this.executeTool(block)),
      );
      params = this.appendToolResults(
        params,
        response,
        executed.map((result) => result.toolResultBlock),
      );
    }
  }

  async *streamTurn(
    dto: TurnDto,
  ): AsyncGenerator<LiveToolUseConsoleStreamFrame> {
    let params = this.buildMessageParams(dto);
    const calls: TurnCall[] = [];

    try {
      for (;;) {
        const events: AnthropicStreamEvent[] = [];
        for await (const event of this.anthropicClient.streamMessage(params)) {
          events.push(event);
          yield { kind: 'stream-event', event };
        }
        const response = this.buildMessageFromEvents(events);

        if (response.stop_reason !== 'tool_use') {
          const envelope: LiveToolUseEnvelope = this.envelopeBuilder.build(
            params,
            response,
          );
          if (calls.length > 0) {
            envelope.calls = calls;
          }
          yield { kind: 'turn-complete', envelope };
          return;
        }

        calls.push({ request: params, response });
        const toolResultBlocks: ToolResultBlockParam[] = [];
        for (const block of this.toolUseBlocksOf(response)) {
          yield {
            kind: 'tool-call-start',
            name: block.name,
            input: block.input,
          };
          const executed = await this.executeTool(block);
          toolResultBlocks.push(executed.toolResultBlock);
          yield {
            kind: 'tool-call-result',
            name: block.name,
            result: executed.displayResult,
            isError: executed.isError,
          };
        }
        params = this.appendToolResults(params, response, toolResultBlocks);
      }
    } catch (exception) {
      yield { kind: 'error', shaped: shapeError(exception) };
    }
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
    if (block.name === 'get_weather') {
      return this.executeGetWeather(block);
    }
    return this.executeGetRepoStats(block);
  }

  private async executeGetWeather(block: ToolUseBlock): Promise<ExecutedTool> {
    const location = (block.input as { location: string }).location;
    const weather = await this.openMeteoClient.getWeather(location);

    if (weather === null) {
      const message = `No location found matching "${location}"`;
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

    return {
      toolResultBlock: {
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(weather),
      },
      displayResult: weather,
      isError: false,
    };
  }

  private async executeGetRepoStats(
    block: ToolUseBlock,
  ): Promise<ExecutedTool> {
    const [issues, commits, releases] = await Promise.all([
      this.githubClient.getIssues({ state: 'open' }),
      this.githubClient.getCommits(),
      this.githubClient.getReleases(),
    ]);

    const stats = {
      openIssueCount: issues.length,
      latestCommit: commits[0]
        ? {
            sha: commits[0].sha,
            message: commits[0].message,
            date: commits[0].date,
          }
        : null,
      latestRelease: releases[0]
        ? {
            tagName: releases[0].tagName,
            publishedAt: releases[0].publishedAt,
          }
        : null,
    };

    return {
      toolResultBlock: {
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(stats),
      },
      displayResult: stats,
      isError: false,
    };
  }

  private buildMessageParams(dto: TurnDto): AnthropicMessageParams {
    return {
      model: this.modelConfig.getModel(dto.modelChoice),
      max_tokens: DEFAULT_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: dto.question }],
      tools: TOOLS,
    };
  }

  private buildMessageFromEvents(
    events: AnthropicStreamEvent[],
  ): AnthropicMessage {
    return this.streamResponseBuilder.reconstructMessage(events);
  }
}
