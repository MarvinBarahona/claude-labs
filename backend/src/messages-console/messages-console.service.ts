import { Injectable } from '@nestjs/common';
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
import { ModelChoice, SendMessageDto } from './dto/send-message.dto';

/** No env-configurable default elsewhere in the repo to defer to. */
const DEFAULT_MAX_TOKENS = 4096;

type MessageContentBlock = AnthropicMessage['content'][number];

/** `message_start`'s own `content` is always `[]` in real streaming — reassembles it from the delta events instead. */
function accumulateStreamedContent(
  events: readonly AnthropicStreamEvent[],
): MessageContentBlock[] {
  const blocksByIndex = new Map<number, MessageContentBlock>();

  for (const event of events) {
    if (event.type === 'content_block_start') {
      blocksByIndex.set(event.index, { ...event.content_block });
      continue;
    }
    if (event.type === 'content_block_delta') {
      const block = blocksByIndex.get(event.index);
      if (block && block.type === 'text' && event.delta.type === 'text_delta') {
        block.text += event.delta.text;
      }
    }
  }

  return [...blocksByIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, block]) => block);
}

/** One frame of the `/messages-console/turn` SSE stream, already shaped for the controller to serialize verbatim. */
export type MessagesConsoleStreamFrame =
  | { kind: 'stream-event'; event: AnthropicStreamEvent }
  | { kind: 'turn-complete'; envelope: TurnEnvelope }
  | { kind: 'error'; shaped: ShapedError };

@Injectable()
export class MessagesConsoleService {
  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly modelConfig: ModelConfigService,
    private readonly envelopeBuilder: EnvelopeBuilderService,
  ) {}

  async createTurn(dto: SendMessageDto): Promise<TurnEnvelope> {
    const params = this.buildMessageParams(dto);
    const response = await this.anthropicClient.createMessage(params);
    return this.envelopeBuilder.build(params, response);
  }

  async *streamTurn(
    dto: SendMessageDto,
  ): AsyncGenerator<MessagesConsoleStreamFrame> {
    const params = this.buildMessageParams(dto);
    const events: AnthropicStreamEvent[] = [];
    try {
      for await (const event of this.anthropicClient.streamMessage(params)) {
        events.push(event);
        yield { kind: 'stream-event', event };
      }
      yield {
        kind: 'turn-complete',
        envelope: this.buildEnvelopeFromEvents(params, events),
      };
    } catch (exception) {
      yield { kind: 'error', shaped: shapeError(exception) };
    }
  }

  private resolveModel(choice: ModelChoice): string {
    return this.modelConfig.getModel(choice);
  }

  private buildMessageParams(dto: SendMessageDto): AnthropicMessageParams {
    const params: AnthropicMessageParams = {
      model: this.resolveModel(dto.modelChoice),
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: dto.messages.map((message) => ({
        role: message.role,
        content: message.text,
      })),
    };

    if (dto.systemPrompt) {
      params.system = dto.systemPrompt;
    }
    if (dto.temperature !== undefined) {
      params.temperature = dto.temperature;
    }

    return params;
  }

  /** Reconstructs a `Message`-shaped envelope from the raw stream events. */
  private buildEnvelopeFromEvents(
    params: AnthropicMessageParams,
    events: AnthropicStreamEvent[],
  ): TurnEnvelope {
    const startEvent = events.find((event) => event.type === 'message_start');
    if (!startEvent || startEvent.type !== 'message_start') {
      throw new Error(
        'Streamed response completed without a message_start event',
      );
    }

    const deltaEvent = events.find((event) => event.type === 'message_delta');

    const response: AnthropicMessage = {
      ...startEvent.message,
      content: accumulateStreamedContent(events),
      ...(deltaEvent && deltaEvent.type === 'message_delta'
        ? {
            stop_reason: deltaEvent.delta.stop_reason,
            stop_sequence: deltaEvent.delta.stop_sequence,
            usage: {
              ...startEvent.message.usage,
              input_tokens:
                deltaEvent.usage.input_tokens ??
                startEvent.message.usage.input_tokens,
              output_tokens:
                deltaEvent.usage.output_tokens ??
                startEvent.message.usage.output_tokens,
              cache_creation_input_tokens:
                deltaEvent.usage.cache_creation_input_tokens ??
                startEvent.message.usage.cache_creation_input_tokens,
              cache_read_input_tokens:
                deltaEvent.usage.cache_read_input_tokens ??
                startEvent.message.usage.cache_read_input_tokens,
            },
          }
        : {}),
    };

    return this.envelopeBuilder.build(params, response);
  }
}
