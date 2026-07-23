import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { useNockFixtures } from '../src/testing/http-fixtures/nock-lifecycle';
import { mockAnthropicBetaMessagesCreate } from '../src/testing/http-fixtures/anthropic.fixtures';
import { fakeTextMessage } from '../src/testing/anthropic/message-builders';
import type { ResearchEnvelope } from '../src/web-repo-research-reporter/web-repo-research-reporter.service';

interface ShapedErrorBody {
  error: { message: string; source: string };
}

describe('WebRepoResearchReporterController (e2e)', () => {
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

  function fixtureResponse(): ReturnType<typeof fakeTextMessage> {
    return fakeTextMessage(
      JSON.stringify({
        summary: 'The repo uses a layered testing strategy.',
        findings: [
          {
            claim: 'Unit tests mock external clients.',
            source: 'https://example.com/testing',
          },
        ],
      }),
      {
        content: [
          {
            type: 'server_tool_use',
            id: 'srv_1',
            name: 'web_search',
            input: { query: 'testing strategy' },
          },
          {
            type: 'web_search_tool_result',
            tool_use_id: 'srv_1',
            content: [
              {
                type: 'web_search_result',
                url: 'https://example.com/testing',
                title: 'Testing strategy',
                page_age: null,
                encrypted_content: 'encrypted',
              },
            ],
          },
          {
            type: 'mcp_tool_use',
            id: 'mcp_1',
            name: 'ask_question',
            server_name: 'deepwiki',
            input: { question: 'How is testing structured?' },
          },
          {
            type: 'mcp_tool_result',
            tool_use_id: 'mcp_1',
            content: [{ type: 'text', text: 'Testing is layered.' }],
          },
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'The repo uses a layered testing strategy.',
              findings: [
                {
                  claim: 'Unit tests mock external clients.',
                  source: 'https://example.com/testing',
                },
              ],
            }),
            citations: null,
          },
        ] as unknown as ReturnType<typeof fakeTextMessage>['content'],
      },
    );
  }

  it('GET /web-repo-research-reporter/config returns the configured GitHub target repo', async () => {
    const response = await request(app.getHttpServer())
      .get('/web-repo-research-reporter/config')
      .expect(200);

    expect(response.body).toEqual({ targetRepo: 'angular/angular' });
  });

  it('POST /web-repo-research-reporter/run returns the brief and counters end to end', async () => {
    mockAnthropicBetaMessagesCreate(fixtureResponse());

    const response = await request(app.getHttpServer())
      .post('/web-repo-research-reporter/run')
      .send({ question: 'How is testing structured in this repo?' })
      .expect(200);

    const envelope = response.body as ResearchEnvelope;
    expect(envelope.brief).toEqual({
      summary: 'The repo uses a layered testing strategy.',
      findings: [
        {
          claim: 'Unit tests mock external clients.',
          source: 'https://example.com/testing',
        },
      ],
    });
    expect(envelope.searchesPerformed).toBe(1);
    expect(envelope.mcpCallsPerformed).toBe(1);
  });

  it('rejects an empty question with a plain 400 before any outbound call', async () => {
    const scope = mockAnthropicBetaMessagesCreate(fixtureResponse());

    await request(app.getHttpServer())
      .post('/web-repo-research-reporter/run')
      .send({ question: '' })
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('rejects a maxSearches outside 1-10 with a plain 400 before any outbound call', async () => {
    const scope = mockAnthropicBetaMessagesCreate(fixtureResponse());

    await request(app.getHttpServer())
      .post('/web-repo-research-reporter/run')
      .send({ question: 'A question', maxSearches: 11 })
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('rejects a non-integer maxSearches with a plain 400 before any outbound call', async () => {
    const scope = mockAnthropicBetaMessagesCreate(fixtureResponse());

    await request(app.getHttpServer())
      .post('/web-repo-research-reporter/run')
      .send({ question: 'A question', maxSearches: 2.5 })
      .expect(400);

    expect(scope.isDone()).toBe(false);
  });

  it('returns a 502 with the shaped error body when the response has no text block', async () => {
    mockAnthropicBetaMessagesCreate(
      fakeTextMessage('unused', {
        content: [
          {
            type: 'server_tool_use',
            id: 'srv_1',
            name: 'web_search',
            input: {},
          },
        ] as unknown as ReturnType<typeof fakeTextMessage>['content'],
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/web-repo-research-reporter/run')
      .send({ question: 'A question' })
      .expect(502);

    const body = response.body as ShapedErrorBody;
    expect(body.error.source).toBe('anthropic');
    expect(typeof body.error.message).toBe('string');
  });
});
