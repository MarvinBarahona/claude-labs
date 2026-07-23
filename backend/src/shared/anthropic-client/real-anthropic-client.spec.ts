import nock from 'nock';
import { useNockFixtures } from '../../testing/http-fixtures/nock-lifecycle';
import {
  ANTHROPIC_API_BASE_URL,
  mockAnthropicMessagesCreate,
  mockAnthropicMessagesAuthError,
  mockAnthropicMessagesStream,
  mockAnthropicFilesUpload,
  mockAnthropicFilesUploadAuthError,
  mockAnthropicFilesRetrieveMetadata,
  mockAnthropicFilesRetrieveMetadataAuthError,
  mockAnthropicFilesDownload,
  mockAnthropicSkillsCreate,
  mockAnthropicSkillsCreateAuthError,
} from '../../testing/http-fixtures/anthropic.fixtures';
import {
  fakeTextMessage,
  fakeTextStreamEvents,
} from '../../testing/anthropic/message-builders';
import { ExternalApiError } from '../api-error-handling';
import { AppConfigService } from '../config/config.service';
import { AnthropicStreamEvent } from './anthropic-client';
import { RealAnthropicClient } from './real-anthropic-client';

const params = { model: 'claude-sonnet-5', max_tokens: 100, messages: [] };

function buildClient(apiKey = 'test-key'): RealAnthropicClient {
  return new RealAnthropicClient({
    anthropicApiKey: apiKey,
  } as AppConfigService);
}

describe('RealAnthropicClient', () => {
  useNockFixtures();

  it('constructs its underlying SDK client from AppConfigService.anthropicApiKey', async () => {
    const scope = mockAnthropicMessagesCreate(fakeTextMessage('hi'));
    const client = buildClient('a-specific-key');

    await client.createMessage(params);

    expect(scope.isDone()).toBe(true);
  });

  it('returns the exact shaped Message on a successful createMessage() call', async () => {
    mockAnthropicMessagesCreate(fakeTextMessage('hello there'));
    const client = buildClient();

    const message = await client.createMessage(params);

    expect(message.content[0]).toMatchObject({
      type: 'text',
      text: 'hello there',
    });
  });

  it('yields the raw stream events in order on a successful streamMessage() call', async () => {
    mockAnthropicMessagesStream(fakeTextStreamEvents('streamed'));
    const client = buildClient();

    const events: AnthropicStreamEvent[] = [];
    for await (const event of client.streamMessage({
      ...params,
      stream: true,
    })) {
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
  });

  it('rethrows a createMessage() auth failure as a normalized ExternalApiError', async () => {
    mockAnthropicMessagesAuthError();
    const client = buildClient('bad-key');

    const error = await client.createMessage(params).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ source: 'anthropic' });
  });

  it('rethrows a streamMessage() auth failure as a normalized ExternalApiError', async () => {
    mockAnthropicMessagesAuthError();
    const client = buildClient('bad-key');

    const drain = async () => {
      for await (const event of client.streamMessage({
        ...params,
        stream: true,
      })) {
        void event; // draining to trigger the underlying request
      }
    };

    const error = await drain().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ source: 'anthropic' });
  });

  it('returns the uploaded file id on a successful uploadFile() call', async () => {
    mockAnthropicFilesUpload('file_abc123');
    const client = buildClient();

    const result = await client.uploadFile(
      Buffer.from('fake pdf bytes'),
      'application/pdf',
    );

    expect(result).toEqual({ id: 'file_abc123' });
  });

  it('sends the files-api-2025-04-14 beta flag on uploadFile()', async () => {
    let sentBetaHeader: string | undefined;
    nock(ANTHROPIC_API_BASE_URL)
      .post('/v1/files')
      .query({ beta: 'true' })
      .reply(function replyToUpload() {
        sentBetaHeader = this.req.headers['anthropic-beta'];
        return [200, { id: 'file_abc123' }];
      });
    const client = buildClient();

    await client.uploadFile(Buffer.from('fake pdf bytes'), 'application/pdf');

    expect(sentBetaHeader).toContain('files-api-2025-04-14');
  });

  it('rethrows an uploadFile() auth failure as a normalized ExternalApiError', async () => {
    mockAnthropicFilesUploadAuthError();
    const client = buildClient('bad-key');

    const error = await client
      .uploadFile(Buffer.from('fake pdf bytes'), 'application/pdf')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ source: 'anthropic' });
  });

  it('returns the downloaded bytes/mediaType/filename on a successful downloadFile() call', async () => {
    mockAnthropicFilesRetrieveMetadata('file_abc123', 'chart.png', 'image/png');
    mockAnthropicFilesDownload('file_abc123', Buffer.from('chart bytes'));
    const client = buildClient();

    const result = await client.downloadFile('file_abc123');

    expect(result.filename).toBe('chart.png');
    expect(result.mediaType).toBe('image/png');
    expect(result.bytes.toString()).toBe('chart bytes');
  });

  it('rethrows a downloadFile() metadata auth failure as a normalized ExternalApiError', async () => {
    mockAnthropicFilesRetrieveMetadataAuthError('file_abc123');
    const client = buildClient('bad-key');

    const error = await client
      .downloadFile('file_abc123')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ source: 'anthropic' });
  });

  it('returns the registered skill id on a successful registerSkill() call', async () => {
    mockAnthropicSkillsCreate('skill_abc123');
    const client = buildClient();

    const result = await client.registerSkill([
      { filename: 'SKILL.md', content: Buffer.from('# spreadsheet-export') },
    ]);

    expect(result).toEqual({ id: 'skill_abc123' });
  });

  it('sends the skills-2025-10-02 beta flag on registerSkill()', async () => {
    let sentBetaHeader: string | undefined;
    nock(ANTHROPIC_API_BASE_URL)
      .post('/v1/skills')
      .query({ beta: 'true' })
      .reply(function replyToSkillCreate() {
        sentBetaHeader = this.req.headers['anthropic-beta'];
        return [200, { id: 'skill_abc123' }];
      });
    const client = buildClient();

    await client.registerSkill([
      { filename: 'SKILL.md', content: Buffer.from('# spreadsheet-export') },
    ]);

    expect(sentBetaHeader).toContain('skills-2025-10-02');
  });

  it('rethrows a registerSkill() auth failure as a normalized ExternalApiError', async () => {
    mockAnthropicSkillsCreateAuthError();
    const client = buildClient('bad-key');

    const error = await client
      .registerSkill([
        { filename: 'SKILL.md', content: Buffer.from('# spreadsheet-export') },
      ])
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ source: 'anthropic' });
  });
});
