import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
  AnthropicStreamEvent,
} from '../../shared/anthropic-client/anthropic-client';
import { fakeTextMessage, fakeTextStreamEvents } from './message-builders';

const FALLBACK_TEXT =
  'This is a fabricated fake-mode response — no real Claude API call was made, and no response was queued for this call.';

interface JsonSchemaLike {
  readonly type?: string;
  readonly enum?: readonly unknown[];
  readonly items?: JsonSchemaLike;
  readonly properties?: Readonly<Record<string, JsonSchemaLike>>;
  readonly required?: readonly string[];
}

/** Deliberately minimal placeholder generator — just enough JSON Schema subset for the unqueued-call fallback. */
function fallbackValueForSchema(schema: JsonSchemaLike): unknown {
  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0];
  }
  switch (schema.type) {
    case 'string':
      return 'fake mode — no response was queued for this call';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return schema.items ? [fallbackValueForSchema(schema.items)] : [];
    case 'object': {
      const properties = schema.properties ?? {};
      const keys = schema.required ?? Object.keys(properties);
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        const propertySchema = properties[key];
        if (propertySchema) {
          result[key] = fallbackValueForSchema(propertySchema);
        }
      }
      return result;
    }
    default:
      return null;
  }
}

/** Honors a requested `output_config.format` so a structured-output caller gets parseable JSON, not fallback prose. */
function fallbackMessage(params: AnthropicMessageParams): AnthropicMessage {
  const format = params.output_config?.format;
  if (format?.type === 'json_schema' && format.schema) {
    const value = fallbackValueForSchema(format.schema);
    return fakeTextMessage(JSON.stringify(value));
  }
  return fakeTextMessage(FALLBACK_TEXT);
}

/** Test double for `AnthropicClient`; see docs/shared/test-doubles.md for the FIFO-queue and `allowUnqueuedFallback` contract. */
export class FakeAnthropicClient extends AnthropicClient {
  allowUnqueuedFallback = false;

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
    if (next) {
      return Promise.resolve(next);
    }
    if (this.allowUnqueuedFallback) {
      return Promise.resolve(fallbackMessage(params));
    }
    return Promise.reject(
      new Error(
        'FakeAnthropicClient.createMessage() called with no queued message left — call queueMessage() first.',
      ),
    );
  }

  async *streamMessage(
    params: AnthropicMessageParams,
  ): AsyncIterable<AnthropicStreamEvent> {
    this.calls.push(params);
    const next = this.queuedStreams.shift();
    const events =
      next ??
      (this.allowUnqueuedFallback ? fakeTextStreamEvents(FALLBACK_TEXT) : null);
    if (!events) {
      throw new Error(
        'FakeAnthropicClient.streamMessage() called with no queued stream left — call queueStream() first.',
      );
    }
    for (const event of events) {
      await Promise.resolve();
      yield event;
    }
  }
}
