import { Injectable } from '@nestjs/common';
import { ModelConfigService } from '../shared/model-config/model-config.service';
import { ModelTier } from '../shared/model-config/model-config.types';
import {
  AnthropicClient,
  AnthropicMessageParams,
  AnthropicStreamEvent,
} from '../shared/anthropic-client/anthropic-client';
import { shapeError, ShapedError } from '../shared/api-error-handling';
import { EnvelopeBuilderService } from '../shared/envelope-builder/envelope-builder.service';
import { TurnEnvelope } from '../shared/envelope-builder/envelope-builder.types';
import { StreamResponseBuilderService } from '../shared/stream-response-builder/stream-response-builder.service';
import { SendMessageDto } from './dto/send-message.dto';

/** No env-configurable default elsewhere in the repo to defer to. */
const DEFAULT_MAX_TOKENS = 4096;

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
    private readonly streamResponseBuilder: StreamResponseBuilderService,
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

  private resolveModel(choice: ModelTier): string {
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

  private buildEnvelopeFromEvents(
    params: AnthropicMessageParams,
    events: AnthropicStreamEvent[],
  ): TurnEnvelope {
    const response = this.streamResponseBuilder.reconstructMessage(events);
    return this.envelopeBuilder.build(params, response);
  }
}
