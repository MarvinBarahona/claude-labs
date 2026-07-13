# Task — Docs Panel

**Status:** In progress.

## Purpose

Per `guiding-principles.md`, "Docs travel with code": a shared frontend component that renders a lab's **in-app** Markdown doc inline next to its demo, so the app is its own documentation instead of a separate docs site. This is a product artifact, not a workflow one: the doc it renders is written for a developer learning a Claude API concept, authored by the `write-lab-doc` skill directly against that lab's code. It is unrelated to, and never reads, `docs/features/<slug>.md` — this workflow's own permanent doc, written for a future maintainer extending the repo, not for an app end user.

## Interface

A component that, given a feature's route, fetches and renders that lab's in-app doc file (`frontend/public/lab-docs/<slug>.md`, per `repo-layout.md`) as formatted Markdown alongside the demo UI and inspector panel. Same component instance reused per feature — no per-feature doc-rendering code. Purely a renderer: it has no opinion on how that Markdown got written or kept current, only that it exists at the expected per-slug path.

## Consumers

Every feature, from Foundations Console onward.

## Potential other uses

None specific right now — kept generic (render whatever Markdown file sits at a known path) rather than tailored to a particular doc's content.

## Build order & dependencies

Order relative to [`model-config.md`](../shared/model-config.md) / [`inspector-panel.md`](../shared/inspector-panel.md) / [`task-app-shell.md`](task-app-shell.md) doesn't matter — all four sit between [`env-config.md`](../shared/env-config.md) and the first feature, Foundations Console (see `status.md` for current position). No dependency on other tasks; testable against a fixture Markdown file and a mock route before any feature exists.

## Test scenarios

- [x] Given a fixture Markdown file and a mock feature route, the doc renders inline next to where the demo UI would sit.
- [x] Markdown formatting (headings, lists, code blocks, links) renders correctly, not as raw text.
- [x] A missing in-app doc file for a route fails visibly (not a silent blank panel) rather than assuming one always exists — writing that doc is a separate, unscheduled action (`write-lab-doc`), not a required step of this workflow.

## To-do list

- [x] Pick/confirm the Markdown rendering approach (library or hand-rolled) for the Angular frontend.
- [x] Build the component against a fixture Markdown file and a mock route.
- [x] Wire routing so each feature's page points the component at `frontend/public/lab-docs/<slug>.md`.
- [x] Confirm it renders whatever `write-lab-doc` has written there, independent of this work item's own workflow status.

## Open questions

None.

## Development notes

- **Technical decision:** rendering approach is the `marked` library (zero dependencies, GFM support) piped through Angular's `[innerHTML]` binding. Angular's built-in `DomSanitizer` sanitizes any HTML bound via `[innerHTML]` automatically (unless explicitly bypassed, which this component never does), so no separate sanitization step was needed. Component lives at `frontend/src/app/shared/docs-panel/`, selector `app-docs-panel`, single input `slug: string` — it builds the fetch path as `/lab-docs/${slug}.md` itself, matching the `repo-layout.md` convention, so a consumer only ever passes a slug, never a path.
- **Not owned by this task:** actual `RouterModule` routes per feature don't exist yet (`app-shell` and every feature are still `Planned`/`Draft`). "Wire routing" was satisfied at the component-contract level — any future feature route only needs to bind `[slug]="'<feature-slug>'"` (or resolve it from route data) to `<app-docs-panel>`; no further change to this component should be needed when `app-shell`/features land.
- **Process observation:** `frontend/package.json` gained its first runtime dependency beyond the original scaffold (`marked`). Installed into the running container's `node_modules` volume via `docker compose exec frontend npm install` for this session; per `tech-stack.md`, anyone picking this up fresh still needs `docker compose down -v` + `docker compose up --build` for the volume to pick up the new dependency from a cold start.
- **Technical decision (flag for `docs/technical/tech-stack.md`'s Windows bind-mount paragraph):** on this Windows host, `ng serve`'s default file watcher never detected host-side edits to files under the `frontend` bind mount — builds only picked up new content after a full `docker compose restart frontend`, confirmed by editing `app.html`/`app.ts` and finding no rebuild log line even after 30+ seconds. Root cause is almost certainly the same Docker Desktop bind-mount limitation `tech-stack.md` already calls out for `node_modules` I/O — inotify events from the Windows host don't reliably reach the Linux container. Fix: added `--poll 1000` to the frontend's `start` script (`frontend/package.json`) — verified this makes `ng serve` detect and rebuild on both a `.html` template edit and a further edit, each within ~5s, no restart needed. This changes the `start` script referenced by both `docker compose up` (dev) and `CLAUDE.md`'s "Running the app" section, so it's a repo-wide dev-workflow fix, not something scoped to this task specifically — worth a line in `tech-stack.md` alongside the existing Windows bind-mount note.
