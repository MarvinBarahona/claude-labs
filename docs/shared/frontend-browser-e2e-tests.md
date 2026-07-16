# Frontend Browser E2E Tests

An automated, browser-driven end-to-end test suite (Playwright) that runs against this project's own real, running dev stack — real page navigation, real clicks, real streaming as a browser actually receives it — rather than any mocked or in-process boundary. See `testing-strategy.md`'s "Frontend browser E2E" for how this bucket differs from "Frontend integration" (HTTP-only, no browser) and from backend's own `*.e2e-spec.ts` files (supertest-driven, also no browser).

One spec file per lab it covers, each asserting that lab's own happy path and major checks — not exhaustive per-lab coverage.

## Suite

New top-level `e2e/` directory (sibling to `frontend/`, `backend/` — see `repo-layout.md`), kept separate from `frontend/` since it runs under a different test runner (Playwright, not Karma/Jest) and pulls in a heavy, binary-downloading dependency that only needs to run occasionally.

- **`e2e/package.json`** — pins `@playwright/test` to `1.48.0`, matching the `mcr.microsoft.com/playwright:v1.48.0-noble` image tag it runs under (a mismatch can pull browser binaries the image doesn't already have baked in).
- **`e2e/playwright.config.ts`** — `testDir: './tests'`, `globalSetup: './global-setup.ts'`, `use.baseURL: 'http://frontend:4200'` (the dev stack's own Compose service name/port).
- **`e2e/global-setup.ts`** — the fake-mode guard, see below.
- **`e2e/tests/messages-console.spec.ts`** / **`e2e/tests/structured-output-console.spec.ts`** — one spec file per lab, see "Specs" below.

## Running it

Wired as a `docker-compose.dev.yml` service (`e2e`), gated behind a Compose `profile` so a bare `docker compose -f docker-compose.dev.yml up` never starts it:

```
docker compose -f docker-compose.dev.yml run --rm e2e
```

Naming a profiled service directly with `run` auto-activates its own profile — no extra `--profile e2e` flag needed (confirmed against Compose `v5.2.0`). `depends_on: frontend: condition: service_healthy` means this command alone starts (and waits on) `frontend`, which itself already depends on `backend`'s health — no need to have already run `up` first. No `build:` — reuses the official Playwright image directly, the same choice `browser-preview-check` makes for its own one-off container.

## Fake-mode guard

Always runs against a fake-mode dev-stack instance, never real mode — verifying real rendered/streamed behavior without spending a real API call, and without a real credential ever being anywhere near a repeatable, scripted suite. Enforced, not just documented: `global-setup.ts` calls `GET /api/mode` (see `fake-mode.md`'s "Interface") and throws a clear error before any spec runs if `fakeMode` isn't `true`. This is the one test bucket that runs against a real live app process rather than an isolated module or a mocked boundary, so it's the one bucket where this rule needed its own explicit runtime check rather than relying on every other bucket's structural guarantee (never touching a real client at all).

## Specs

`messages-console.spec.ts`:
- Root path (`/`) redirects to Messages Console, reachable as the app's first nav entry; fake-mode banner visible; docs panel renders non-empty content.
- A non-streamed send (model selection, system prompt, user message) renders the user message right-aligned and the assistant reply left-aligned, with the inspector panel showing that turn's request/response/usage.
- Toggling streaming on and sending again renders the reply incrementally, ending in the same state a non-streamed reply would, with the inspector's stream-events log populated and its final usage/stopReason matching the non-streaming case.
- The inspector — one shared instance on this page — reflects whichever of the two sends most recently completed.

`structured-output-console.spec.ts`:
- Reachable as the nav entry right after Messages Console; docs panel renders non-empty content.
- Selecting a model and submitting free text renders the parsed `summary`/`sentiment`/`actionItems` fields, with the inspector panel showing that call's request/response/usage.

## Notes for writing future specs

- `FakeAnthropicClient`'s unqueued-call fallback (see `test-doubles.md`) returns identical canned `usage` (`input_tokens: 10`, `output_tokens: 10`) and `stop_reason: 'end_turn'` for both its non-streaming and streaming paths — a spec can assert those exact values rather than just their shape, and can assert they match between a non-streamed and a streamed turn in the same page.
- When a lab's own rendered result could contain the same text as what the shared inspector panel also renders (e.g. a fallback value duplicated in the inspector's request/response/content-block JSON dump), scope a page-wide text assertion with a `data-testid` on that lab's own result container rather than matching page-wide — see `structured-output-console.html`'s `data-testid="structured-result"`, mirroring `messages-console.html`'s existing `data-testid="transcript-list"`.
