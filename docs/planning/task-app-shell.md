# Task — App Shell

**Status:** Draft.

## Purpose

The shared Angular routing, top-level layout, and navigation chrome every lab plugs into — one route per feature, a persistent header/layout frame, and the nav component that orders and renders links between labs. Without this, `**Nav position:**` (recorded on every feature's plan file, and carried into its permanent doc at graduation per `writing-docs`) has nowhere to be consumed, and there is no actual page an in-app feature route resolves to.

## Interface

A routing module (one lazy-loaded route per feature, keyed by slug) plus a layout component (persistent header/chrome, a content outlet) plus a nav component that reads each feature's `**Nav position:**` (`first` / `last` / `before <slug>` / `after <slug>`) and renders it in the correct relative order, rendered as a left sidebar — a vertical list of labs down the left edge, not a top tab bar — so it scales as labs are added without wrapping or crowding the demo/docs/inspector panels that already share every lab's width. Individual shared components are testable in isolation against a mock route (as `task-docs-panel.md` / `task-inspector-panel.md` already assume in their own test scenarios); this task is what makes that route real.

## Consumers

Every feature, from Foundations Console onward — each feature's page is reached through this shell's routing and appears in its nav, ordered by that feature's `**Nav position:**` line.

## Potential other uses

The same layout frame is a natural place for a default/landing route (e.g. redirecting to the first feature, or a short project-intro view) if one is wanted — not committed now.

## Build order & dependencies

Order relative to `task-model-config.md` / `task-inspector-panel.md` / `task-docs-panel.md` likely doesn't matter — all are plausible candidates to sit between `task-env-config.md` and the first feature, Foundations Console (see `status.md` for current position). No dependency on other tasks; the routing/layout/nav mechanics don't need the backend config, GitHub provider, or any feature to exist first.

## Open questions

- Whether this task also owns a default/landing route (redirect to the first feature vs. a short intro view) — see "Potential other uses" above.
