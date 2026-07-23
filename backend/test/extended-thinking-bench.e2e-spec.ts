import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { useNockFixtures } from '../src/testing/http-fixtures/nock-lifecycle';
import { mockAnthropicMessagesCreate } from '../src/testing/http-fixtures/anthropic.fixtures';
import { mockGithubIssues } from '../src/testing/http-fixtures/github.fixtures';
import { fakeTextMessage } from '../src/testing/anthropic/message-builders';
import { AnthropicMessage } from '../src/shared/anthropic-client/anthropic-client';
import type { ExtendedThinkingBenchResult } from '../src/extended-thinking-bench/extended-thinking-bench.service';

const REPO_PATH = 'angular/angular';

function fakeThinkingMessage(
  thinkingText: string,
  answerText: string,
): AnthropicMessage {
  return fakeTextMessage(answerText, {
    content: [
      { type: 'thinking', thinking: thinkingText, signature: 'sig_fake' },
      { type: 'text', text: answerText, citations: null },
    ],
  });
}

describe('ExtendedThinkingBenchController (e2e)', () => {
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

  it('POST /extended-thinking-bench/run returns all 3 runs end to end', async () => {
    mockGithubIssues(REPO_PATH, [
      {
        number: 7,
        title: 'Intermittent race condition in the scheduler',
        state: 'open',
        body: 'Hard to reproduce, only under heavy concurrent load.',
        user: { login: 'someone' },
        created_at: '2026-01-01T00:00:00Z',
        html_url: `https://github.com/${REPO_PATH}/issues/7`,
      },
    ]);
    mockAnthropicMessagesCreate(fakeTextMessage('Thinking-off answer.'));
    mockAnthropicMessagesCreate(
      fakeThinkingMessage(
        'Weighing the medium-effort tradeoffs...',
        'Thinking-medium answer.',
      ),
    );
    mockAnthropicMessagesCreate(
      fakeThinkingMessage(
        'Weighing the high-effort tradeoffs in depth...',
        'Thinking-high answer.',
      ),
    );

    const response = await request(app.getHttpServer())
      .post('/extended-thinking-bench/run')
      .send({ issueNumber: 7 })
      .expect(200);

    const result = response.body as ExtendedThinkingBenchResult;
    expect(result.issue).toEqual({
      number: 7,
      title: 'Intermittent race condition in the scheduler',
    });
    expect(result.runs).toHaveLength(3);
    expect(result.runs.map((run) => run.label)).toEqual([
      'thinking-off',
      'thinking-medium',
      'thinking-high',
    ]);
    expect(result.runs[0].answer).toBe('Thinking-off answer.');
    expect(result.runs[0].reasoningTrace).toBeNull();
    expect(result.runs[1].reasoningTrace).toBe(
      'Weighing the medium-effort tradeoffs...',
    );
    expect(result.runs[2].reasoningTrace).toBe(
      'Weighing the high-effort tradeoffs in depth...',
    );
    result.runs.forEach((run) => {
      expect(typeof run.latencyMs).toBe('number');
      expect(run.envelope.request).toBeDefined();
      expect(run.envelope.response).toBeDefined();
    });
  });

  it('a non-existent issueNumber returns a plain 404 before any Claude API call', async () => {
    mockGithubIssues(REPO_PATH, [
      {
        number: 7,
        title: 'Intermittent race condition in the scheduler',
        state: 'open',
        body: null,
        user: { login: 'someone' },
        created_at: '2026-01-01T00:00:00Z',
        html_url: `https://github.com/${REPO_PATH}/issues/7`,
      },
    ]);
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('unused'));

    await request(app.getHttpServer())
      .post('/extended-thinking-bench/run')
      .send({ issueNumber: 999 })
      .expect(404);

    expect(scope.isDone()).toBe(false);
  });

  it('GET /extended-thinking-bench/issues returns the mapped issue list from fixture GitHub data', async () => {
    mockGithubIssues(REPO_PATH, [
      {
        number: 1,
        title: 'First issue',
        state: 'open',
        body: null,
        user: { login: 'a' },
        created_at: '2026-01-01T00:00:00Z',
        html_url: `https://github.com/${REPO_PATH}/issues/1`,
      },
      {
        number: 2,
        title: 'Second issue',
        state: 'open',
        body: 'Body text',
        user: { login: 'b' },
        created_at: '2026-01-02T00:00:00Z',
        html_url: `https://github.com/${REPO_PATH}/issues/2`,
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/extended-thinking-bench/issues')
      .expect(200);

    expect(response.body).toEqual({
      issues: [
        { number: 1, title: 'First issue' },
        { number: 2, title: 'Second issue' },
      ],
    });
  });
});
