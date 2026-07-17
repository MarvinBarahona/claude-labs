import Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessageParams,
  AnthropicStreamEvent,
} from '../../shared/anthropic-client/anthropic-client';
import {
  fakeTextMessage,
  fakeTextStreamEvents,
  fakeToolUseMessage,
  fakeToolUseStreamEvents,
  FakeToolCall,
} from './message-builders';

type AnthropicOfferedTool = NonNullable<
  AnthropicMessageParams['tools']
>[number];
/** Only a custom tool (not a built-in like `bash`) carries `input_schema` — the only kind this lab's fallback can fabricate an input for. */
type AnthropicCustomTool = Anthropic.Messages.Tool;

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

function isCustomTool(tool: AnthropicOfferedTool): tool is AnthropicCustomTool {
  return 'input_schema' in tool;
}

/** True once the loop's latest message already carries a `tool_result` — an unqueued fallback then answers in plain text instead of issuing another tool call, so a fake-mode turn always terminates after one tool round trip. */
function latestMessageHasToolResult(params: AnthropicMessageParams): boolean {
  const messages = params.messages;
  const content: unknown = messages[messages.length - 1]?.content;
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some(
    (block: unknown) =>
      typeof block === 'object' &&
      block !== null &&
      (block as Record<string, unknown>)['type'] === 'tool_result',
  );
}

function latestUserText(params: AnthropicMessageParams): string {
  const message = [...params.messages].reverse().find((m) => m.role === 'user');
  const content: unknown = message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  const texts: string[] = [];
  for (const block of content as unknown[]) {
    if (typeof block !== 'object' || block === null) {
      continue;
    }
    const record = block as Record<string, unknown>;
    if (record['type'] === 'text' && typeof record['text'] === 'string') {
      texts.push(record['text']);
    }
  }
  return texts.join(' ');
}

/** Picks whichever offered tool's name is mentioned in the latest user turn, falling back to the first — just enough of a heuristic that an unqueued fake-mode call exercises a plausible tool instead of always the same one. */
function pickFallbackTool(
  tools: readonly AnthropicCustomTool[],
  params: AnthropicMessageParams,
): AnthropicCustomTool {
  const question = latestUserText(params).toLowerCase();
  const matched = tools.find((tool) =>
    tool.name
      .split('_')
      .some((word) => word.length > 3 && question.includes(word)),
  );
  return matched ?? tools[0];
}

/** One synthesized `tool_use` call for an unqueued fallback, or `null` when this request isn't offering (custom) tools / is already past one tool round trip. */
function fallbackToolCall(params: AnthropicMessageParams): FakeToolCall | null {
  const tools = params.tools?.filter(isCustomTool);
  if (!tools || tools.length === 0 || latestMessageHasToolResult(params)) {
    return null;
  }
  const tool = pickFallbackTool(tools, params);
  const input = fallbackValueForSchema(
    tool.input_schema as unknown as JsonSchemaLike,
  );
  return { id: 'fake_tool_call_1', name: tool.name, input };
}

/** Honors a requested `output_config.format` so a structured-output caller gets parseable JSON, not fallback prose; honors offered `tools` so a tool-use loop gets one fabricated tool call round trip instead of an immediate plain-text answer. */
function fallbackMessage(params: AnthropicMessageParams): AnthropicMessage {
  const format = params.output_config?.format;
  if (format?.type === 'json_schema' && format.schema) {
    const value = fallbackValueForSchema(format.schema);
    return fakeTextMessage(JSON.stringify(value));
  }
  const toolCall = fallbackToolCall(params);
  if (toolCall) {
    return fakeToolUseMessage([toolCall]);
  }
  return fakeTextMessage(FALLBACK_TEXT);
}

/** Streaming counterpart of `fallbackMessage()` — same tool-call heuristic, reassembled as the raw event sequence a real streamed call would emit. */
function fallbackStreamEvents(
  params: AnthropicMessageParams,
): AnthropicStreamEvent[] {
  const toolCall = fallbackToolCall(params);
  if (toolCall) {
    return fakeToolUseStreamEvents([toolCall]);
  }
  return fakeTextStreamEvents(FALLBACK_TEXT);
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
      (this.allowUnqueuedFallback ? fallbackStreamEvents(params) : null);
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
