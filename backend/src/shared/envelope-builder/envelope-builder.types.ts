import {
  AnthropicMessage,
  AnthropicMessageParams,
} from '../anthropic-client/anthropic-client';

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface TurnEnvelope {
  request: AnthropicMessageParams;
  response: AnthropicMessage;
  usage: TurnUsage;
  stopReason: string | null;
}
