# Data & Code Sandbox

Pulls real activity data for the subject repo (issues + commits, via the GitHub data provider), uploads it through the Files API, and has Claude write and run Python against it in the code execution tool's sandboxed container — producing charts/analysis, and optionally reaching for a custom Agent Skill to export a styled spreadsheet instead of a plain CSV.

## Backend

`backend/src/data-code-sandbox/`:

- **`POST /api/data-code-sandbox/run`**:
  - Request: `{ prompt: string; useSkill: boolean }` (`prompt` non-empty — plain `400` otherwise via the validation pipe).
  - A GitHub data fetch failure surfaces as `ExternalApiError('github', ...)` → `502`; an upload, skill-registration, or Messages API failure surfaces as `ExternalApiError('anthropic', ...)` → `502`.
  - Flow: fetches the target repo's issues + commits via `GithubClient`, serializes them to JSON, uploads that via `AnthropicClient.uploadFile(bytes, 'application/json')`, then makes one Messages API call with the code execution tool (`{ type: 'code_execution_20260521', name: 'code_execution' }`) enabled and a user message carrying `{ type: 'container_upload', file_id }` alongside the prompt text. `betas` always includes `files-api-2025-04-14` — the sandbox has no network access, so the Files API is the only way to move data in or out; there is no base64 fallback path here. When `useSkill` is `true`, `container: { skills: [{ type: 'custom', skill_id, version: 'latest' }] }` is added, along with two more betas: `skills-2025-10-02` for the Skills API itself, and `code-execution-2025-08-25`, required whenever code execution is combined with a container skill.
  - Success → `200`:
    ```ts
    TurnEnvelope & {
      executedCode: { command: string; stdout: string; stderr: string; returnCode: number }[];  // one entry per server_tool_use (name: 'bash_code_execution') / bash_code_execution_tool_result pair, in order; empty if Claude answered without running a bash command
      outputFiles: { fileId: string; filename: string; mediaType: string; dataBase64: string }[];  // every file_id inside any bash_code_execution_tool_result's content.content[], downloaded via AnthropicClient.downloadFile()
      skillUsed: boolean;  // see "Detecting skill use" below
    }
    ```
    No `calls` field — the code execution tool is server-executed and resolves inside the single Messages API call, so this route never loops. No `cache` field either — a single call has no repeated prefix to place a breakpoint on.

### Detecting skill use

There is no dedicated content block or field in the Messages API response that says "the skill was invoked" — Claude simply runs bash commands, and if it decided the skill was relevant, one of those commands references the skill's own mounted files. `skillUsed` is computed by checking whether any executed bash command's `command` string contains the skill's own name (`spreadsheet-export`) as a substring; it's always `false` when `useSkill` was `false`, and only `true` when `useSkill` was `true` **and** that substring check matched — requesting the skill only makes it *available*, it doesn't guarantee Claude reaches for it.

### The spreadsheet-export skill

`backend/src/data-code-sandbox/skills/spreadsheet-export/` — a custom Agent Skill: `SKILL.md` (frontmatter `name: spreadsheet-export`) plus `export_xlsx.py`, a helper script wrapping `openpyxl` to write a styled `.xlsx` (bold header row, auto-sized columns) from a `{headers, rows}` JSON payload. Registered once per process via `AnthropicClient.registerSkill(files)` (`client.beta.skills.create({ files, betas: ['skills-2025-10-02'] })`), lazily on `DataCodeSandboxService`'s first `useSkill: true` request; the returned `skill_id` is cached in memory and reused on every later `useSkill: true` request without registering again (a process restart re-registers once, on the next such request — no persistence, consistent with `session-state.md`).

Because `nest build` only copies `.ts` files by default, `backend/nest-cli.json` has `compilerOptions.assets: ["data-code-sandbox/skills/**/*"]` (+ `watchAssets: true`) so `SKILL.md`/`export_xlsx.py` actually reach `dist/` for `registerSkill()` to read at runtime.

Wired via `DataCodeSandboxModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `GithubProviderModule`) into `AppModule`.

## Frontend

`frontend/src/app/data-code-sandbox/` (`DataCodeSandbox`). Stacks `<app-docs-panel [slug]="'data-code-sandbox'" />` → the demo (a free-text analysis prompt, the "Use Spreadsheet Export Skill" checkbox below it, a Run button, and a results view listing each executed-code block with its stdout/stderr, output-file previews — an image `mediaType` renders inline, anything else offers a download link built from the returned `dataBase64` — and a `skillUsed` badge) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. The results view stays mounted with skeleton placeholders (held for a minimum readable duration) while a run is in flight, since code execution can take noticeably longer than a plain text call.

## In-app doc

`frontend/public/lab-docs/data-code-sandbox.md` — covers the code execution tool and why the Files API is mandatory here (no network access in the sandbox), a real example request/response pair for a `bash_code_execution` round trip, how an output file's `file_id` comes back, and the Agent Skill registration/attachment flow, rendered inline by `DocsPanel`.

## Testing

- `data-code-sandbox.service.spec.ts` — unit tests with a fake `AnthropicClient`/`GithubClient` bound via DI: the `code_execution_20260521` tool offered on every call; dataset assembly + upload + `container_upload` block with `files-api-2025-04-14` always present; `container.skills`/`skills-2025-10-02` added only when `useSkill` is `true`; the skill registered once and reused on a second `useSkill: true` call; `executedCode` extraction (in order, empty when none); output-file download + inclusion in `outputFiles`; `skillUsed` true only when a bash command actually references the skill; a GitHub failure surfacing as `ExternalApiError('github', ...)`, an upload failure as `ExternalApiError('anthropic', ...)`.
- `data-code-sandbox.e2e-spec.ts` — integration tests with `nock` intercepting the real GitHub/Anthropic HTTP calls (including a fixture `bash_code_execution_tool_result` with an output file), proving the full `200` response shape for both `useSkill` states, the outbound `anthropic-beta` header carrying `code-execution-2025-08-25` alongside `skills-2025-10-02` only when `useSkill` is `true`, the `502` GitHub-failure path, and the plain `400` on an empty prompt.
- `data-code-sandbox.spec.ts` (frontend) — unit tests with `HttpTestingController`: the prompt form and skill checkbox, Run disabled on an empty prompt, executed-code/stdout/stderr rendering, an image output file rendering inline vs. a non-image one rendering a download link, the `skillUsed` badge reflecting the mocked response, and the results-view skeleton holding for the minimum duration.
- `e2e/tests/data-code-sandbox.spec.ts` (Playwright, browser E2E) — nav reachable, docs panel renders non-empty content, and the happy path (skill off) submits a prompt and confirms the executed-code view and an output-file preview render. `FakeAnthropicClient`'s unqueued-call fallback recognizes the `code_execution_*` tool and fabricates a plausible `bash_code_execution` round trip with an output file specifically so this spec has real content to assert against (see `test-doubles.md`).
