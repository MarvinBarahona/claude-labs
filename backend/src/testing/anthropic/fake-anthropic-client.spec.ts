import { Test } from '@nestjs/testing';
import { AnthropicClient, AnthropicStreamEvent } from './anthropic-client';
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
});
