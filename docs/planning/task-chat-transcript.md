# Task — Chat Transcript

**Status:** 📝 Draft.

## Purpose

A shared frontend building block for the chat-style, multi-turn Q&A "Transcript" pattern, extracted from the two labs that each currently hand-roll their own version of it: [`messages-console.md`](../features/messages-console.md) and [`document-research-assistant.md`](../features/document-research-assistant.md). Right now the two implementations have drifted apart in three concrete ways:

1. **Layout.** `messages-console` already has the input dock pinned below the message list (the layout a chat is expected to have). `document-research-assistant`'s "Ask" section has its question input and controls placed *above* the "Transcript" list instead, which reads oddly next to the other lab.
2. **Loading state.** `document-research-assistant` shows a skeleton in place of the pending assistant turn between send and answer (per [`loading-states.md`](../technical/loading-states.md)). `messages-console` shows nothing at all in that gap — for a non-streaming turn there's no feedback until the response lands; for a streaming turn there's nothing until the first token arrives.
3. **Markdown rendering.** Assistant responses are markdown but both labs render them as literal text in the transcript bubble (`{{ message.text }}` / `{{ paragraph.text }}`). `document-research-assistant` already renders markdown-to-HTML elsewhere in the same component — its separate Notes panel uses `marked.parse(..., { async: false })` piped into `[innerHTML]` — just not for transcript answers.

## Likely scope

- A new shared component under `frontend/src/app/shared/` (exact name/boundary TBD in planning) providing the chat-shaped message-list-above/input-dock-below layout, a consistent pending-turn loading indicator, and markdown-to-HTML rendering of assistant bubbles.
- Retrofitting `messages-console` onto it — this is an already-`Done`, already-shipped feature; this task changes its existing markup/behavior rather than greenfield work.
- Retrofitting `document-research-assistant` onto it — this is now an already-`Done`, already-shipped feature too; this task changes its existing markup/behavior the same way it does for `messages-console` above.
- Reusing `marked` (already an installed frontend dependency, already used for `document-research-assistant`'s Notes panel) for the new markdown rendering, rather than introducing a second markdown library.

## Open questions

1. Exact component boundary: does the shared piece own just the message-bubble list + input dock, or more? `document-research-assistant`'s transcript turns also carry citation markers and sit above a separate Tool Activity section — likely those stay lab-specific and only the generic bubble-list/input-dock/loading/markdown parts move into the shared component, but this needs to be pinned down in planning.
2. Loading-state shape: reuse `document-research-assistant`'s existing per-turn skeleton bubble as the standard, or land on something lighter (e.g. a "thinking…" indicator) that works for both labs' scroll behavior?
3. Streaming interaction: `messages-console`'s streaming path currently shows nothing until the first delta arrives, and its in-progress assistant bubble is plain-text-appended token by token — does the shared component keep rendering that in-progress bubble as raw text and only convert to markdown once the turn completes, or re-parse markdown on every delta?
4. Confirm scope boundary: `live-tool-use-console` has a single one-shot "Answer" section (not a multi-turn transcript) and `structured-output-console` has a one-shot structured result panel — both presumed out of scope for this task, only `messages-console` and `document-research-assistant` actually have a transcript today.

## Likely dependencies

- [`loading-states.md`](../technical/loading-states.md) — the minimum-duration skeleton convention this task's loading-state work must follow (already `document-research-assistant`'s pattern for its per-turn skeleton).
- [`messages-console.md`](../features/messages-console.md) — `Done`; this task edits its already-shipped transcript markup and streaming/non-streaming send flow.
- [`document-research-assistant.md`](../features/document-research-assistant.md) — `Done`; this task edits its already-shipped transcript markup, same as `messages-console.md` above.
- `marked` — already an installed frontend dependency and already used (in `document-research-assistant`) for markdown-to-HTML rendering; this task reuses that same approach rather than adding a new one.
