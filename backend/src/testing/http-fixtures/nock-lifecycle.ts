import nock from 'nock';

/** Call once per integration-test file, before using any fixture below. See test-doubles.md. */
export function useNockFixtures(): void {
  beforeAll(() => {
    nock.disableNetConnect();
    nock.enableNetConnect(/^(127\.0\.0\.1|localhost)/);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });
}
