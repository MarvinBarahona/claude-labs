# Task — Document Research Assistant Large-File Warning

**Status:** 📋 Planned

**Target doc:** [`document-research-assistant.md`](../features/document-research-assistant.md)

## What

[`task-agent-playground-tool-result-caps.md`](task-agent-playground-tool-result-caps.md) fixed
an Agent Playground bug where an unbounded external data source (a repo's full file tree, a
file's full contents) landed in a tool result with no size limit, driving per-call cost up
without bound. Document Research Assistant has the same root exposure through a different
door: `RealArxivClient.getPaper()`
(`backend/src/document-research-assistant/real-arxiv-client.ts`) fetches a paper's entire PDF
into memory (`axios.get(pdfUrl, { responseType: 'arraybuffer' })`) with no size check at all,
and those bytes become the `document` content block attached on the session's first `ask` —
resent on every later turn once cached (see `document-research-assistant.md`'s "Backend"
section). A paper with many pages (a long survey, a thesis-length submission) makes every turn
in that session more expensive and slower, with nothing in the app today surfacing that to the
person who typed in the arXiv ID.

Unlike the Agent Playground fix, this task's job is not to cap or truncate — a PDF can't be
partially truncated the way a file tree or a tool result can without breaking the very
page-based citations (`start_page_number`/`end_page_number`) the lab exists to demonstrate. The
fix here is a **warning**: surface to the user, once the paper's size is known, that this
particular document is large and turns against it will cost more / run slower — not block the
session or silently cut the document down.

## Why now

Filed as a follow-on to the already-shipped `document-research-assistant` feature, prompted by
the same investigation that produced the Agent Playground task: both labs wrap an external,
size-unbounded data source, and `architecture.md`'s "Custom tools vs. server-executed tools"
section's size-cap rule doesn't cover this case (this isn't a custom tool result — it's a
document content block), so it's tracked as its own task rather than assumed to already be
handled by that standing rule.

## Decisions

- **Size is fully known at session-creation time, not first-ask time.**
  `RealArxivClient.getPaper()` already buffers the entire PDF into memory
  (`Buffer.from(pdfBytes)`) before `createSession()` returns — nothing about the document is
  streamed or lazily fetched. `pdfBytes.length` is therefore available immediately in
  `DocumentResearchAssistantService.createSession()`, before the frontend ever renders the
  "Paper" section, let alone asks a question. This resolves the open question from the draft:
  the warning is computed and returned on `POST .../session`, not on `ask`.
- **Byte size is the metric, not page count or an estimated token cost.** The app has no PDF
  parsing dependency anywhere (`fast-xml-parser` in this lab parses arXiv's Atom XML, not PDF
  structure) — deriving a page count would mean adding one just for this warning. Raw byte size
  is already known for free and is an honest, if approximate, proxy for both request cost and
  latency.
- **Threshold: `LARGE_PDF_WARNING_BYTES = 10 * 1024 * 1024` (10 MB), a module-level constant in
  `document-research-assistant.service.ts`.** Comfortably below Claude's real hard ceiling for a
  PDF document (32 MB / 100 pages), and well above a typical arXiv paper (usually a few MB) — it
  only fires for a paper that's genuinely unusual in size, not the common case. Easy to retune
  later, same pattern as the sibling task's `MAX_TREE_ENTRIES`/`MAX_FILE_CONTENT_CHARS`.
- **Response shape:** `CreateSessionResult` (`document-research-assistant.service.ts`) gains one
  new field: `warning: string | null`. `null` when `pdfBytes.length <= LARGE_PDF_WARNING_BYTES`;
  otherwise a ready-to-display message computed server-side, e.g. `` `This paper's PDF is 14.2
  MB — turns against it will process more content, so each question costs more and takes longer
  than a typical paper.` `` (size formatted as `(pdfBytes.length / (1024 * 1024)).toFixed(1)` MB).
  The backend owns the threshold and the message text, the same way `cache: { read, write }` is
  computed server-side rather than shipping raw usage numbers for the frontend to interpret —
  the frontend only renders the string, it doesn't re-derive "large."
- **Warning display: a persistent inline banner in the "Paper" section, not a one-time
  toast.** This app has no toast/snackbar component anywhere — the existing pattern for
  session-level messaging is an inline `role="alert"` paragraph (`sessionError`, `askError` in
  `document-research-assistant.html`). The "Paper" section stays mounted and showing paper
  metadata for the entire life of a session once `session()` is set (`document-research-
  assistant.html` lines 9–15), so a persistent banner there — shown for as long as the session
  lasts — correctly signals an ongoing state ("every turn in this session costs more"), unlike a
  toast, which would disappear even though the condition it describes is still true.
- **No fake-mode/test-double change needed.** `FakeArxivClient.setPaper()`
  (`backend/src/testing/arxiv/fake-arxiv-client.ts`) already accepts an arbitrary `ArxivPaper`,
  `pdfBytes` included — a backend unit test exercises the large-file path by calling
  `setPaper()` with a paper whose `pdfBytes` is a `Buffer.alloc(...)` sized over
  `LARGE_PDF_WARNING_BYTES`, exactly the pattern `document-research-assistant.service.spec.ts`
  already uses for its `TEST_PAPER` fixture. No second canned fixture, and no change to
  `FakeArxivClient` itself, is needed.
- **In scope: update the demo's suggested example arXiv ID.** The arXiv-ID input's placeholder
  (`frontend/src/app/document-research-assistant/document-research-assistant.html`, currently
  `placeholder="e.g. 2301.00234"`) is updated to `placeholder="e.g. 2603.05621"` — the paper the
  user has actually been exercising this lab with, a short, few-page paper (i.e. the
  *non*-warning case; it doesn't exercise this task's own new code path). Bundled into this
  task rather than done as a standalone edit, per the user's explicit request.

## Dependencies

- depends on: [`document-research-assistant.md`](../features/document-research-assistant.md)
  (target doc, read in full) — "Backend" section (`RealArxivClient`, `createSession()`, document
  content-block attachment) and "Testing" section (existing spec coverage this task extends).
  Updated at graduation to describe the new `warning` field and the placeholder change.
- depends on: [`content-block-builder.md`](../shared/content-block-builder.md) (read in full) —
  `ContentBlockBuilderService.buildBlock()` takes already-fetched `bytes`/`mediaType`/`mode` and
  has no size awareness of its own; this task's size check happens entirely in
  `DocumentResearchAssistantService.createSession()`, before that service is ever called, not
  inside the shared builder.
- depends on: [`architecture.md`](../technical/architecture.md), "Unbounded external data
  sources" — the standing rule this task's warn-not-cap approach follows (the document/image
  content-block branch specifically), reworked during this task's own planning to state the
  shared "unbounded external source" premise once and branch on mitigation, rather than
  restating it in a second, separate section. Already applied — `build-work-item` doesn't need
  to touch `architecture.md` again.
- depends on: [`session-state.md`](../technical/session-state.md) — this task adds no new
  session-state reason; `pdfBytes` is already held server-side per its second bullet ("Re-sending
  a large attachment... would be wasteful"), and `warning` is derived from that already-stored
  buffer at `createSession()` time rather than stored separately.
- depends on: [`testing-strategy.md`](../technical/testing-strategy.md) — "Backend unit" and
  "Backend integration" bucket definitions, and "A DOM-shape change isn't fully covered by
  Frontend unit tests alone" (checked directly against `e2e/tests/document-research-
  assistant.spec.ts` below — no structural assertion there touches the "Paper" section's element
  count, so no Playwright spec change is needed).
- relates to (not a dependency):
  [`task-agent-playground-tool-result-caps.md`](task-agent-playground-tool-result-caps.md) —
  same class of problem (unbounded external source feeding conversation history), different
  mitigation shape (warn vs. cap) for a reason specific to this lab (PDF/citation integrity).

## Test scenarios

### Automated

Backend (`backend/src/document-research-assistant/document-research-assistant.service.spec.ts`,
backend unit bucket, `FakeArxivClient` bound via DI, no real network):

1. `createSession()` with the existing small `TEST_PAPER` fixture (`pdfBytes` well under
   `LARGE_PDF_WARNING_BYTES`) → `warning: null`, existing assertions on `sessionId`/`paper`
   unchanged.
2. `createSession()` with `FakeArxivClient.setPaper()` given a paper whose `pdfBytes` is
   `Buffer.alloc(LARGE_PDF_WARNING_BYTES + 1)` → `warning` is a non-null string mentioning the
   size in MB.
3. Boundary: `pdfBytes.length === LARGE_PDF_WARNING_BYTES` exactly → `warning: null` (the
   threshold is a "strictly greater than" cutoff, not "at or over").
4. The large-paper case doesn't otherwise change behavior: `sessionId` is still returned, `paper`
   metadata is unchanged, and a subsequent `ask()` against that session still attaches the
   document block and answers normally (extends an existing `ask()` test rather than adding a
   new one).

Backend integration (`backend/src/document-research-assistant/document-research-assistant.e2e-
spec.ts`, `nock`-intercepted, backend integration bucket):

5. The existing session-creation scenario's response body now also asserts `warning: null` — the
   canned `nock` PDF fixture is small, so this is the non-large path exercised end-to-end through
   the real HTTP pipeline. No new large-file integration scenario is added — the byte-threshold
   logic itself is fully covered at the unit level above; integration only needs to prove the new
   field survives the real request/response round trip.

Frontend (`frontend/src/app/document-research-assistant/document-research-assistant.spec.ts`,
frontend unit bucket):

6. A session response with `warning: null` → no warning banner element rendered in the "Paper"
   section.
7. A session response with `warning: '<message>'` → the message renders as a distinct banner
   (`role="alert"`, matching `sessionError`/`askError`'s existing pattern) in the "Paper" section.
8. The banner from scenario 7 stays visible after a subsequent `ask()` completes (`isAsking()`
   cycling true → false doesn't clear it) — proves it's session-persistent, not tied to any
   in-flight/loading state.

No `e2e/tests/document-research-assistant.spec.ts` change: confirmed its only session-start
assertions are `paper-summary` visibility and the question input becoming visible — no assertion
counts elements within the "Paper" section, and its fixture (`FakeArxivClient`'s small default
paper, `arxivId: 'fake.0001'`) never crosses the new threshold, so the existing spec's behavior
is unaffected either way, per `testing-strategy.md`'s DOM-shape-change callout.

### Manual

None required for verifying the code or the new banner's rendering logic — fully covered by the
automated scenarios above. Optional, user-run only: once built, the user may eyeball the
banner's actual visual styling in a real browser (e.g. via `browser-preview-check`) — not part of
this task's own definition of done.

## To-do list

- [ ] Add `LARGE_PDF_WARNING_BYTES = 10 * 1024 * 1024` constant to
      `document-research-assistant.service.ts`.
- [ ] Add a `warning: string | null` field to `CreateSessionResult`; compute it in
      `createSession()` from `pdfBytes.length` against the constant, per the message format in
      "Decisions" above.
- [ ] Update `document-research-assistant.service.spec.ts` per "Test scenarios" → "Automated"
      above: the small-fixture `warning: null` case, the large-`pdfBytes` `warning` case (via
      `FakeArxivClient.setPaper()`), the exact-boundary case, and the large-paper `ask()`
      regression check.
- [ ] Update `document-research-assistant.e2e-spec.ts`'s existing session-creation assertion to
      also check `warning: null`.
- [ ] Add a `warning: string | null` field to the frontend's `Paper`/`SessionResponse` type
      (`document-research-assistant.ts`) and render it as a persistent `role="alert"` banner in
      the "Paper" section of `document-research-assistant.html` whenever it's non-null.
- [ ] Update `document-research-assistant.spec.ts` (frontend unit) per "Test scenarios" above:
      no-banner case, banner-rendered case, banner persists across a completed `ask()`.
- [ ] Update the arXiv-ID input placeholder in `document-research-assistant.html` from
      `"e.g. 2301.00234"` to `"e.g. 2603.05621"`.
- [ ] Run backend unit/integration tests, frontend unit tests, lint (both projects), and build
      in-container and confirm all green (per `CLAUDE.md`'s required verification trio —
      `npm test` alone doesn't type-check, per `testing-strategy.md`).
- [ ] At graduation: update `document-research-assistant.md`'s "Backend" section to document the
      new `warning` field and its threshold, its "Frontend" section to mention the banner, and
      its "Testing" section to describe the new spec coverage.
