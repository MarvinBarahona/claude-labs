# Status

The single source of truth for what's next and what's already done. Every work item is one row below, in build order, with its current status, its slug, and a link to whichever doc currently describes it — its plan file while it's `Draft`/`Planned`/`In progress`, its permanent doc once `Done`. Each work item's own doc describes what it *is*; this table only tracks where it *stands*.

## Status values

`Not started` (no plan file yet) → `Draft` (plan file exists: description, open questions, likely dependencies) → `Planned` (self-contained: principles inlined, test scenarios and a to-do list in place) → `In progress` (being implemented and tested) → `Done` (graduated; the Doc column above points at the permanent doc instead of the retired plan file).

| Transition | Triggered by |
|---|---|
| — → `Draft` | `draft-work-item` |
| `Draft` → `Planned` | `plan-work-item` |
| `Planned` → `In progress` | `build-work-item`, at the start of implementation (not on completion) |
| `In progress` → `Done` | `graduate-work-item`, only after manual approval of the build |
| `Draft`/`Planned` → *(row removed)* | `abandon-work-item` |

This table is a summary pointer — each skill above is the authoritative definition of what its transition requires; update this row only if a transition's owning skill changes.

| Work item | Type | Slug | Status | Doc |
|---|---|---|---|---|
| Project scaffold | Task | `project-scaffold` | Done | [`project-scaffold.md`](shared/project-scaffold.md) |
| Env/config loading | Task | `env-config` | Done | [`env-config.md`](shared/env-config.md) |
| Config/model layer | Task | `model-config` | Done | [`model-config.md`](shared/model-config.md) |
| Inspector panel | Task | `inspector-panel` | Done | [`inspector-panel.md`](shared/inspector-panel.md) |
| Docs panel | Task | `docs-panel` | Done | [`docs-panel.md`](shared/docs-panel.md) |
| App shell | Task | `app-shell` | In progress | [`task-app-shell.md`](planning/task-app-shell.md) |
| Test doubles for external clients | Task | `test-doubles` | Planned | [`task-test-doubles.md`](planning/task-test-doubles.md) |
| Production Docker configuration | Task | `prod-docker` | Planned | [`task-prod-docker.md`](planning/task-prod-docker.md) |
| Fake mode | Task | `fake-mode` | Planned | [`task-fake-mode.md`](planning/task-fake-mode.md) |
| API key health check | Task | `key-health` | Planned | [`task-key-health.md`](planning/task-key-health.md) |
| Foundations Console | Feature | `foundations-console` | Draft | [`feature-foundations-console.md`](planning/feature-foundations-console.md) |
| GitHub data provider | Task | `github-provider` | Draft | [`task-github-provider.md`](planning/task-github-provider.md) |
| Live Tool-Use Console | Feature | `live-tool-use-console` | Draft | [`feature-live-tool-use-console.md`](planning/feature-live-tool-use-console.md) |
| Caching layer | Task | `caching-layer` | Draft | [`task-caching-layer.md`](planning/task-caching-layer.md) |
| Workflow Gallery | Feature | `workflow-gallery` | Draft | [`feature-workflow-gallery.md`](planning/feature-workflow-gallery.md) |
| Content-block builder | Task | `content-block-builder` | Draft | [`task-content-block-builder.md`](planning/task-content-block-builder.md) |
| Document Research Assistant | Feature | `document-research-assistant` | Draft | [`feature-document-research-assistant.md`](planning/feature-document-research-assistant.md) |
| Data & Code Sandbox | Feature | `data-code-sandbox` | Draft | [`feature-data-code-sandbox.md`](planning/feature-data-code-sandbox.md) |
| DeepWiki MCP connector | Task | `deepwiki-connector` | Draft | [`task-deepwiki-connector.md`](planning/task-deepwiki-connector.md) |
| Web & Repo Research Reporter | Feature | `web-repo-research-reporter` | Draft | [`feature-web-repo-research-reporter.md`](planning/feature-web-repo-research-reporter.md) |
| Vision Lab | Feature | `vision-lab` | Draft | [`feature-vision-lab.md`](planning/feature-vision-lab.md) |
| Extended Thinking Bench | Feature | `extended-thinking-bench` | Draft | [`feature-extended-thinking-bench.md`](planning/feature-extended-thinking-bench.md) |
| Agent Playground | Feature | `agent-playground` | Draft | [`feature-agent-playground.md`](planning/feature-agent-playground.md) |


