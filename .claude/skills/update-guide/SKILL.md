---
name: update-guide
description: Use this skill to add or update content in guide/guide.md, this repo's standalone practitioner guide to using the Claude API in a web application — for example when asked to "add a chapter to the guide", "update the guide with X", "add a screenshot placeholder to the guide", or when write-lab-doc surfaces a durable lesson worth generalizing into it. Not for a lab's own in-app docs — see write-lab-doc for that.
---

# Updating the standalone Claude API guide

`guide/guide.md` is a separate publication, not part of the app: a self-contained practitioner guide on using the Claude API in a web application, written for a reader who will never open this repo. It draws on lessons learned building this repo's labs, but the repo is evidence, not a template — everything added here must stay portable.

## Who the guide is written for

Assume a reader who already builds and operates web applications **and already uses the Claude API** — they have made Messages calls, read a `stop_reason`, and wired up a tool. This governs every edit: don't re-explain the API surface, restate what a content block or a streaming event is, or walk through a lifecycle the official docs already own. Link to the relevant Anthropic page and spend the words on what that page doesn't say — the product decision, the tradeoff, the failure mode, the thing that only shows up once the feature is real.

The same test applies to non-Claude material. General web-application engineering the audience already knows (layered testing, feature flags, dependency injection) belongs in the guide only where Claude changes the answer.

## Precondition

Reserve this for durable, transferable lessons — a pattern, tradeoff, failure mode, or architectural decision that would help someone building an unrelated application. Not every lab detail or in-app doc update belongs here; most won't.

## Portability rules

- Generalize: no repo-specific names, slugs, routes, or file paths, except where the repo is explicitly and deliberately named as an optional case study.
- Examples are portable TypeScript/pseudocode/JSON, not tied to this repo's actual stack.
- Playground-only affordances (a fake mode, an inspector panel, and the like) may appear only as optional testing/debugging ideas, never as product requirements. In particular, the guide's testing material never mentions a whole-app fake mode: the transferable rule is that no automated test should need a real Claude key or make a real Claude call, and substituting the Claude client at its interface is what carries that. Other dependencies are left as an ordinary engineering judgment — a real test database instance is frequently the better choice, so don't generalize the Claude rule into "mock every external system."
- Define any non-obvious term at first use, in the prose where it's used. There is no glossary to add it to.
- Cite claims about model/API behavior or limits against current Anthropic documentation and record an access date next to the citation — that behavior can change.

## Guide structure

The guide has exactly one variable element — its numbered chapters — inside an otherwise fixed skeleton, always in this order:

1. Title and subtitle
2. Abstract
3. Table of Contents
4. Introduction
5. Numbered chapters — the variable content
6. References
7. Appendices — only the ones actually needed, see below

Every item except the numbered chapters is a fixed section: it always exists, always in this position, and is never itself numbered.

- **Abstract** is at most 3 paragraphs. Its job is to quickly orient a new reader on what the guide is and get them interested enough to keep reading — not to summarize every chapter.
- **Introduction** is one section, kept short. It covers who the guide assumes you are, the central question, how the chapters are organized, scope and non-goals, suggested reading order and adoption path, and the two recurring terms (application contract, provider type). It does not carry a learning-objectives list, and there is no separate "How to Use This Guide" section — that content was folded in here.
- **Table of Contents** is a plain bullet list (`-`), never an ordered list — fixed sections are never numbered, and a chapter or appendix that already carries a number in its own heading (e.g. "3. Structured Outputs...", "Appendix A: ...") keeps that number because it's in the heading text, not because the ToC re-numbers it. Entries start from Introduction — the Title, Abstract, and the Table of Contents itself aren't listed as entries in it.

## Formatting conventions

- Single H1 for the whole document; ordered heading levels beneath it.
- Fenced code blocks with a language identifier.

**The guide has two render targets: GitHub and the PDF.** Anything added has to work in both, which rules out more than it sounds like. Mermaid renders on GitHub but pandoc emits it into the PDF as raw source, so never use it. The two visual devices that survive both are Markdown pipe tables and ASCII diagrams in a ```` ```text ```` fence — prefer those, and don't reach for anything else without checking it renders in both.

- Reach for a table when prose is comparing several things along the same axes; a three-way comparison spread over three paragraphs is almost always a table trying to get out. But check the page count after: a table is usually clearer than the prose it replaces and often *taller* in the PDF, so "shorter" and "better" don't automatically travel together.
- Tables must stay narrow enough to render legibly in the PDF. Pandoc sizes a column proportionally to the dash count in its separator segment, not to its content, so weight the separator row deliberately (a short run for a label column, longer runs for prose columns) rather than writing a uniform `|---|---|---|`. Keep cells short and push nuance into the paragraph after the table; an unbreakable long cell is what produces an `Overfull \hbox`, which `revise-guide` treats as a real defect.
- Images live under `guide/assets/` and are referenced with guide-relative paths (e.g. `assets/example.png`), never a repo-root-relative `guide/assets/...` path — the guide is read as a standalone file, not from the repo root.
- Use **application contract** for a type owned by the product (even one wrapping provider metadata) and **provider type** for an Anthropic SDK request/response type, consistent with the rest of the guide.
- The guide has a fixed PDF pagination: an `<!-- PAGEBREAK -->` marker — an HTML comment, invisible on GitHub — goes on its own line immediately before every fixed section and every chapter/appendix that should start a fresh page, except where two are deliberately paired to share one. Adding a new fixed section, chapter, or appendix without one leaves it silently sharing the previous section's page once rendered. Exact pairing and pagination mechanics are `revise-guide`'s call — see that skill for what the marker becomes at render time.
- The title and subtitle are wrapped in a `<!-- CENTER -->` / `<!-- /CENTER -->` marker pair, same idea as `PAGEBREAK` — invisible on GitHub, resolved into real centering only by `revise-guide` at render time. This is a fixed, one-time fixture of the title block, not something to add elsewhere.

## Renaming a heading breaks every link that points at it

Internal links (Table of Contents, inline cross-references) resolve from GitHub-style heading slugs — `revise-guide` renders with `gfm_auto_identifiers` for exactly this reason. Any heading rename is therefore also an anchor rename, and every place linking to the old anchor needs the same edit, in the same pass. Update the Table of Contents entry along with every inline cross-reference: some link with generic text like `[Chapter N]` and only need the anchor fixed, others link using the heading's own title text and need both the visible text and the anchor updated to match.

**Renumbering a chapter is the expensive case.** Chapters are referred to by number in running prose across the whole guide ("as Chapter 4 covers"), not only through links, so inserting, removing, or merging a chapter means auditing every `Chapter N` mention in the file, not just the anchors. Grep for both the old anchor fragment and `Chapter N` afterwards, and re-read each hit in context — a reference that still resolves can now point at the wrong chapter, which no link check will catch.

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

## Appendices are optional and un-wrapped

There is no `## Appendices` heading. Appendices aren't a section of their own — they're a sequence of independent fixed-type sections that begin directly at `## Appendix A: ...`, continue B, C, D... in order, and exist only when the guide actually needs one. Don't add a placeholder or empty appendix just to preserve a slot.

The guide currently has none, deliberately. An appendix earns its place only by holding something the chapters genuinely can't: not a fuller version of a listing a chapter already excerpts, not a restatement of a chapter's practices as a checklist, and not example payloads a reader of this guide's audience can already picture. If a chapter's excerpt is too thin to follow, fix the excerpt.

## Sections that no longer exist

The guide has no `## Conclusion`, no `## How to Use This Guide`, no `## Glossary`, and no standalone `## Topical Index`. Each was folded elsewhere: Conclusion into `Putting It Together`, How to Use This Guide into `Introduction`, and Glossary and Topical Index dropped outright — a reader who already uses the Claude API doesn't need *content block* or *prompt caching* defined, and the handful of terms the guide actually coins are defined in the prose that uses them. Don't recreate any of them, and don't leave a stray reference to one lying around in a ToC entry, cross-reference, or example — a reader who follows it will find nothing there.

## Title, Abstract, and Introduction are checked on every content edit

Whenever a chapter's content changes enough that it might shift what a first-time reader should expect from the guide, check the title/subtitle, Abstract, and Introduction (What You Will Learn / Scope and Non-Goals) against the change. Most edits won't need any change to these — but the check itself happens every time an edit is made here, not only when cutting a revision.

## References is reconciled only when a revision is cut

`References` is deliberately *not* touched as a side effect of an ordinary chapter edit here, even if the edit arguably changes what it should cite. Updating it for every small change would make it chase content constantly. Leave it as it is; `revise-guide`'s pre-publication checks reconcile it against the guide's current full content when a revision is actually being cut.

## Where content usually comes from

- `write-lab-doc` may surface a lesson while writing or refreshing a lab's in-app doc — see that skill's guide-alignment step.
- A direct request to add or expand a chapter, appendix, or index entry.

## Before considering an edit done

Finishing an edit here is not the same as cutting a new revision. Once you're done adding or changing content, hand off to `revise-guide` for the pre-publication checks, version/date bump, and PDF render — don't run those steps here.
