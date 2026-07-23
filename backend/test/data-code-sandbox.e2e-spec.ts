import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { useNockFixtures } from '../src/testing/http-fixtures/nock-lifecycle';
import {
  mockAnthropicBetaMessagesCreate,
  mockAnthropicFilesUpload,
  mockAnthropicFilesRetrieveMetadata,
  mockAnthropicFilesDownload,
  mockAnthropicSkillsCreate,
} from '../src/testing/http-fixtures/anthropic.fixtures';
import {
  mockGithubIssues,
  mockGithubCommits,
  mockGithubRateLimitError,
} from '../src/testing/http-fixtures/github.fixtures';
import { fakeTextMessage } from '../src/testing/anthropic/message-builders';
import type { AnthropicMessage } from '../src/shared/anthropic-client/anthropic-client';
import type { DataCodeSandboxEnvelope } from '../src/data-code-sandbox/data-code-sandbox.service';

const REPO_PATH = 'angular/angular';

function mockDatasetFixtures(): void {
  mockGithubIssues(REPO_PATH, [
    {
      number: 1,
      title: 'Fake issue',
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
        message: 'Fix a bug',
        author: { name: 'someone', date: '2026-01-01T00:00:00Z' },
      },
      html_url: `https://github.com/${REPO_PATH}/commit/abc123`,
    },
  ]);
}

function codeExecutionResponse(): AnthropicMessage {
  return fakeTextMessage('Here is the chart.', {
    content: [
      {
        type: 'server_tool_use',
        id: 'srvtoolu_1',
        name: 'bash_code_execution',
        input: { command: 'python analyze.py' },
      },
      {
        type: 'bash_code_execution_tool_result',
        tool_use_id: 'srvtoolu_1',
        content: {
          stdout: 'chart saved',
          stderr: '',
          return_code: 0,
          content: [
            { type: 'bash_code_execution_output', file_id: 'file_out_1' },
          ],
        },
      },
    ] as unknown as AnthropicMessage['content'],
  });
}

interface ShapedErrorBody {
  error: { message: string; source: string };
}

describe('DataCodeSandboxController (e2e)', () => {
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

  it('POST /run (useSkill: false) fetches the dataset, uploads it, runs code execution, and returns the full envelope', async () => {
    mockDatasetFixtures();
    mockAnthropicFilesUpload('file_dataset_1');
    mockAnthropicBetaMessagesCreate(codeExecutionResponse());
    mockAnthropicFilesRetrieveMetadata('file_out_1', 'chart.png', 'image/png');
    mockAnthropicFilesDownload('file_out_1', Buffer.from('png bytes'));

    const response = await request(app.getHttpServer())
      .post('/data-code-sandbox/run')
      .send({ prompt: 'Chart commit frequency by month.', useSkill: false })
      .expect(200);

    const envelope = response.body as DataCodeSandboxEnvelope;
    expect(envelope.executedCode).toEqual([
      {
        command: 'python analyze.py',
        stdout: 'chart saved',
        stderr: '',
        returnCode: 0,
      },
    ]);
    expect(envelope.outputFiles).toEqual([
      {
        fileId: 'file_out_1',
        filename: 'chart.png',
        mediaType: 'image/png',
        dataBase64: Buffer.from('png bytes').toString('base64'),
      },
    ]);
    expect(envelope.skillUsed).toBe(false);
    expect(envelope.calls).toBeUndefined();
    expect(envelope.cache).toBeUndefined();
  });

  it('POST /run (useSkill: true) registers the skill, attaches container.skills, and returns skillUsed: true', async () => {
    mockDatasetFixtures();
    mockAnthropicSkillsCreate('skill_abc123');
    mockAnthropicFilesUpload('file_dataset_2');
    mockAnthropicBetaMessagesCreate(
      fakeTextMessage('Used the skill.', {
        content: [
          {
            type: 'server_tool_use',
            id: 'srvtoolu_2',
            name: 'bash_code_execution',
            input: {
              command:
                'python /skills/spreadsheet-export/export_xlsx.py out.xlsx data.json',
            },
          },
          {
            type: 'bash_code_execution_tool_result',
            tool_use_id: 'srvtoolu_2',
            content: { stdout: '', stderr: '', return_code: 0 },
          },
        ] as unknown as AnthropicMessage['content'],
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/data-code-sandbox/run')
      .send({ prompt: 'Export the data as a spreadsheet.', useSkill: true })
      .expect(200);

    const envelope = response.body as DataCodeSandboxEnvelope;
    expect(envelope.skillUsed).toBe(true);
    const requestBody = envelope.request as { container?: unknown };
    expect(requestBody.container).toEqual({
      skills: [{ type: 'custom', skill_id: 'skill_abc123', version: 'latest' }],
    });
  });

  it('returns a 502 with the shaped error body when the GitHub fetch fails', async () => {
    mockGithubRateLimitError(REPO_PATH);
    mockGithubCommits(REPO_PATH, [
      {
        sha: 'abc123',
        commit: {
          message: 'Fix a bug',
          author: { name: 'someone', date: '2026-01-01T00:00:00Z' },
        },
        html_url: `https://github.com/${REPO_PATH}/commit/abc123`,
      },
    ]);

    const response = await request(app.getHttpServer())
      .post('/data-code-sandbox/run')
      .send({ prompt: 'Chart commit frequency by month.', useSkill: false })
      .expect(502);

    expect((response.body as ShapedErrorBody).error.source).toBe('github');
  });

  it('rejects an empty prompt with a plain 400 before any outbound call', async () => {
    await request(app.getHttpServer())
      .post('/data-code-sandbox/run')
      .send({ prompt: '', useSkill: false })
      .expect(400);
  });
});
