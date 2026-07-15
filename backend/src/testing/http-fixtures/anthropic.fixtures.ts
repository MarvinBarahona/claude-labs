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
