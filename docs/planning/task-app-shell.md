# Task — App Shell

**Status:** Planned.

## Purpose

The shared Angular routing, top-level layout, and navigation chrome every lab plugs into — one route per feature, a persistent header/layout frame, and the nav component that orders and renders links between labs. Without this, `**Nav position:**` (recorded on every feature's plan file, and carried into its permanent doc at graduation per `writing-docs`) has nowhere to be consumed, and there is no actual page an in-app feature route resolves to.

## Interface

A routing module (one lazy-loaded route per feature, keyed by slug) plus a layout component (persistent header/chrome, a content outlet) plus a nav component that reads each feature's `**Nav position:**` (`first` / `last` / `before <slug>` / `after <slug>`) and renders it in the correct relative order, rendered as a left sidebar — a vertical list of labs down the left edge, not a top tab bar — so it scales as labs are added without wrapping or crowding the demo/docs/inspector panels that already share every lab's width. Individual shared components are testable in isolation against a mock route (as `task-docs-panel.md` already assumes in its own test scenarios, and `inspector-panel.md` did before graduating); this task is what makes that route real.

This task also owns a minimal default route: the root path (`/`) redirects to whichever feature sorts first in nav order (computed the same way the nav component orders links) — no separate intro-view content, since none is planned elsewhere (see "Open questions" resolution below).

## Consumers

Every feature, from Foundations Console onward — each feature's page is reached through this shell's routing and appears in its nav, ordered by that feature's `**Nav position:**` line.

## Potential other uses

None beyond the default route already committed above (see "Interface"). A short project-intro view in place of the redirect is a possible future swap, not committed now.

## Build order & dependencies

Order relative to [`model-config.md`](../shared/model-config.md) / [`inspector-panel.md`](../shared/inspector-panel.md) / `task-docs-panel.md` likely doesn't matter — all are plausible candidates to sit between `env-config.md` and the first feature, Foundations Console (see `status.md` for current position). No dependency on other tasks; the routing/layout/nav mechanics don't need the backend config, GitHub provider, or any feature to exist first.

## Test scenarios

- [ ] Given a set of mock feature routes carrying `**Nav position:**` values (`first`, `last`, `before <slug>`, `after <slug>`), the nav sidebar renders their links in the correct relative order.
- [ ] Visiting a mock feature's route renders that feature's content inside the persistent header/chrome layout, with the content outlet swapping per route.
- [ ] Visiting the root route (`/`) redirects to whichever mock feature sorts first in nav order.
- [ ] Each feature's route is lazy-loaded, not bundled into the initial chunk — confirms the "one lazy-loaded route per feature" interface commitment.
- [ ] The nav sidebar marks the currently active route's link distinctly, so it's clear which lab is being viewed.

## To-do list

- [ ] Build the layout component: persistent header/chrome plus a content outlet.
- [ ] Build the routing module: one lazy-loaded route per feature, keyed by slug.
- [ ] Build the nav component: read each feature's `**Nav position:**` value and render links, ordered correctly, as a left sidebar.
- [ ] Add the default root route (`/`) redirecting to the first feature in nav order.
- [ ] Confirm routing/layout/nav work end to end against mock feature routes, before any real feature exists to plug in.

## Open questions

None. Resolved: this task owns the default/landing route — root (`/`) redirects to the first feature in nav order, reusing the nav component's own ordering logic, rather than a separate intro view (no intro-view content is planned anywhere else in the backlog).
