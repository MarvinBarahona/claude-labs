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
  mockGithubCommits,
  mockGithubIssues,
  mockGithubRateLimitError,
  mockGithubReleases,
} from '../src/testing/http-fixtures/github.fixtures';
import {
  mockOpenMeteoForecast,
  mockOpenMeteoGeocode,
  mockOpenMeteoGeocodeServerError,
} from '../src/testing/http-fixtures/open-meteo.fixtures';
import {
  fakeTextMessage,
  fakeTextStreamEvents,
  fakeToolUseMessage,
  fakeToolUseStreamEvents,
} from '../src/testing/anthropic/message-builders';
import type { LiveToolUseEnvelope } from '../src/live-tool-use-console/live-tool-use-console.service';

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

const REPO_PATH = 'angular/angular';

function mockRepoStatsFixtures(): void {
  mockGithubIssues(REPO_PATH, [
    {
      number: 1,
      title: 'an issue',
      state: 'open',
      body: null,
      user: { login: 'someone' },
      created_at: '2026-01-01T00:00:00Z',
      html_url: `https://github.com/${REPO_PATH}/issues/1`,
    },
  ]);
  mockGithubCommits(REPO_PATH, [
    {
      sha: 'abc123',
      commit: {
        message: 'a commit',
        author: { name: 'someone', date: '2026-01-01T00:00:00Z' },
      },
      html_url: `https://github.com/${REPO_PATH}/commit/abc123`,
    },
  ]);
  mockGithubReleases(REPO_PATH, [
    {
      tag_name: 'v1.0.0',
      name: 'a release',
      body: null,
      published_at: '2026-01-01T00:00:00Z',
      html_url: `https://github.com/${REPO_PATH}/releases/tag/v1.0.0`,
    },
  ]);
}

function mockWeatherFixtures(): void {
  mockOpenMeteoGeocode('Tokyo', [{ latitude: 35.68, longitude: 139.69 }]);
  mockOpenMeteoForecast(35.68, 139.69, {
    current: { temperature_2m: 18, weather_code: 2 },
  });
}

describe('LiveToolUseConsoleController (e2e)', () => {
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

  it('GET /live-tool-use-console/config returns the configured GitHub target repo', async () => {
    const response = await request(app.getHttpServer())
      .get('/live-tool-use-console/config')
      .expect(200);

    expect(response.body).toEqual({ targetRepo: REPO_PATH });
  });

  it('POST /live-tool-use-console/turn (non-streaming) resolves both tools across the loop', async () => {
    mockAnthropicMessagesCreate(
      fakeToolUseMessage([
        { id: 'call_1', name: 'get_weather', input: { location: 'Tokyo' } },
      ]),
    );
    mockAnthropicMessagesCreate(
      fakeToolUseMessage([{ id: 'call_2', name: 'get_repo_stats', input: {} }]),
    );
    const finalResponse = fakeTextMessage(
      'Tokyo is 18C and partly cloudy; the repo has 1 open issue.',
    );
    mockAnthropicMessagesCreate(finalResponse);
    mockWeatherFixtures();
    mockRepoStatsFixtures();

    const response = await request(app.getHttpServer())
      .post('/live-tool-use-console/turn')
      .send({
        modelChoice: 'default',
        question: 'What is the weather in Tokyo, and how is the repo doing?',
        stream: false,
      })
      .expect(200);

    const envelope = response.body as LiveToolUseEnvelope;
    expect(envelope.response.id).toBe(finalResponse.id);
    expect(envelope.calls).toHaveLength(2);
    expect(envelope.calls?.[0].response.stop_reason).toBe('tool_use');
    expect(envelope.calls?.[1].response.stop_reason).toBe('tool_use');
  });

  it('rejects an empty question with a plain 400 before any outbound call', async () => {
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('unused'));

    await request(app.getHttpServer())
      .post('/live-tool-use-console/turn')
      .send({ modelChoice: 'default', question: '', stream: false })
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('rejects an invalid modelChoice with a plain 400 before any outbound call', async () => {
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('unused'));

    await request(app.getHttpServer())
      .post('/live-tool-use-console/turn')
      .send({
        modelChoice: 'not-a-real-tier',
        question: 'Hi there',
        stream: false,
      })
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('returns a 502 with the shaped error body when the Claude API call fails (non-streaming)', async () => {
    mockAnthropicMessagesAuthError();

    const response = await request(app.getHttpServer())
      .post('/live-tool-use-console/turn')
      .send({ modelChoice: 'default', question: 'Hi there', stream: false })
      .expect(502);

    const body = response.body as ShapedErrorBody;
    expect(body.error.source).toBe('anthropic');
  });

  it('returns a 502 with the shaped error body when a GitHub call fails mid-loop (non-streaming)', async () => {
    mockAnthropicMessagesCreate(
      fakeToolUseMessage([{ id: 'call_1', name: 'get_repo_stats', input: {} }]),
    );
    mockGithubRateLimitError(REPO_PATH);

    const response = await request(app.getHttpServer())
      .post('/live-tool-use-console/turn')
      .send({
        modelChoice: 'default',
        question: 'How is the repo doing?',
        stream: false,
      })
      .expect(502);

    const body = response.body as ShapedErrorBody;
    expect(body.error.source).toBe('github');
  });

  it('returns a 502 with the shaped error body when Open-Meteo fails mid-loop (non-streaming)', async () => {
    mockAnthropicMessagesCreate(
      fakeToolUseMessage([
        { id: 'call_1', name: 'get_weather', input: { location: 'Tokyo' } },
      ]),
    );
    mockOpenMeteoGeocodeServerError();

    const response = await request(app.getHttpServer())
      .post('/live-tool-use-console/turn')
      .send({
        modelChoice: 'default',
        question: 'What is the weather in Tokyo?',
        stream: false,
      })
      .expect(502);

    const body = response.body as ShapedErrorBody;
    expect(body.error.source).toBe('open-meteo');
  });

  it('POST /live-tool-use-console/turn (streaming) forwards raw events, tool_call frames, then turn_complete', async () => {
    mockAnthropicMessagesStream(
      fakeToolUseStreamEvents([
        { id: 'call_1', name: 'get_weather', input: { location: 'Tokyo' } },
      ]),
    );
    const finalStreamEvents = fakeTextStreamEvents(
      'Tokyo is 18C and partly cloudy.',
    );
    mockAnthropicMessagesStream(finalStreamEvents);
    mockWeatherFixtures();

    const response = await request(app.getHttpServer())
      .post('/live-tool-use-console/turn')
      .send({
        modelChoice: 'default',
        question: 'What is the weather in Tokyo?',
        stream: true,
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');

    const frames = parseSseFrames(response.text);
    const events = frames.map((frame) => frame.event);

    const startIndex = events.indexOf('tool_call_start');
    const resultIndex = events.indexOf('tool_call_result');
    const completeIndex = events.indexOf('turn_complete');

    expect(startIndex).toBeGreaterThan(-1);
    expect(resultIndex).toBeGreaterThan(startIndex);
    expect(completeIndex).toBe(events.length - 1);
    expect(events.filter((event) => event === 'turn_complete')).toHaveLength(1);

    const toolCallResultFrame = frames[resultIndex].data as {
      name: string;
      result: unknown;
      isError: boolean;
    };
    expect(toolCallResultFrame.name).toBe('get_weather');
    expect(toolCallResultFrame.isError).toBe(false);
    expect(toolCallResultFrame.result).toEqual({
      temperatureC: 18,
      description: 'Partly cloudy',
    });

    const finalEnvelope = frames[completeIndex].data as LiveToolUseEnvelope;
    expect(finalEnvelope.calls).toHaveLength(1);
    expect(finalEnvelope.response.content).toEqual([
      {
        type: 'text',
        text: 'Tokyo is 18C and partly cloudy.',
        citations: null,
      },
    ]);
  });

  it('emits a mid-stream error frame (no turn_complete) when a GitHub call fails', async () => {
    mockAnthropicMessagesStream(
      fakeToolUseStreamEvents([
        { id: 'call_1', name: 'get_repo_stats', input: {} },
      ]),
    );
    mockGithubRateLimitError(REPO_PATH);

    const response = await request(app.getHttpServer())
      .post('/live-tool-use-console/turn')
      .send({
        modelChoice: 'default',
        question: 'How is the repo doing?',
        stream: true,
      })
      .expect(200);

    const frames = parseSseFrames(response.text);
    const last = frames[frames.length - 1];
    expect(last.event).toBe('error');
    const errorBody = last.data as ShapedErrorBody;
    expect(errorBody.error.source).toBe('github');
    expect(frames.some((frame) => frame.event === 'turn_complete')).toBe(false);
  });
});
