# Status

The single source of truth for what's next and what's already done. Every work item is one row below, in build order, with its current status, its slug, and a link to whichever doc currently describes it — its plan file while it's `Draft`/`Planned`/`In progress`, its permanent doc once `Done`. Each work item's own doc describes what it *is*; this table only tracks where it *stands*.

## Status values

⚪ `Not started` (no plan file yet) → 📝 `Draft` (plan file exists: description, open questions, likely dependencies) → 📋 `Planned` (self-contained: principles inlined, test scenarios and a to-do list in place) → 🔵 `In progress` (being implemented and tested) → ✅ `Done` (graduated; the Doc column above points at the permanent doc instead of the retired plan file).

The leading emoji is the color cue for each status (plain Markdown can't set text color on GitHub) — always ⚪/📝/📋/🔵/✅ in that order, both in this table's Status column and in a plan file's own `**Status:**` line. Reused, don't invent new ones.

| Transition | Happens when |
|---|---|
| — → `Draft` | a plan file is drafted for the item |
| `Draft` → `Planned` | the draft is fleshed out into a self-contained plan |
| `Planned` → `In progress` | implementation starts (not on completion) |
| `In progress` → `Done` | the build is manually approved |
| `Draft`/`Planned` → *(row removed)* | the item is abandoned before being built |

This table is a summary pointer — whatever process currently carries out each step is the authoritative definition of what its transition requires; update this row only if that changes.

| Work item | Type | Slug | Status | Doc |
|---|---|---|---|---|
| Project scaffold | Task | `project-scaffold` | ✅ Done | [`project-scaffold.md`](shared/project-scaffold.md) |
| Env/config loading | Task | `env-config` | ✅ Done | [`env-config.md`](shared/env-config.md) |
| Config/model layer | Task | `model-config` | ✅ Done | [`model-config.md`](shared/model-config.md) |
| Inspector panel | Task | `inspector-panel` | ✅ Done | [`inspector-panel.md`](shared/inspector-panel.md) |
| Docs panel | Task | `docs-panel` | ✅ Done | [`docs-panel.md`](shared/docs-panel.md) |
| App shell | Task | `app-shell` | ✅ Done | [`app-shell.md`](shared/app-shell.md) |
| Test doubles for external clients | Task | `test-doubles` | ✅ Done | [`test-doubles.md`](shared/test-doubles.md) |
| Production Docker configuration | Task | `prod-docker` | ✅ Done | [`prod-docker.md`](shared/prod-docker.md) |
| Fake mode | Task | `fake-mode` | ✅ Done | [`fake-mode.md`](shared/fake-mode.md) |
| API key health check | Task | `key-health` | ✅ Done | [`key-health.md`](shared/key-health.md) |
| API error handling | Task | `api-error-handling` | ✅ Done | [`api-error-handling.md`](shared/api-error-handling.md) |
| Anthropic client | Task | `anthropic-client` | ✅ Done | [`anthropic-client.md`](shared/anthropic-client.md) |
| Foundations Console | Feature | `foundations-console` | ✅ Done | [`foundations-console.md`](features/foundations-console.md) |
| Response Envelope Builder | Task | `envelope-builder` | ✅ Done | [`envelope-builder.md`](shared/envelope-builder.md) |
| Model Picker | Task | `model-picker` | ✅ Done | [`model-picker.md`](shared/model-picker.md) |
| Messages Console | Feature | `messages-console` | ✅ Done | [`messages-console.md`](features/messages-console.md) |
| Structured Output Console | Feature | `structured-output-console` | ✅ Done | [`structured-output-console.md`](features/structured-output-console.md) |
| Retire Foundations Console | Task | `retire-foundations-console` | ✅ Done | [`foundations-console.md`](features/foundations-console.md) |
| Frontend browser E2E tests | Task | `frontend-browser-e2e-tests` | ✅ Done | [`frontend-browser-e2e-tests.md`](shared/frontend-browser-e2e-tests.md) |
| Home Page | Feature | `home-page` | ✅ Done | [`home-page.md`](features/home-page.md) |
| GitHub data provider | Task | `github-provider` | ✅ Done | [`github-provider.md`](shared/github-provider.md) |
| Live Tool-Use Console | Feature | `live-tool-use-console` | ✅ Done | [`live-tool-use-console.md`](features/live-tool-use-console.md) |
| Demo deploy | Task | `demo-deploy` | ✅ Done | [`demo-deploy.md`](shared/demo-deploy.md) |
| Caching layer | Task | `caching-layer` | ✅ Done | [`caching-layer.md`](shared/caching-layer.md) |
| Workflow Gallery | Feature | `workflow-gallery` | ✅ Done | [`workflow-gallery.md`](features/workflow-gallery.md) |
| Content-block builder | Task | `content-block-builder` | ✅ Done | [`content-block-builder.md`](shared/content-block-builder.md) |
| Document Research Assistant | Feature | `document-research-assistant` | 🔵 In progress | [`feature-document-research-assistant.md`](planning/feature-document-research-assistant.md) |
| Data & Code Sandbox | Feature | `data-code-sandbox` | 📋 Planned | [`feature-data-code-sandbox.md`](planning/feature-data-code-sandbox.md) |
| DeepWiki MCP connector | Task | `deepwiki-connector` | 📋 Planned | [`task-deepwiki-connector.md`](planning/task-deepwiki-connector.md) |
| Web & Repo Research Reporter | Feature | `web-repo-research-reporter` | 📋 Planned | [`feature-web-repo-research-reporter.md`](planning/feature-web-repo-research-reporter.md) |
| Vision Lab | Feature | `vision-lab` | 📋 Planned | [`feature-vision-lab.md`](planning/feature-vision-lab.md) |
| Extended Thinking Bench | Feature | `extended-thinking-bench` | 📋 Planned | [`feature-extended-thinking-bench.md`](planning/feature-extended-thinking-bench.md) |
| Agent Playground | Feature | `agent-playground` | 📋 Planned | [`feature-agent-playground.md`](planning/feature-agent-playground.md) |


