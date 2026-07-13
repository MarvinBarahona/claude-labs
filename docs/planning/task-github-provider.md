# Task — GitHub Data Provider

**Status:** Draft.

**Depends on:** [`env-config.md`](../shared/env-config.md) (reads `GITHUB_TARGET_REPO` / `GITHUB_TOKEN` through it); [`test-doubles.md`](../shared/test-doubles.md) (this is the first task expected to add a data-source fake).

## Purpose

One backend module wrapping the GitHub REST API (`api.github.com`) — issues, commits, releases, file tree — against `GITHUB_TARGET_REPO`. Every other module that needs repo data depends on this instead of calling GitHub directly, so the "recurring subject repo" story stays consistent everywhere and there's exactly one place handling GitHub's rate limits and response shapes. This is also the app's embodiment of the "minimize integrations" guiding principle: one shared, key-free GitHub integration reused across most features, rather than each rolling its own.

## Interface

A backend service exposing typed methods for the data each consumer needs (issues, commits, releases, file tree) against the configured target repo, using `GITHUB_TOKEN` when present to get the higher authenticated rate limit.

## Consumers

Direct consumers: [`feature-live-tool-use-console.md`](feature-live-tool-use-console.md) (repo-stats tool), [`feature-data-code-sandbox.md`](feature-data-code-sandbox.md) (repo activity data), [`feature-workflow-gallery.md`](feature-workflow-gallery.md) (real issues), [`feature-agent-playground.md`](feature-agent-playground.md) (repo exploration tools). [`feature-extended-thinking-bench.md`](feature-extended-thinking-bench.md) depends on it only transitively, through Workflow Gallery's already-fetched issue data — it makes no direct GitHub calls of its own.

## Potential other uses

Since multiple features query the same repo and Extended Thinking Bench deliberately reuses Workflow Gallery's fetched data rather than re-querying, this is a natural place for a short in-memory TTL cache per endpoint+repo — it would benefit every consumer automatically (fewer calls against the unauthenticated 60/hr limit) without any of them having to think about caching themselves. Worth considering when this piece is built in detail, not a hard requirement now.

## Build order & dependencies

Right after Foundations Console, before Live Tool-Use Console (see `status.md` for current position). Unlocks Live Tool-Use Console, Data & Code Sandbox, Workflow Gallery, Agent Playground (and, transitively, Extended Thinking Bench). Live Tool-Use Console is the provider's first consumer.

## Test scenarios

- [ ] Fetching issues/commits/releases/file tree for the default repo (`angular/angular`) returns real data shaped consistently for consumers.
- [ ] Overriding `GITHUB_TARGET_REPO` re-points every method at the new repo without code changes.
- [ ] Running unauthenticated (no `GITHUB_TOKEN`) works, just at the lower rate limit.
- [ ] Running authenticated (`GITHUB_TOKEN` set) raises the rate limit and is used automatically when present.
- [ ] A GitHub API error (rate limit hit, repo not found) surfaces as a clear error to the consumer, not a raw unhandled exception.

## To-do list

- [ ] Implement the backend module wrapping issues/commits/releases/file-tree endpoints.
- [ ] Wire `GITHUB_TARGET_REPO` / `GITHUB_TOKEN` through `env-config.md`.
- [ ] Handle GitHub API errors (rate limit, not found) with clear error surfaces.
- [ ] Decide whether to add a short TTL cache per endpoint+repo (see "Potential other uses" above).
- [ ] Add the first data-source fake at `backend/src/testing/github/` — a `FakeGithubClient` bound to an abstract-class DI token, exported from `backend/src/testing/index.ts`, following the same pattern as the existing Anthropic fake (see `test-doubles.md`). This is the task `test-doubles.md` deferred this work to.

## Open questions

None.
