# Task — Content-Block Builder

**Status:** 📝 Draft.

## Purpose

The Files-API-vs-base64 service: given fetched bytes and a mode flag, it either uploads via the Files API and returns a file-reference content block, or base64-encodes inline — same interface either way. This is what lets Document Research Assistant and Vision Lab expose a "delivery mode" toggle, and what Data & Code Sandbox uses in Files-API-only mode (its sandbox has no network access, so there's no base64 path to toggle to).

This piece is pulled out as its own standalone task rather than being built inside Document Research Assistant (an earlier draft of the plan had that feature "introduce" it) — its interface is generic to any feature that attaches a document or image, not specific to Document Research Assistant's document-Q&A UI. It's a direct example of drafting a task for common functionality the moment a feature reveals the need for it, rather than building it inline as one-off feature code.

## Interface

A shared backend service: given fetched bytes, a media type, and a mode flag (`files-api` | `base64`), returns a ready-to-use message content block — either a file-reference block (after uploading via the Files API) or an inline base64 block. Same call shape either way, so a consumer just flips the mode flag and re-sends.

Confirmed field shapes:

- **`files-api` mode** — requires the beta header `files-api-2025-04-14` on both the upload call and the Messages API call that references the result. Upload returns a file object whose `id` is the file reference; the message content block is `{"type": "document" | "image", "source": {"type": "file", "file_id": "<id>"}}` — the block's own `type` (`document` vs `image`) is picked from the media type the service was given, not from the file's contents.
- **`base64` mode** — no beta header. The message content block is `{"type": "document" | "image", "source": {"type": "base64", "media_type": "<media type>", "data": "<base64 string>"}}`.

## Consumers

- [`feature-document-research-assistant.md`](feature-document-research-assistant.md) — first real consumer; exposes the "delivery mode" toggle in the UI, with the inspector panel showing the resulting content block shape side by side for both modes.
- [`feature-data-code-sandbox.md`](feature-data-code-sandbox.md) — Files-API-only mode (mandatory, no base64 path — the code-execution sandbox has no network access).
- [`feature-vision-lab.md`](feature-vision-lab.md) — reuses the same "delivery mode" toggle UI/backend pattern as Document Research Assistant, for images.

## Potential other uses

Any later feature attaching a document or image reuses this instead of hand-rolling upload/base64 logic — the interface is already content-type-agnostic (PDFs for Document Research Assistant, images for Vision Lab).

## Build order & dependencies

Right before Document Research Assistant (see `status.md` for current position). Nothing built before it depends on it.

## Test scenarios

- [ ] Given fetched bytes and `mode: "files-api"`, the service uploads via the Files API and returns a valid file-reference content block.
- [ ] Given fetched bytes and `mode: "base64"`, the service returns a valid inline base64 content block, no upload call made.
- [ ] Flipping the mode for the same source bytes produces two content blocks the inspector panel can show side by side.
- [ ] A PDF (Document Research Assistant's use case) and an image (Vision Lab's use case) both work through the same interface without content-type-specific branches leaking into consumers.

## To-do list

- [ ] Implement the Files API upload path (upload bytes via the beta Files endpoint, get back a file reference).
- [ ] Implement the inline base64 path.
- [ ] Unify both behind one service call keyed by a mode flag.

## Open questions

None.
