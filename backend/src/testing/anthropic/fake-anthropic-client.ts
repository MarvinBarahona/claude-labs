import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
  AnthropicStreamEvent,
} from '../../shared/anthropic-client/anthropic-client';

/**
 * Test double for `AnthropicClient`. Each call consumes the next queued item
 * in FIFO order — queue several `createMessage` responses in a row to fake a
 * tool-use loop.
 */
export class FakeAnthropicClient extends AnthropicClient {
  private readonly queuedMessages: AnthropicMessage[] = [];
  private readonly queuedStreams: AnthropicStreamEvent[][] = [];
  private readonly calls: AnthropicMessageParams[] = [];

  queueMessage(message: AnthropicMessage): this {
    this.queuedMessages.push(message);
    return this;
  }

  queueStream(events: AnthropicStreamEvent[]): this {
    this.queuedStreams.push(events);
    return this;
  }

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
