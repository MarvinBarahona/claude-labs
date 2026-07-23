import nock from 'nock';
import Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicMessage,
  AnthropicStreamEvent,
} from '../../shared/anthropic-client/anthropic-client';

export const ANTHROPIC_API_BASE_URL = 'https://api.anthropic.com';

export function mockAnthropicMessagesCreate(
  response: AnthropicMessage,
): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL).post('/v1/messages').reply(200, response);
}

export function mockAnthropicMessagesStream(
  events: AnthropicStreamEvent[],
): nock.Scope {
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');

  return nock(ANTHROPIC_API_BASE_URL)
    .post('/v1/messages')
    .reply(200, body, { 'Content-Type': 'text/event-stream' });
}

/** Streaming counterpart of `mockAnthropicBetaMessagesCreate` — same `?beta=true` path, SSE body. */
export function mockAnthropicBetaMessagesStream(
  events: AnthropicStreamEvent[],
): nock.Scope {
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');

  return nock(ANTHROPIC_API_BASE_URL)
    .post('/v1/messages')
    .query({ beta: 'true' })
    .reply(200, body, { 'Content-Type': 'text/event-stream' });
}

export function mockAnthropicMessagesAuthError(): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .post('/v1/messages')
    .reply(401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
}

export function mockAnthropicModelsList(
  models: Array<Partial<Anthropic.Models.ModelInfo> & { id: string }>,
): nock.Scope {
  const data: Anthropic.Models.ModelInfo[] = models.map((model) => ({
    capabilities: null,
    created_at: '2026-01-01T00:00:00Z',
    display_name: model.id,
    max_input_tokens: null,
    max_tokens: null,
    type: 'model',
    ...model,
  }));

  return nock(ANTHROPIC_API_BASE_URL)
    .get('/v1/models')
    .query(true)
    .reply(200, {
      data,
      has_more: false,
      first_id: data[0]?.id ?? null,
      last_id: data[data.length - 1]?.id ?? null,
    });
}

export function mockAnthropicModelsAuthError(): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .get('/v1/models')
    .query(true)
    .reply(401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
}

/** For a call made with `betas` set (e.g. a Files-API `file_id` document reference) — the SDK's beta client posts to this same path with `?beta=true`, not a different URL. */
export function mockAnthropicBetaMessagesCreate(
  response: AnthropicMessage,
): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .post('/v1/messages')
    .query({ beta: 'true' })
    .reply(200, response);
}

export function mockAnthropicFilesUpload(fileId: string): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .post('/v1/files')
    .query({ beta: 'true' })
    .reply(200, {
      id: fileId,
      type: 'file',
      created_at: '2026-01-01T00:00:00Z',
      filename: 'upload',
      mime_type: 'application/octet-stream',
      size_bytes: 0,
      downloadable: false,
    });
}

export function mockAnthropicFilesUploadAuthError(): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .post('/v1/files')
    .query({ beta: 'true' })
    .reply(401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
}

export function mockAnthropicFilesRetrieveMetadata(
  fileId: string,
  filename: string,
  mimeType: string,
): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .get(`/v1/files/${fileId}`)
    .query({ beta: 'true' })
    .reply(200, {
      id: fileId,
      type: 'file',
      created_at: '2026-01-01T00:00:00Z',
      filename,
      mime_type: mimeType,
      size_bytes: 0,
      downloadable: true,
    });
}

export function mockAnthropicFilesRetrieveMetadataAuthError(
  fileId: string,
): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .get(`/v1/files/${fileId}`)
    .query({ beta: 'true' })
    .reply(401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
}

export function mockAnthropicFilesDownload(
  fileId: string,
  content: Buffer,
): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .get(`/v1/files/${fileId}/content`)
    .query({ beta: 'true' })
    .reply(200, content);
}

export function mockAnthropicFilesDownloadAuthError(
  fileId: string,
): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .get(`/v1/files/${fileId}/content`)
    .query({ beta: 'true' })
    .reply(401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
}

export function mockAnthropicSkillsCreate(skillId: string): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .post('/v1/skills')
    .query({ beta: 'true' })
    .reply(200, {
      id: skillId,
      type: 'skill',
      created_at: '2026-01-01T00:00:00Z',
      latest_version: '1',
    });
}

export function mockAnthropicSkillsCreateAuthError(): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .post('/v1/skills')
    .query({ beta: 'true' })
    .reply(401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
}
