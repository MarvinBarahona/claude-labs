import Anthropic from '@anthropic-ai/sdk';

export type AnthropicMessage = Anthropic.Messages.Message;
export type AnthropicMessageParams = Anthropic.Messages.MessageCreateParams;
export type AnthropicStreamEvent = Anthropic.Messages.RawMessageStreamEvent;

/** DI token every consumer depends on instead of the concrete `Anthropic` SDK client. */
export abstract class AnthropicClient {
  /** `betas`, when non-empty, routes the call through `client.beta.messages.create()` instead of the stable endpoint — needed for a beta-only content shape (e.g. a Files-API `file_id` source). */
  abstract createMessage(
    params: AnthropicMessageParams,
    betas?: string[],
  ): Promise<AnthropicMessage>;
  abstract streamMessage(
    params: AnthropicMessageParams,
    betas?: string[],
  ): AsyncIterable<AnthropicStreamEvent>;
  abstract uploadFile(
    bytes: Buffer,
    mediaType: string,
  ): Promise<{ id: string }>;
}
