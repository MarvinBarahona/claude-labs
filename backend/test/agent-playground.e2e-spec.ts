import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { useNockFixtures } from '../src/testing/http-fixtures/nock-lifecycle';
import {
  mockAnthropicBetaMessagesAuthError,
  mockAnthropicBetaMessagesCreate,
  mockAnthropicBetaMessagesStream,
} from '../src/testing/http-fixtures/anthropic.fixtures';
import {
  mockGithubRateLimitError,
  mockGithubRepo,
  mockGithubTree,
} from '../src/testing/http-fixtures/github.fixtures';
import {
  fakeTextMessage,
  fakeTextStreamEvents,
  fakeToolUseMessage,
  fakeToolUseStreamEvents,
} from '../src/testing/anthropic/message-builders';
import type { AgentPlaygroundEnvelope } from '../src/agent-playground/agent-playground.service';

interface ShapedErrorBody {
  error: { message: string; source: string };
}

const REPO_PATH = 'angular/angular';

function mockFileTree(): void {
  mockGithubRepo(REPO_PATH, { default_branch: 'main' });
  mockGithubTree(REPO_PATH, 'main', {
    tree: [{ path: 'README.md', type: 'blob', sha: 'sha1' }],
  });
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
      return { event: eventLine?.slice('event: '.length) ?? '', data };
    });
}

describe('AgentPlaygroundController (e2e)', () => {
  let app: INestApplication<App>;

  useNockFixtures();

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /agent-playground/run (non-streaming) resolves a list_files round trip end to end', async () => {
    mockAnthropicBetaMessagesCreate(
      fakeToolUseMessage([{ id: 'call_1', name: 'list_files', input: {} }]),
    );
    const finalResponse = fakeTextMessage(
      'This repo is a reference app for the Claude API.',
    );
    mockAnthropicBetaMessagesCreate(finalResponse);
    mockFileTree();

    const response = await request(app.getHttpServer())
      .post('/agent-playground/run')
      .send({ stream: false })
      .expect(200);

    const envelope = response.body as AgentPlaygroundEnvelope;
    expect(envelope.finalAnswer).toBe(
      'This repo is a reference app for the Claude API.',
    );
    expect(envelope.calls).toHaveLength(1);
    expect(envelope.toolActivity).toEqual([
      {
        tool: 'list_files',
        input: {},
        result: [{ path: 'README.md', type: 'blob', sha: 'sha1' }],
        isError: false,
      },
    ]);
    expect(envelope.hitIterationCap).toBe(false);
  });

  it('returns a 502 with the shaped error body when the Claude API call fails (non-streaming)', async () => {
    mockAnthropicBetaMessagesAuthError();

    const response = await request(app.getHttpServer())
      .post('/agent-playground/run')
      .send({ stream: false })
      .expect(502);

    const body = response.body as ShapedErrorBody;
    expect(body.error.source).toBe('anthropic');
  });

  it('returns a 502 with the shaped error body when a GitHub call fails mid-loop (non-streaming)', async () => {
    mockAnthropicBetaMessagesCreate(
      fakeToolUseMessage([{ id: 'call_1', name: 'list_files', input: {} }]),
    );
    mockGithubRateLimitError(REPO_PATH);

    const response = await request(app.getHttpServer())
      .post('/agent-playground/run')
      .send({ stream: false })
      .expect(502);

    const body = response.body as ShapedErrorBody;
    expect(body.error.source).toBe('github');
  });

  it('POST /agent-playground/run (streaming) forwards raw events, tool_call frames, then turn_complete', async () => {
    mockAnthropicBetaMessagesStream(
      fakeToolUseStreamEvents([
        { id: 'call_1', name: 'list_files', input: {} },
      ]),
    );
    mockAnthropicBetaMessagesStream(
      fakeTextStreamEvents('This repo is a reference app.'),
    );
    mockFileTree();

    const response = await request(app.getHttpServer())
      .post('/agent-playground/run')
      .send({ stream: true })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');

    const frames = parseSseFrames(response.text);
    const events = frames.map((frame) => frame.event);

    expect(events).toContain('tool_call_start');
    expect(events).toContain('tool_call_result');
    expect(events[events.length - 1]).toBe('turn_complete');
    expect(events.filter((event) => event === 'turn_complete')).toHaveLength(1);

    const finalEnvelope = frames[frames.length - 1]
      .data as AgentPlaygroundEnvelope;
    expect(finalEnvelope.finalAnswer).toBe('This repo is a reference app.');
    expect(finalEnvelope.toolActivity).toHaveLength(1);
  });

  it('emits a mid-stream error frame (no turn_complete) when a GitHub call fails', async () => {
    mockAnthropicBetaMessagesStream(
      fakeToolUseStreamEvents([
        { id: 'call_1', name: 'list_files', input: {} },
      ]),
    );
    mockGithubRateLimitError(REPO_PATH);

    const response = await request(app.getHttpServer())
      .post('/agent-playground/run')
      .send({ stream: true })
      .expect(200);

    const frames = parseSseFrames(response.text);
    const last = frames[frames.length - 1];
    expect(last.event).toBe('error');
    const errorBody = last.data as ShapedErrorBody;
    expect(errorBody.error.source).toBe('github');
    expect(frames.some((frame) => frame.event === 'turn_complete')).toBe(false);
  });
});
