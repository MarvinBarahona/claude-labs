import { AnthropicStreamEvent } from '../anthropic-client/anthropic-client';
import {
  fakeTextStreamEvents,
  fakeToolUseStreamEvents,
} from '../../testing/anthropic/message-builders';
import { StreamResponseBuilderService } from './stream-response-builder.service';

describe('StreamResponseBuilderService', () => {
  const service = new StreamResponseBuilderService();

  it('accumulates text_delta events into a text block', () => {
    const message = service.reconstructMessage(
      fakeTextStreamEvents('hello world'),
    );

    expect(message.content).toEqual([
      { type: 'text', text: 'hello world', citations: null },
    ]);
  });

  it("accumulates input_json_delta events into a tool_use block's parsed input", () => {
    const events = fakeToolUseStreamEvents([
      { id: 'toolu_01', name: 'get_weather', input: { location: 'Tokyo' } },
    ]);

    const message = service.reconstructMessage(events);

    expect(message.content).toEqual([
      {
        type: 'tool_use',
        id: 'toolu_01',
        name: 'get_weather',
        input: { location: 'Tokyo' },
        caller: { type: 'direct' },
      },
    ]);
  });

  it('reconstructs an empty-arguments tool call as input: {}', () => {
    const events: AnthropicStreamEvent[] = [
      { type: 'message_start', message: startMessage() },
      {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'toolu_01',
          name: 'get_repo_stats',
          input: {},
          caller: { type: 'direct' },
        },
      },
      { type: 'content_block_stop', index: 0 },
    ];

    const message = service.reconstructMessage(events);

    expect(message.content).toEqual([
      {
        type: 'tool_use',
        id: 'toolu_01',
        name: 'get_repo_stats',
        input: {},
        caller: { type: 'direct' },
      },
    ]);
  });

  it('accumulates thinking_delta and signature_delta events into a thinking block', () => {
    const events: AnthropicStreamEvent[] = [
      { type: 'message_start', message: startMessage() },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Let me consider ' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'this carefully.' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 'sig-abc' },
      },
      { type: 'content_block_stop', index: 0 },
    ];

    const message = service.reconstructMessage(events);

    expect(message.content).toEqual([
      {
        type: 'thinking',
        thinking: 'Let me consider this carefully.',
        signature: 'sig-abc',
      },
    ]);
  });

  it("accumulates citations_delta events into a text block's citations array", () => {
    const citation = {
      type: 'page_location' as const,
      cited_text: 'the cited sentence',
      document_index: 0,
      document_title: 'A Paper',
      start_page_number: 1,
      end_page_number: 2,
    };

    const message = service.reconstructMessage(
      fakeTextStreamEvents('see citation', {}, citation),
    );

    expect(message.content).toEqual([
      { type: 'text', text: 'see citation', citations: [citation] },
    ]);
  });

  it('merges message_delta stop_reason/stop_sequence/usage onto the message_start message', () => {
    const message = service.reconstructMessage(fakeTextStreamEvents('hi'));

    expect(message.stop_reason).toBe('end_turn');
    expect(message.usage.input_tokens).toBe(10);
    expect(message.usage.output_tokens).toBe(10);
  });

  it("falls back to message_start's own usage field when message_delta omits it", () => {
    const events = fakeTextStreamEvents('hi');
    const deltaEvent = events.find((event) => event.type === 'message_delta');
    if (deltaEvent && deltaEvent.type === 'message_delta') {
      deltaEvent.usage.cache_creation_input_tokens = 42;
    }
    const startEvent = events.find((event) => event.type === 'message_start');
    if (startEvent && startEvent.type === 'message_start') {
      startEvent.message.usage.cache_read_input_tokens = 7;
    }

    const message = service.reconstructMessage(events);

    expect(message.usage.cache_creation_input_tokens).toBe(42);
    expect(message.usage.cache_read_input_tokens).toBe(7);
  });

  it('throws a clear error when no message_start event is present', () => {
    expect(() =>
      service.reconstructMessage([{ type: 'message_stop' }]),
    ).toThrow('Streamed response completed without a message_start event');
  });

  it('throws when given a content_block_delta whose delta.type is not one of the known kinds', () => {
    const events: AnthropicStreamEvent[] = [
      { type: 'message_start', message: startMessage() },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '', citations: null },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'unknown_future_delta' } as never,
      },
    ];

    expect(() => service.reconstructMessage(events)).toThrow(
      'Unhandled stream delta type: unknown_future_delta',
    );
  });
});

function startMessage() {
  return {
    id: 'msg_fake_0001',
    container: null,
    content: [],
    model: 'claude-sonnet-5',
    role: 'assistant' as const,
    stop_details: null,
    stop_reason: null,
    stop_sequence: null,
    type: 'message' as const,
    usage: {
      input_tokens: 10,
      output_tokens: 10,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: 'standard' as const,
    },
  };
}
