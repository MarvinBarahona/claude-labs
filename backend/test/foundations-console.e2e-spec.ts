import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { useNockFixtures } from '../src/testing/http-fixtures/nock-lifecycle';
import { mockAnthropicMessagesCreate } from '../src/testing/http-fixtures/anthropic.fixtures';
import { fakeTextMessage } from '../src/testing/anthropic/message-builders';
import type {
  MessagesEnvelope,
  StructuredEnvelope,
} from '../src/foundations-console/foundations-console.service';

describe('FoundationsConsoleController (e2e)', () => {
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

  it('POST /foundations-console/messages (non-streaming) returns the envelope end to end', async () => {
    const fakeResponse = fakeTextMessage('Hello from Claude');
    mockAnthropicMessagesCreate(fakeResponse);

    const response = await request(app.getHttpServer())
      .post('/foundations-console/messages')
      .send({
        modelChoice: 'default',
        messages: [{ role: 'user', text: 'Hi there' }],
        stream: false,
      })
      .expect(200);

    const envelope = response.body as MessagesEnvelope;
    expect(envelope.response.id).toBe(fakeResponse.id);
    expect(envelope.stopReason).toBe(fakeResponse.stop_reason);
    expect(envelope.usage).toEqual({
      inputTokens: fakeResponse.usage.input_tokens,
      outputTokens: fakeResponse.usage.output_tokens,
    });
  });

  it('rejects an out-of-range temperature with a plain 400 before any outbound call', async () => {
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('unused'));

    await request(app.getHttpServer())
      .post('/foundations-console/messages')
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
      .post('/foundations-console/messages')
      .send({
        modelChoice: 'default',
        messages: [],
        stream: false,
      })
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('POST /foundations-console/structured returns the parsed structured output end to end', async () => {
    const structuredPayload = {
      summary: 'Positive feedback about onboarding',
      sentiment: 'positive',
      actionItems: ['Send thank-you note'],
    };
    mockAnthropicMessagesCreate(
      fakeTextMessage(JSON.stringify(structuredPayload)),
    );

    const response = await request(app.getHttpServer())
      .post('/foundations-console/structured')
      .send({
        modelChoice: 'default',
        input: 'The onboarding call went great.',
      })
      .expect(200);

    const envelope = response.body as StructuredEnvelope;
    expect(envelope.parsed).toEqual(structuredPayload);
  });
});
