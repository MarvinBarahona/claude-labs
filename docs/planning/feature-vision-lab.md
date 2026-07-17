# Feature — Vision Lab

**Status:** 📋 Planned.

**Nav position:** after `feature-data-code-sandbox`.

## Claude API features

- **Images (single- and multi-image analysis)** — up to 100 images per request, 5MB max each; token cost = (width_px × height_px) / 750; sent as a `type: "image"` content block (base64 or URL) alongside `text` blocks.
- **Dimension-limit behavior change** — a single image allows up to 8000×8000px, but the cap drops to 2000×2000px as soon as a second image is added to the same request — a large image that's fine alone can get silently downscaled once a second one is attached.

## Main idea

Compare/count/describe across several real, freely-licensed images fetched from Wikimedia Commons, with the Files-API-vs-base64 toggle available here too, and the UI calling out the 8000px→2000px dimension cap that kicks in once a second image is added.

## Dataset & env vars

- **Wikimedia Commons API** — no auth required.
- No feature-specific env vars beyond the global `ANTHROPIC_API_KEY`.

## Build order & dependencies

Reuses the content-block builder first used by Document Research Assistant (see `status.md` for current position).

- Requires the **content-block builder** ([`task-content-block-builder.md`](task-content-block-builder.md)) to already exist.

## Shared functionality used

- Content-block builder ([`task-content-block-builder.md`](task-content-block-builder.md)).
- Response Envelope Builder ([`envelope-builder.md`](../shared/envelope-builder.md)).

## Files API / base64

Both mechanisms are technically valid for attaching images here, so this feature reuses the **"delivery mode" toggle** (same UI/backend pattern as Document Research Assistant).

## Guiding principles

- [`guiding-principles.md`](../technical/guiding-principles.md), "Real data, not fixtures" — real, freely-licensed Wikimedia Commons images, fetched live.
- [`guiding-principles.md`](../technical/guiding-principles.md), "Minimize integrations" — see "Depends on" below for why the Wikimedia client is lab-local rather than shared, the same reasoning already applied to Document Research Assistant's `ArxivClient`.

## Depends on

- [`task-content-block-builder.md`](task-content-block-builder.md)'s `ContentBlockBuilderService.buildBlock()` — builds one `image` content block per fetched image, in whichever delivery mode the current request asks for.
- [`architecture.md`](../technical/architecture.md), "Streaming transport" — this feature has no tools and no structured-output parsing, the same shape as Messages Console's plain multi-block call, so it reuses that lab's own streaming convention (raw events forwarded verbatim, a synthetic response reconstructed from `content_block_delta` events, a terminal `turn_complete`) rather than Structured Output Console's non-streaming precedent, which exists specifically because that feature has to parse the final text as JSON.
- **Wikimedia Commons client** — a new data-source client, built **lab-local** (`backend/src/vision-lab/wikimedia-client.ts`), not under `backend/src/shared/`, per [`repo-layout.md`](../technical/repo-layout.md)'s "Lab-specific, or shared functionality?" rule — no other planned feature consumes Wikimedia Commons, the same situation Document Research Assistant's lab-local `ArxivClient` and Live Tool-Use Console's lab-local `OpenMeteoClient` are already in. Follows the same DI-token-plus-fake pattern as those: an abstract-class `WikimediaClient` token (`searchImages(query: string, count: number): Promise<{ url: string; title: string; mediaType: string; widthPx: number; heightPx: number; bytes: Buffer }[]>`), a `RealWikimediaClient` (rethrowing any failure as `ExternalApiError('wikimedia', ...)` per [`api-error-handling.md`](../shared/api-error-handling.md)), a `FakeWikimediaClient` under `backend/src/testing/wikimedia/` returning canned image metadata and small canned buffers by default, and wired through [`fake-mode.md`](../shared/fake-mode.md)'s `fakeSwitchProvider()`.
  - **Confirmed wire call:** one `GET` to `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=<query>&gsrnamespace=6&gsrlimit=<count>&prop=imageinfo&iiprop=url|size|mime` — `generator=search` (namespace `6` = File) produces the candidate pages, and `prop=imageinfo` resolves each one's metadata in the same round trip (the `gsr`-prefixed params are the generator's own copies of `list=search`'s `sr`-prefixed ones, not a second call). The response's `query.pages` is a pageid-keyed map; each page's `imageinfo[0]` carries `url`, `width`, `height`, and `mime`, and its own `title` is the `File:...` name. `RealWikimediaClient.searchImages()` makes this call, then issues one plain `GET` per result against each `imageinfo[0].url` to fetch the actual image bytes (the search+imageinfo call returns metadata only, never the file content itself) — mapping `mime` to this client's own `mediaType` field and `width`/`height` to `widthPx`/`heightPx`.

## Endpoint contract

`backend/src/vision-lab/`:

- **`POST /api/vision-lab/run`**:
  - Request: `{ query: string; imageCount: 1 | 2 | 3 | 4; instruction: string; deliveryMode: 'files-api' | 'base64'; stream: boolean }` (`query` and `instruction` non-empty — plain `400` otherwise).
  - A Wikimedia fetch failure → `ExternalApiError('wikimedia', ...)` → `502`. Fewer than `imageCount` results found for `query` → `502` too (`ExternalApiError('wikimedia', 'Fewer than <n> images found for "<query>"')`) rather than silently running with fewer images than requested, since the whole point of `imageCount` is letting the user deliberately trigger (or not trigger) the dimension cap.
  - `imageCount` images are fetched via `WikimediaClient.searchImages()`, each turned into an `image` content block via `ContentBlockBuilderService.buildBlock()` in the requested `deliveryMode`, alongside a `text` block carrying `instruction`.
  - `dimensionCapApplied` is computed by the backend from the fetched images' own reported `widthPx`/`heightPx` (not inferred from the Claude response, which doesn't expose it): `true` only when `imageCount > 1` **and** at least one fetched image's `widthPx` or `heightPx` exceeds 2000 — a single-image request is never capped regardless of size, per the Claude API features note above.
  - `stream: false` → `200`:
    ```ts
    TurnEnvelope & {
      images: { url: string; title: string; widthPx: number; heightPx: number }[];  // the images actually used, for thumbnail rendering
      answer: string;
      dimensionCapApplied: boolean;
    }
    ```
  - `stream: true` → `200`, `Content-Type: text/event-stream`, same route, reusing Messages Console's exact convention: raw Claude stream events forwarded verbatim, response reconstructed from `content_block_delta` events, a terminal `event: turn_complete\ndata: <same JSON body as the non-streaming success>\n\n`. A mid-stream failure → `event: error\ndata: <ShapedError body JSON>\n\n`, no `turn_complete` after it.

## Frontend

`frontend/src/app/vision-lab/` (`VisionLab`). Stacks `<app-docs-panel [slug]="'vision-lab'" />` → the demo (search-query field, an `imageCount` selector (1–4), a free-text instruction field, streaming toggle, delivery-mode toggle, Run button, a thumbnail gallery of the fetched images, a dimension-cap callout banner shown only when `dimensionCapApplied` is `true`, and the rendered answer) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. Per [`loading-states.md`](../technical/loading-states.md), the gallery/answer area stays mounted with skeleton placeholders while a run is in flight.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Backend unit"/"Backend integration"/"Frontend unit" buckets:

- [ ] **Unit** — `WikimediaClient` (fake) returns canned image metadata + bytes for a query; `run` builds one `image` content block per fetched image via `ContentBlockBuilderService`, in the requested `deliveryMode`.
- [ ] **Unit** — `dimensionCapApplied` is `true` when `imageCount > 1` and at least one fetched image exceeds 2000px in either dimension; `false` when `imageCount === 1` regardless of size; `false` when `imageCount > 1` and every image is ≤2000px in both dimensions.
- [ ] **Unit** — fewer than `imageCount` results for a query throws `ExternalApiError('wikimedia', ...)`.
- [ ] **Unit** — non-streaming and streaming (Messages-Console-style) response shapes, both including `images`/`dimensionCapApplied`.
- [ ] **Integration** — a `nock`-intercepted end-to-end run against fixture Wikimedia/Anthropic responses proves the full `200` shape and the `502` paths, for both `deliveryMode`s.
- [ ] **Frontend unit** — the query/instruction form, `imageCount` selector, delivery-mode and streaming toggles; the thumbnail gallery and dimension-cap banner render from a mocked response (banner absent when `dimensionCapApplied` is `false`); the Ask flow for both streaming and non-streaming; the gallery/answer skeleton holds for the minimum duration per `loading-states.md`.

### Manual

1. With a real `ANTHROPIC_API_KEY`, search a query and run with `imageCount: 1` — confirm a plausible description of the single image.
2. Same query, bump to `imageCount: 2+` including at least one image over 2000px in either dimension — confirm the dimension-cap callout appears, and that Claude can still meaningfully compare/count across the (downscaled) images.
3. Toggle delivery mode for the same query/images and confirm the inspector shows both content-block shapes.

## To-do list

- [ ] Implement the lab-local `WikimediaClient` (`RealWikimediaClient`, `FakeWikimediaClient`, `fakeSwitchProvider()` wiring), per "Depends on" above.
- [ ] Implement the image fetch + content-block assembly per delivery mode.
- [ ] Implement `dimensionCapApplied` computation and the fewer-than-requested-images `502` path.
- [ ] Implement non-streaming and streaming responses, reusing Messages Console's SSE plumbing.
- [ ] Build the frontend: query/instruction form, `imageCount` selector, delivery-mode/streaming toggles, thumbnail gallery, dimension-cap callout.
- [ ] Wire `VisionLabModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `ContentBlockBuilderModule`).

## Open questions

None.
