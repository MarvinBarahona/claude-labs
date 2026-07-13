import nock from 'nock';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicMessage } from '../anthropic/anthropic-client';

export const ANTHROPIC_API_BASE_URL = 'https://api.anthropic.com';

/** Intercepts one `POST /v1/messages` call and replies with a canned message. */
export function mockAnthropicMessagesCreate(
  response: AnthropicMessage,
): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL).post('/v1/messages').reply(200, response);
}

/** Intercepts one `POST /v1/messages` call and replies with an auth error, as the real API does for an invalid key. */
export function mockAnthropicMessagesAuthError(): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .post('/v1/messages')
    .reply(401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
}

/** Intercepts one `GET /v1/models` call and replies with a canned model list. */
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

/** Intercepts one `GET /v1/models` call and replies with an auth error, as the real API does for an invalid key. */
export function mockAnthropicModelsAuthError(): nock.Scope {
  return nock(ANTHROPIC_API_BASE_URL)
    .get('/v1/models')
    .query(true)
    .reply(401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
}
