# Frontend Browser E2E Tests

An automated, browser-driven end-to-end test suite (Playwright) that runs against this project's own real, running dev stack — real page navigation, real clicks, real streaming as a browser actually receives it — rather than any mocked or in-process boundary. See `testing-strategy.md`'s "Frontend browser E2E" for how this bucket differs from "Frontend integration" (HTTP-only, no browser) and from backend's own `*.e2e-spec.ts` files (supertest-driven, also no browser).

One spec file per lab it covers, each asserting that lab's own happy path and major checks — not exhaustive per-lab coverage.

## Suite

New top-level `e2e/` directory (sibling to `frontend/`, `backend/` — see `repo-layout.md`), kept separate from `frontend/` since it runs under a different test runner (Playwright, not Karma/Jest) and pulls in a heavy, binary-downloading dependency that only needs to run occasionally.

- **`e2e/package.json`** — pins `@playwright/test` to `1.48.0`, matching the `mcr.microsoft.com/playwright:v1.48.0-noble` image tag it runs under (a mismatch can pull browser binaries the image doesn't already have baked in).
- **`e2e/playwright.config.ts`** — `testDir: './tests'`, `globalSetup: './global-setup.ts'`, `use.baseURL: 'http://frontend:4200'` (the dev stack's own Compose service name/port).
- **`e2e/global-setup.ts`** — the fake-mode guard, see below.
- **`e2e/tests/`** — one spec file per lab, plus `home.spec.ts` for the landing route; see "Specs" below for the naming/coverage convention.
- **`e2e/tests/support/`** — shared pure-function helpers reused across spec files (e.g. `nav-link-after.ts`, which looks up "the nav link right after label X" by content instead of a hard-coded index — see "Specs" below for why). Filenames here deliberately avoid `test`/`spec` so Playwright's own file discovery never picks them up as specs.

## Running it

Wired as a `docker-compose.dev.yml` service (`e2e`), gated behind a Compose `profile` so a bare `docker compose -f docker-compose.dev.yml up` never starts it:

```
docker compose -f docker-compose.dev.yml run --rm e2e
```

Naming a profiled service directly with `run` auto-activates its own profile — no extra `--profile e2e` flag needed (confirmed against Compose `v5.2.0`). `depends_on: frontend: condition: service_healthy` means this command alone starts (and waits on) `frontend`, which itself already depends on `backend`'s health — no need to have already run `up` first. No `build:` — reuses the official Playwright image directly, the same choice `browser-preview-check` makes for its own one-off container.

## Fake-mode guard

Always runs against a fake-mode dev-stack instance, never real mode — verifying real rendered/streamed behavior without spending a real API call, and without a real credential ever being anywhere near a repeatable, scripted suite. Enforced, not just documented: `global-setup.ts` calls `GET /api/mode` (see `fake-mode.md`'s "Interface") and throws a clear error before any spec runs if `fakeMode` isn't `true`. This is the one test bucket that runs against a real live app process rather than an isolated module or a mocked boundary, so it's the one bucket where this rule needed its own explicit runtime check rather than relying on every other bucket's structural guarantee (never touching a real client at all).

## Specs

One file per lab under `e2e/tests/`, named `<slug>.spec.ts` (`home.spec.ts` for the landing route). Each spec asserts its page's own nav reachability (relative to whichever entry precedes it — a change to nav order is exactly the kind of thing a spec should catch, so assert the real adjacent entry rather than a hard-coded index believed stable), its docs panel where the page has one, and its own happy-path flow end to end, non-streamed and streamed for a lab that supports both.

A spec's docs-panel assertion checks for real, non-empty rendered content, which means that lab's in-app doc (`frontend/public/lab-docs/<slug>.md`) has to already exist — write a lab's in-app doc before its E2E spec, not after, or the spec has nothing real to assert against.

This doc doesn't enumerate what each spec currently asserts — that lives in the spec file itself, which is the only place it can't silently go stale. Adding a new lab's spec, or changing an existing one, never requires an edit here.

## Notes for writing future specs

- `FakeAnthropicClient`'s unqueued-call fallback (see `test-doubles.md`) returns identical canned `usage` (`input_tokens: 10`, `output_tokens: 10`) and `stop_reason: 'end_turn'` for both its non-streaming and streaming paths — a spec can assert those exact values rather than just their shape, and can assert they match between a non-streamed and a streamed turn in the same page.
- When a lab's own rendered result could contain the same text as what the shared inspector panel also renders (e.g. a fallback value duplicated in the inspector's request/response/content-block JSON dump), scope a page-wide text assertion with a `data-testid` on that lab's own result container rather than matching page-wide — see `structured-output-console.html`'s `data-testid="structured-result"`, mirroring `messages-console.html`'s existing `data-testid="transcript-list"`.
- For a tool-use lab whose offered tools aren't queued a response, `FakeAnthropicClient`'s unqueued-call fallback picks whichever offered tool has a name-word (split on `_`, longer than 3 characters) present in the latest user-turn text, falling back to the first offered tool if none match — write the question text to deliberately include (or omit) a given tool's own name word so a spec can assert exactly which tool ran, rather than leaving it to chance.
