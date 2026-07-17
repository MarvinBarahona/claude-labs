# Task — Content-Block Builder

**Status:** 📋 Planned.

## Purpose

The Files-API-vs-base64 service: given fetched bytes and a mode flag, it either uploads via the Files API and returns a file-reference content block, or base64-encodes inline — same interface either way. This is what lets Document Research Assistant and Vision Lab expose a "delivery mode" toggle. Data & Code Sandbox depends on the `AnthropicClient.uploadFile()` method this task adds (see "Depends on" below), but not on `ContentBlockBuilderService.buildBlock()` itself — the code-execution tool's own input-file content block (`container_upload`, referencing a `file_id`) isn't a `document`/`image` block at all, so it falls outside what this service builds; see [`feature-data-code-sandbox.md`](feature-data-code-sandbox.md)'s own plan for how it assembles that block directly.

This piece is pulled out as its own standalone task rather than being built inside Document Research Assistant (an earlier draft of the plan had that feature "introduce" it) — its interface is generic to any feature that attaches a document or image, not specific to Document Research Assistant's document-Q&A UI. It's a direct example of drafting a task for common functionality the moment a feature reveals the need for it, rather than building it inline as one-off feature code.

## Interface

`backend/src/shared/content-block-builder/`:

- **`content-block-builder.types.ts`** — `ContentBlockDeliveryMode = 'files-api' | 'base64'`; `ContentBlock` (the union of the two shapes below).
- **`ContentBlockBuilderService.buildBlock(bytes: Buffer, mediaType: string, mode: ContentBlockDeliveryMode): Promise<ContentBlock>`**:
  - The block's own `type` (`'document'` vs `'image'`) is derived from `mediaType`: `'application/pdf'` → `'document'`, any `'image/*'` → `'image'`. This mapping is the one place that decision is made — a consumer never picks `type` itself, only supplies bytes/media type/mode.
  - **`files-api` mode** — calls `AnthropicClient.uploadFile(bytes, mediaType)` (new method, see "Depends on" below) and returns `{ type, source: { type: 'file', file_id: uploadResult.id } }`.
  - **`base64` mode** — no upload call. Returns `{ type, source: { type: 'base64', media_type: mediaType, data: bytes.toString('base64') } }`.
- **`ContentBlockBuilderModule`** (`content-block-builder.module.ts`) — imports `AnthropicClientModule`, `providers: [ContentBlockBuilderService], exports: [ContentBlockBuilderService]`.

`AnthropicClient.uploadFile()`'s real implementation calls `client.beta.files.upload({ file: Readable.from(bytes), betas: ['files-api-2025-04-14'] })` (confirmed against the installed `@anthropic-ai/sdk` `^0.111.0`'s `client.beta.files` resource), returning `{ id: uploadResult.id }`.

## Depends on

- [`anthropic-client.md`](../shared/anthropic-client.md) — this task extends its `AnthropicClient` abstract-class DI token with a new method, `uploadFile(bytes: Buffer, mediaType: string): Promise<{ id: string }>`, following the same pattern as its existing `createMessage()`/`streamMessage()`: `RealAnthropicClient` calls the SDK's Files API beta surface with the `files-api-2025-04-14` beta flag and catches/rethrows any SDK error as `ExternalApiError('anthropic', ...)` per [`api-error-handling.md`](../shared/api-error-handling.md); `FakeAnthropicClient` (see [`test-doubles.md`](../shared/test-doubles.md)) gets a matching `uploadFile()` that follows its existing queue-or-throw idiom (throws when nothing's queued, `allowUnqueuedFallback` returns a canned `{ id: 'file_fake_...' }` instead) — the same idiom its other two methods already use, not `FakeGithubClient`'s separate always-a-static-default idiom, since this is extending the Anthropic fake's own established interface, not adding a new data-source fake. This task's own to-do list includes updating `anthropic-client.md` and `test-doubles.md` in place to document the new method once built, per `writing-docs`'s convention for a permanent doc that gains a capability.
- [`api-error-handling.md`](../shared/api-error-handling.md) — `ExternalApiError('anthropic', ...)` is the error shape `RealAnthropicClient.uploadFile()` must throw on failure, same as its existing two methods.

## Consumers

- [`feature-document-research-assistant.md`](feature-document-research-assistant.md) — first real consumer; exposes the "delivery mode" toggle in the UI, with the inspector panel showing the resulting content block shape side by side for both modes.
- [`feature-vision-lab.md`](feature-vision-lab.md) — reuses the same "delivery mode" toggle UI/backend pattern as Document Research Assistant, for images.

`feature-data-code-sandbox.md` consumes only `AnthropicClient.uploadFile()` (this task's other deliverable), not `ContentBlockBuilderService.buildBlock()` — see "Purpose" above.

## Potential other uses

Any later feature attaching a document or image reuses this instead of hand-rolling upload/base64 logic — the interface is already content-type-agnostic (PDFs for Document Research Assistant, images for Vision Lab).

## Build order & dependencies

Right before Document Research Assistant (see `status.md` for current position). Nothing built before it depends on it.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Backend unit"/"Backend integration" buckets:

- [ ] **Unit** — `buildBlock` in `files-api` mode calls `AnthropicClient.uploadFile()` and returns `{ type: 'document', source: { type: 'file', file_id } }` for `application/pdf`, and `{ type: 'image', source: { type: 'file', file_id } }` for an `image/*` media type.
- [ ] **Unit** — `buildBlock` in `base64` mode returns the inline base64 block for both media types above, with no `uploadFile()` call made.
- [ ] **Unit** — the same source bytes through both modes produce two blocks whose `type` matches (only `source` differs) — this is the pair the inspector panel shows side by side.
- [ ] **Unit** — `FakeAnthropicClient.uploadFile()` throws when nothing's queued, and returns the queued/canned `{ id }` otherwise, mirroring `createMessage()`/`streamMessage()`'s existing tests.
- [ ] **Integration** — a `nock` fixture for the Files API upload endpoint proves `RealAnthropicClient.uploadFile()` sends the `files-api-2025-04-14` beta flag and the real request body, and maps a 4xx/5xx response to `ExternalApiError('anthropic', ...)`.

### Manual

None — this module has no UI of its own. A real Files API round trip (upload, then a Messages API call referencing the returned `file_id`) is verified manually once a consuming feature is run against a real key — that's [`feature-document-research-assistant.md`](feature-document-research-assistant.md)'s own manual test scenario, not this task's.

## To-do list

- [ ] Extend `AnthropicClient`, `RealAnthropicClient`, and `FakeAnthropicClient` with `uploadFile()`, per "Depends on" above.
- [ ] Update `anthropic-client.md` and `test-doubles.md` in place to document the new method.
- [ ] Add a `nock` fixture for the Files API upload endpoint to `backend/src/testing/http-fixtures/anthropic.fixtures.ts`.
- [ ] Implement the media-type → block-`type` mapping (`application/pdf` → `document`, `image/*` → `image`).
- [ ] Implement `ContentBlockBuilderService.buildBlock()` for both modes.
- [ ] Wire up `ContentBlockBuilderModule`.

## Open questions

None.
