# Test Doubles for External Clients

Shared fakes for every external client the backend talks to — the Anthropic SDK client and each data-source client (GitHub, Open-Meteo, arXiv, Wikimedia Commons) — plus a `nock`-based HTTP-fixture helper for integration tests. No lab writes its own ad hoc mock, and no test anywhere needs a real credential or real network access (see `testing-strategy.md`).

## Interface

All exported from `backend/src/testing/index.ts`.

- **Fake Anthropic client** (`backend/src/testing/anthropic/anthropic-client.ts`) — `AnthropicClient` is an abstract class used as a Nest DI token, exposing `createMessage()` / `streamMessage()` typed against `@anthropic-ai/sdk`'s own `Message` / `MessageCreateParams` / `RawMessageStreamEvent` types. The fake implementation returns canned non-streaming responses, canned streaming event sequences, and canned tool-use loops. No real `AnthropicClient` implementation exists yet in this codebase — whichever feature first calls the Messages API for real should implement it as a thin adapter over `@anthropic-ai/sdk`, with no reshaping needed since the token is already typed against the SDK's own types.
- **`nock`-based fixture helper** (`backend/src/testing/http-fixtures/`) — one fixture set per external host, so integration tests exercise the app's real HTTP-calling code (real SDK/Octokit/axios calls) without any request leaving the test process. Currently covers the Anthropic host only: `mockAnthropicMessagesCreate` / `mockAnthropicModelsList` and their auth-error variants, plus `useNockFixtures()`, a generic lifecycle helper any host's fixtures can use. `useNockFixtures()` disables real network access for external hosts but always leaves loopback (`127.0.0.1`/`localhost`) connections enabled, so a `supertest`-driven e2e test can still reach the real local app under test in the same run as an external-host mock. No data-source host is covered yet — none is consumed anywhere yet.
- **Data-source fakes** (GitHub, Open-Meteo, arXiv, Wikimedia Commons) — not yet built. Added incrementally, one per data-source client, alongside whichever task/feature first consumes that client — not all up front. Each follows the same pattern as the Anthropic client: `backend/src/testing/<source>/`, a `Fake<Source>Client` bound to an abstract-class DI token, exported from `backend/src/testing/index.ts`.

## Using it

- **Backend unit tests** — bind the DI token (e.g. `AnthropicClient`) to the fake implementation in the test module instead of a real provider, and get a canned, deterministic response with no HTTP involved.
- **Backend integration tests** — call `useNockFixtures()` for lifecycle setup, then the relevant per-host fixture functions (e.g. `mockAnthropicMessagesCreate`) before exercising the real request path.

## Build note

`backend/src/testing/` is a shared-module folder (per `repo-layout.md`'s "shared functionality" rule) but for test-only code — it's excluded from `backend/tsconfig.build.json`'s build (mirroring how `**/*spec.ts` is already excluded), so `nock` and other test-only tooling never end up in `dist`.
