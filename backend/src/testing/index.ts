/**
 * Shared test doubles for every external client this app talks to.
 *
 * Unit tests: bind `AnthropicClient` to a `FakeAnthropicClient` (queued via
 * `queueMessage`/`queueStream`) in place of the real client, e.g.
 *
 *   Test.createTestingModule({
 *     providers: [MyService, { provide: AnthropicClient, useValue: new FakeAnthropicClient().queueMessage(fakeTextMessage('hi')) }],
 *   })
 *
 * Integration tests (a real Nest app instance, real SDK/Octokit/axios calls
 * intercepted before they leave the process): call `useNockFixtures()` once
 * per spec file, then use a fixture like `mockAnthropicMessagesCreate()` to
 * queue the canned HTTP response for the next request to that host.
 *
 * A data-source client (GitHub, Open-Meteo, arXiv, Wikimedia Commons) gets
 * its own fake/fixture set here the same way, added alongside whichever
 * task or feature first consumes that client — not all up front.
 */
export * from './anthropic';
export * from './http-fixtures';
