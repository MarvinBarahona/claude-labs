# Task — Docs Panel

**Status:** Planned.

## Purpose

Per `guiding-principles.md`, "Docs travel with code": a shared frontend component that renders a lab's **in-app** Markdown doc inline next to its demo, so the app is its own documentation instead of a separate docs site. This is a product artifact, not a workflow one: the doc it renders is written for a developer learning a Claude API concept, authored by the `write-lab-doc` skill directly against that lab's code. It is unrelated to, and never reads, `docs/features/<slug>.md` — this workflow's own permanent doc, written for a future maintainer extending the repo, not for an app end user.

## Interface

A component that, given a feature's route, fetches and renders that lab's in-app doc file (`frontend/public/lab-docs/<slug>.md`, per `repo-layout.md`) as formatted Markdown alongside the demo UI and inspector panel. Same component instance reused per feature — no per-feature doc-rendering code. Purely a renderer: it has no opinion on how that Markdown got written or kept current, only that it exists at the expected per-slug path.

## Consumers

Every feature, from Foundations Console onward.

## Potential other uses

None specific right now — kept generic (render whatever Markdown file sits at a known path) rather than tailored to a particular doc's content.

## Build order & dependencies

Order relative to [`model-config.md`](../shared/model-config.md) / [`task-inspector-panel.md`](task-inspector-panel.md) / [`task-app-shell.md`](task-app-shell.md) doesn't matter — all four sit between [`env-config.md`](../shared/env-config.md) and the first feature, Foundations Console (see `status.md` for current position). No dependency on other tasks; testable against a fixture Markdown file and a mock route before any feature exists.

## Test scenarios

- [ ] Given a fixture Markdown file and a mock feature route, the doc renders inline next to where the demo UI would sit.
- [ ] Markdown formatting (headings, lists, code blocks, links) renders correctly, not as raw text.
- [ ] A missing in-app doc file for a route fails visibly (not a silent blank panel) rather than assuming one always exists — writing that doc is a separate, unscheduled action (`write-lab-doc`), not a required step of this workflow.

## To-do list

- [ ] Pick/confirm the Markdown rendering approach (library or hand-rolled) for the Angular frontend.
- [ ] Build the component against a fixture Markdown file and a mock route.
- [ ] Wire routing so each feature's page points the component at `frontend/public/lab-docs/<slug>.md`.
- [ ] Confirm it renders whatever `write-lab-doc` has written there, independent of this work item's own workflow status.

## Open questions

None.
