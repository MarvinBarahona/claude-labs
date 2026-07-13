import nock from 'nock';

/**
 * Call once per integration-test file (inside a top-level `describe`), before
 * using any fixture below. Disables real network access for the whole file
 * so a fixture that's missing an interceptor fails loudly instead of quietly
 * reaching the real network, clears interceptors between tests so one test's
 * fixtures can't leak into the next, and restores real network access when
 * the file finishes.
 */
export function useNockFixtures(): void {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });
}
