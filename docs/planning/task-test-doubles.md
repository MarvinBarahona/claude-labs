# Task — Test Doubles for External Clients

**Status:** Planned.

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

- [ ] A unit test can inject the fake Anthropic client instead of a real one and get a canned, deterministic response.
- [ ] A unit test can inject a fake data-source client instead of a real one and get canned fixture data.
- [ ] An integration test using the `nock`-based fixture helper exercises the app's real HTTP-calling code (real SDK/Octokit/axios calls) without any request leaving the test process.
- [ ] No test anywhere in the suite requires a real `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, or any other real credential to pass.

## To-do list

- [ ] Implement the fake Anthropic client provider (canned non-streaming responses, canned streaming event sequences, canned tool-use loops), swappable via Nest DI.
- [ ] Wire `nock` as the integration-test HTTP interception layer, with one fixture set per external host.
- [ ] Add each data-source fake incrementally, alongside the task/feature that first consumes it, rather than building all of them up front.
- [ ] Document how a new lab's tests should reach for these fakes instead of writing their own.

## Open questions

None. Resolved: incremental — the fake Anthropic client starts with only the basic non-streaming/streaming text-response shape (all Foundations Console needs), and gains a new content-block/streaming-event shape only when the feature that actually needs it (tool use, thinking, citations, etc.) is built, matching the to-do list above.
