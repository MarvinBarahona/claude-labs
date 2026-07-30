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

## Guide structure

The guide has exactly one variable element — its numbered chapters — inside an otherwise fixed skeleton, always in this order:

1. Title and subtitle
2. Abstract
3. Table of Contents
4. Introduction
5. How to Use This Guide
6. Glossary — also serves as the topical index, see below
7. Numbered chapters — the variable content
8. References
9. Appendices — only the ones actually needed, see below

Every item except the numbered chapters is a fixed section: it always exists, always in this position, and is never itself numbered.

- **Abstract** is at most 3 paragraphs. Its job is to quickly orient a new reader on what the guide is and get them interested enough to keep reading — not to summarize every chapter.
- **Table of Contents** is a plain bullet list (`-`), never an ordered list — fixed sections are never numbered, and a chapter or appendix that already carries a number in its own heading (e.g. "3. Foundations...", "Appendix A: ...") keeps that number because it's in the heading text, not because the ToC re-numbers it. Entries start from Introduction — the Title, Abstract, and the Table of Contents itself aren't listed as entries in it.

## Formatting conventions

- Single H1 for the whole document; ordered heading levels beneath it.
- Fenced code blocks with a language identifier.
- Tables narrow enough to render legibly when converted to PDF.
- Images live under `guide/assets/` and are referenced with guide-relative paths (e.g. `assets/example.png`), never a repo-root-relative `guide/assets/...` path — the guide is read as a standalone file, not from the repo root.
- Use **application contract** for a type owned by the product (even one wrapping provider metadata) and **provider type** for an Anthropic SDK request/response type, consistent with the rest of the guide.
- The guide has a fixed PDF pagination: an `<!-- PAGEBREAK -->` marker — an HTML comment, invisible on GitHub — goes on its own line immediately before every fixed section and every chapter/appendix that should start a fresh page, except where two are deliberately paired to share one. Adding a new fixed section, chapter, or appendix without one leaves it silently sharing the previous section's page once rendered. Exact pairing and pagination mechanics are `revise-guide`'s call — see that skill for what the marker becomes at render time.
- The title and subtitle are wrapped in a `<!-- CENTER -->` / `<!-- /CENTER -->` marker pair, same idea as `PAGEBREAK` — invisible on GitHub, resolved into real centering only by `revise-guide` at render time. This is a fixed, one-time fixture of the title block, not something to add elsewhere.

## Renaming a heading breaks every link that points at it

Internal links (Table of Contents, Glossary, inline cross-references) resolve from GitHub-style heading slugs — `revise-guide` renders with `gfm_auto_identifiers` for exactly this reason. Any heading rename is therefore also an anchor rename, and every place linking to the old anchor needs the same edit, in the same pass:

- **Chapter (`##`) headings** are the safest to rename — for example, reframing a chapter title around a feature idea instead of a bare capability name. Update its Table of Contents entry, and any Glossary entry linking to it: some link with generic text like `[Chapter N]` and only need the anchor fixed, others link using the chapter's own title text and need both the visible text and the anchor updated to match.
- **Subsection (`###`) headings are riskier to rename**: the Glossary routinely links a term directly to one specific subsection inside a chapter, not to the chapter as a whole. Prefer folding new material into an existing subsection's prose, or adding a brand-new subsection, over renaming one that something elsewhere already links to.

After any heading rename, grep the whole file for the old anchor fragment to confirm nothing still points at it — don't rely on remembering every place a heading gets referenced.

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

Once a real screenshot is supplied for a placeholder, resolve it here, in `guide/guide.md` itself: place the image file at the placeholder's `File:` path under `guide/assets/`, replace the whole comment block with a Markdown image using that path, the drafted `Alt:` text, and the drafted `Caption:` as visible text below the image, then remove the placeholder comment. If a figure turns out not to be worth capturing, remove the placeholder and any prose that depended on it instead of leaving it in place. Either way, no `SCREENSHOT TODO` should remain by the time `revise-guide` is asked to cut a revision — it checks for exactly that.

## Glossary is the topical index

There is one `## Glossary` section — not a separate Glossary and Topical Index. Introducing a term or concept worth surfacing updates this one list. Define genuinely non-obvious terminology inline; for a concept that's really discussed at length elsewhere in the guide, add a link to where it's covered instead of maintaining a second lookup list, e.g. `**Prompt caching** — a mechanism for reusing eligible, repeated prompt prefixes. See [Chapter 7](#7-files-documents-citations-and-caching) for the full pattern.` Never add a page number here — `revise-guide` computes and injects those into a disposable copy at render time; the tracked source only ever holds the anchor link.

## Appendices are optional and un-wrapped

There is no `## Appendices` heading. Appendices aren't a section of their own — they're a sequence of independent fixed-type sections that begin directly at `## Appendix A: ...`, continue B, C, D... in order, and exist only when the guide actually needs one. Don't add a placeholder or empty appendix just to preserve a slot.

## Sections that no longer exist

The guide has no `## Conclusion` and no standalone `## Topical Index` — both were folded elsewhere (Conclusion's content into `How to Use This Guide` and `Putting It Together`; Topical Index into `Glossary`, see above). Don't recreate either, and don't leave a stray reference to one lying around in a ToC entry, cross-reference, or example — a reader who follows it will find nothing there.

## Title, Abstract, and Introduction are checked on every content edit

Whenever a chapter's content changes enough that it might shift what a first-time reader should expect from the guide, check the title/subtitle, Abstract, and Introduction (What You Will Learn / Scope and Non-Goals) against the change. Most edits won't need any change to these — but the check itself happens every time an edit is made here, not only when cutting a revision.

## References is reconciled only when a revision is cut

`References` is deliberately *not* touched as a side effect of an ordinary chapter edit here, even if the edit arguably changes what it should cite. Updating it for every small change would make it chase content constantly. Leave it as it is; `revise-guide`'s pre-publication checks reconcile it against the guide's current full content when a revision is actually being cut.

## Where content usually comes from

- `write-lab-doc` may surface a lesson while writing or refreshing a lab's in-app doc — see that skill's guide-alignment step.
- A direct request to add or expand a chapter, appendix, or index entry.

## Before considering an edit done

Finishing an edit here is not the same as cutting a new revision. Once you're done adding or changing content, hand off to `revise-guide` for the pre-publication checks, version/date bump, and PDF render — don't run those steps here.
