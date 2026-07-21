# Feature — Document Research Assistant

**Status:** 📋 Planned.

**Nav position:** after `feature-live-tool-use-console`.

## Claude API features

- **PDF support** — a PDF is a `document` content block (`media_type: "application/pdf"`); Claude processes each page as both extracted text and a rendered image, same setup as images; capped at 100 pages / 32MB.
- **Citations** — add `title` and `citations: {enabled: true}` to the document block; each claim in the response comes back with a citation object (`cited_text`, `document_index`, `document_title`, `start_page_number`, `end_page_number`) pointing to the exact source text.
- **Prompt caching + breakpoints** — mark a manual cache breakpoint on a block (system prompt, tools, messages, images, ...); processing always runs tools → system → messages, so a breakpoint caches everything before it too; minimum 1024 tokens to cache, up to 4 breakpoints per request, ~1-hour TTL; changing an earlier region (e.g. the document, if placed before the breakpoint) invalidates every region after it too, forcing a full-price reprocess.
- **Files API vs. base64 toggle** — upload once and reference a file ID vs. re-sending base64 inline; see `task-content-block-builder.md` for the confirmed field shapes.
- **Text editor tool** — server tool `str_replace_based_edit_tool` (type `text_editor_20250728`), schema-less; commands `view` / `str_replace` / `create` / `insert`; the app does the real file I/O and must enforce `str_replace` uniqueness (return `is_error: true` with a clear message on 0 or 2+ matches) and prepend line numbers to file contents so `view_range`/`insert_line` targeting works.

## Main idea

Fetch a real paper from arXiv, ask multi-turn questions over it with citations enabled so every claim points back to exact source text, and cache the document so follow-up questions in the same session are fast/cheap. A text-editor-tool side panel lets Claude keep structured running notes on the document as the conversation progresses.

## Dataset & env vars

- **arXiv API** — no auth required. Provides paper metadata plus PDF download.
- No feature-specific env vars beyond the global `ANTHROPIC_API_KEY`.

## Build order & dependencies

After Foundations Console's shell, the GitHub data provider, Live Tool-Use Console, and Workflow Gallery (see `status.md` for current position).

- Requires Foundations Console's shell (inspector panel, config/model layer).
- Reuses the **caching layer** ([`caching-layer.md`](../shared/caching-layer.md)), shared with Workflow Gallery.
- Requires the **content-block builder** ([`task-content-block-builder.md`](task-content-block-builder.md), built right before this feature) to already exist — this is its first real consumer. Data & Code Sandbox and Vision Lab depend on it too and are built after this feature.

## Shared functionality used

- Caching layer ([`caching-layer.md`](../shared/caching-layer.md)).
- Content-block builder ([`task-content-block-builder.md`](task-content-block-builder.md)) — first real consumer here; later reused by Data & Code Sandbox in Files-API-only mode, and by Vision Lab.

## Files API / base64

Both mechanisms are technically valid for attaching the PDF, so this feature exposes a **"delivery mode" toggle**: flipping it re-runs the same request through the shared content-block builder, and the inspector panel shows the resulting content block shape side by side (Files API `file_id` reference vs. inline base64).

## Guiding principles

- [`guiding-principles.md`](../technical/guiding-principles.md), "Real data, not fixtures" — a real arXiv paper, fetched live, not a bundled sample PDF.
- [`guiding-principles.md`](../technical/guiding-principles.md), "Minimize integrations" — arXiv is a new integration, but a deliberately narrow, key-free one (see "Depends on" below for why its client is lab-local rather than shared).
- [`guiding-principles.md`](../technical/guiding-principles.md), "One inspector, many labs" — every turn's envelope (including the tool loop's `calls`) renders through the same shared inspector as every other lab.

## A new pattern: server-owned conversation session

This feature is the first to need server-side state, for the three reasons `architecture.md`'s "Server-owned session state" now documents as the standing rule for when a feature may depart from the app's stateless-per-request default: the text-editor tool's file I/O has to live server-side regardless, re-sending the PDF on every follow-up would be wasteful once a Files-API reference exists, and a cache breakpoint needs an exact byte-identical prefix across calls. Confirmed as the template any later feature in the same situation should reuse rather than reinvent, not a one-off.

Concretely: `DocumentResearchAssistantService` keeps an in-memory `Map<sessionId, DocumentSession>`, `DocumentSession = { paper: ArxivPaper; pdfBytes: Buffer; fileId?: string; notesFileContent: string | null; messages: AnthropicMessageParam[] }` — the general in-memory-`Map`/no-persistence/fresh-session-on-refresh shape `architecture.md` describes, applied to this feature's own session fields.

## Depends on

- [`task-content-block-builder.md`](task-content-block-builder.md)'s `ContentBlockBuilderService.buildBlock()` — builds the document content block in whichever mode the current `ask` requests.
- [`caching-layer.md`](../shared/caching-layer.md)'s `CachingLayerService.markBreakpoints()`/`readCacheStatus()` — the document (first user message) is the cached region.
- [`architecture.md`](../technical/architecture.md), "Custom tools vs. server-executed tools" — the text-editor tool loop follows exactly this convention (backend executes real file I/O, replies with `tool_result`, repeats until `stop_reason` isn't `tool_use`), the same shape [`live-tool-use-console.md`](../features/live-tool-use-console.md) already established for `get_weather`/`get_repo_stats`.
- [`architecture.md`](../technical/architecture.md), "Streaming transport" — this feature's tool loop is structurally the same shape as Live Tool-Use Console's, so it reuses that lab's own streaming convention (raw events forwarded verbatim, plus `tool_call_start`/`tool_call_result` app-level events, plus a terminal `turn_complete`) rather than inventing a new one.
- **arXiv client** — a new data-source client, but built **lab-local** (`backend/src/document-research-assistant/arxiv-client.ts`), not under `backend/src/shared/`, per [`repo-layout.md`](../technical/repo-layout.md)'s "Lab-specific, or shared functionality?" rule: no other planned feature consumes arXiv, which is exactly the same situation Live Tool-Use Console's `OpenMeteoClient` is already in (see [`live-tool-use-console.md`](../features/live-tool-use-console.md)'s "Backend" section) — it's promoted to `backend/src/shared/` only if and when a second feature needs it, not preemptively. Still follows the same DI-token-plus-fake pattern as every other external client ([`test-doubles.md`](../shared/test-doubles.md)): an abstract-class `ArxivClient` token (`getPaper(arxivId: string): Promise<{ arxivId, title, authors: string[], summary, pdfUrl, pdfBytes: Buffer }>`), a `RealArxivClient` (fetches the Atom XML metadata via `export.arxiv.org/api/query?id_list=<id>`, then the PDF bytes from the returned PDF link, rethrowing any failure as `ExternalApiError('arxiv', ...)` per [`api-error-handling.md`](../shared/api-error-handling.md)), a `FakeArxivClient` under `backend/src/testing/arxiv/` returning canned metadata and a small canned (not-necessarily-valid-PDF) buffer by default, and wired through [`fake-mode.md`](../shared/fake-mode.md)'s `fakeSwitchProvider()`.

## Endpoint contract

`backend/src/document-research-assistant/`:

- **`POST /api/document-research-assistant/session`**:
  - Request: `{ arxivId: string }` (non-empty; accepts either a bare ID like `2301.00234` or a full `arxiv.org` URL, normalized server-side).
  - A lookup failure (not found, malformed ID, network failure) → `ExternalApiError('arxiv', ...)` → `502`.
  - Success → `200` `{ sessionId: string; paper: { arxivId: string; title: string; authors: string[]; summary: string; pdfUrl: string } }`. Creates the session (empty `notesFileContent`, empty `messages`) but makes no Claude API call yet — the first `ask` is what actually attaches the document.
- **`POST /api/document-research-assistant/session/:sessionId/ask`**:
  - `sessionId` not found (unknown or never created) → `404` (`NotFoundException`, a client request-shape rejection per `architecture.md`'s error-contract citation above, not an `ExternalApiError`).
  - Request: `{ question: string; deliveryMode: 'files-api' | 'base64'; stream: boolean }` (`question` non-empty — plain `400` otherwise).
  - On the session's first `ask`, the user message carries the document content block (built via `ContentBlockBuilderService.buildBlock()` in the requested `deliveryMode`, with `title: paper.title` and `citations: { enabled: true }` added) ahead of the question text, and a cache boundary is marked on it (`CachingLayerService.markBreakpoints(params, [{ region: 'messages', messageIndex: 0 }])`). In `files-api` mode, the upload happens once — the returned `file_id` is cached on the session (`DocumentSession.fileId`) and reused on every later `ask` that requests `files-api` mode again, never re-uploaded. Every `ask` appends the new question (and, once answered, the assistant's reply) to the session's own `messages`, which is what makes the conversation multi-turn without the frontend resending history.
  - The text-editor tool (`str_replace_based_edit_tool`, `text_editor_20250728`) is offered on every `ask`, operating on the session's single fixed virtual file at path `/notes.md`: `create` initializes/overwrites `notesFileContent`; `view` returns its content with line numbers prepended; `str_replace` requires exactly one match (`is_error: true` with a clear message on 0 or 2+ matches, loop continues rather than erroring the turn); `insert` inserts at the given line. Any command targeting a path other than `/notes.md` → `is_error: true` ("no such file"), since there's exactly one file in this feature, not a real filesystem.
  - `stream: false` → `200`:
    ```ts
    TurnEnvelope & {
      calls?: { request: AnthropicMessageParams; response: AnthropicMessage }[];  // present only when the text-editor tool loop made more than one call this turn
      answer: string;
      citations: { citedText: string; documentTitle: string; startPage: number; endPage: number }[];  // flattened from every citation object across the final response's content blocks
      notes: string | null;  // notesFileContent after this turn, for the side panel
      cache: { read: boolean; write: boolean };
    }
    ```
  - `stream: true` → `200`, `Content-Type: text/event-stream`, same route: raw Claude stream events forwarded verbatim; `event: tool_call_start`/`event: tool_call_result` around each text-editor tool execution (same shape as [`live-tool-use-console.md`](../features/live-tool-use-console.md)); a terminal `event: turn_complete\ndata: <same JSON body as the non-streaming success>\n\n`. A mid-stream transport failure → `event: error\ndata: <ShapedError body JSON>\n\n`, no `turn_complete` after it.

## Frontend

`frontend/src/app/document-research-assistant/` (`DocumentResearchAssistant`). Stacks `<app-docs-panel [slug]="'document-research-assistant'" />` → the demo → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. The demo itself: an arXiv-ID entry form (per [`forms.md`](../technical/forms.md)) that starts a session and shows the paper's title/authors/summary once fetched; below it, a chat-style question/answer transcript (streaming toggle, delivery-mode toggle) with citation markers on each claim that, on click/hover, surface the `citedText`/page range; a running-notes side panel rendering the latest `notes` value, updating after each ask. Per [`loading-states.md`](../technical/loading-states.md), the transcript and notes panel stay mounted with skeleton placeholders while an ask is in flight rather than blanking.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Backend unit"/"Backend integration"/"Frontend unit"/"Frontend browser E2E" buckets:

- [ ] **Unit** — `POST /session` fetches metadata+PDF bytes via a fake `ArxivClient` and creates a session with empty notes and empty history.
- [ ] **Unit** — the first `ask` in a session builds the document content block via `ContentBlockBuilderService` in the requested mode, adds `title`/`citations: { enabled: true }`, and marks the `messages[0]` cache boundary.
- [ ] **Unit** — a second `ask` requesting `files-api` mode again reuses the session's cached `fileId` rather than calling `AnthropicClient.uploadFile()` a second time.
- [ ] **Unit** — `create` on `/notes.md` initializes `notesFileContent`; a unique `str_replace` updates it; a 0-match or 2+-match `str_replace` returns `is_error: true` with a clear message and the loop continues; `view` returns line-numbered content; any command against a path other than `/notes.md` returns `is_error: true`.
- [ ] **Unit** — citations are correctly flattened from the final response's content blocks into the response's `citations` array.
- [ ] **Unit** — an `ask` against an unknown `sessionId` throws `NotFoundException` (404).
- [ ] **Unit** — `calls` is present (and holds every intermediate tool-loop call) only when the text-editor tool loop actually ran more than once this turn; omitted for a turn that answered without a tool call.
- [ ] **Integration** — `nock`-intercepted end-to-end: session creation, a first ask (document attached, cache boundary marked), and a follow-up ask (cached document, tool loop exercised), covering both `stream: false` and `stream: true`, and the `404`/`502` error paths.
- [ ] **Frontend unit** — the arXiv-ID form starts a session and renders the fetched paper; the transcript renders question/answer turns and citation markers from a mocked response; toggling delivery mode re-issues the current question and the inspector shows both content-block shapes side by side; the notes panel renders `notes` after each ask; the transcript/notes panel skeletons hold for the minimum duration per `loading-states.md` and never blank on a second-onward ask.
- [ ] **E2E (Playwright)** — `document-research-assistant.spec.ts`, per [`frontend-browser-e2e-tests.md`](../shared/frontend-browser-e2e-tests.md)'s "Specs": nav reachable right after Live Tool-Use Console; docs panel renders non-empty content; the happy path starts a session against the one fake-mode arXiv paper, asks a question, and confirms a rendered answer with citation markers and an updated notes panel, for both `stream: false` and `stream: true`.

### Manual

1. With a real `ANTHROPIC_API_KEY`, fetch a real arXiv paper by ID and ask a first question — confirm the answer includes citations pointing to real text in the paper (spot-check a `cited_text` against the actual PDF).
2. Ask a follow-up question in the same session and confirm, via the inspector panel, the second call reports `cache.read: true` on the document portion.
3. Toggle delivery mode for the same question and confirm the inspector shows both the Files API (`file_id`) and base64 content-block shapes.
4. Ask a question that prompts Claude to update its running notes (e.g. "note the paper's key contribution in your notes") and confirm the notes side panel reflects the edit — including, if it occurs naturally, a case where a `str_replace` hits a uniqueness conflict and Claude self-corrects on the next tool call.

## To-do list

- [ ] Implement the lab-local `ArxivClient` (`RealArxivClient`, `FakeArxivClient`, `fakeSwitchProvider()` wiring), per "Depends on" above.
- [ ] Implement `POST /session` (fetch + in-memory session creation).
- [ ] Implement the document content-block attachment (first-ask-only) with citations enabled and the cache boundary.
- [ ] Implement `file_id` reuse across asks in `files-api` mode.
- [ ] Implement the text-editor tool loop against the session's single `/notes.md` virtual file, including the `str_replace` uniqueness/`is_error` handling and line-numbered `view` output.
- [ ] Implement citation flattening into the response shape.
- [ ] Implement streaming (`tool_call_start`/`tool_call_result`/`turn_complete`), reusing Live Tool-Use Console's SSE plumbing.
- [ ] Implement `404` handling for an unknown `sessionId`.
- [ ] Build the frontend: arXiv-ID form, chat transcript with citation markers, delivery-mode toggle, notes side panel.
- [ ] Write this lab's in-app doc (`write-lab-doc`).
- [ ] Add the browser E2E spec (`e2e/tests/document-research-assistant.spec.ts`) — per [`frontend-browser-e2e-tests.md`](../shared/frontend-browser-e2e-tests.md)'s "Specs", only once the in-app doc above already exists, since the spec's docs-panel assertion needs real rendered content to check.
- [ ] Wire `DocumentResearchAssistantModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `ContentBlockBuilderModule`, `CachingLayerModule`).

## Open questions

None specific to this feature. The Files API field-shape question is tracked in [`task-content-block-builder.md`](task-content-block-builder.md) instead, since that's where the content-block builder's interface is actually decided.
