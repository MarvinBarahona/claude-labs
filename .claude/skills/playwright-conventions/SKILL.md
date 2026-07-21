---
name: playwright-conventions
description: This skill should be used when writing or editing any Playwright browser-E2E test in this repo's `e2e/` app — for example when asked to "add an e2e spec for X", "write a browser test for this lab", or any other Playwright test-authoring task. Covers general, up-to-date Playwright/browser-E2E conventions (locator strategy, waiting, spec structure, fixtures, debugging) applicable to any Playwright suite; not this project's own test-strategy decisions (see `testing-strategy.md`, indexed from `technical.md`).
---

# Playwright browser-E2E conventions

General best practices for writing Playwright-driven browser E2E tests, independent of any one project's specifics.

## Stay project-agnostic

Never reference another skill by name here, project-specific or otherwise — this skill should read the same in any repo it's dropped into. A skill checked into a given project besides that project's own listed skills is generic tooling that can be renamed, replaced, or deleted independently of the project — this skill included — so a hard-coded reference to one would go stale silently.

## Locators

- Prefer Playwright's user-facing locators (`getByRole`, `getByLabel`, `getByPlaceholder`, `getByText`) over CSS/XPath selectors — they follow how a real user finds the element and survive markup/styling churn.
- Reach for a dedicated test-only hook (`data-testid`, queried with `getByTestId`) only when no accessible role/label reliably identifies the element, or when a page has more than one element that could otherwise match the same text/role — e.g. a page-wide debug/raw-data panel that can coincidentally contain the same text as the feature actually under test. Put the attribute on the feature's own result/target element, not on the ambiguous one.
- Never select by CSS class or DOM structure alone — both change for reasons unrelated to test intent.

## Waiting and assertions

- Rely on Playwright's built-in auto-waiting and web-first assertions (`expect(locator).toBeVisible()`, `.toHaveText()`, etc.) instead of manual `waitForTimeout` or arbitrary sleeps.
- Assert on user-observable outcomes (rendered text, visibility, navigation, network response shape) rather than internal implementation details a refactor could change without altering behavior.
- Reach for `expect.poll`/`toPass` only for a genuinely eventual-consistency condition no locator-based assertion already covers — not as a substitute for fixing a race the suite exposed.

## Structuring specs

- One spec file per user-facing flow or page, asserting that flow's own happy path and major checks — not exhaustive edge-case coverage, which belongs in a lower-level unit/integration test instead.
- Keep every spec independent — able to run alone or in any order, never relying on state a different spec left behind. Use Playwright's fixture system (`test.extend`) for reusable per-test setup (auth, seeded state, page objects) rather than a shared mutable page/session across tests.
- Keep suite-wide setup (environment checks, seeding) in `globalSetup`/`globalTeardown`, not repeated per spec file.

## Network and environment

- Use Playwright's route interception (`page.route`) to stub a third-party dependency the suite doesn't own, rather than depending on that dependency's real availability during a test run.
- Guard the suite from ever running against a real/production environment or with real credentials if that's a risk in the target project — a startup check that fails fast beats a leaked credential or an accidental write.
- Pin the Playwright package version to whatever browser image/binaries the suite actually runs under — a mismatch can silently pull browser binaries the environment doesn't already have baked in.

## Debugging and flakiness

- Use the trace viewer (`trace: 'on-first-retry'` or similar) and codegen/`--debug` during authoring instead of sprinkling console logging through a spec.
- CI `retries` absorb genuine environment flakiness (slow cold starts, network jitter) — they aren't a substitute for fixing a spec whose own assertion is racy against the app's real behavior.
- A spec that can't find a stable role/label locator is often surfacing a real accessibility gap in the page, not just a testing inconvenience — treat that as a signal to improve the markup before falling back to a test-only hook.

## General

- Comments are the exception, not the rule — reach for one only in a genuinely special case (a hidden constraint, a non-obvious workaround, a subtlety the code can't express on its own), never as routine narration. When one is warranted, keep it to one short line; a longer explanation belongs in the project's own documentation, not a multi-line comment block in the source.
