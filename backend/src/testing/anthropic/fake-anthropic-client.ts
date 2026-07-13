import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
  AnthropicStreamEvent,
} from './anthropic-client';

/**
 * Test double for `AnthropicClient`. Queue one or more canned
 * responses/stream sequences, then bind this in place of the real client via
 * Nest DI. Each `createMessage`/`streamMessage` call consumes the next
 * queued item in FIFO order — queue several `createMessage` responses in a
 * row to fake a custom-tool loop (a tool_use response, then the follow-up
 * text response after the tool result is sent back).
 */
export class FakeAnthropicClient extends AnthropicClient {
  private readonly queuedMessages: AnthropicMessage[] = [];
  private readonly queuedStreams: AnthropicStreamEvent[][] = [];
  private readonly calls: AnthropicMessageParams[] = [];

  /** Queue a canned response for the next `createMessage` call. */
  queueMessage(message: AnthropicMessage): this {
    this.queuedMessages.push(message);
    return this;
  }

  /** Queue a canned event sequence for the next `streamMessage` call. */
  queueStream(events: AnthropicStreamEvent[]): this {
    this.queuedStreams.push(events);
    return this;
  }

  /** Every params object passed to `createMessage`/`streamMessage` so far, in order. */
  get recordedCalls(): readonly AnthropicMessageParams[] {
    return this.calls;
  }

  createMessage(params: AnthropicMessageParams): Promise<AnthropicMessage> {
    this.calls.push(params);
    const next = this.queuedMessages.shift();
    if (!next) {
      return Promise.reject(
        new Error(
          'FakeAnthropicClient.createMessage() called with no queued message left — call queueMessage() first.',
        ),
      );
    }
    return Promise.resolve(next);
  }

  async *streamMessage(
    params: AnthropicMessageParams,
  ): AsyncIterable<AnthropicStreamEvent> {
    this.calls.push(params);
    const next = this.queuedStreams.shift();
    if (!next) {
      throw new Error(
        'FakeAnthropicClient.streamMessage() called with no queued stream left — call queueStream() first.',
      );
    }
    for (const event of next) {
      await Promise.resolve();
      yield event;
    }
  }
}
