import Anthropic from '@anthropic-ai/sdk';

export type AnthropicMessage = Anthropic.Messages.Message;
export type AnthropicMessageParams = Anthropic.Messages.MessageCreateParams;
export type AnthropicStreamEvent = Anthropic.Messages.RawMessageStreamEvent;

/**
 * DI token every consumer depends on instead of the concrete `Anthropic` SDK
 * client. `FakeAnthropicClient` (below) is the test double bound to this
 * token in unit tests; the real client's own provider (built alongside the
 * first feature that actually calls the Messages API) binds a thin adapter
 * over the real SDK to the same token.
 */
export abstract class AnthropicClient {
  abstract createMessage(
    params: AnthropicMessageParams,
  ): Promise<AnthropicMessage>;
  abstract streamMessage(
    params: AnthropicMessageParams,
  ): AsyncIterable<AnthropicStreamEvent>;
}
