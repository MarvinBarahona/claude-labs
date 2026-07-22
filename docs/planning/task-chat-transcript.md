# Task — Chat Transcript

**Status:** 🔵 In progress.

## Purpose

A shared frontend building block for the chat-style, multi-turn Q&A "Transcript" pattern, extracted from the two labs that each currently hand-roll their own version of it: [`messages-console.md`](../features/messages-console.md) and [`document-research-assistant.md`](../features/document-research-assistant.md). Rereading both components' current code during planning confirms the three drifts the draft identified:

1. **Layout.** `messages-console` already has the input dock pinned below the message list. `document-research-assistant`'s "Ask" section has its input/controls above the "Transcript" list instead.
2. **Loading state.** `document-research-assistant` shows a skeleton bubble (`data-testid="answer-skeleton"`) in place of a pending turn's answer; `messages-console` shows nothing at all in that gap, for either a streaming or non-streaming turn — no placeholder turn is even pushed ahead of the request today.
3. **Markdown rendering.** Assistant text renders as literal text in both labs' transcript bubbles (`{{ message.text }}` / `{{ paragraph.text }}`), even though `document-research-assistant` already renders markdown elsewhere in the same component (its Notes panel, via an inline `marked.parse(notes, { async: false })` call feeding `[innerHTML]`).

## Interface

`frontend/src/app/shared/chat-transcript/` (`ChatTranscript`, selector `app-chat-transcript`):

- **Turn model** — exported `ChatTranscriptTurn = { question: string; answerMarkdown: string | null }` (`answerMarkdown: null` means this turn's answer hasn't landed yet). At most one turn has `answerMarkdown === null` at a time — the most recently sent one — matching both labs' existing send-flow invariant (a new turn is only ever appended right before/at the moment its request fires).
- **Inputs:** `turns: readonly ChatTranscriptTurn[]`; `pendingAnswerMarkdown: string | null` (the in-progress streamed text for whichever turn currently has `answerMarkdown === null`, if any); `disabled: boolean` (Send button and input disabled while a turn is in flight); `placeholder: string`; `ariaLabel: string` (each lab supplies its own copy — "Say something…"/"Message" vs. "Ask about this paper…"/"Question"). A per-turn custom body slot lets a consumer render more than plain markdown inside the assistant bubble (Document Research Assistant's citation markers) — exact Angular mechanism (a template-reference input, content projection, or an equivalent idiom) is `angular-conventions`' call at build time, not fixed here; either way the slot receives the turn's raw `answerMarkdown`/paragraph text, not pre-rendered HTML, so a consumer needing per-paragraph rendering (see Consumers below) calls the shared `renderMarkdown()` itself per paragraph.
- **Output:** emits the trimmed draft text when the user presses Enter or clicks Send; the component owns its own draft-text input state internally, clearing it on emit (mirrors both labs' current `draftMessage`/`draftQuestion` handling).
- **Rendering:** an `<ol data-testid="transcript-list">` of turns (one `<li>` per turn, preserving that existing testid's convention), each a right-aligned user bubble + left-aligned assistant bubble. The assistant bubble shows, in priority order: the custom body slot's content if a consumer supplied one; else `renderMarkdown(answerMarkdown)` via `[innerHTML]` when `answerMarkdown` isn't null; else `renderMarkdown(pendingAnswerMarkdown)` when that's non-empty for the one pending turn; else the skeleton-bubble placeholder (two `app-skeleton` bars, `data-testid="answer-skeleton"`), ported verbatim from `document-research-assistant`'s current markup. The input dock (text input + Send button, Enter-to-send, disabled/empty-trim-to-disable) sits below the list.

`frontend/src/app/shared/markdown/render-markdown.ts` — exports `renderMarkdown(text: string): string`, wrapping `marked.parse(text, { async: false })` — the exact call `document-research-assistant`'s `notesHtml` computed already makes inline. One shared home for a concern two call sites duplicate once this task lands (the new component's own default rendering, and that Notes panel), per [`repo-layout.md`](../technical/repo-layout.md)'s "Shared functionality" rule.

## Consumers (migration, not new functionality)

- [`messages-console.md`](../features/messages-console.md), "Frontend" — retrofit its transcript/input-dock markup onto `<app-chat-transcript>`. Requires: pushing a `{ question, answerMarkdown: null }` turn immediately in `sendTranscriptMessage()` (mirroring `document-research-assistant`'s existing `askQuestion()` pattern) instead of only appending the assistant reply once it lands, so the pending-skeleton state (item #2) actually has a turn to attach to; adding the `loading-states.md` minimum-duration floor timer (see Dependencies) to both its non-streaming and streaming send paths, since this is the first time this lab has asynchronous loading content worth protecting from a fake-mode flash; no custom body slot needed (plain markdown rendering, item #3, is enough — this lab has no citations). Its transcript DOM shape changes from one `<li>` per flat message to one `<li>` per question/answer turn, so `messages-console.spec.ts` needs rewriting where it asserts against the old per-message shape, not just re-running unchanged.
- [`document-research-assistant.md`](../features/document-research-assistant.md), "Frontend" — retrofit its transcript/input-dock markup onto `<app-chat-transcript>`, supplying a custom body slot that renders its existing paragraphs + citation-marker markup, each paragraph's text now run through the shared `renderMarkdown()` (item #3) instead of literal `{{ paragraph.text }}`. Its input dock is already below the transcript today (item #1 already matches the target shape for this lab) and its skeleton bubble is the one being ported into the shared component verbatim (item #2 already matches too), so this lab's own migration is narrower than Messages Console's. Its Notes panel's `notesHtml` computed switches from its own inline `marked.parse(...)` call to the shared `renderMarkdown()`. `document-research-assistant.spec.ts`'s existing scenarios should need confirmation against the migrated markup, not a rewrite, since its DOM was already turn-based/skeleton-based going in.
- Live Tool-Use Console / Structured Output Console — untouched. Neither has a multi-turn transcript today (a single one-shot Answer / result panel respectively), confirming the draft's own scope-boundary question.

## Dependencies

- [`loading-states.md`](../technical/loading-states.md) — both documented rules apply: the skeleton-in-place-of-disappearing-content rule governs the shared component's own skeleton-bubble fallback; the 500ms-minimum-duration rule governs Messages Console's newly-added floor timer, ported from Document Research Assistant's existing `MIN_ASKING_MS`/`waitOutMinAskingDuration` pattern in `document-research-assistant.ts`.
- [`repo-layout.md`](../technical/repo-layout.md), "Shared functionality" — governs the component-boundary call: citations and Tool Activity stay lab-specific (only one lab needs each), while the bubble-list/input-dock/skeleton/markdown shape promotes to `frontend/src/app/shared/` now that a second lab needs exactly that.
- [`messages-console.md`](../features/messages-console.md), "Frontend" — `Done`; this task rewrites its transcript markup/send-flow per "Consumers" above.
- [`document-research-assistant.md`](../features/document-research-assistant.md), "Frontend" — `Done`; this task rewrites its transcript markup and its Notes panel's markdown call per "Consumers" above.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Frontend unit" bucket (Angular `TestBed`, no real backend):

- [ ] `ChatTranscript` renders one `<li>` per turn, user bubble right-aligned, assistant bubble left-aligned.
- [ ] `ChatTranscript` renders `renderMarkdown(answerMarkdown)` for a turn whose `answerMarkdown` isn't null (a `**bold**` input produces a `<strong>` in the rendered bubble).
- [ ] `ChatTranscript` renders `pendingAnswerMarkdown` (markdown-rendered) for the one turn whose `answerMarkdown` is null, when `pendingAnswerMarkdown` is non-empty.
- [ ] `ChatTranscript` renders the skeleton placeholder (`data-testid="answer-skeleton"`) for a turn whose `answerMarkdown` is null and `pendingAnswerMarkdown` is empty/absent.
- [ ] `ChatTranscript` renders a consumer-supplied custom body slot instead of its own default rendering, when one is provided.
- [ ] `ChatTranscript`'s Send is disabled when the draft is empty/whitespace-only or `disabled` is true; Enter and Send both emit the trimmed text and clear the draft.
- [ ] `renderMarkdown()` returns a plain string (not a Promise) — proves the `{ async: false }` option is passed.
- [ ] `messages-console.spec.ts` — updated for the turn-based DOM shape: sends a message, sees it right-aligned and the reply left-aligned once received (existing scenario, new DOM shape); shows the pending-turn skeleton between send and response landing, for both a non-streaming and a streaming turn (new scenario, closing item #2's gap); streams the assistant reply incrementally and renders it as markdown once complete (existing scenario, extended); the minimum-duration floor holds the skeleton for at least `MIN_*_MS` even when the response resolves sooner (new scenario, per `loading-states.md`); existing model-picker, inspector-panel, and error-state scenarios continue passing.
- [ ] `document-research-assistant.spec.ts` — existing scenarios (citation markers, tool activity, notes panel, skeletons, delivery-mode toggle, error states) continue passing against the migrated markup; each paragraph's answer text is confirmed markdown-rendered (a `**bold**` paragraph produces a `<strong>`), closing item #3's gap for this lab; the Notes panel is confirmed to still render via the shared `renderMarkdown()`, not a lab-local `marked.parse` call.

### Manual

1. Run the dev stack in fake mode (`docker compose -f docker-compose.dev.yml up`), open Messages Console, send a non-streaming message: confirm a pending-turn skeleton shows briefly (not nothing) before the reply renders, and that the reply renders markdown (bold/lists) rather than literal `**`/`-` characters.
2. In Messages Console, toggle Streaming on and send another message: confirm the assistant bubble accumulates text live and renders as markdown, with no jarring flash/reflow once the turn completes.
3. Open Document Research Assistant, start a session, and ask a question: confirm the input dock sits below the transcript, the answer paragraph renders as markdown, and citation markers/detail popovers still work exactly as before.
4. In Document Research Assistant, ask a follow-up question and confirm the Notes panel still renders correctly after its switch to the shared `renderMarkdown()`.

## To-do list

- [x] Implement `frontend/src/app/shared/markdown/render-markdown.ts` (`renderMarkdown()`).
- [x] Implement `frontend/src/app/shared/chat-transcript/` (`ChatTranscript` component + template) per "Interface" above.
- [x] Write `chat-transcript.spec.ts` per "Test scenarios" → "Automated" above.
- [x] Retrofit Messages Console onto `<app-chat-transcript>` per "Consumers" above, including the new pending-turn skeleton and minimum-duration floor timer.
- [x] Retrofit Document Research Assistant onto `<app-chat-transcript>` per "Consumers" above, including its custom citation body slot and its Notes panel's switch to the shared `renderMarkdown()`.
- [x] Update `messages-console.spec.ts` for the new turn-based DOM shape and new scenarios, per "Test scenarios" → "Automated" above.
- [x] Update `document-research-assistant.spec.ts` to confirm markdown-rendering of answer paragraphs and the Notes panel's shared-renderer source, per "Test scenarios" → "Automated" above.

## Development notes

- **Plan gap, fixed during build (coding-convention/process observation):** the plan's "Automated" test scenarios only cited the "Frontend unit" bucket, but `e2e/tests/messages-console.spec.ts` (Playwright, "Frontend browser E2E" bucket) hard-coded the pre-retrofit per-message `<li>` count (2 after one send, 4 after two), which the turn-based DOM shape breaks. Fixed it to assert per-turn counts (1, then 2) and to locate the two bubble `div`s inside each turn's own `<li>` instead of treating each `<li>` as a single bubble. `e2e/tests/document-research-assistant.spec.ts` needed no change — its DOM was already turn-based. Future plans touching a lab's transcript DOM shape should explicitly check `e2e/tests/` for hard-coded structural assertions, not just the two frontend-unit spec files.
- No other implementation deviated from the plan — the `ChatTranscript` interface, the `renderMarkdown()` extraction, and both labs' retrofits match the plan's "Interface"/"Consumers" sections as written. The per-turn custom body slot ended up using an `NgTemplateOutlet` context of `{ $implicit: turn, index: $index }` (an `index` alongside the turn itself) so Document Research Assistant's own template can look up its richer paragraph/citation data by array index rather than the shared component needing to know about citations at all — the plan deferred this exact mechanism to build time, and this is the concrete shape it took.
- Added a `sendLabel` input (default `'Send'`) to `ChatTranscript`, not named in the plan's own Input list — needed so Document Research Assistant could keep its existing `'Ask'` button label/testid unchanged, matching the plan's own claim that this lab's spec needs no rewrite.

## Open questions

None — all four of the draft's open questions are resolved above: the shared component owns only the generic bubble-list/input-dock/skeleton/markdown shape (citations and Tool Activity stay lab-specific, per `repo-layout.md`'s single-consumer rule); the loading-state shape reuses Document Research Assistant's existing skeleton-bubble pattern verbatim; the streaming path always renders the accumulated text through the same markdown renderer, both mid-stream and at completion, rather than switching representations at turn-complete; and the scope boundary is confirmed — Live Tool-Use Console and Structured Output Console are untouched.
