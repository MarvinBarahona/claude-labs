# Task — Test Doubles for External Clients

**Status:** In progress.

## Purpose

Shared fakes for every external client this app talks to — the Anthropic SDK client and each data-source client (GitHub, Open-Meteo, arXiv, Wikimedia Commons) — plus the `nock`-based HTTP-fixture helper integration tests use, so that no lab invents its own ad hoc mock and no test anywhere needs a real credential or real network access. This is the direct consequence of `testing-strategy.md`'s no-real-credentials rule: it only works in practice if every external client is easy to fake, in one place, instead of each task/feature solving that problem for itself.

## Interface

A small library of test-only helpers, imported by any lab's test suite:

- A fake Anthropic client provider — canned non-streaming responses, canned streaming event sequences, and canned tool-use loops — swappable in for the real client via Nest's DI in unit tests.
- A fake implementation per data-source client (GitHub, Open-Meteo, arXiv, Wikimedia Commons), added incrementally as each task/feature that consumes one is actually built, not all up front.
- A `nock`-based fixture helper for integration tests: one fixture set per external host, so real request-building/response-handling code runs against a canned response instead of the real network.

## Consumers

Every task and feature whose own tests exercise an external client — most directly [`model-config.md`](../shared/model-config.md) and [`task-github-provider.md`](task-github-provider.md), and then every feature built after them.

## Build order & dependencies

Order relative to [`model-config.md`](../shared/model-config.md) / [`inspector-panel.md`](../shared/inspector-panel.md) / [`docs-panel.md`](../shared/docs-panel.md) / [`app-shell.md`](../shared/app-shell.md) doesn't matter — all five sit between [`env-config.md`](../shared/env-config.md) and the first feature, Foundations Console (see `status.md` for current position). Depends on [`project-scaffold.md`](../shared/project-scaffold.md) for the test tooling to exist; no dependency on `env-config.md` itself, since these fakes replace the client that a real config value would otherwise feed.

## Test scenarios

- [x] A unit test can inject the fake Anthropic client instead of a real one and get a canned, deterministic response.
- [ ] A unit test can inject a fake data-source client instead of a real one and get canned fixture data. — no data-source client exists yet to fake; deferred to whichever task first consumes one (see Development notes).
- [x] An integration test using the `nock`-based fixture helper exercises the app's real HTTP-calling code (real SDK/Octokit/axios calls) without any request leaving the test process.
- [x] No test anywhere in the suite requires a real `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, or any other real credential to pass.

## To-do list

- [x] Implement the fake Anthropic client provider (canned non-streaming responses, canned streaming event sequences, canned tool-use loops), swappable via Nest DI.
- [x] Wire `nock` as the integration-test HTTP interception layer, with one fixture set per external host.
- [ ] Add each data-source fake incrementally, alongside the task/feature that first consumes it, rather than building all of them up front. — intentionally not started; no data-source task has been built yet (see Development notes).
- [x] Document how a new lab's tests should reach for these fakes instead of writing their own.

## Open questions

None. Resolved: incremental — the fake Anthropic client starts with only the basic non-streaming/streaming text-response shape (all Foundations Console needs), and gains a new content-block/streaming-event shape only when the feature that actually needs it (tool use, thinking, citations, etc.) is built, matching the to-do list above.

## Development notes

- **[technical]** No shared "real Anthropic client" module exists yet in this codebase (per `task-key-health.md`'s own note, that's deferred to whichever feature first calls the Messages API for real — not yet built). Since this task's whole job is to establish the mockable seam ahead of that, `AnthropicClient` (an abstract class used as a Nest DI token, `backend/src/testing/anthropic/anthropic-client.ts`) is defined *by this task* rather than promoted from an existing real implementation — `createMessage()`/`streamMessage()`, typed against `@anthropic-ai/sdk`'s own `Message`/`MessageCreateParams`/`RawMessageStreamEvent` types so a future real-client provider can implement it as a thin adapter with no reshaping. `@anthropic-ai/sdk` was added as a real (non-dev) dependency for this reason — its types are load-bearing for the fake now, and the real client will need the package itself later.
- **[technical]** `backend/src/testing/` is new — a shared-module folder (per `repo-layout.md`'s "shared functionality" rule) but for test-only code, so it's excluded from the production build (`backend/tsconfig.build.json` now excludes `src/testing`, mirroring how `**/*spec.ts` was already excluded) to keep `nock` and other test-only tooling out of `dist`.
- **[technical]** `nock`'s fixture helper (`backend/src/testing/http-fixtures/`) currently only covers the Anthropic host (`mockAnthropicMessagesCreate`/`mockAnthropicModelsList`/their auth-error variants, plus a generic `useNockFixtures()` lifecycle helper) — no data-source host yet, since no data-source client is consumed anywhere yet. The Models API fixture was included now (not just Messages) because `task-key-health.md`'s own plan already names a `nock`-style intercept of `client.models.list()` as one of its test scenarios; building both now means that task doesn't have to add its own ad hoc Anthropic fixture later.
- **[process]** Caught by `tsc --noEmit` but not by `npm test`: this project's Jest config runs `ts-jest` with `isolatedModules: true` (fast per-file transpilation), which does *not* type-check — a genuine type error (e.g. referencing an SDK type member that doesn't actually exist) can pass `npm test` silently and only surface via `npm run lint` (type-aware ESLint) or a manual `tsc --noEmit`. Worth flagging as a process gap: neither `CLAUDE.md`'s test commands nor this repo's lint step is documented as a required pre-commit check, so a future build could ship a type error that only `npm run lint`/`tsc --noEmit` would catch. Suggesting (not applying) this as a `docs/process-notes.md` candidate: run `npm run lint` (and/or `tsc --noEmit`) as part of this project's standard test-and-verify step, not just `npm test`.
- **[data-source fakes]** Deferred exactly as planned — no GitHub/Open-Meteo/arXiv/Wikimedia Commons fake was added in this pass; `task-github-provider.md` (next data-source consumer) is expected to add the first one, following the pattern established here (`backend/src/testing/<source>/`, a `Fake<Source>Client` bound to an abstract-class DI token, exported from `backend/src/testing/index.ts`).
