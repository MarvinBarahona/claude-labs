import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { useNockFixtures } from '../src/testing/http-fixtures/nock-lifecycle';
import {
  mockAnthropicMessagesAuthError,
  mockAnthropicMessagesCreate,
  mockAnthropicMessagesStream,
} from '../src/testing/http-fixtures/anthropic.fixtures';
import {
  fakeTextMessage,
  fakeTextStreamEvents,
} from '../src/testing/anthropic/message-builders';
import type { TurnEnvelope } from '../src/shared/envelope-builder/envelope-builder.types';

interface ShapedErrorBody {
  error: { message: string; source: string };
}

/** Parses a raw SSE response body into `{ event, data }` frames, in order. */
function parseSseFrames(body: string): { event: string; data: unknown }[] {
  return body
    .split('\n\n')
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => {
      const eventLine = chunk
        .split('\n')
        .find((line) => line.startsWith('event: '));
      const dataLine = chunk
        .split('\n')
        .find((line) => line.startsWith('data: '));
      const data: unknown = dataLine
        ? (JSON.parse(dataLine.slice('data: '.length)) as unknown)
        : null;
      return {
        event: eventLine?.slice('event: '.length) ?? '',
        data,
      };
    });
}

describe('MessagesConsoleController (e2e)', () => {
  let app: INestApplication<App>;

  useNockFixtures();

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Test apps don't inherit main.ts's global ValidationPipe — register it here too.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /messages-console/turn (non-streaming) returns the envelope end to end', async () => {
    const fakeResponse = fakeTextMessage('Hello from Claude');
    mockAnthropicMessagesCreate(fakeResponse);

    const response = await request(app.getHttpServer())
      .post('/messages-console/turn')
      .send({
        modelChoice: 'default',
        messages: [{ role: 'user', text: 'Hi there' }],
        stream: false,
      })
      .expect(200);

    const envelope = response.body as TurnEnvelope;
    expect(envelope.response.id).toBe(fakeResponse.id);
    expect(envelope.stopReason).toBe(fakeResponse.stop_reason);
    expect(envelope.usage).toEqual({
      inputTokens: fakeResponse.usage.input_tokens,
      outputTokens: fakeResponse.usage.output_tokens,
    });
    expect(envelope).not.toHaveProperty('calls');
  });

  it('rejects an out-of-range temperature with a plain 400 before any outbound call', async () => {
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('unused'));

    await request(app.getHttpServer())
      .post('/messages-console/turn')
      .send({
        modelChoice: 'default',
        temperature: 1.5,
        messages: [{ role: 'user', text: 'Hi there' }],
        stream: false,
      })
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('rejects an empty messages array with a plain 400 before any outbound call', async () => {
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('unused'));

    await request(app.getHttpServer())
      .post('/messages-console/turn')
      .send({
        modelChoice: 'default',
        messages: [],
        stream: false,
      })
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('rejects an invalid modelChoice with a plain 400 before any outbound call', async () => {
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('unused'));

    await request(app.getHttpServer())
      .post('/messages-console/turn')
      .send({
        modelChoice: 'not-a-real-tier',
        messages: [{ role: 'user', text: 'Hi there' }],
        stream: false,
      })
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('returns a 502 with the shaped error body when the Claude API call fails (non-streaming)', async () => {
    mockAnthropicMessagesAuthError();

    const response = await request(app.getHttpServer())
      .post('/messages-console/turn')
      .send({
        modelChoice: 'default',
        messages: [{ role: 'user', text: 'Hi there' }],
        stream: false,
      })
      .expect(502);

    const body = response.body as ShapedErrorBody;
    expect(body.error.source).toBe('anthropic');
    expect(typeof body.error.message).toBe('string');
  });

  it('POST /messages-console/turn (streaming) forwards raw events and ends with turn_complete', async () => {
    const streamEvents = fakeTextStreamEvents('streamed reply');
    mockAnthropicMessagesStream(streamEvents);

    const response = await request(app.getHttpServer())
      .post('/messages-console/turn')
      .send({
        modelChoice: 'default',
        messages: [{ role: 'user', text: 'Hi there' }],
        stream: true,
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');

    const frames = parseSseFrames(response.text);
    expect(frames).toHaveLength(streamEvents.length + 1);
    streamEvents.forEach((event, index) => {
      expect(frames[index]).toEqual({ event: event.type, data: event });
    });

    const last = frames[frames.length - 1];
    expect(last.event).toBe('turn_complete');
    const envelope = last.data as TurnEnvelope;
    expect(envelope.response.content).toEqual([
      { type: 'text', text: 'streamed reply', citations: null },
    ]);
  });

  it('emits a terminal error frame (no turn_complete) when the Claude API fails mid-stream', async () => {
    mockAnthropicMessagesAuthError();

    const response = await request(app.getHttpServer())
      .post('/messages-console/turn')
      .send({
        modelChoice: 'default',
        messages: [{ role: 'user', text: 'Hi there' }],
        stream: true,
      })
      .expect(200);

    const frames = parseSseFrames(response.text);
    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe('error');
    const errorBody = frames[0].data as ShapedErrorBody;
    expect(errorBody.error.source).toBe('anthropic');
    expect(typeof errorBody.error.message).toBe('string');
    expect(frames.some((frame) => frame.event === 'turn_complete')).toBe(false);
  });
});
