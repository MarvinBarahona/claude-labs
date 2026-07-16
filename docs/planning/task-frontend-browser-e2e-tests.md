# Task — Frontend Browser E2E Tests

**Status:** 📋 Planned.

## Description

An automated, browser-driven end-to-end test suite (Playwright) run against this project's own real, running dev stack — real page navigation, real clicks, real streaming as a browser actually receives it — rather than any mocked or in-process boundary. This is a genuinely new kind of test coverage: none of `testing-strategy.md`'s existing four buckets render a browser at all, and its own "Frontend integration" bucket, while still unimplemented (see below), is explicitly HTTP-only ("not browser-driven e2e — no simulated clicks or page navigation").

Named "browser E2E" throughout — deliberately not "e2e" alone — to avoid colliding with two other senses of that word already in use in this project: backend's own `*.e2e-spec.ts` files (Nest's own naming for its supertest-driven integration tests, no browser involved) and `testing-strategy.md`'s still-unimplemented "Frontend integration" bucket (also no browser).

Messages Console and Structured Output Console (both `Planned`, expected `Done` before this task is built — see "Depends on" below) are this suite's first subjects, one spec file each. This gap was originally going to be closed against Foundations Console, the single bundled page these two labs were split from — `process-notes.md` already flagged that page as the natural first candidate for exactly this kind of gap, since its "real round trip" testing was worked around manually with a one-off Playwright check during its own build rather than an automated one. Re-planned during this task's own second planning pass (after `task-retire-foundations-console.md` scheduled that page's retirement ahead of this task in build order) to target the two labs it was split into instead, each on its own page and route rather than sharing one.

Always runs against a fake-mode dev-stack instance, never real mode — this is the whole point (verifying real rendered/streamed behavior without spending a real API call for it, and without a real credential ever being anywhere near a repeatable, scripted suite). Enforced, not just documented: the suite's own global setup queries `GET /api/mode` and aborts before any spec runs if `fakeMode` isn't `true`.

## Decisions made during this planning pass

- **New top-level `e2e/` directory** (sibling to `frontend/`, `backend/`) rather than nesting under `frontend/` — this suite tests the full running stack (not just frontend code), runs under a completely different test runner (Playwright, not Karma/Jest), and would otherwise pull a heavy, binary-downloading dependency into `frontend/package.json`/its own node_modules volume for something that only runs occasionally, not on every `frontend` build.
- **Reuses `browser-preview-check`'s existing container recipe** (the official `mcr.microsoft.com/playwright` image, joining the dev stack's own Compose network, no bespoke Dockerfile) rather than inventing a new one — the difference is only that this suite is a committed, repeatable set of spec files run by Playwright's own test runner (pass/fail, nothing for a person to look at), instead of a throwaway script producing a screenshot for a person to inspect.
- **Wired as a real `docker-compose.dev.yml` service** (`e2e`), gated behind a Compose `profile` so a bare `docker compose -f docker-compose.dev.yml up` never starts it — only `docker compose -f docker-compose.dev.yml run --rm e2e` does, matching the existing `run --rm <service> <command>` shape `README.md`'s Tests section already uses for the other four buckets, rather than a bespoke `docker run` invocation to memorize separately.
- **`depends_on: frontend: condition: service_healthy`** on the new service — `docker compose run` respects `depends_on` health conditions the same as `up` does, so running the suite auto-starts (and waits on) `frontend` (which itself already depends on `backend`'s own health, per `tech-stack.md`) rather than requiring the developer to have already run `up` first, unlike `browser-preview-check`'s manual-only precondition.
- **Fake mode is an enforced guard, not just a documented precondition.** A `globalSetup` script (`e2e/global-setup.ts`, wired via `playwright.config.ts`) calls `GET /api/mode` before any spec runs and throws immediately if `fakeMode` isn't `true`. This is new relative to every existing precedent (`browser-preview-check`, `testing-strategy.md`'s existing rules) — those all rely on the developer already knowing/remembering fake mode is required; this is the first place that's actually checked in code, because this suite, unlike a one-off manual screenshot check, is meant to run repeatedly (and eventually possibly from CI) where nobody's necessarily watching.
- **Playwright specs are automated scenarios, not manual ones.** Per `plan-work-item`'s "Automated vs. manual test scenarios," this suite's own specs assert pass/fail programmatically (Playwright's own test runner and reporter) — nobody looks at a screenshot to judge them. Running it is squarely an automated scenario a future `build-work-item` pass runs directly, the same as any unit/integration test command, not a manual one gated behind explicit request. That gate is specifically about a person (or me) rendering the app to *look* at it; an assertion-driven Playwright run doesn't do that.

## Guiding principles / standing decisions cited

- [`testing-strategy.md`](../technical/testing-strategy.md), "Four test buckets, no end-to-end/browser-driven suite" and "Frontend integration" — the existing bucket this task's suite is deliberately distinct from (see "Description" above for the naming distinction).
- [`testing-strategy.md`](../technical/testing-strategy.md), "No container that runs tests ever holds a real credential" — this suite's global-setup guard is what makes that rule actually enforced for a *running-app* test (every other bucket enforces it structurally, by never touching a real client at all; this is the first bucket that runs against a real live process, so it needs its own explicit check).
- [`fake-mode.md`](../shared/fake-mode.md), "Interface" (`GET /api/mode` response shape: `{ fakeMode: boolean, repoUrl?: string }`) — exactly what the global-setup guard above calls and checks.
- [`tech-stack.md`](../technical/tech-stack.md), "Runtime" — the dev stack's Compose network name and existing `depends_on`/`condition: service_healthy` pattern (`frontend` → `backend`), reused unchanged for `e2e` → `frontend`.
- [`messages-console.md`](../features/messages-console.md), "Backend"/"Frontend" and nav position (`first`) — the route, component structure, and streamed/non-streamed turn behavior `messages-console.spec.ts` exercises.
- [`structured-output-console.md`](../features/structured-output-console.md), "Backend"/"Frontend" and nav position (`after messages-console`) — the route and component structure `structured-output-console.spec.ts` exercises.
- `guiding-principles.md`, "One inspector, many labs" — why `messages-console.spec.ts` asserts the inspector panel reflects whichever of a streamed/non-streamed turn most recently completed, not just that a turn's own result renders. This no longer spans two labs the way it did against the old bundled page (each lab now has its own inspector instance) — it's now a within-page assertion for Messages Console's own streamed-vs-non-streamed turns, and doesn't apply to Structured Output Console at all (only one kind of call).

## Depends on

- `messages-console` (`Done`) — [`messages-console.md`](../features/messages-console.md), read in full; a graduated dependency this task builds against.
- `structured-output-console` (`Done`) — [`structured-output-console.md`](../features/structured-output-console.md), read in full; a graduated dependency this task builds against.
- `fake-mode` (`Done`) — [`fake-mode.md`](../shared/fake-mode.md), read in full; see "Guiding principles" above for the exact interface used.
- `test-doubles` (`Done`) — [`test-doubles.md`](../shared/test-doubles.md) — not consumed directly (this suite drives the real running app, not an in-process test module) but confirms nothing about `FakeAnthropicClient`'s `allowUnqueuedFallback` behavior (enabled only for a live fake-mode app, per that doc) stands in the way of an unscripted-looking real click sequence dead-ending mid-spec.

## Contract

One track — suite scaffolding and the Compose wiring don't need an independent-tracks split (the wiring is pointless before the suite it runs exists, so they're sequenced, not parallel).

**`e2e/package.json`** (new, minimal):
```json
{
  "name": "e2e",
  "private": true,
  "devDependencies": { "@playwright/test": "1.48.0" }
}
```
Pin `1.48.0` to match `mcr.microsoft.com/playwright:v1.48.0-noble` — the same image/version pairing `browser-preview-check` already uses; a mismatch can pull browser binaries the image doesn't already have baked in.

**`e2e/playwright.config.ts`** (new):
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  use: { baseURL: 'http://frontend:4200' },
  reporter: 'list',
});
```

**`e2e/global-setup.ts`** (new): `fetch('http://backend:3000/api/mode')`, parse the JSON, throw with a clear message (`'Refusing to run browser E2E tests: FAKE_MODE is not enabled on the running dev stack.'`) if `fakeMode !== true`.

**`e2e/tests/messages-console.spec.ts`** and **`e2e/tests/structured-output-console.spec.ts`** (new, one per lab): see "Test scenarios" below for exactly what each asserts.

**`docker-compose.dev.yml`** (existing file, new service added):
```yaml
  e2e:
    image: mcr.microsoft.com/playwright:v1.48.0-noble
    working_dir: /work
    volumes:
      - ./e2e:/work
    depends_on:
      frontend:
        condition: service_healthy
    profiles: ["e2e"]
    entrypoint: ["bash", "-c"]
    command: ["npm install >/dev/null 2>&1 && npx playwright test"]
```
No `build:` — reuses the public Playwright image directly, same choice `browser-preview-check` already made, rather than a bespoke `Dockerfile.dev` for a suite that only runs occasionally. Run via `docker compose -f docker-compose.dev.yml run --rm e2e`.

## Test scenarios

All automated — see "Decisions made during this planning pass" above for why running this suite doesn't count as a manual scenario. No manual group.

- [ ] Running the suite against a dev-stack instance with `FAKE_MODE` unset/`false` aborts immediately via the global-setup guard, before any spec executes, with a clear error message — not a generic connection failure and not a real API call.
- [ ] The fake-mode banner is visible on page load (proves the running instance is actually in fake mode end-to-end, not just that the guard's own API check passed).

`messages-console.spec.ts`:
- [ ] The app's root path redirects to Messages Console (its nav-`first` position, per `messages-console.md`), and it's reachable as the app's first nav entry.
- [ ] Its in-app docs panel renders non-empty content.
- [ ] Selecting a model, entering a system prompt and a user message, and sending with streaming off renders the user message right-aligned and the assistant's reply left-aligned once it arrives, and the inspector panel shows that turn's request/response/usage.
- [ ] Toggling streaming on and sending another message renders the assistant's reply incrementally as it streams in, ending in the same rendered state a non-streamed reply would; the inspector panel's stream-events log populates and its final usage/stopReason display matches the non-streaming case.
- [ ] The inspector panel reflects whichever of the two sends above (non-streamed, then streamed) most recently completed — both share one inspector instance on this single page.

`structured-output-console.spec.ts`:
- [ ] Structured Output Console is reachable as the nav entry right after Messages Console.
- [ ] Its in-app docs panel renders non-empty content.
- [ ] Selecting a model and submitting free text renders the parsed `summary`, `sentiment`, and `actionItems` fields, and the inspector panel shows that call's request/response/usage.

## To-do list

- [ ] Confirm both `messages-console` and `structured-output-console` are `Done` before starting.
- [ ] Add `e2e/package.json`, `playwright.config.ts`, `global-setup.ts` per Contract above.
- [ ] Write `e2e/tests/messages-console.spec.ts` and `e2e/tests/structured-output-console.spec.ts` covering every scenario above.
- [ ] Add the `e2e` service to `docker-compose.dev.yml` per Contract above.
- [ ] Run `docker compose -f docker-compose.dev.yml run --rm e2e` and confirm every spec passes against a real fake-mode dev stack.
- [ ] Deliberately leave `FAKE_MODE` unset once (throwaway local env change, reverted right after) to confirm the global-setup guard actually aborts the run rather than proceeding — per the first test scenario above.

## Open questions

- Whether `testing-strategy.md` (a new "Frontend browser E2E" bucket, distinguished from "Frontend integration" per "Description" above) and `repo-layout.md` (the new top-level `e2e/` directory) get updated once this pattern is proven working at graduation time, or need a closer look first — the same open call `process-notes.md`'s existing frontend-integration gap entry already flagged for itself. Resolve this when this task graduates, not before.
- Whether a companion `.claude/skills` entry (parallel to `browser-preview-check`, documenting the exact `docker compose run --rm e2e` command for anyone — human or agent — running this suite later) gets authored once this task graduates. `build-work-item` can't create one directly (skill files are outside what any `*-work-item` skill edits); this should be flagged via a development note routed to `process-notes.md`, the same mechanism already used for other non-owned-file suggestions.
- Whether `docker compose run`'s `depends_on`/`profiles` interaction actually behaves as decided above (a profiled service still auto-activates its own profile when named directly in `run`) needs confirming against the actual installed Compose version at build time — if it doesn't, the fallback is `docker compose -f docker-compose.dev.yml --profile e2e run --rm e2e` instead (one extra flag), not a different design.
