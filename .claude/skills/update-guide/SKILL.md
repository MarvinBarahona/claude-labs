---
name: update-guide
description: Use this skill to add or update content in guide/claude-api-web-app-guide.md, this repo's standalone practitioner guide to using the Claude API in a web application — for example when asked to "add a chapter to the guide", "update the guide with X", "add a screenshot placeholder to the guide", or when write-lab-doc surfaces a durable lesson worth generalizing into it. Not for a lab's own in-app docs — see write-lab-doc for that.
---

# Updating the standalone Claude API guide

`guide/claude-api-web-app-guide.md` is a separate publication, not part of the app: a self-contained practitioner guide on using the Claude API in a web application, written for a reader who will never open this repo. It draws on lessons learned building this repo's labs, but the repo is evidence, not a template — everything added here must stay portable.

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

## Before considering an update done

- No `SCREENSHOT TODO` you introduced is left unresolved without either a real image in place or a deliberate decision to drop the figure.
- Internal links (table of contents, cross-references, topical index) still resolve.
- Any technical claim you added or changed is accurate against current documentation and dated if it may drift.
- The addition reads as generalized guidance, not a restatement of one lab's specific implementation.

## Where content usually comes from

- `write-lab-doc` may surface a lesson while writing or refreshing a lab's in-app doc — see that skill's guide-alignment step.
- A direct request to add or expand a chapter, appendix, or index entry.

## About `guide/plan.md`

The guide currently also has its own drafting plan at `guide/plan.md`, tracking the initial writing session-by-session. It's temporary and will be deleted once the first complete version of the guide lands — this skill is what stays authoritative for the guide's conventions afterward, so don't treat `plan.md` as a dependency.
