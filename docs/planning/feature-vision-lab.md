# Feature — Vision Lab

**Status:** 📝 Draft.

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

## Files API / base64

Both mechanisms are technically valid for attaching images here, so this feature reuses the **"delivery mode" toggle** (same UI/backend pattern as Document Research Assistant).

## Open questions

None.
