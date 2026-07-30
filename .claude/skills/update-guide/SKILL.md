---
name: update-guide
description: Use this skill to add or update content in guide/guide.md, this repo's standalone practitioner guide to using the Claude API in a web application — for example when asked to "add a chapter to the guide", "update the guide with X", "add a screenshot placeholder to the guide", or when write-lab-doc surfaces a durable lesson worth generalizing into it. Not for a lab's own in-app docs — see write-lab-doc for that.
---

# Updating the standalone Claude API guide

`guide/guide.md` is a separate publication, not part of the app: a self-contained practitioner guide on using the Claude API in a web application, written for a reader who will never open this repo. It draws on lessons learned building this repo's labs, but the repo is evidence, not a template — everything added here must stay portable.

## Precondition

Reserve this for durable, transferable lessons — a pattern, tradeoff, failure mode, or architectural decision that would help someone building an unrelated application. Not every lab detail or in-app doc update belongs here; most won't.

## Portability rules

- Generalize: no repo-specific names, slugs, routes, or file paths, except where the repo is explicitly and deliberately named as an optional case study.
- Examples are portable TypeScript/pseudocode/JSON, not tied to this repo's actual stack.
- Playground-only affordances (a fake mode, an inspector panel, and the like) may appear only as optional testing/debugging ideas, never as product requirements.
- Define any non-obvious term at first use, or add it to the Glossary chapter.
- Cite claims about model/API behavior or limits against current Anthropic documentation and record an access date next to the citation — that behavior can change.

## Formatting conventions

- Single H1 for the whole document; ordered heading levels beneath it.
- Fenced code blocks with a language identifier.
- Tables narrow enough to render legibly when converted to PDF.
- Images live under `guide/assets/` and are referenced with guide-relative paths (e.g. `assets/example.png`), never a repo-root-relative `guide/assets/...` path — the guide is read as a standalone file, not from the repo root.
- Use **application contract** for a type owned by the product (even one wrapping provider metadata) and **provider type** for an Anthropic SDK request/response type, consistent with the rest of the guide.
- The guide has a fixed PDF pagination: every chapter, appendix, and top-level front-matter section starts on its own page, except a few deliberately paired to share one (Title+Revision History+Abstract; Introduction+How to Use This Guide; Glossary+Topical Index). This is encoded with an `<!-- PAGEBREAK -->` marker — an HTML comment, invisible on GitHub — on its own line immediately before every heading that should start fresh. Adding a new chapter or appendix without one leaves it silently sharing the previous section's page once rendered; see `revise-guide` for what the marker becomes at render time.

## Screenshot placeholders

Screenshots are captured manually, never invented or generated. Where a new figure would help, insert a placeholder at the exact spot instead:

```markdown
<!-- SCREENSHOT TODO
Capture: [page/feature and exact UI state]
Setup: [data and interactions required]
Frame: [what to include and exclude]
File: assets/[descriptive-name].png
Alt: [draft accessible alternative text]
Caption: [draft figure caption]
Purpose: [transferable concept illustrated]
-->
```

## Glossary and Topical Index are a joint section

`## Glossary` and the immediately-following `## Topical Index` are a paired, adjacent section (they share one PDF page). Introducing a term or concept worth surfacing should update both together where it applies: define it in Glossary if it's genuinely non-obvious terminology used before it's explained, and add a `- [Term](#anchor)` entry to Topical Index if it's a concept a reader would want to jump to directly. Never add a page number here — `revise-guide` computes and injects those into a disposable copy at render time; the tracked source only ever holds the anchor link, e.g. `- [Prompt caching](#cache-the-stable-document-prefix)`.

## No Conclusion section

The guide has no `## Conclusion`. Its former content (a synthesis paragraph, a numbered principles list, an adoption path, a closing thought) mostly restated points made elsewhere and was folded into `How to Use This Guide` (the adoption-path idea) and `Putting It Together` (the closing thought). Don't recreate a Conclusion section — a closing thought for new content belongs at the end of `Putting It Together` or inside whichever existing chapter it's actually about.

## Sections reconciled only when a revision is cut

`Abstract`, `Introduction`, and `References and Further Reading` are deliberately *not* touched as a side effect of an ordinary chapter edit here, even if the edit arguably changes what one of them should say. Updating them for every small change would make them chase content constantly and drift out of sync with each other instead. Leave them as they are; `revise-guide`'s pre-publication checks reconcile all three against the guide's current full content when a revision is actually being cut.

## Where content usually comes from

- `write-lab-doc` may surface a lesson while writing or refreshing a lab's in-app doc — see that skill's guide-alignment step.
- A direct request to add or expand a chapter, appendix, or index entry.

## Before considering an edit done

Finishing an edit here is not the same as cutting a new revision. Once you're done adding or changing content, hand off to `revise-guide` for the pre-publication checks, version/date bump, and PDF render — don't run those steps here.

## About `guide/plan.md`

The guide currently also has its own drafting plan at `guide/plan.md`, tracking the initial writing session-by-session. It's temporary and will be deleted once the first complete version of the guide lands — this skill is what stays authoritative for the guide's conventions afterward, so don't treat `plan.md` as a dependency.
