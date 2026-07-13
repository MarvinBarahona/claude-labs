import Anthropic from '@anthropic-ai/sdk';
import { AnthropicMessage, AnthropicStreamEvent } from './anthropic-client';

type ContentBlock = Anthropic.Messages.ContentBlock;

const DEFAULT_USAGE: Anthropic.Messages.Usage = {
  input_tokens: 10,
  output_tokens: 10,
  cache_creation: null,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  inference_geo: null,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: 'standard',
};

function baseMessage(
  overrides: Partial<AnthropicMessage> = {},
): AnthropicMessage {
  return {
    id: 'msg_fake_0001',
    container: null,
    content: [],
    model: 'claude-sonnet-5',
    role: 'assistant',
    stop_details: null,
    stop_reason: 'end_turn',
    stop_sequence: null,
    type: 'message',
    usage: DEFAULT_USAGE,
    ...overrides,
  };
}

/** A canned non-streaming text response — the shape most tests need. */
export function fakeTextMessage(
  text: string,
  overrides: Partial<AnthropicMessage> = {},
): AnthropicMessage {
  const block: ContentBlock = { type: 'text', text, citations: null };
  return baseMessage({ content: [block], ...overrides });
}

export interface FakeToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** A canned response where Claude asks to invoke one or more tools. */
export function fakeToolUseMessage(
  toolCalls: FakeToolCall[],
  overrides: Partial<AnthropicMessage> = {},
): AnthropicMessage {
  const blocks: ContentBlock[] = toolCalls.map((call) => ({
    type: 'tool_use',
    id: call.id,
    name: call.name,
    input: call.input,
    caller: { type: 'direct' },
  }));
  return baseMessage({
    content: blocks,
    stop_reason: 'tool_use',
    ...overrides,
  });
}

/**
 * The streaming event sequence a real `messages.create({ stream: true })`
 * call would emit for a single text block, in order: message_start,
 * content_block_start, one content_block_delta per chunk, content_block_stop,
 * message_delta, message_stop.
 */
export function fakeTextStreamEvents(
  text: string,
  overrides: Partial<AnthropicMessage> = {},
): AnthropicStreamEvent[] {
  const startMessage = baseMessage({
    content: [],
    stop_reason: null,
    ...overrides,
  });
  const finalMessage = fakeTextMessage(text, overrides);

  return [
    { type: 'message_start', message: startMessage },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '', citations: null },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: {
        container: null,
        stop_details: null,
        stop_reason: finalMessage.stop_reason,
        stop_sequence: null,
      },
      usage: {
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        input_tokens: finalMessage.usage.input_tokens,
        output_tokens: finalMessage.usage.output_tokens,
        output_tokens_details: null,
        server_tool_use: null,
      },
    },
    { type: 'message_stop' },
  ];
}
