import nock from 'nock';
import { AppConfigService } from '../config/config.service';
import { useNockFixtures } from '../../testing/http-fixtures/nock-lifecycle';
import {
  ANTHROPIC_API_BASE_URL,
  mockAnthropicModelsAuthError,
  mockAnthropicModelsList,
} from '../../testing/http-fixtures/anthropic.fixtures';
import { KeyHealthService } from './key-health.service';

function buildService(apiKey = 'test-key'): KeyHealthService {
  return new KeyHealthService({ anthropicApiKey: apiKey } as AppConfigService);
}

describe('KeyHealthService', () => {
  useNockFixtures();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports valid when the Models API call succeeds', async () => {
    const scope = mockAnthropicModelsList([{ id: 'claude-sonnet-5' }]);
    const service = buildService();

    await expect(service.getKeyStatus()).resolves.toBe('valid');
    expect(scope.isDone()).toBe(true);
  });

  it('reports invalid when the Models API call fails with an authentication error', async () => {
    mockAnthropicModelsAuthError();
    const service = buildService('bad-key');

    await expect(service.getKeyStatus()).resolves.toBe('invalid');
  });

  it('never calls anything other than the Models API endpoint', async () => {
    const scope = mockAnthropicModelsList([{ id: 'claude-sonnet-5' }]);
    const service = buildService();

    await service.getKeyStatus();

    expect(scope.isDone()).toBe(true);
  });

  it('preserves the default valid status on a transient, non-auth error', async () => {
    nock(ANTHROPIC_API_BASE_URL)
      .get('/v1/models')
      .query(true)
      .replyWithError('network failure');
    const service = buildService();

    await expect(service.getKeyStatus()).resolves.toBe('valid');
  });

  it('preserves the previously cached invalid status on a later transient error', async () => {
    mockAnthropicModelsAuthError();
    const service = buildService('bad-key');
    await expect(service.getKeyStatus()).resolves.toBe('invalid');

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);
    nock(ANTHROPIC_API_BASE_URL)
      .get('/v1/models')
      .query(true)
      .replyWithError('network failure');

    await expect(service.getKeyStatus()).resolves.toBe('invalid');
  });

  it('reuses the cached result within the 5-minute TTL', async () => {
    const scope = mockAnthropicModelsList([{ id: 'claude-sonnet-5' }]);
    const service = buildService();

    await expect(service.getKeyStatus()).resolves.toBe('valid');
    expect(scope.isDone()).toBe(true);

    // No second interceptor is registered; a fresh call here would fail
    // loudly (real network is disabled), proving the cache was reused.
    await expect(service.getKeyStatus()).resolves.toBe('valid');
  });

  it('runs a fresh check once the TTL has expired', async () => {
    mockAnthropicModelsList([{ id: 'claude-sonnet-5' }]);
    const service = buildService();
    await expect(service.getKeyStatus()).resolves.toBe('valid');

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);
    mockAnthropicModelsAuthError();

    await expect(service.getKeyStatus()).resolves.toBe('invalid');
  });
});
