Claude can look at images directly — attach one or more as `image` content
blocks alongside your text and it can describe, compare, or count across
them in the same reply. This lab fetches real, freely-licensed photos from
Wikimedia Commons for a search query you give it, attaches however many
you ask for, and sends them to Claude with an instruction of your choice.

## Attaching images

Every fetched image becomes its own content block in the same user
message as your instruction:

```json
{
  "role": "user",
  "content": [
    { "type": "image", "source": { "type": "base64", "media_type": "image/jpeg", "data": "<base64 bytes>" } },
    { "type": "image", "source": { "type": "base64", "media_type": "image/jpeg", "data": "<base64 bytes>" } },
    { "type": "text", "text": "<your instruction>" }
  ]
}
```

Up to 100 images are allowed per request, 5MB each. Claude's own image
token cost works out to roughly `(width_px × height_px) / 750` — a large
photo isn't free just because it's "one image."

## The dimension cap

A single image can be up to 8000×8000px and Claude reads it at full
resolution. The moment a **second** image is added to the same request,
that per-image cap drops to 2000×2000px — anything larger gets silently
downscaled before Claude ever sees it. This lab computes whether that cap
actually applied to your specific request (`imageCount > 1` and at least
one fetched image exceeds 2000px in either dimension) and shows a banner
when it does, so the effect isn't invisible. Pick **Image Count: 1** and
it never applies, regardless of how large that one image is; pick 2 or
more and search for something likely to turn up a large photo to see it
trigger.

## Files API vs. Base64

The same image bytes can be attached two ways, same tradeoff as any other
file attachment. **Base64** (above) inlines the bytes directly in the
request. The **Files API** uploads each image once and references it by
ID instead:

```json
{ "type": "image", "source": { "type": "file", "file_id": "file_abc123" } }
```

referencing a `file_id` this way requires the `files-api-2025-04-14` beta
header on the Messages call itself, not just on the earlier upload call.
This lab re-uploads on every run rather than caching a `file_id` across
requests — each run is a fresh, independent query, unlike a multi-turn
session where the same document persists across turns.

## The response

A non-streaming run returns the model's answer as plain text, alongside
the images actually used (for the thumbnail gallery here) and whether the
dimension cap applied:

```json
{
  "answer": "The two photos show...",
  "images": [{ "url": "...", "title": "...", "widthPx": 4032, "heightPx": 3024 }],
  "dimensionCapApplied": true
}
```

Toggle **Stream Response** to get the same fields, but reconstructed live
from raw `content_block_delta` events as Claude's answer is generated,
rather than waiting for the whole reply — the same streaming shape used
elsewhere in this app for a plain (non-tool, non-structured-output) call.
