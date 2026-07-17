import { Test } from '@nestjs/testing';
import {
  AnthropicClient,
  AnthropicStreamEvent,
} from '../../shared/anthropic-client/anthropic-client';
import { FakeAnthropicClient } from './fake-anthropic-client';
import {
  fakeTextMessage,
  fakeToolUseMessage,
  fakeTextStreamEvents,
} from './message-builders';

const params = { model: 'claude-sonnet-5', max_tokens: 100, messages: [] };

describe('FakeAnthropicClient', () => {
  it('can be injected via Nest DI in place of AnthropicClient', async () => {
    const fake = new FakeAnthropicClient().queueMessage(fakeTextMessage('hi'));
    const moduleRef = await Test.createTestingModule({
      providers: [{ provide: AnthropicClient, useValue: fake }],
    }).compile();

    const client = moduleRef.get(AnthropicClient);
    const message = await client.createMessage(params);

    expect(message.content).toEqual([
      { type: 'text', text: 'hi', citations: null },
    ]);
  });

  it('returns a canned non-streaming response', async () => {
    const fake = new FakeAnthropicClient().queueMessage(
      fakeTextMessage('hello there'),
    );

    const message = await fake.createMessage(params);

    expect(message.stop_reason).toBe('end_turn');
    expect(message.content[0]).toMatchObject({
      type: 'text',
      text: 'hello there',
    });
  });

  it('returns a canned streaming event sequence', async () => {
    const fake = new FakeAnthropicClient().queueStream(
      fakeTextStreamEvents('streamed'),
    );

    const events: AnthropicStreamEvent[] = [];
    for await (const event of fake.streamMessage({ ...params, stream: true })) {
      events.push(event);
    }

    expect(events.map((e) => e.type)).toEqual([
      'message_start',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ]);
  });

  it('replays a queued tool-use loop across successive calls', async () => {
    const fake = new FakeAnthropicClient()
      .queueMessage(
        fakeToolUseMessage([
          { id: 'toolu_1', name: 'get_weather', input: { city: 'nyc' } },
        ]),
      )
      .queueMessage(fakeTextMessage('It is sunny in NYC.'));

    const firstTurn = await fake.createMessage(params);
    expect(firstTurn.stop_reason).toBe('tool_use');
    expect(firstTurn.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'get_weather',
    });

    const secondTurn = await fake.createMessage(params);
    expect(secondTurn.stop_reason).toBe('end_turn');
    expect(secondTurn.content[0]).toMatchObject({
      type: 'text',
      text: 'It is sunny in NYC.',
    });

    expect(fake.recordedCalls).toHaveLength(2);
  });

  it('throws a clear error when called with nothing queued', async () => {
    const fake = new FakeAnthropicClient();

    await expect(fake.createMessage(params)).rejects.toThrow(
      /no queued message left/,
    );
  });

  it('throws a clear error from streamMessage() when called with nothing queued', async () => {
    const fake = new FakeAnthropicClient();

    const iterator = fake
      .streamMessage({ ...params, stream: true })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toThrow(/no queued stream left/);
  });

  describe('allowUnqueuedFallback', () => {
    it('still throws with nothing queued when left at its default (false)', async () => {
      const fake = new FakeAnthropicClient();

      await expect(fake.createMessage(params)).rejects.toThrow(
        /no queued message left/,
      );
    });

    it('returns a generic canned message instead of throwing once enabled', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage(params);

      expect(message.stop_reason).toBe('end_turn');
      expect(message.content[0]).toMatchObject({ type: 'text' });
    });

    it('still prefers a queued message over the fallback once enabled', async () => {
      const fake = new FakeAnthropicClient().queueMessage(
        fakeTextMessage('queued, not fallback'),
      );
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage(params);

      expect(message.content[0]).toMatchObject({
        type: 'text',
        text: 'queued, not fallback',
      });
    });

    it('returns schema-conformant JSON as the fallback when output_config.format requests structured output', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage({
        ...params,
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                sentiment: {
                  type: 'string',
                  enum: ['positive', 'neutral', 'negative'],
                },
                actionItems: { type: 'array', items: { type: 'string' } },
              },
              required: ['summary', 'sentiment', 'actionItems'],
            },
          },
        },
      });

      const block = message.content[0];
      expect(block).toMatchObject({ type: 'text' });
      if (block.type !== 'text') {
        throw new Error('expected a text block');
      }
      const parsed: unknown = JSON.parse(block.text);
      expect(parsed).toEqual({
        summary: 'fake mode — no response was queued for this call',
        sentiment: 'positive',
        actionItems: ['fake mode — no response was queued for this call'],
      });
    });

    it('yields a generic canned stream instead of throwing once enabled', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const events: AnthropicStreamEvent[] = [];
      for await (const event of fake.streamMessage({
        ...params,
        stream: true,
      })) {
        events.push(event);
      }

      expect(events.map((e) => e.type)).toEqual([
        'message_start',
        'content_block_start',
        'content_block_delta',
        'content_block_stop',
        'message_delta',
        'message_stop',
      ]);
    });

    const weatherRepoTools = [
      {
        name: 'get_weather',
        description: 'Get the current weather conditions for a named location.',
        input_schema: {
          type: 'object' as const,
          properties: { location: { type: 'string' } },
          required: ['location'],
        },
      },
      {
        name: 'get_repo_stats',
        description: "Get stats for the app's configured GitHub repository.",
        input_schema: { type: 'object' as const, properties: {} },
      },
    ];

    it('returns a fabricated tool_use call as the fallback when tools are offered and no tool_result exists yet', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage({
        ...params,
        tools: weatherRepoTools,
        messages: [{ role: 'user', content: 'How is the repo doing?' }],
      });

      expect(message.stop_reason).toBe('tool_use');
      expect(message.content[0]).toMatchObject({
        type: 'tool_use',
        name: 'get_repo_stats',
        input: {},
      });
    });

    it('returns the plain-text fallback once the latest message already carries a tool_result', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const message = await fake.createMessage({
        ...params,
        tools: weatherRepoTools,
        messages: [
          { role: 'user', content: 'How is the repo doing?' },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'fake_tool_call_1',
                name: 'get_repo_stats',
                input: {},
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'fake_tool_call_1',
                content: '{}',
              },
            ],
          },
        ],
      });

      expect(message.stop_reason).toBe('end_turn');
      expect(message.content[0]).toMatchObject({ type: 'text' });
    });

    it('yields a fabricated tool_use stream as the fallback when tools are offered and no tool_result exists yet', async () => {
      const fake = new FakeAnthropicClient();
      fake.allowUnqueuedFallback = true;

      const events: AnthropicStreamEvent[] = [];
      for await (const event of fake.streamMessage({
        ...params,
        tools: weatherRepoTools,
        messages: [{ role: 'user', content: 'What is the weather like?' }],
        stream: true,
      })) {
        events.push(event);
      }

      const startEvent = events.find(
        (event) => event.type === 'content_block_start',
      );
      expect(startEvent).toMatchObject({
        content_block: { type: 'tool_use', name: 'get_weather' },
      });
      const deltaEvent = events.find((event) => event.type === 'message_delta');
      expect(deltaEvent).toMatchObject({ delta: { stop_reason: 'tool_use' } });
    });
  });
});
