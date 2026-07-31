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

Up to 100 images are allowed per request on models with a 200k-token
context window, and 600 on models with a larger one. Each image can be up
to 10MB base64-encoded on the Claude API — partner platforms such as
Bedrock and Google Cloud cap it lower, at 5MB. Claude bills images as
visual tokens over a 28-pixel patch grid, so one image costs
`ceil(width / 28) × ceil(height / 28)` tokens — a large photo isn't free
just because it's "one image."

## What resolution Claude actually reads

A single image can be submitted at up to 8000×8000px, but that's the
largest size the API will *accept*, not the size Claude reads. Every model
belongs to a resolution tier, and an image larger than its tier is
downscaled — preserving aspect ratio — before the model sees it. Newer
models read up to 2576px on the long edge and 4784 visual tokens per
image; everything else reads up to 1568px and 1568 tokens. So an
8000×8000 upload buys nothing but upload bandwidth, and the tier is also
what decides whether small text in your image survives the trip.

## The dimension cap (this lab's own rule)

Anthropic's own multi-image rule starts above **20** images in one
request: past that threshold a stricter per-image dimension limit applies,
and an image over it is **rejected** with an `invalid_request_error`
rather than quietly resized. The documented way to stay clear of it on
every platform is to keep each image at or below 2000×2000px, or to keep
the request to 20 or fewer image and document blocks.

This lab applies a much more conservative version of that rule: it caps
images at 2000×2000px as soon as a request contains **more than one**
image. That threshold is this lab's own product decision, not an API
requirement — a safety margin that keeps every request it builds
comfortably portable without having to reason about the real limit. Since
a silent downscale is indistinguishable from a model that simply missed a
detail, the lab computes whether its cap actually changed anything for
your specific request (`imageCount > 1` and at least one fetched image
over 2000px in either dimension) and shows a banner when it did. Pick
**Image Count: 1** and it never applies, however large that one image is;
pick 2 or more and search for something likely to turn up a large photo
to watch it trigger.

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

**Gotcha:** base64 inlines every image's raw bytes into the request body,
and Anthropic caps the whole request at 32MB — Wikimedia originals can run
into the tens of MB before base64 even adds its ~33% overhead, so a large
`Image Count` in base64 mode can trip a `413 request_too_large`. This lab
fetches a downscaled Wikimedia thumbnail rather than the full original, and
checks the total payload size before ever calling Claude, failing fast with
a clear message instead of round-tripping to a 413. Files API mode doesn't
have this exposure at all — the Messages request only carries a `file_id`
reference, regardless of how large the uploaded image was.

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
