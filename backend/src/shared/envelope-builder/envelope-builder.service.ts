import { Injectable } from '@nestjs/common';
import {
  AnthropicMessage,
  AnthropicMessageParams,
} from '../anthropic-client/anthropic-client';
import { TurnEnvelope } from './envelope-builder.types';

@Injectable()
export class EnvelopeBuilderService {
  build(
    params: AnthropicMessageParams,
    response: AnthropicMessage,
  ): TurnEnvelope {
    return {
      request: params,
      response,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationInputTokens:
          response.usage.cache_creation_input_tokens ?? undefined,
        cacheReadInputTokens:
          response.usage.cache_read_input_tokens ?? undefined,
      },
      stopReason: response.stop_reason,
    };
  }
}
