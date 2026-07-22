# Document Research Assistant

Fetches a real paper from arXiv and answers multi-turn questions over it with citations enabled, so every claim in an answer points back to exact source text (`cited_text`, page range). The document is cached so follow-up questions in the same session are fast/cheap, and a text-editor-tool side panel lets Claude keep structured running notes on the paper as the conversation progresses.

## Backend

`backend/src/document-research-assistant/`:

- **`POST /api/document-research-assistant/session`** — `{ arxivId: string }` (bare ID like `2301.00234` or a full `arxiv.org` URL, normalized server-side). A lookup failure (not found, malformed ID, network failure) → `ExternalApiError('arxiv', ...)` → `502`. Success → `200` `{ sessionId: string; paper: { arxivId: string; title: string; authors: string[]; summary: string; pdfUrl: string } }`. Creates the session (empty notes, empty history) but makes no Claude API call yet — the first `ask` is what actually attaches the document.
- **`POST /api/document-research-assistant/session/:sessionId/ask`** — `{ question: string; deliveryMode: 'files-api' | 'base64'; stream: boolean }` (`question` non-empty, else `400`). Unknown `sessionId` → `404` (`NotFoundException`).
  - On the session's first `ask`, the user message carries the document content block ahead of the question text (built via `ContentBlockBuilderService.buildBlock()` in the requested `deliveryMode`, with `title: paper.title` and `citations: { enabled: true }` added), with a cache boundary marked on it (`CachingLayerService.markBreakpoints(params, [{ region: 'messages', messageIndex: 0 }])`). This document content block is rebuilt fresh from the current `ask`'s `deliveryMode` on every call, per `caching-layer.md`'s "Using it" — in `files-api` mode the upload happens once (the returned `file_id` is cached on the session and reused, never re-uploaded), and switching delivery mode mid-session deliberately produces a cache write instead of a read on the next call. Every `ask` appends the new question (and, once answered, the assistant's reply) to the session's own message history, which is what makes the conversation multi-turn without the frontend resending it. A response block's citation metadata is stripped before it's folded into that history (the cited text itself is kept) — an unstripped citation isn't safely resendable in a later call.
  - The text-editor tool (`str_replace_based_edit_tool`, `text_editor_20250728`) is offered on every `ask`, operating on the session's single fixed virtual file at `/notes.md`: `create` initializes/overwrites its content; `view` returns it with line numbers prepended; `str_replace` requires exactly one match (`is_error: true` with a clear message on 0 or 2+ matches, loop continues); `insert` inserts at the given line. Any command against a path other than `/notes.md` → `is_error: true`. Since this tool carries no `description` field of its own, a system prompt names `/notes.md` and when to use the tool — without it, Claude has no way to learn the tool applies.
  - `stream: false` → `200`:
    ```ts
    TurnEnvelope & {
      calls?: { request: AnthropicMessageParams; response: AnthropicMessage }[];  // present only when the text-editor tool loop made more than one call this turn
      answer: string;
      citations: { citedText: string; documentTitle: string; startPage: number; endPage: number }[];  // flattened from every citation object across the final response's content blocks
      notes: string | null;  // the notes file's content after this turn
      cache: { read: boolean; write: boolean };
    }
    ```
  - `stream: true` → `200`, `Content-Type: text/event-stream`, same route: raw Claude stream events forwarded verbatim (including `citations_delta`, accumulated into the reconstructed response the same way `text_delta`/`thinking_delta`/`signature_delta`/`input_json_delta` are); `event: tool_call_start`/`event: tool_call_result` around each text-editor tool execution; a terminal `event: turn_complete\ndata: <same JSON body as the non-streaming success>\n\n`. A mid-stream transport failure → `event: error\ndata: <ShapedError body JSON>\n\n`, no `turn_complete` after it.

Both delivery modes are exposed as a toggle in the demo: flipping it re-runs the same request through `ContentBlockBuilderService`, and the inspector panel shows the resulting content block shape side by side (Files API `file_id` reference vs. inline base64) — see `content-block-builder.md`.

Wired via `DocumentResearchAssistantModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `ContentBlockBuilderModule`, `CachingLayerModule`).

### arXiv client

A lab-local client (`backend/src/document-research-assistant/arxiv-client.ts`), not shared, since no other feature consumes arXiv: an abstract-class `ArxivClient` token (`getPaper(arxivId: string): Promise<{ arxivId, title, authors: string[], summary, pdfUrl, pdfBytes: Buffer }>`), `RealArxivClient` (fetches the Atom XML metadata via `export.arxiv.org/api/query?id_list=<id>` using `fast-xml-parser`, then the PDF bytes from the returned PDF link, rethrowing any failure as `ExternalApiError('arxiv', ...)`), and `FakeArxivClient` (`backend/src/testing/arxiv/`) returning canned metadata and a small canned buffer by default, wired through `fake-mode.md`'s `fakeSwitchProvider()`.

## Frontend

`frontend/src/app/document-research-assistant/` (`DocumentResearchAssistant`). Stacks `<app-docs-panel [slug]="'document-research-assistant'" />` → the demo → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. The demo: an arXiv-ID entry form that starts a session and shows the paper's title/authors/summary once fetched; a chat-style question/answer transcript (streaming toggle, delivery-mode toggle) with citation markers on each claim that, on click/hover, surface the `citedText`/page range; a running-notes side panel rendering the latest `notes` value, updating after each ask. The transcript and notes panel stay mounted with skeleton placeholders while an ask is in flight rather than blanking.

## In-app doc

`frontend/public/lab-docs/document-research-assistant.md` — rendered inline by `DocsPanel`.

## Testing

- `document-research-assistant.service.spec.ts` (backend unit) — session creation via a fake `ArxivClient`; the first ask's document-block attachment (delivery mode, `citations: { enabled: true }`, cache boundary); `file_id` reuse across asks in `files-api` mode; the text-editor tool loop including the `str_replace` uniqueness/`is_error` handling and line-numbered `view` output; citation flattening from both a non-streamed response and a streamed one (`citations_delta` accumulation); the `calls` field's presence only on a multi-call turn; `404` on an unknown `sessionId`.
- `document-research-assistant.e2e-spec.ts` (backend integration) — `nock`-intercepted end-to-end: session creation, a first ask (document attached, cache boundary marked), and a follow-up ask (cached document, tool loop exercised), covering both `stream: false` and `stream: true`, and the `404`/`502` error paths.
- `document-research-assistant.spec.ts` (frontend unit) — the arXiv-ID form starting a session and rendering the fetched paper; the transcript rendering question/answer turns and citation markers from a mocked response; toggling delivery mode re-issuing the current question with both content-block shapes shown in the inspector; the notes panel rendering after each ask; the transcript/notes-panel skeletons holding for the minimum duration and never blanking on a second-onward ask.
- `document-research-assistant.spec.ts` (Playwright E2E, `e2e/tests/`) — nav reachable right after Live Tool-Use Console; docs panel renders non-empty content; the happy path starts a session against the one fake-mode arXiv paper, asks a question, and confirms a rendered answer with citation markers and an updated notes panel, for both `stream: false` and `stream: true`.
