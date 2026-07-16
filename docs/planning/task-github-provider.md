# Task — GitHub Data Provider

**Status:** 📋 Planned.

**Depends on:**
- [`env-config.md`](../shared/env-config.md), "Interface" section — `AppConfigService.githubTargetRepo` (defaults `angular/angular`) and `AppConfigService.githubToken` (`undefined` if unset) already exist; this task consumes them as-is, no new config wiring needed.
- [`test-doubles.md`](../shared/test-doubles.md), "Interface" section's "Data-source fakes" bullet and "Build note" section — this is that section's first data-source fake, following the exact same location/DI-token/export/build-exclusion pattern already proven by the Anthropic client.
- [`api-error-handling.md`](../shared/api-error-handling.md), "Interface" section — `ExternalApiError`.
- [`anthropic-client.md`](../shared/anthropic-client.md), "Interface" section — structural pattern this task mirrors (abstract-class DI token + real adapter + `fakeSwitchProvider`-bound module), adapted for GitHub instead of the Claude API.
- [`fake-mode.md`](../shared/fake-mode.md), "Interface" section — `fakeSwitchProvider()`, including its "Using it" section's note on pinning the generic explicitly if `RealGithubClient` ends up with a `private` field `FakeGithubClient` doesn't share.
- [`repo-layout.md`](../technical/repo-layout.md), "Shared functionality" section (backend shared-module placement: `backend/src/shared/<concern>/`) and its "Test-only shared code" bullet (`backend/src/testing/<concern>/`).
- [`testing-strategy.md`](../technical/testing-strategy.md), "Every external client sits behind a mockable seam" bullet — unit tests bind the fake directly; integration tests let the real client run with `nock` intercepting the outbound HTTP call.

## Purpose

One backend module wrapping the GitHub REST API (`api.github.com`) — issues, commits, releases, file tree — against `GITHUB_TARGET_REPO`. Every other module that needs repo data depends on this instead of calling GitHub directly, so the "recurring subject repo" story stays consistent everywhere and there's exactly one place handling GitHub's rate limits and response shapes. This is also the app's embodiment of [`guiding-principles.md`](../technical/guiding-principles.md)'s "Minimize integrations" principle: one shared, key-free GitHub integration reused across most features, rather than each rolling its own.

## Interface

`backend/src/shared/github-provider/`:

- **`github-provider.types.ts`** — the typed shapes every method returns:
  ```ts
  interface GithubIssue {
    number: number;
    title: string;
    state: 'open' | 'closed';
    body: string | null;
    user: string;
    createdAt: string;
    url: string;
  }

  interface GithubCommit {
    sha: string;
    message: string;
    author: string;
    date: string;
    url: string;
  }

  interface GithubRelease {
    tagName: string;
    name: string | null;
    body: string | null;
    publishedAt: string;
    url: string;
  }

  interface GithubFileTreeEntry {
    path: string;
    type: 'blob' | 'tree';
    sha: string;
  }
  ```
- **`GithubClient`** (`github-client.ts`) — the abstract-class DI token, mirroring `AnthropicClient`'s shape:
  ```ts
  abstract class GithubClient {
    abstract getIssues(params?: { state?: 'open' | 'closed' | 'all'; perPage?: number }): Promise<GithubIssue[]>;
    abstract getCommits(params?: { perPage?: number }): Promise<GithubCommit[]>;
    abstract getReleases(params?: { perPage?: number }): Promise<GithubRelease[]>;
    abstract getFileTree(): Promise<GithubFileTreeEntry[]>;
  }
  ```
  Every method operates on the single configured target repo (`AppConfigService.githubTargetRepo`) — no method takes a repo override; the app has exactly one subject repo.
- **`RealGithubClient`** (`real-github-client.ts`) — uses `axios` directly (already a dependency; no new package needed) against `https://api.github.com`, reading `AppConfigService.githubTargetRepo`/`githubToken` via constructor injection, same pattern as `RealAnthropicClient`. Sends `Authorization: Bearer <githubToken>` when set, no auth header otherwise. `getFileTree()` first reads `GET /repos/{owner}/{repo}` for `default_branch`, then `GET /repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1`, returning its `tree` array mapped to `GithubFileTreeEntry[]`. `getIssues`/`getCommits`/`getReleases` call their corresponding list endpoints (`/issues`, `/commits`, `/releases`) directly. Any thrown axios error (4xx/5xx, network failure) is caught and rethrown as `ExternalApiError('github', <original message>)`, exactly like `RealAnthropicClient`'s `toExternalApiError()` helper.
- **`GithubProviderModule`** (`github-provider.module.ts`) — `providers: [fakeSwitchProvider(GithubClient, { real: RealGithubClient, fake: FakeGithubClient })], exports: [GithubClient]`. A consuming feature module imports this and injects `GithubClient`, never `RealGithubClient`/`FakeGithubClient` directly.
- **`FakeGithubClient`** (`backend/src/testing/github/fake-github-client.ts`) — unlike `FakeAnthropicClient`'s throw-when-unqueued design (needed because Anthropic responses are scripted per scenario), GitHub data is naturally static: `FakeGithubClient` returns built-in canned fixture data for all four methods by default, so a live fake-mode app never dead-ends on an unscripted call and no module-level `allowUnqueuedFallback` flag is needed. Exposes setter methods (`setIssues()`, `setCommits()`, `setReleases()`, `setFileTree()`) letting a unit test override any one of them before exercising a consumer. Exported (alongside a re-export of `GithubClient` from its real, build-included location) from `backend/src/testing/index.ts`, per `test-doubles.md`.

## Consumers

Direct consumers: [`feature-live-tool-use-console.md`](feature-live-tool-use-console.md) (repo-stats tool), [`feature-data-code-sandbox.md`](feature-data-code-sandbox.md) (repo activity data), [`feature-workflow-gallery.md`](feature-workflow-gallery.md) (real issues), [`feature-agent-playground.md`](feature-agent-playground.md) (repo exploration tools). [`feature-extended-thinking-bench.md`](feature-extended-thinking-bench.md) depends on it only transitively, through Workflow Gallery's already-fetched issue data — it makes no direct GitHub calls of its own.

## Non-goals

An in-memory TTL cache per endpoint+repo (to reduce calls against the unauthenticated 60/hr rate limit) was considered, since multiple features query the same repo. Deliberately out of scope for this task — no consumer's usage pattern has proven a need for it yet, and it's unrelated to [`task-caching-layer.md`](task-caching-layer.md) (that task covers Claude API prompt-caching breakpoints, a distinct concept from an HTTP response cache). If a future consumer's rate-limit usage demands it, it becomes its own follow-on task against this module rather than being speculatively built now.

## Build order & dependencies

Right after Demo deploy, before Live Tool-Use Console (see `status.md` for current position). Unlocks Live Tool-Use Console, Data & Code Sandbox, Workflow Gallery, Agent Playground (and, transitively, Extended Thinking Bench). Live Tool-Use Console is the provider's first consumer.

## Test scenarios

### Automated

**Backend unit** (`github-provider.module.spec.ts`, mirroring `anthropic-client.module.spec.ts`):
- `GithubProviderModule` binds `RealGithubClient` when `fakeMode` is `false` and `FakeGithubClient` when `true`, using a stub config module (never the real `AppConfigModule`).

**Backend unit** (`fake-github-client.spec.ts`):
- Each of `getIssues`/`getCommits`/`getReleases`/`getFileTree` returns its built-in canned fixture when nothing is overridden.
- Calling the matching setter (`setIssues()` etc.) before a call returns the overridden data instead.

**Backend integration** (`real-github-client.spec.ts`, `nock`-intercepted, per `test-doubles.md`'s `useNockFixtures()` pattern):
- `getIssues()`/`getCommits()`/`getReleases()` against the default repo (`angular/angular`) each hit the expected `api.github.com` path and shape the fixture response into the typed return array.
- `getFileTree()` reads `default_branch` from the repo endpoint first, then hits `git/trees/{default_branch}?recursive=1` and shapes the `tree` array.
- Overriding `GITHUB_TARGET_REPO` re-points every method's request path at the new repo.
- No `GITHUB_TOKEN` set → the request carries no `Authorization` header.
- `GITHUB_TOKEN` set → the request carries `Authorization: Bearer <token>` automatically.
- A GitHub API error response (403 rate-limit, 404 not found) is caught and rethrown as `ExternalApiError('github', <message>)`, never a raw unhandled exception.

### Manual

None — this task has no frontend/UI surface of its own.

## To-do list

- [ ] Add `github-provider.types.ts` with `GithubIssue`/`GithubCommit`/`GithubRelease`/`GithubFileTreeEntry`.
- [ ] Implement the `GithubClient` abstract-class DI token (`github-client.ts`).
- [ ] Implement `RealGithubClient` — issues/commits/releases/file-tree endpoints via `axios`, `Authorization` header only when `githubToken` is set, errors rethrown as `ExternalApiError('github', ...)`.
- [ ] Implement `GithubProviderModule`, binding `GithubClient` via `fakeSwitchProvider(GithubClient, { real: RealGithubClient, fake: FakeGithubClient })`.
- [ ] Add `FakeGithubClient` at `backend/src/testing/github/fake-github-client.ts` with built-in canned fixtures and per-method setters; export it and `GithubClient` from `backend/src/testing/index.ts`.
- [ ] Add `backend/src/testing/http-fixtures/github.fixtures.ts` — `nock` fixtures for successful issues/commits/releases/repo/tree responses plus a 403 and a 404 error response.
- [ ] Write the automated test scenarios above.

## Open questions

None.
