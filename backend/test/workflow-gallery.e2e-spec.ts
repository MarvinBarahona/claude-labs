import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { useNockFixtures } from '../src/testing/http-fixtures/nock-lifecycle';
import { mockAnthropicMessagesCreate } from '../src/testing/http-fixtures/anthropic.fixtures';
import { mockGithubIssues } from '../src/testing/http-fixtures/github.fixtures';
import { fakeTextMessage } from '../src/testing/anthropic/message-builders';
import type { WorkflowGalleryEnvelope } from '../src/workflow-gallery/workflow-gallery.service';

const REPO_PATH = 'angular/angular';
const CRITERIA = ['tone', 'technical-accuracy', 'policy-compliance'];

function queueRouting(category: string): void {
  mockAnthropicMessagesCreate(fakeTextMessage(JSON.stringify({ category })));
}

function queueDraftAndRefine(): void {
  mockAnthropicMessagesCreate(fakeTextMessage('Draft response text.'));
  mockAnthropicMessagesCreate(fakeTextMessage('Refined response text.'));
}

function queuePassingGrading(): void {
  CRITERIA.forEach((criterion) => {
    mockAnthropicMessagesCreate(
      fakeTextMessage(
        JSON.stringify({ pass: true, feedback: `${criterion} ok` }),
      ),
    );
  });
}

describe('WorkflowGalleryController (e2e)', () => {
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

  it('POST /workflow-gallery/run returns the full pipeline envelope end to end', async () => {
    mockGithubIssues(REPO_PATH, [
      {
        number: 7,
        title: 'Button does not respond to click',
        state: 'open',
        body: 'Clicking the submit button does nothing on Safari.',
        user: { login: 'someone' },
        created_at: '2026-01-01T00:00:00Z',
        html_url: `https://github.com/${REPO_PATH}/issues/7`,
      },
    ]);
    queueRouting('bug');
    queueDraftAndRefine();
    queuePassingGrading();

    const response = await request(app.getHttpServer())
      .post('/workflow-gallery/run')
      .send({ issueNumber: 7 })
      .expect(200);

    const envelope = response.body as WorkflowGalleryEnvelope;
    expect(envelope.route).toBe('bug');
    expect(envelope.draft).toBe('Refined response text.');
    expect(envelope.grading).toHaveLength(3);
    expect(envelope.grading.map((result) => result.criterion)).toEqual(
      CRITERIA,
    );
    expect(envelope.iterations).toBe(1);
    expect(envelope.passed).toBe(true);
    expect(envelope.calls).toHaveLength(5);
    expect(envelope.cache).toEqual({ read: false, write: false });
    expect(envelope.usage).toBeDefined();
    expect(envelope.stopReason).toBeDefined();
    expect(envelope.request).toBeDefined();
    expect(envelope.response).toBeDefined();
  });

  it('a non-existent issueNumber returns a plain 404 before any Claude API call', async () => {
    mockGithubIssues(REPO_PATH, [
      {
        number: 7,
        title: 'Button does not respond to click',
        state: 'open',
        body: null,
        user: { login: 'someone' },
        created_at: '2026-01-01T00:00:00Z',
        html_url: `https://github.com/${REPO_PATH}/issues/7`,
      },
    ]);
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('unused'));

    await request(app.getHttpServer())
      .post('/workflow-gallery/run')
      .send({ issueNumber: 999 })
      .expect(404);

    expect(scope.isDone()).toBe(false);
  });

  it('GET /workflow-gallery/issues returns the mapped issue list from fixture GitHub data', async () => {
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
      .get('/workflow-gallery/issues')
      .expect(200);

    expect(response.body).toEqual({
      issues: [
        { number: 1, title: 'First issue' },
        { number: 2, title: 'Second issue' },
      ],
    });
  });
});
