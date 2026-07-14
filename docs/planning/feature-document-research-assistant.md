# Feature — Document Research Assistant

**Status:** 📝 Draft.

**Nav position:** after `feature-live-tool-use-console`.

## Claude API features

- **PDF support** — a PDF is a `document` content block (`media_type: "application/pdf"`); Claude processes each page as both extracted text and a rendered image, same setup as images; capped at 100 pages / 32MB.
- **Citations** — add `title` and `citations: {enabled: true}` to the document block; each claim in the response comes back with a citation object (`cited_text`, `document_index`, `document_title`, `start_page_number`, `end_page_number`) pointing to the exact source text.
- **Prompt caching + breakpoints** — mark a manual cache breakpoint on a block (system prompt, tools, messages, images, ...); processing always runs tools → system → messages, so a breakpoint caches everything before it too; minimum 1024 tokens to cache, up to 4 breakpoints per request, ~1-hour TTL; changing an earlier region (e.g. the document, if placed before the breakpoint) invalidates every region after it too, forcing a full-price reprocess.
- **Files API vs. base64 toggle** — upload once and reference a file ID vs. re-sending base64 inline; see the open question below on unconfirmed field shapes.
- **Text editor tool** — server tool `str_replace_based_edit_tool` (type `text_editor_20250728`), schema-less; commands `view` / `str_replace` / `create` / `insert`; the app does the real file I/O and must enforce `str_replace` uniqueness (return `is_error: true` with a clear message on 0 or 2+ matches) and prepend line numbers to file contents so `view_range`/`insert_line` targeting works.

## Main idea

Fetch a real paper from arXiv, ask multi-turn questions over it with citations enabled so every claim points back to exact source text, and cache the document so follow-up questions in the same session are fast/cheap. A text-editor-tool side panel lets Claude keep structured running notes on the document as the conversation progresses.

## Dataset & env vars

- **arXiv API** — no auth required. Provides paper metadata plus PDF download.
- No feature-specific env vars beyond the global `ANTHROPIC_API_KEY`.

## Build order & dependencies

After Foundations Console's shell, the GitHub data provider, Live Tool-Use Console, and Workflow Gallery (see `status.md` for current position).

- Requires Foundations Console's shell (inspector panel, config/model layer).
- Reuses the **caching layer** ([`task-caching-layer.md`](task-caching-layer.md)), shared with Workflow Gallery.
- Requires the **content-block builder** ([`task-content-block-builder.md`](task-content-block-builder.md), built right before this feature) to already exist — this is its first real consumer. Data & Code Sandbox and Vision Lab depend on it too and are built after this feature.

## Shared functionality used

- Caching layer ([`task-caching-layer.md`](task-caching-layer.md)).
- Content-block builder ([`task-content-block-builder.md`](task-content-block-builder.md)) — first real consumer here; later reused by Data & Code Sandbox in Files-API-only mode, and by Vision Lab.

## Files API / base64

Both mechanisms are technically valid for attaching the PDF, so this feature exposes a **"delivery mode" toggle**: flipping it re-runs the same request through the shared content-block builder, and the inspector panel shows the resulting content block shape side by side (Files API `file_id` reference vs. inline base64).

## Open questions

None specific to this feature. The Files API field-shape question is tracked in [`task-content-block-builder.md`](task-content-block-builder.md) instead, since that's where the content-block builder's interface is actually decided.
