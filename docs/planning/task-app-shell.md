# Task — App Shell

**Status:** In progress.

## Purpose

The shared Angular routing, top-level layout, and navigation chrome every lab plugs into — one route per feature, a persistent header/layout frame, and the nav component that renders links between labs in registry order. Without this, `**Nav position:**` (recorded on every feature's plan file, and carried into its permanent doc at graduation per `writing-docs`) has nowhere to guide a real insertion, and there is no actual page an in-app feature route resolves to.

## Interface

A routing module (one lazy-loaded route per feature, keyed by slug) plus a layout component (persistent header/chrome, a content outlet) plus a nav component that renders a left sidebar — a vertical list of labs down the left edge, not a top tab bar — so it scales as labs are added without wrapping or crowding the demo/docs/inspector panels that already share every lab's width. Individual shared components are testable in isolation against a mock route (as `docs-panel.md` already assumes in its own test scenarios, and `inspector-panel.md` did before graduating); this task is what makes that route real.

Nav order is a plain array order, not a runtime computation: `frontend/src/app/core/feature-registry.ts` exports `FEATURE_ROUTES`, an ordered array of `{ slug, label, loadComponent }`, and the nav component renders it in that order as-is. Each feature's own plan file still records a `**Nav position:**` line (`first` / `last` / `before <slug>` / `after <slug>`), but that value is planning-time guidance only — whoever registers the feature (during its own build or graduation) reads it and inserts the new entry at the corresponding index in `FEATURE_ROUTES` by hand. There is no `navPosition` field and no ordering function in the app itself.

Wiring the docs panel into each feature's route is a one-line binding, not new plumbing: `docs-panel.md`'s `DocsPanel` already takes a plain `slug` input and resolves its own fetch path — a feature's route component only needs `[slug]="'<feature-slug>'"` (or resolve it from route data) on `<app-docs-panel>`. No further change to that component is expected here.

This task also owns a minimal default route: the root path (`/`) redirects to whichever feature is first in `FEATURE_ROUTES` — no separate intro-view content, since none is planned elsewhere (see "Open questions" resolution below).

## Consumers

Every feature, from Foundations Console onward — each feature's page is reached through this shell's routing and appears in its nav, at whatever index its entry was inserted at in `FEATURE_ROUTES` per its own plan file's `**Nav position:**` line.

## Potential other uses

None beyond the default route already committed above (see "Interface"). A short project-intro view in place of the redirect is a possible future swap, not committed now.

## Build order & dependencies

Order relative to [`model-config.md`](../shared/model-config.md) / [`inspector-panel.md`](../shared/inspector-panel.md) / [`docs-panel.md`](../shared/docs-panel.md) likely doesn't matter — all are plausible candidates to sit between `env-config.md` and the first feature, Foundations Console (see `status.md` for current position). No dependency on other tasks; the routing/layout/nav mechanics don't need the backend config, GitHub provider, or any feature to exist first.

## Test scenarios

- [x] Given a set of mock feature routes, the nav sidebar renders their links in the given registry order.
- [x] Visiting a mock feature's route renders that feature's content inside the persistent header/chrome layout, with the content outlet swapping per route.
- [x] Visiting the root route (`/`) redirects to the first mock feature in registry order.
- [x] Each feature's route is lazy-loaded, not bundled into the initial chunk — confirms the "one lazy-loaded route per feature" interface commitment.
- [x] The nav sidebar marks the currently active route's link distinctly, so it's clear which lab is being viewed.

## To-do list

- [x] Build the layout component: persistent header/chrome plus a content outlet.
- [x] Build the routing module: one lazy-loaded route per feature, keyed by slug.
- [x] Build the nav component: render each feature's link, in registry order, as a left sidebar.
- [x] Add the default root route (`/`) redirecting to the first feature in registry order.
- [x] Confirm routing/layout/nav work end to end against mock feature routes, before any real feature exists to plug in.

## Open questions

None. Resolved: this task owns the default/landing route — root (`/`) redirects to the first feature in nav order, reusing the nav component's own ordering logic, rather than a separate intro view (no intro-view content is planned anywhere else in the backlog).

## Development notes

- **Ad hoc decision (design simplification, made with the user during manual testing):** the plan's original interface had the nav component parse each feature's `**Nav position:**` value (`first`/`last`/`before <slug>`/`after <slug>`) at runtime and compute a render order from it. That was cut as overengineering — `**Nav position:**` is planning-time metadata only (already how it's recorded in every feature's own plan file); the app has no `navPosition` field and no ordering function. `FEATURE_ROUTES` (`frontend/src/app/core/feature-registry.ts`) is a plain ordered array of `{ slug, label, loadComponent }`, and its array order *is* the nav order — whoever adds a feature's entry places it at the correct index by hand, using that feature's own `**Nav position:**` line as a one-time guide. `Nav` and `buildFeatureRoutes` just consume the array in the order given.
- **Technical decision:** `FeatureRoute` (the type) lives in `frontend/src/app/core/feature-route.ts`; `buildFeatureRoutes` (which needs `Layout`) lives in a separate `build-feature-routes.ts`. This split avoids a circular import: `Layout` imports `Nav`, which needs the `FeatureRoute` type — if `buildFeatureRoutes` and the type were in the same module, that module would import `Layout`, which imports `Nav`, which imports it back. Keep the split if this area is touched again.
- **Technical decision:** `Layout`'s `features` input is populated via route `data: { features }` plus `provideRouter(routes, withComponentInputBinding())` in `app.config.ts`, rather than `Layout` importing `FEATURE_ROUTES` directly. This makes the feature list `Nav` renders provably the same list that built the routes (in tests, a different mock list; in prod, `FEATURE_ROUTES`) instead of two call sites that could drift out of sync.
- **Technical decision:** `buildFeatureRoutes` omits the default-redirect child route entirely when there are no features, rather than emitting a `redirectTo: ''` self-redirect, to avoid an infinite-redirect loop at the real root route whenever the registry is empty.
- **Process observation:** manual/browser verification wasn't available in this environment (no headless-browser tool); verification relied on the full unit/integration suite (`Nav`/`Layout`/`buildFeatureRoutes` specs, including `RouterTestingHarness`-driven navigation against mock feature routes per the plan's test scenarios) plus confirming the dev server recompiles cleanly with each change, and manual data in `FEATURE_ROUTES` (three throwaway preview components under `frontend/src/app/dev-preview/`, removed before graduation) that the user clicked through directly in the browser.
- **Non-owned-file suggestion:** when Foundations Console (or whichever feature graduates first) is built, its route/nav wiring is a one-line addition to `frontend/src/app/core/feature-registry.ts` (a `{ slug, label, loadComponent }` entry inserted at the index its own plan file's `**Nav position:**` line calls for) — worth calling out explicitly in that feature's own plan file or in `docs/shared/app-shell.md` once this task graduates, so it's not rediscovered from scratch.
