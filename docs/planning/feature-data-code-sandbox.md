# Feature — Data & Code Sandbox

**Status:** 📋 Planned.

**Nav position:** after `feature-web-repo-research-reporter`.

## Claude API features

- **Code execution tool** — server tool (no implementation to write); runs Python in an isolated Docker sandbox with no network access; can execute multiple times per conversation, iterating on results; response mixes `text`, `server_tool_use` (the code that ran), and `code_execution_tool_result` (stdout/errors/output file refs) blocks.
- **Files API (mandatory here)** — upload a file once, get a file ID, reference it in a message instead of inline base64; the only way to move data into/out of the sandbox since it has no network access — data goes in via file ID, results come out via file ID.
- **Agent Skills** — a packaged `SKILL.md` (frontmatter `name`/`description`) plus scripts/resources, loaded via `container.skills` alongside the code execution tool (needs both the `code-execution` and `skills` beta headers); progressive disclosure keeps an unused skill's full instructions out of context until Claude judges it relevant; up to 8 skills per request; skill output files land in the Files API. The exact registration mechanism (whether a skill package needs a one-time upload to obtain a skill ID, or is referenced a different way) is confirmed against current Claude API docs at build time — what's fixed here is the `SKILL.md` frontmatter contract and the two beta headers.

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
- [`guiding-principles.md`](../technical/guiding-principles.md), "One inspector, many labs" — the single call's raw request/response (including the `server_tool_use`/`code_execution_tool_result` blocks) renders through the shared inspector unmodified.

## Architecture

- [`architecture.md`](../technical/architecture.md), "Custom tools vs. server-executed tools" — the code execution tool is server-executed: it "resolves inside a single Messages API call... The backend forwards those blocks through the same envelope unchanged; it does not loop." This is why this feature makes exactly one Messages API call per run, never a `calls` array, and needs no app-level streaming events the way a custom-tool loop (Live Tool-Use Console, Document Research Assistant) does.

## Endpoint contract

This feature is **non-streaming**, for the same reason Structured Output Console is: one blocking call whose value is in its finished, structured output (executed code, stdout/stderr, output files), not in watching text accumulate live.

`backend/src/data-code-sandbox/`:

- **`POST /api/data-code-sandbox/run`**:
  - Request: `{ prompt: string; useSkill: boolean }` (`prompt` non-empty — plain `400` otherwise).
  - A GitHub data fetch failure → `ExternalApiError('github', ...)` → `502`. An upload or Messages API failure → `ExternalApiError('anthropic', ...)` → `502`.
  - Flow: fetch the target repo's issues and commits via `GithubClient`, serialize to JSON, upload via `AnthropicClient.uploadFile(jsonBytes, 'application/json')`, then make one Messages API call with the code-execution tool enabled and a user message containing `{ type: 'container_upload', file_id }` alongside `prompt`'s text. When `useSkill` is `true`, the spreadsheet-export skill (see "Agent Skill" below) is loaded via `container.skills`, with the `skills` beta header added alongside `code-execution`.
  - Any `file_id` appearing in a `code_execution_tool_result` block (an output file the sandbox produced) is downloaded via a new `AnthropicClient.downloadFile(fileId: string): Promise<{ bytes: Buffer; mediaType: string; filename: string }>` method (this feature's own extension of the `AnthropicClient` token — a download-back capability no earlier task needed, distinct from `task-content-block-builder.md`'s upload-focused `uploadFile()`; same pattern otherwise: real implementation calls the SDK's Files API beta download surface and rethrows any failure as `ExternalApiError('anthropic', ...)`, fake implementation returns a canned buffer via the same queue-or-throw idiom as `AnthropicClient`'s other methods).
  - Success → `200`:
    ```ts
    TurnEnvelope & {
      executedCode: { code: string; stdout: string; stderr: string }[];  // one entry per server_tool_use / code_execution_tool_result pair, in order; empty if Claude answered without running code
      outputFiles: { fileId: string; filename: string; mediaType: string; dataBase64: string }[];
      skillUsed: boolean;  // whether a server_tool_use block actually invoked the spreadsheet-export skill this turn — not merely whether useSkill was requested
    }
    ```
    No `calls` field (always exactly one call, per the architecture citation above) and no `cache` field (this feature never places a cache breakpoint — a single call has no repeated prefix to cache, per `architecture.md`'s "omitted for a lab that never places a breakpoint").

## Agent Skill: spreadsheet export

`backend/src/data-code-sandbox/skills/spreadsheet-export/SKILL.md` — frontmatter `name: spreadsheet-export`, `description` telling Claude this skill formats tabular analysis results into a styled `.xlsx` file (headers, auto-sized columns) instead of a plain CSV, plus a helper Python script (e.g. wrapping `openpyxl`) the skill's instructions point Claude at. This is the only skill this feature loads (well under the 8-per-request cap).

## Frontend

`frontend/src/app/data-code-sandbox/` (`DataCodeSandbox`). Stacks `<app-docs-panel [slug]="'data-code-sandbox'" />` → the demo (free-text analysis prompt per [`forms.md`](../technical/forms.md), a `useSkill` checkbox, Run button, a results view showing each executed-code block with its stdout/stderr, output-file previews — an image `mediaType` renders inline, anything else offers a download link built from the returned `dataBase64` — and a `skillUsed` badge) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. Per [`loading-states.md`](../technical/loading-states.md), the results view stays mounted with skeleton placeholders while a run is in flight, since code execution can take noticeably longer than a plain text call.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Backend unit"/"Backend integration"/"Frontend unit" buckets:

- [ ] **Unit** — assembles the target repo's issues+commits into JSON, uploads it via `AnthropicClient.uploadFile()`, and includes a `{ type: 'container_upload', file_id }` block in the request.
- [ ] **Unit** — `useSkill: true` adds the spreadsheet-export skill to `container.skills` and the `skills` beta header; `useSkill: false` omits both, sending only the `code-execution` beta header.
- [ ] **Unit** — `executedCode` is correctly extracted from paired `server_tool_use`/`code_execution_tool_result` blocks, in order; empty when the response has none.
- [ ] **Unit** — an output `file_id` in a `code_execution_tool_result` is downloaded via `AnthropicClient.downloadFile()` and included in `outputFiles` with the correct `mediaType`/`filename`/`dataBase64`.
- [ ] **Unit** — `skillUsed` is `true` only when a `server_tool_use` block actually invokes the skill, `false` when `useSkill` was requested but Claude never used it.
- [ ] **Unit** — a GitHub fetch failure surfaces as `ExternalApiError('github', ...)` (502); an upload or Messages API failure surfaces as `ExternalApiError('anthropic', ...)` (502).
- [ ] **Unit** — `FakeAnthropicClient.downloadFile()` throws when nothing's queued, returns the queued/canned buffer otherwise.
- [ ] **Integration** — a `nock`-intercepted end-to-end run (fixture GitHub + Anthropic responses, including a fixture `code_execution_tool_result` with an output file) proves the full `200` response shape, for both `useSkill` states.
- [ ] **Frontend unit** — the prompt form and `useSkill` checkbox; Run disabled on an empty prompt; executed-code/stdout/stderr rendering from a mocked response; an image output file renders inline while a non-image one renders a download link; the `skillUsed` badge reflects the mocked response's value; the results-view skeleton holds for the minimum duration per `loading-states.md`.

### Manual

1. With a real `ANTHROPIC_API_KEY` and `GITHUB_TARGET_REPO` configured, run a prompt like "chart commit frequency by month" with `useSkill` off — confirm a real chart image comes back and renders inline.
2. Re-run the same prompt with `useSkill` on — confirm the `skillUsed` badge accurately reflects whether Claude actually invoked the spreadsheet-export skill, and, if it did, that the returned `.xlsx` file downloads and opens correctly with formatted headers.

## To-do list

- [ ] Implement the GitHub issues+commits fetch and JSON serialization for the sandbox input file.
- [ ] Extend `AnthropicClient`/`RealAnthropicClient`/`FakeAnthropicClient` with `downloadFile()`.
- [ ] Update `anthropic-client.md` in place to document the new method.
- [ ] Implement the upload + `container_upload` block assembly and the code-execution tool request (betas, `container.skills` toggle).
- [ ] Author the `spreadsheet-export` `SKILL.md` and its helper script.
- [ ] Implement `executedCode`/`outputFiles`/`skillUsed` extraction from the response.
- [ ] Build the frontend: prompt form, `useSkill` checkbox, results view (code/stdout/stderr, file previews, `skillUsed` badge).
- [ ] Wire `DataCodeSandboxModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `GithubProviderModule`).

## Open questions

None.
