import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { useNockFixtures } from '../src/testing/http-fixtures/nock-lifecycle';
import {
  mockAnthropicMessagesAuthError,
  mockAnthropicMessagesCreate,
} from '../src/testing/http-fixtures/anthropic.fixtures';
import {
  fakeTextMessage,
  fakeToolUseMessage,
} from '../src/testing/anthropic/message-builders';
import type { StructuredEnvelope } from '../src/structured-output-console/structured-output-console.service';

interface ShapedErrorBody {
  error: { message: string; source: string };
}

describe('StructuredOutputConsoleController (e2e)', () => {
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

  it('POST /structured-output-console/run returns the envelope with a parsed field end to end', async () => {
    const fakeResponse = fakeTextMessage(
      JSON.stringify({
        summary: 'Customer is happy overall.',
        sentiment: 'positive',
        actionItems: ['Follow up next week'],
      }),
    );
    mockAnthropicMessagesCreate(fakeResponse);

    const response = await request(app.getHttpServer())
      .post('/structured-output-console/run')
      .send({ modelChoice: 'default', input: 'Summarize this feedback.' })
      .expect(200);

    const envelope = response.body as StructuredEnvelope;
    expect(envelope.response.id).toBe(fakeResponse.id);
    expect(envelope.stopReason).toBe(fakeResponse.stop_reason);
    expect(envelope.usage).toEqual({
      inputTokens: fakeResponse.usage.input_tokens,
      outputTokens: fakeResponse.usage.output_tokens,
    });
    expect(envelope.parsed).toEqual({
      summary: 'Customer is happy overall.',
      sentiment: 'positive',
      actionItems: ['Follow up next week'],
    });
  });

  it('rejects an empty input with a plain 400 before any outbound call', async () => {
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('unused'));

    await request(app.getHttpServer())
      .post('/structured-output-console/run')
      .send({ modelChoice: 'default', input: '' })
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('rejects an invalid modelChoice with a plain 400 before any outbound call', async () => {
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('unused'));

    await request(app.getHttpServer())
      .post('/structured-output-console/run')
      .send({ modelChoice: 'not-a-real-tier', input: 'Summarize this.' })
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('returns a 502 with the shaped error body when the response has no text block', async () => {
    mockAnthropicMessagesCreate(
      fakeToolUseMessage([{ id: 'call_1', name: 'noop', input: {} }]),
    );

    const response = await request(app.getHttpServer())
      .post('/structured-output-console/run')
      .send({ modelChoice: 'default', input: 'Summarize this.' })
      .expect(502);

    const body = response.body as ShapedErrorBody;
    expect(body.error.source).toBe('anthropic');
    expect(typeof body.error.message).toBe('string');
  });

  it('returns a 502 with the shaped error body when the Claude API call fails', async () => {
    mockAnthropicMessagesAuthError();

    const response = await request(app.getHttpServer())
      .post('/structured-output-console/run')
      .send({ modelChoice: 'default', input: 'Summarize this.' })
      .expect(502);

    const body = response.body as ShapedErrorBody;
    expect(body.error.source).toBe('anthropic');
    expect(typeof body.error.message).toBe('string');
  });
});
