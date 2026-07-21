# Content-Block Builder

The Files-API-vs-base64 service: given fetched bytes and a mode flag, it either uploads via the Files API and returns a file-reference content block, or base64-encodes inline — same interface either way. This is what lets a lab attaching a document or image expose a "delivery mode" toggle without hand-rolling upload/base64 logic itself; the interface is content-type-agnostic (PDFs, images).

## Interface

`backend/src/shared/content-block-builder/`:

- **`content-block-builder.types.ts`** — `ContentBlockDeliveryMode = 'files-api' | 'base64'`; `ContentBlock`, the union of `{ type: 'document' | 'image'; source: { type: 'file'; file_id: string } }` and `{ type: 'document' | 'image'; source: { type: 'base64'; media_type: string; data: string } }`.
- **`ContentBlockBuilderService.buildBlock(bytes: Buffer, mediaType: string, mode: ContentBlockDeliveryMode): Promise<ContentBlock>`**:
  - The block's own `type` is derived from `mediaType`: `'application/pdf'` → `'document'`, any other media type (e.g. `image/*`) → `'image'`. This mapping is the one place that decision is made — a consumer never picks `type` itself, only supplies bytes/media type/mode.
  - **`files-api` mode** — calls `AnthropicClient.uploadFile(bytes, mediaType)` (see [`anthropic-client.md`](anthropic-client.md)) and returns `{ type, source: { type: 'file', file_id: uploadResult.id } }`.
  - **`base64` mode** — no upload call. Returns `{ type, source: { type: 'base64', media_type: mediaType, data: bytes.toString('base64') } }`.
- **`ContentBlockBuilderModule`** (`content-block-builder.module.ts`) — imports `AnthropicClientModule`, `providers: [ContentBlockBuilderService], exports: [ContentBlockBuilderService]`.

This task also added `AnthropicClient.uploadFile(bytes: Buffer, mediaType: string): Promise<{ id: string }>` itself — see [`anthropic-client.md`](anthropic-client.md) for that method's own real/fake implementation. A consumer that only needs a raw Files API upload (not a `document`/`image` content block) can inject `AnthropicClient` directly and call `uploadFile()` without going through this service at all.

## Using it

Import `ContentBlockBuilderModule` into a feature module and inject `ContentBlockBuilderService`. Call `buildBlock(bytes, mediaType, mode)` with the fetched file bytes, its media type, and whichever delivery mode the caller (typically a user-facing toggle) selected, then splice the returned `ContentBlock` into a Messages API request's content array.

## Testing

- `backend/src/shared/content-block-builder/content-block-builder.service.spec.ts` — `buildBlock` in `files-api` mode calls `AnthropicClient.uploadFile()` and returns the file-reference block for both `application/pdf` and an `image/*` media type; `base64` mode returns the inline block for both, with no `uploadFile()` call made; the same source bytes through both modes produce two blocks whose `type` matches (only `source` differs).
- `backend/src/testing/anthropic/fake-anthropic-client.spec.ts` — `FakeAnthropicClient.uploadFile()` throws when nothing's queued, and returns the queued/canned `{ id }` otherwise, mirroring `createMessage()`/`streamMessage()`'s existing tests.
- `backend/src/shared/anthropic-client/real-anthropic-client.spec.ts` — a `nock` fixture (`mockAnthropicFilesUpload`/`mockAnthropicFilesUploadAuthError`, see [`test-doubles.md`](test-doubles.md)) proves `RealAnthropicClient.uploadFile()` sends the `files-api-2025-04-14` beta flag and maps a 4xx/5xx response to `ExternalApiError('anthropic', ...)`.

A real Files API round trip (upload, then a Messages API call referencing the returned `file_id`) is only verified manually once a consuming feature is run against a real key — this module has no UI of its own.
