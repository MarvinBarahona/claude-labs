Claude can read a PDF directly — no OCR step, no text extraction on your
end. Attach it as a `document` content block and Claude sees each page as
both extracted text and a rendered image, so it can answer questions about
figures and layout, not just body text. This lab fetches a real paper from
arXiv, attaches its PDF, and lets you ask multi-turn questions about it
with every claim traceable back to the exact source text.

## Attaching the PDF

The first question in a session sends the document alongside it, in the
same user message:

```json
{
  "role": "user",
  "content": [
    {
      "type": "document",
      "source": { "type": "base64", "media_type": "application/pdf", "data": "<base64 PDF bytes>" },
      "title": "<the paper's title>",
      "citations": { "enabled": true }
    },
    { "type": "text", "text": "<your question>" }
  ]
}
```

`citations: { enabled: true }` is what turns citations on for this
document — without it, Claude can still read the PDF, but won't return the
source-location data described below. `title` is optional but shows up in
each citation's own `document_title` field, which is otherwise just
whichever string you set here.

## Citations in the response

With citations enabled, a text block in the response carries its own
`citations` array alongside the answer text — one entry per span of text
that's directly supported by something in the document:

```json
{
  "type": "text",
  "text": "The paper's key contribution is a new caching strategy.",
  "citations": [
    {
      "type": "page_location",
      "cited_text": "we introduce a novel caching strategy that reduces...",
      "document_title": "<the paper's title>",
      "start_page_number": 3,
      "end_page_number": 4
    }
  ]
}
```

A PDF always cites by `page_location` (a plain-text document would cite by
character offset instead) — `start_page_number`/`end_page_number` name
the 1-indexed page range the `cited_text` came from. This lab flattens
every citation across the whole response into the answer's numbered `[1]`,
`[2]`… markers below; click one to see its `cited_text` and page range.

## Prompt caching across turns

Sending the same PDF's bytes on every follow-up question would be wasteful
— the document doesn't change between turns, only the question does. This
lab marks a cache breakpoint on the first message (the one carrying the
document), so a same-session follow-up question reads that prefix back
from the cache instead of reprocessing it: cheaper and faster, visible in
the inspector panel's `cache_read_input_tokens`. The **delivery mode**
toggle below deliberately demonstrates the flip side of this: switching
between Files API and Base64 changes that first message's bytes, so the
very next call misses the cache and pays full price again, a live example
of why an earlier region in a cached prefix has to stay byte-identical to
keep benefiting from the cache.

## Files API vs. Base64

The same PDF bytes can be attached two ways. Base64 (above) inlines the
whole file in every request that resends it. The **Files API** uploads the
bytes once and references them by ID instead:

```json
{ "type": "document", "source": { "type": "file", "file_id": "file_abc123" }, "citations": { "enabled": true } }
```

This lab uploads once per session and reuses the same `file_id` for every
later question asked in Files API mode — worth it once a document is large
or reused across many calls, since the bytes themselves only cross the
wire once. The Files API is still in beta: referencing a `file_id` in a
message requires the `files-api-2025-04-14` beta header on that Messages
call too, not just on the earlier upload call — easy to miss, since the
upload alone succeeds either way.

## The text-editor tool

Alongside each question, this lab offers Claude a text-editor tool
(`str_replace_based_edit_tool`) pointed at a single scratch file,
`/notes.md`, that your own backend actually implements: `view` (read the
file, with line numbers), `create` (write/overwrite it), `str_replace`
(replace one exact, unique occurrence of some text), and `insert` (add a
line at a given position). A short system prompt tells Claude the file
exists and when to use it — see the Gotchas below for why that's not
optional here. Ask something like "note the paper's key contribution" and
the notes panel below updates after the turn that touches the file. Unlike
a lookup tool, there's no external API behind this one: your code is the
entire implementation, which is exactly the pattern for a tool that needs
to manage real state (a file, a document, a workspace) rather than fetch
data.

## Gotchas

The text-editor tool has no `description` field at all — unlike a custom
tool, whose schema explains its own purpose directly to Claude, this
tool's behavior is documented for *you*, the developer, not conveyed in
the request. Offer it with no system prompt and Claude has no way to know
`/notes.md` exists, what it's for, or that it's expected to use it —
asking it to "note" something will silently do nothing, no error, no tool
call. This lab's system prompt is what actually makes the notes panel
work; it's not optional the way it might be for a self-describing custom
tool.

`str_replace` requires the text you're replacing to appear *exactly once*
in the file — zero matches or several both come back as a tool error
(`is_error: true`) with a message describing which, rather than silently
guessing. That's deliberate: a silent multi-match replace could edit the
wrong occurrence. Watch the notes panel for a case where Claude's first
attempt at an edit fails this way and it retries with more surrounding
context to make the match unique.

A citation object from a response is not safe to resend verbatim as
conversation history on a later call — the API rejects it once the
`citations` array is echoed back. This lab keeps a growing multi-turn
conversation server-side, and strips citations back out of a turn's own
text before storing it as history for the next question: the cited *text*
carries forward so Claude still remembers what it said, but the citation
metadata itself doesn't. Worth knowing if you're building your own
multi-turn citations app: keep citations for display, not for replay.

If you reconstruct a streamed response by hand (rather than using an SDK
helper that does it for you), several fields arrive incrementally on
`content_block_delta` and each needs its own accumulation, separate from
plain text: a `thinking` block's `thinking`/`signature` fields via
`thinking_delta`/`signature_delta`, and — with citations enabled, as in
this lab — a text block's `citations` array via one `citations_delta`
event per citation, appended rather than overwritten. Miss any of these,
and the reconstructed block looks present but is missing that field —
for `thinking`, harmless until you resend it as history, at which point
the API rejects it (a thinking block must actually contain thinking); for
citations, it just means a streamed turn silently comes back with no
citations at all, same shape as a turn that never had any.
