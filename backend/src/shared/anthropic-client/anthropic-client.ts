import Anthropic from '@anthropic-ai/sdk';

export type AnthropicMessage = Anthropic.Messages.Message;
export type AnthropicMessageParams = Anthropic.Messages.MessageCreateParams;
export type AnthropicStreamEvent = Anthropic.Messages.RawMessageStreamEvent;

/** DI token every consumer depends on instead of the concrete `Anthropic` SDK client. */
export abstract class AnthropicClient {
  abstract createMessage(
    params: AnthropicMessageParams,
  ): Promise<AnthropicMessage>;
  abstract streamMessage(
    params: AnthropicMessageParams,
  ): AsyncIterable<AnthropicStreamEvent>;
  abstract uploadFile(
    bytes: Buffer,
    mediaType: string,
  ): Promise<{ id: string }>;
}
