---
name: review-guide
description: Use this skill to run a deep, multi-perspective audit of guide/guide.md — for example "review the guide", "audit the guide", "run the four checks on the guide", "what's wrong with the guide", or "check the guide against the lab docs". Produces a merged appraisal with findings and suggestions; it never edits anything. Not for authoring content (see update-guide) and not part of cutting a revision (see revise-guide).
---

# Deep review of the standalone guide

`guide/guide.md` is a standalone publication whose reader will never open this repo. That makes it unusually easy for defects to survive: a cross-reference can point at the wrong chapter and still resolve, a code example can contradict the paragraph above it, a claim about API behavior can quietly go stale, and a rule that only exists because of this repo can read as general advice. This skill runs four independent reviews that each catch a different one of those, then merges them.

## This skill only reports

It makes no edits, to the guide or anything else. Its output is an appraisal the user decides what to act on. Content fixes go through `update-guide` afterward; nothing here writes to the guide, the lab docs, or any skill file.

## When to run it

Only on an explicit request. It is slow and expensive — four subagents each reading a ~1700-line document in full, plus live documentation fetches — so it is not something to chain onto other guide work. Finishing a batch of edits does not call for it, and neither does cutting a revision: `revise-guide` has its own pre-publication checks and is deliberately independent of this.

Good reasons to run it: before a revision that matters, after a stretch of accumulated edits by different hands, when the guide and a lab doc are suspected to disagree, or when something feels wrong and the specific defect isn't obvious yet.

## The four checks

Run all four as subagents, in parallel, one per check. They overlap on purpose — a finding two of them reach independently is worth considerably more than either alone, and the overlaps are where the real defects have shown up. Each subagent must read the whole guide rather than skim, and must anchor every finding to a line number and a quote; a finding with no quote attached is not actionable.

**1. Spec conformance.** The guide against `update-guide`'s written rules, read literally and exhaustively. Audience contract (does it re-explain API surface its reader already knows, or general web engineering where Claude doesn't change the answer?), portability, the fixed skeleton and section order, forbidden sections, heading levels, fenced-code language identifiers, no mermaid, table separator weighting and PDF-width risk, `PAGEBREAK` coverage on every section that needs one, and anchor integrity. Reading `revise-guide` as secondary criteria is useful here, since its pre-publication checks are what the guide eventually has to pass.

**2. Lab-doc cross-check.** The guide against every doc under `frontend/public/lab-docs/`. These are two different publications for two different readers, so the check is not whether they match — it is three specific things:

- **Contradictions.** The guide and a lab doc disagree about API behavior, a limit, or a tradeoff. One of them is wrong, and it is not automatically the lab. Highest-value findings this check produces.
- **Coverage gaps.** A durable, transferable lesson a lab learned that the guide would be better for generalizing. Apply `update-guide`'s bar ruthlessly — most lab detail does not clear it.
- **Leakage.** Repo-, lab-, or playground-specific detail that reached the guide, where a standalone reader would find it inexplicable or, worse, would adopt one app's arbitrary choice as an industry practice.

**3. Technical writer.** A developmental and line edit by someone who edits long-form technical prose for a living: chapter proportions measured rather than guessed, opening quality per chapter, recurring prose tics named with real quotes and rewrites, density and where a reader stalls, heading and terminology consistency, and whether the guide is scannable by someone hunting for one decision. Both render targets constrain the suggestions — anything proposed has to work on GitHub *and* in the PDF.

**4. Senior developer, cold read.** Someone handed this one file with no repo, no context, and no companion app. Technical correctness of every claim about models, limits, parameters, tool mechanics, streaming, caching, citations, and thinking — **verified against live Anthropic documentation, never from memory** — fetch the specific page that owns each claim, and say which page each verdict came from. Whatever current Claude API reference tooling is available is worth loading first, but it does not replace fetching the page for a claim the review intends to call wrong. Code examples read as a PR review: would they compile, are types consistent across chapters, would copying the shape mislead. Then self-sufficiency (anything used before it's defined, any reference to something the reader can't see) and the gaps a practitioner would hit building from the guide alone.

## Merging the four

The merge is the part that determines whether this was worth running, and it is not a concatenation.

**Verify the load-bearing findings yourself.** Subagents are confidently wrong often enough that a blocker-level claim must be confirmed before it reaches the user — open the file and read the cross-reference, read the code block, fetch the documentation page. A merged report that relays an unverified "this is broken" costs more trust than the finding was worth. Say which findings you verified and how.

**Rank by consequence, not by reviewer.** A wrong API fact and a wrong cross-reference outrank a paragraph that could be tighter, regardless of which subagent found which.

**Separate what the guide gets right.** The fix list is long by construction; a report that lists only defects misrepresents the document and makes it harder to judge what to protect during edits. Name the strongest passages with line numbers.

**Route the outcome.** Content fixes go through `update-guide`. If a check turns up an error in a lab doc rather than the guide — which the cross-check does produce — that is `write-lab-doc`'s territory, not something to fold into a guide edit.
