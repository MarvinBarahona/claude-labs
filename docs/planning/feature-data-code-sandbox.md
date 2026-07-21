# Feature — Data & Code Sandbox

**Status:** 📋 Planned.

**Nav position:** after `feature-web-repo-research-reporter`.

## Claude API features

- **Code execution tool** — server tool (no implementation to write), generally available as of tool version `code_execution_20250825` (the version this feature uses — no beta header needed for the tool itself); runs Python in an isolated Docker sandbox with no network access, via a `bash_code_execution` sub-tool (runs shell commands, e.g. `python script.py`) and a `text_editor_code_execution` sub-tool (writes/edits files, including the Python source itself) that Claude gets automatically once the tool is enabled; can execute multiple times per conversation, iterating on results. A bash command's result comes back as a `server_tool_use` (`name: 'bash_code_execution'`) / `bash_code_execution_tool_result` pair, the latter's `content` carrying `stdout`, `stderr`, `return_code`, and `content: [{ file_id, ... }]` — the last is where any file the command created shows up, one entry per created file (there is no separate `code_execution_tool_result` block type).
- **Files API (mandatory here, needs beta header `files-api-2025-04-14`)** — upload a file once, get a file ID, reference it in a message instead of inline base64; the only way to move data into/out of the sandbox since it has no network access — data goes in via a `container_upload` content block naming the file ID, results come out via the `file_id`s inside a `bash_code_execution_tool_result`'s `content.content`.
- **Agent Skills (needs beta header `skills-2025-10-02`)** — a packaged `SKILL.md` (frontmatter `name`/`description`) plus scripts/resources, loaded via `container.skills: [{ type: 'custom', skill_id, version: 'latest' }]` alongside the code execution tool; progressive disclosure keeps an unused skill's full instructions out of context until Claude judges it relevant; up to 8 skills per request; skill output files land in the Files API the same way any other sandbox-created file does. A **custom** skill (unlike Anthropic's own pre-built ones, e.g. `xlsx`) needs a one-time registration call before it has a `skill_id` to reference — `POST /v1/skills`, multipart `files[]` carrying the `SKILL.md` plus any helper files, returning a generated `id` — there's no way to point a Messages API request at a `SKILL.md` file path directly.

## Main idea

Pull real activity data for the subject repo (issues/commits over time, via the GitHub provider), upload it through the Files API, and have Claude write and run Python in the sandbox to analyze it and produce charts/reports — output files flow back out through the Files API too. Where it fits naturally, layers in an Agent Skill (spreadsheet export) running in the same sandbox.

"Stars over time" (from an earlier draft of this feature) is dropped from scope: the shared `GithubClient` has no stargazer-history method (see [`github-provider.md`](../shared/github-provider.md)'s "Interface" — only `getIssues`/`getCommits`/`getReleases`/`getFileTree`), and extending it for one decorative metric this single feature would use isn't worth it, per [`guiding-principles.md`](../technical/guiding-principles.md)'s "Minimize integrations." Issues + commits (both already-supported list endpoints) give Claude's Python analysis plenty to work with.

## Dataset & env vars

- **GitHub REST API** — same subject repo, reused via the GitHub data provider; no new integration. Uses `GITHUB_TARGET_REPO` and, optionally, `GITHUB_TOKEN`.

## Build order & dependencies

Right after Document Research Assistant (see `status.md` for current position).

- Requires the **GitHub data provider** ([`github-provider.md`](../shared/github-provider.md)).
- Requires the **`AnthropicClient.uploadFile()` method** ([`task-content-block-builder.md`](task-content-block-builder.md), first used by Document Research Assistant) to already exist, since Files API is mandatory here — this is why this feature is built after Document Research Assistant rather than earlier. Does **not** depend on `ContentBlockBuilderService.buildBlock()` itself — see "Shared functionality used" below.

## Shared functionality used

- GitHub data provider ([`github-provider.md`](../shared/github-provider.md)) — `getIssues()`/`getCommits()` for the analysis dataset.
- `AnthropicClient.uploadFile()` ([`task-content-block-builder.md`](task-content-block-builder.md)) — used directly, not through `ContentBlockBuilderService`, since this feature's own content block (`container_upload`, see "Endpoint contract" below) isn't the `document`/`image` shape that service builds.
- Config/model layer ([`model-config.md`](../shared/model-config.md)) — `getModel('default')`.
- Response Envelope Builder ([`envelope-builder.md`](../shared/envelope-builder.md)).

## Files API / base64

The code-execution sandbox has no network access, so the **Files API is the only way to get data in and out** — there is no base64 fallback path here, unlike Document Research Assistant and Vision Lab. Both the input dataset and any output files (charts, spreadsheets) move exclusively through file IDs.

## Guiding principles

- [`guiding-principles.md`](../technical/guiding-principles.md), "Minimize integrations" — reuses the GitHub data provider; see "Main idea" above for the stars-over-time scope trim this principle motivated.
- [`guiding-principles.md`](../technical/guiding-principles.md), "One inspector, many labs" — the single call's raw request/response (including the `server_tool_use`/`bash_code_execution_tool_result` blocks) renders through the shared inspector unmodified.

## Architecture

- [`architecture.md`](../technical/architecture.md), "Custom tools vs. server-executed tools" — the code execution tool is server-executed: it "resolves inside a single Messages API call... The backend forwards those blocks through the same envelope unchanged; it does not loop." This is why this feature makes exactly one Messages API call per run, never a `calls` array, and needs no app-level streaming events the way a custom-tool loop (Live Tool-Use Console, Document Research Assistant) does.

## Endpoint contract

This feature is **non-streaming**, for the same reason Structured Output Console is: one blocking call whose value is in its finished, structured output (executed code, stdout/stderr, output files), not in watching text accumulate live.

`backend/src/data-code-sandbox/`:

- **`POST /api/data-code-sandbox/run`**:
  - Request: `{ prompt: string; useSkill: boolean }` (`prompt` non-empty — plain `400` otherwise).
  - A GitHub data fetch failure → `ExternalApiError('github', ...)` → `502`. An upload or Messages API failure → `ExternalApiError('anthropic', ...)` → `502`.
  - Flow: fetch the target repo's issues and commits via `GithubClient`, serialize to JSON, upload via `AnthropicClient.uploadFile(jsonBytes, 'application/json')`, then make one Messages API call with the code execution tool (`{ type: 'code_execution_20250825', name: 'code_execution' }`, no beta header of its own) enabled and a user message containing `{ type: 'container_upload', file_id }` alongside `prompt`'s text. Every call sends `betas: ['files-api-2025-04-14']` (Files API is mandatory here regardless of `useSkill`). When `useSkill` is `true`, the spreadsheet-export skill is registered once — lazily, on this service's first `useSkill: true` request per process lifetime, never at module init — via a new `AnthropicClient.registerSkill()` call (see "Agent Skill" below); its returned `skill_id` is cached in memory on the service and reused on every later `useSkill: true` request without registering again. That call's own request adds `container: { skills: [{ type: 'custom', skill_id, version: 'latest' }] }` and `'skills-2025-10-02'` in `betas`, alongside the always-present `files-api-2025-04-14`.
  - Any `file_id` inside a `bash_code_execution_tool_result` block's `content.content[]` (an output file the sandbox produced) is downloaded via a new `AnthropicClient.downloadFile(fileId: string): Promise<{ bytes: Buffer; mediaType: string; filename: string }>` method (this feature's own extension of the `AnthropicClient` token — a download-back capability no earlier task needed, distinct from `task-content-block-builder.md`'s upload-focused `uploadFile()`; real implementation calls `client.beta.files.retrieveMetadata(fileId)` for `filename`/media type and `client.beta.files.download(fileId)` for the bytes, rethrowing either call's failure as `ExternalApiError('anthropic', ...)`; fake implementation returns a canned buffer/filename via the same queue-or-throw idiom as `AnthropicClient`'s other methods).
  - Success → `200`:
    ```ts
    TurnEnvelope & {
      executedCode: { command: string; stdout: string; stderr: string; returnCode: number }[];  // one entry per server_tool_use (name: 'bash_code_execution') / bash_code_execution_tool_result pair, in order; empty if Claude answered without running a bash command
      outputFiles: { fileId: string; filename: string; mediaType: string; dataBase64: string }[];  // every file_id inside any bash_code_execution_tool_result's content.content[], downloaded via AnthropicClient.downloadFile()
      skillUsed: boolean;  // whether a server_tool_use block actually invoked the spreadsheet-export skill this turn — not merely whether useSkill was requested
    }
    ```
    No `calls` field (always exactly one call, per the architecture citation above) and no `cache` field (this feature never places a cache breakpoint — a single call has no repeated prefix to cache, per `architecture.md`'s "omitted for a lab that never places a breakpoint").

## Agent Skill: spreadsheet export

`backend/src/data-code-sandbox/skills/spreadsheet-export/SKILL.md` — frontmatter `name: spreadsheet-export`, `description` telling Claude this skill formats tabular analysis results into a styled `.xlsx` file (headers, auto-sized columns) instead of a plain CSV, plus a helper Python script (e.g. wrapping `openpyxl`) the skill's instructions point Claude at. This is the only skill this feature loads (well under the 8-per-request cap).

**Registration:** `AnthropicClient.registerSkill(files: { filename: string; content: Buffer }[]): Promise<{ id: string }>` (this feature's own extension of the `AnthropicClient` token) reads `SKILL.md` plus the helper script from `backend/src/data-code-sandbox/skills/spreadsheet-export/` and registers them; real implementation calls `client.beta.skills.create({ files, betas: ['skills-2025-10-02'] })`, rethrowing any failure as `ExternalApiError('anthropic', ...)`; fake implementation returns a canned `{ id: 'skill_fake_...' }` via the same queue-or-throw idiom as the client's other methods. `DataCodeSandboxService` calls this once, lazily, on its first `useSkill: true` request, and caches the returned `id` in memory for the rest of the process's lifetime (consistent with `architecture.md`'s "Server-owned session state" — no persistence; a process restart re-registers once, on the next `useSkill: true` request).

## Frontend

`frontend/src/app/data-code-sandbox/` (`DataCodeSandbox`). Stacks `<app-docs-panel [slug]="'data-code-sandbox'" />` → the demo (free-text analysis prompt per [`forms.md`](../technical/forms.md), a `useSkill` checkbox, Run button, a results view showing each executed-code block with its stdout/stderr, output-file previews — an image `mediaType` renders inline, anything else offers a download link built from the returned `dataBase64` — and a `skillUsed` badge) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. Per [`loading-states.md`](../technical/loading-states.md), the results view stays mounted with skeleton placeholders while a run is in flight, since code execution can take noticeably longer than a plain text call.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Backend unit"/"Backend integration"/"Frontend unit"/"Frontend browser E2E" buckets:

- [ ] **Unit** — assembles the target repo's issues+commits into JSON, uploads it via `AnthropicClient.uploadFile()`, and includes a `{ type: 'container_upload', file_id }` block in the request, with `betas: ['files-api-2025-04-14']` always present.
- [ ] **Unit** — `useSkill: true` adds `container: { skills: [{ type: 'custom', skill_id, version: 'latest' }] }` and `'skills-2025-10-02'` to `betas`; `useSkill: false` omits both, sending only `files-api-2025-04-14`.
- [ ] **Unit** — the skill is registered (`AnthropicClient.registerSkill()`) on the first `useSkill: true` request and not on a second one in the same process — the cached `skill_id` is reused instead.
- [ ] **Unit** — `executedCode` is correctly extracted from paired `server_tool_use` (`name: 'bash_code_execution'`)/`bash_code_execution_tool_result` blocks — `command` from the tool-use `input`, `stdout`/`stderr`/`returnCode` from the result's `content` — in order; empty when the response has none.
- [ ] **Unit** — an output `file_id` inside a `bash_code_execution_tool_result`'s `content.content[]` is downloaded via `AnthropicClient.downloadFile()` and included in `outputFiles` with the correct `mediaType`/`filename`/`dataBase64`.
- [ ] **Unit** — `skillUsed` is `true` only when a `server_tool_use` block actually invokes the skill, `false` when `useSkill` was requested but Claude never used it.
- [ ] **Unit** — a GitHub fetch failure surfaces as `ExternalApiError('github', ...)` (502); an upload, skill-registration, or Messages API failure surfaces as `ExternalApiError('anthropic', ...)` (502).
- [ ] **Unit** — `FakeAnthropicClient.downloadFile()` and `.registerSkill()` each throw when nothing's queued, and return the queued/canned result otherwise.
- [ ] **Integration** — a `nock`-intercepted end-to-end run (fixture GitHub + Anthropic responses, including a fixture `bash_code_execution_tool_result` with an output file) proves the full `200` response shape, for both `useSkill` states.
- [ ] **Frontend unit** — the prompt form and `useSkill` checkbox; Run disabled on an empty prompt; executed-code/stdout/stderr rendering from a mocked response; an image output file renders inline while a non-image one renders a download link; the `skillUsed` badge reflects the mocked response's value; the results-view skeleton holds for the minimum duration per `loading-states.md`.
- [ ] **E2E (Playwright)** — `data-code-sandbox.spec.ts`, per [`frontend-browser-e2e-tests.md`](../shared/frontend-browser-e2e-tests.md)'s "Specs": nav reachable right after Web & Repo Research Reporter; docs panel renders non-empty content; the happy path submits a prompt (with `useSkill` off), runs, and confirms the executed-code/stdout/stderr view and an output file preview render.

### Manual

1. With a real `ANTHROPIC_API_KEY` and `GITHUB_TARGET_REPO` configured, run a prompt like "chart commit frequency by month" with `useSkill` off — confirm a real chart image comes back and renders inline.
2. Re-run the same prompt with `useSkill` on — confirm the `skillUsed` badge accurately reflects whether Claude actually invoked the spreadsheet-export skill, and, if it did, that the returned `.xlsx` file downloads and opens correctly with formatted headers.

## To-do list

- [ ] Implement the GitHub issues+commits fetch and JSON serialization for the sandbox input file.
- [ ] Extend `AnthropicClient`/`RealAnthropicClient`/`FakeAnthropicClient` with `downloadFile()` and `registerSkill()`.
- [ ] Update `anthropic-client.md` in place to document both new methods.
- [ ] Implement the upload + `container_upload` block assembly and the code execution tool request (`files-api-2025-04-14` always, `skills-2025-10-02` + `container.skills` only when `useSkill`).
- [ ] Implement the lazy skill-registration-and-cache flow on `DataCodeSandboxService` (register on first `useSkill: true` request, reuse the cached `skill_id` afterward).
- [ ] Author the `spreadsheet-export` `SKILL.md` and its helper script.
- [ ] Implement `executedCode`/`outputFiles`/`skillUsed` extraction from the response.
- [ ] Build the frontend: prompt form, `useSkill` checkbox, results view (code/stdout/stderr, file previews, `skillUsed` badge).
- [ ] Write this lab's in-app doc (`write-lab-doc`).
- [ ] Add the browser E2E spec (`e2e/tests/data-code-sandbox.spec.ts`) — per [`frontend-browser-e2e-tests.md`](../shared/frontend-browser-e2e-tests.md)'s "Specs", only once the in-app doc above already exists, since the spec's docs-panel assertion needs real rendered content to check.
- [ ] Wire `DataCodeSandboxModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `GithubProviderModule`).

## Open questions

None.
