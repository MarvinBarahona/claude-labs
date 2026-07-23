# Vision Lab

Fetches real, freely-licensed images from Wikimedia Commons for a text search query, attaches however many the user asks for (1–4) to a single Claude call, and lets Claude compare/count/describe across them. Also demonstrates the Messages API's per-image dimension cap: a single image can be up to 8000×8000px, but that cap drops to 2000×2000px the moment a second image is attached to the same request — the backend computes and surfaces whether that cap actually applied to the fetched images, rather than inferring it from Claude's response (which doesn't expose it).

## Backend

`backend/src/vision-lab/`:

- **`POST /api/vision-lab/run`** — `{ query: string; imageCount: 1 | 2 | 3 | 4; instruction: string; deliveryMode: 'files-api' | 'base64'; stream: boolean }` (`query` and `instruction` non-empty, else `400`).
  - `imageCount` images are fetched via `WikimediaClient.searchImages()`. A Wikimedia fetch failure, or fewer than `imageCount` results found for `query`, → `ExternalApiError('wikimedia', ...)` → `502` (a shortfall errors rather than silently running with fewer images, since `imageCount` exists specifically to let the user deliberately trigger, or not trigger, the dimension cap).
  - Each fetched image is turned into an `image` content block via `ContentBlockBuilderService.buildBlock()` in the requested `deliveryMode`, alongside a `text` block carrying `instruction`, all in one user message.
  - `dimensionCapApplied` is computed from the fetched images' own reported `widthPx`/`heightPx`: `true` only when `imageCount > 1` **and** at least one fetched image's `widthPx` or `heightPx` exceeds 2000px. A single-image request (`imageCount === 1`) is never capped regardless of size.
  - `stream: false` → `200`:
    ```ts
    TurnEnvelope & {
      images: { url: string; title: string; widthPx: number; heightPx: number }[];  // the images actually used, for thumbnail rendering
      answer: string;
      dimensionCapApplied: boolean;
    }
    ```
  - `stream: true` → `200`, `Content-Type: text/event-stream`, same route, reusing Messages Console's exact convention: raw Claude stream events forwarded verbatim, response reconstructed from `content_block_delta` events, a terminal `event: turn_complete\ndata: <same JSON body as the non-streaming success>\n\n`. A mid-stream failure → `event: error\ndata: <ShapedError body JSON>\n\n`, no `turn_complete` after it.

Both delivery modes are exposed as a toggle in the demo, same UI/backend pattern as Document Research Assistant — flipping it re-runs the same request through `ContentBlockBuilderService`, and the inspector panel shows the resulting content block shape (Files API `file_id` reference vs. inline base64).

Wired via `VisionLabModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `StreamResponseBuilderModule`, `ContentBlockBuilderModule`).

### Wikimedia Commons client

A lab-local client (`backend/src/vision-lab/wikimedia-client.ts`), not shared, since no other feature consumes Wikimedia Commons: an abstract-class `WikimediaClient` token (`searchImages(query: string, count: number): Promise<{ url, title, mediaType, widthPx, heightPx, bytes: Buffer }[]>`), `RealWikimediaClient`, and `FakeWikimediaClient` (`backend/src/testing/wikimedia/`) returning canned image metadata and small canned buffers by default, wired through `fake-mode.md`'s `fakeSwitchProvider()`.

`RealWikimediaClient.searchImages()` makes one `GET` to `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=<query>&gsrnamespace=6&gsrlimit=<count>&prop=imageinfo&iiprop=url|size|mime` (`generator=search` with namespace `6` = File produces the candidate pages, and `prop=imageinfo` resolves each one's metadata in the same round trip). The response's `query.pages` is a pageid-keyed map; each page's `imageinfo[0]` carries `url`, `width`, `height`, and `mime`, and its own `title` is the `File:...` name. The client then issues one plain `GET` per result against each `imageinfo[0].url` to fetch the actual image bytes (the search+imageinfo call returns metadata only, never the file content itself), mapping `mime` → `mediaType` and `width`/`height` → `widthPx`/`heightPx`. Any failure is rethrown as `ExternalApiError('wikimedia', ...)`.

## Frontend

`frontend/src/app/vision-lab/` (`VisionLab`). Stacks `<app-docs-panel [slug]="'vision-lab'" />` → the demo → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. The demo: a search-query field, an `imageCount` selector (1–4), a free-text instruction field, a streaming toggle, the delivery-mode toggle, a Run button, a thumbnail gallery of the fetched images, a dimension-cap callout banner shown only when `dimensionCapApplied` is `true`, and the rendered answer. The gallery/answer area stays mounted with skeleton placeholders while a run is in flight rather than blanking, per `loading-states.md`.

## In-app doc

`frontend/public/lab-docs/vision-lab.md` — rendered inline by `DocsPanel`.

## Testing

- `vision-lab.service.spec.ts` (backend unit) — a fake `WikimediaClient` returning canned images; `run()` building one image content block per fetched image via `ContentBlockBuilderService` in the requested delivery mode; every `dimensionCapApplied` case (`imageCount > 1` plus an oversized image → `true`; `imageCount === 1` regardless of size → `false`; `imageCount > 1` with every image ≤2000px → `false`); a fewer-than-requested-images shortfall throwing `ExternalApiError('wikimedia', ...)`; both the non-streaming and streaming response shapes carrying `images`/`dimensionCapApplied`.
- `vision-lab.e2e-spec.ts` (backend integration) — `nock`-intercepted end-to-end runs against fixture Wikimedia/Anthropic responses, proving the full `200` shape and the `502` paths, for both `deliveryMode`s.
- `vision-lab.spec.ts` (frontend unit) — the query/instruction form, `imageCount` selector, delivery-mode and streaming toggles; the thumbnail gallery and dimension-cap banner rendering from a mocked response (banner absent when `dimensionCapApplied` is `false`); the Run flow for both streaming and non-streaming, including the streamed run's inspector `streamEvents` carrying through to the terminal `turn_complete`; the gallery/answer skeleton holding for the minimum duration per `loading-states.md`; a visible error state on a failed request.
- `vision-lab.spec.ts` (Playwright E2E, `e2e/tests/`) — nav reachable right after Data & Code Sandbox; docs panel renders non-empty content; a single-image non-streamed run renders the gallery/answer with no dimension-cap banner; a multi-image streamed run shows the dimension-cap banner and streams the answer, with the inspector's stream-events section visible once complete.
