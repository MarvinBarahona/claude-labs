import Anthropic, { AuthenticationError } from '@anthropic-ai/sdk';
import { useNockFixtures } from './nock-lifecycle';
import {
  mockAnthropicMessagesCreate,
  mockAnthropicMessagesAuthError,
  mockAnthropicMessagesStream,
  mockAnthropicModelsList,
  mockAnthropicBetaMessagesCreate,
} from './anthropic.fixtures';
import {
  fakeTextMessage,
  fakeTextStreamEvents,
} from '../anthropic/message-builders';
import { AnthropicStreamEvent } from '../../shared/anthropic-client/anthropic-client';

describe('Anthropic nock fixtures', () => {
  useNockFixtures();

  it('intercepts a real SDK messages.create() call with a canned response', async () => {
    const client = new Anthropic({ apiKey: 'test-key' });
    const scope = mockAnthropicMessagesCreate(
      fakeTextMessage('hello from fixture'),
    );

    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(message.content[0]).toMatchObject({
      type: 'text',
      text: 'hello from fixture',
    });
    expect(scope.isDone()).toBe(true);
  });

  it('intercepts a real SDK models.list() call with a canned model list', async () => {
    const client = new Anthropic({ apiKey: 'test-key' });
    const scope = mockAnthropicModelsList([{ id: 'claude-sonnet-5' }]);

    const page = await client.models.list();

    expect(page.data).toHaveLength(1);
    expect(page.data[0].id).toBe('claude-sonnet-5');
    expect(scope.isDone()).toBe(true);
  });

  it('intercepts a real SDK streamed messages.create() call with a canned event sequence', async () => {
    const client = new Anthropic({ apiKey: 'test-key' });
    const scope = mockAnthropicMessagesStream(
      fakeTextStreamEvents('streamed from fixture'),
    );

    const stream = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });

    const events: AnthropicStreamEvent[] = [];
    for await (const event of stream) {
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
    expect(scope.isDone()).toBe(true);
  });

  it('intercepts a real SDK beta.messages.create() call (?beta=true) with a canned response', async () => {
    const client = new Anthropic({ apiKey: 'test-key' });
    const scope = mockAnthropicBetaMessagesCreate(
      fakeTextMessage('hello from beta fixture'),
    );

    const message = await client.beta.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      betas: ['files-api-2025-04-14'],
    });

    expect(message.content[0]).toMatchObject({
      type: 'text',
      text: 'hello from beta fixture',
    });
    expect(scope.isDone()).toBe(true);
  });

  it('surfaces a canned auth error the way the real API would for an invalid key', async () => {
    const client = new Anthropic({ apiKey: 'bad-key' });
    mockAnthropicMessagesAuthError();

    await expect(
      client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(AuthenticationError);
  });

  it('never lets an unmocked request reach the real network', async () => {
    const client = new Anthropic({ apiKey: 'test-key', maxRetries: 0 });

    await expect(
      client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow();
  });
});
