---
name: revise-guide
description: Use this skill to close out a round of edits to guide/claude-api-web-app-guide.md as a new publishable revision — for example "cut a new revision of the guide", "publish the guide", "check the guide before release", or "convert the guide to PDF". Runs the pre-publication checks, bumps the revision metadata, and renders the PDF. Not for adding or changing guide content — see update-guide for that.
---

# Publishing a new revision of the guide

`update-guide` is for authoring: adding or changing content in `guide/claude-api-web-app-guide.md`. This skill is for the separate act of turning a batch of those edits into a new numbered, dated, PDF-rendered revision. Run it after content edits are done, not while still drafting.

## Precondition

Only run this once the edits for the revision are actually finished. If content is still being drafted or a requested change hasn't been made yet, that's `update-guide`'s job — come back here afterward.

## Step 1 — Pre-publication checks

Work through all of these against `guide/claude-api-web-app-guide.md` before touching version metadata or rendering anything:

- No `SCREENSHOT TODO` is left unresolved — each either has a real image in place or a deliberate decision to drop the figure.
- Internal links (table of contents, cross-references, topical index) still resolve.
- Every technical claim about model/API behavior or limits is accurate against current Anthropic documentation and dated where it may drift.
- Code and request/response examples match the API shape described in the cited documentation.
- No repo-specific names, slugs, routes, or file paths leaked in, except where the repo is explicitly and deliberately named as an optional case study.
- The content reads as generalized guidance, not a restatement of one lab's specific implementation.
- Every heading that should start a fresh PDF page has its `<!-- PAGEBREAK -->` marker immediately before it (see the fixed pagination convention in step 3) — a new chapter or appendix added without one will silently share the previous section's page.
- **Abstract**, **Introduction**, and **References and Further Reading** are reconciled against the guide's current full content. These three are deliberately *not* touched during ordinary chapter edits (that's `update-guide`'s restraint, not an oversight) — this is the one place they get revisited, so it's also the one place their staleness would otherwise go unnoticed: does the Abstract still describe what the guide actually covers, does Introduction's "what you will learn" list still match, does References still cover what's actually cited across chapters (and nothing that isn't)?

Fix anything that fails before proceeding — don't render a PDF from a guide that still has open issues.

## Step 2 — Bump the revision metadata

`guide/claude-api-web-app-guide.md` has a `## Revision History` table right below the title, with columns `Version | Date | Author | Changelog`. It's the single source of truth for version, date, and authorship — there is no separate title-page metadata block to keep in sync with it. Every revision adds exactly one row. Gather it in this order:

1. **Author(s)** — always ask, every single time, with no suggested default. Authorship is a fact only the person cutting the revision can supply; never guess it or carry the previous row's author forward silently.
2. **Version** and **Changelog** — propose both, for the user to confirm or override:
   - Suggested version: increment from the highest version currently in the table (e.g. `0.1` → `0.2`), keeping a `(working draft)` suffix on the version number until told otherwise. Drop the suffix, and move toward `1.0`, only on explicit direction that the guide is past its working-draft phase.
   - Suggested changelog: a short, concrete summary of what actually changed since the last row — based on the edits made this session, or `git diff` against the guide file if the session doesn't have that context. Don't write a generic "updates" placeholder.

Once confirmed, append the new row to `## Revision History` with today's date. That's the entire metadata update for this step.

## Step 3 — Prepare the disposable copy and render (first pass)

Convert the Markdown to PDF with a containerized `pandoc` so no local install is required, matching this repo's usual Docker-only tooling pattern. Everything this and the following steps generate — the header file, the working copy, intermediate LaTeX, and the final PDF — goes under `guide/output/`, which is entirely gitignored (`guide/output/`). Nothing under it is source; it can be wiped with `rm -rf guide/output` at any point and fully regenerated.

**Fixed pagination convention.** The guide has a fixed front-matter layout and a "each major section starts on its own page" rule for everything after it: Title+Revision History+Abstract share page 1, Introduction+How to Use This Guide share page 2, Table of Contents gets page 3, Glossary+Topical Index share page 4, and every chapter, Putting It Together, Production Readiness Checklist, References, and each Appendix gets its own page from there on. This is encoded as an `<!-- PAGEBREAK -->` HTML comment on its own line immediately before every heading that should start fresh — invisible on GitHub (comments don't render), meaningless to a plain Markdown reader, but this step turns it into a real page break for the PDF. `update-guide` is responsible for keeping a marker in place before any new chapter/appendix-level heading; step 1 checks that.

Create the directory, the working copy, and a small LaTeX header pandoc needs at render time:

```
mkdir -p guide/output
cp guide/claude-api-web-app-guide.md guide/output/source.md
```

```latex
\clubpenalty=10000
\widowpenalty=10000
```

Write that as `guide/output/pdf-header.tex`. `\clubpenalty` and `\widowpenalty` are core TeX primitives (no extra LaTeX package needed) that forbid a paragraph break from leaving only its first or last line stranded alone on a page — the mechanism behind "no paragraph split across two pages." Setting both to the maximum forces LaTeX to push the whole paragraph to the next page instead.

Now convert every marker in the working copy into a real page break, in place:

```
awk '{ if ($0 == "<!-- PAGEBREAK -->") { print "```{=latex}"; print "\\" "newpage"; print "```" } else { print } }' \
  guide/output/source.md > guide/output/source.md.tmp && mv guide/output/source.md.tmp guide/output/source.md
```

That `"\\" "newpage"` is two concatenated string literals, not one — deliberately. gawk's escape processing mangles a single literal `"\\newpage"` (verified: it silently drops the `n`, producing `\ewpage`), but leaves `"\\" "newpage"` alone. Don't "simplify" this back to one string.

This has to happen at the Markdown level, on the copy, before pandoc ever sees the file — pandoc silently strips HTML comments during conversion (verified: they don't survive into the `.tex` output at all), so there's no marker left to find or convert afterward. The fenced block with the `{=latex}` attribute is pandoc's native raw-passthrough syntax (the `raw_attribute` extension, on by default — no extra flag needed) and becomes a literal `\newpage` in the LaTeX output. `guide/claude-api-web-app-guide.md` itself is never touched by this substitution.

Render from the working copy, not the tracked source, from here on:

```
docker run --rm -v "${PWD}/guide:/data" -w /data pandoc/latex \
  -f markdown+gfm_auto_identifiers \
  output/source.md -o output/claude-api-web-app-guide.pdf \
  -V geometry:margin=1in \
  -V pagestyle=plain --include-in-header=output/pdf-header.tex
```

(On Windows Git Bash, prefix the command with `MSYS_NO_PATHCONV=1` — otherwise Git Bash rewrites the `/data` container path into a bogus host path before Docker ever sees it.)

- Keeping the container's working directory at `/data` (mapped to `guide/` itself, not `guide/output/`) is required, not incidental — the guide's images use guide-relative paths like `assets/example.png`, and those only resolve if pandoc runs from `guide/`. The input (`output/source.md`) and output (`output/claude-api-web-app-guide.pdf`) living one level down, as paths relative to that same working directory, doesn't disturb that resolution.
- `-f markdown+gfm_auto_identifiers` is required, not optional: without it, pandoc generates its own heading identifiers instead of GitHub-style slugs, and every internal link the guide's own anchors depend on — table of contents, cross-references, topical index — silently breaks in the PDF (LaTeX logs it as `Hyper reference ... undefined`) even though the same anchors resolve fine when the file is read as plain Markdown. Confirm the render log has no `undefined` hyper reference warnings before moving on.
- Do not pass `--toc`: the guide already has its own hand-authored `## Table of Contents` section, kept as ordinary Markdown so it also works on GitHub. Pandoc's `--toc` inserts a second, auto-generated table of contents (`\tableofcontents`) ahead of it, so the PDF ends up with two. The manual section is the only one that should exist in either output.
- `-V pagestyle=plain` is what puts a page number on every content page (LaTeX's `plain` page style is number-only, no running headers).
- If a figure is missing or a `SCREENSHOT TODO` slipped through, pandoc will still render — that's what step 1 is for, not this step.

## Step 4 — Add page numbers to the topical index (second pass, same working copy)

The Topical Index (now merged onto the Glossary page, `## Topical Index` right after `## Glossary`) links each term to its section anchor but has no page numbers in the source — Markdown has no concept of a page, and page numbers shift on nearly any edit (a paragraph added, an image resized, a page-break marker moved). Storing them in `guide/claude-api-web-app-guide.md` would make them go stale the moment anything upstream of an entry changes, silently, with nothing to catch it. So they are never written to the tracked source — only injected into `guide/output/source.md`, the same working copy from step 3, on the fly, every time.

Compile the intermediate LaTeX from that working copy — it already has the page breaks applied, which matters here: discovering page numbers from a version *without* the page breaks would give numbers that don't match the final, paginated PDF.

```
docker run --rm -v "${PWD}/guide:/data" -w /data pandoc/latex \
  -f markdown+gfm_auto_identifiers \
  output/source.md -o output/pagenum.tex \
  -V geometry:margin=1in \
  -V pagestyle=plain --include-in-header=output/pdf-header.tex

docker run --rm -v "${PWD}/guide:/data" -w /data --entrypoint sh pandoc/latex -c \
  "pdflatex -interaction=nonstopmode -output-directory=output output/pagenum.tex >/dev/null 2>&1; \
   pdflatex -interaction=nonstopmode -output-directory=output output/pagenum.tex >/dev/null 2>&1"
```

Same flags as step 3 (no `--toc`, same header, same geometry) — the page count has to match exactly, or the numbers this step discovers won't match the PDF step 3 already rendered.

`-output-directory=output` is required: pdflatex otherwise writes its job files (`.aux`/`.log`/`.toc`/`.pdf`, named after the jobname) into the current working directory — `guide/` itself — regardless of which subdirectory the `.tex` source lives in, which would leak build output back out of `output/`. Keeping the container's working directory at `/data` (not `/data/output`) is still what makes `assets/...` resolve, exactly as in step 3.

Run `pdflatex` twice — the first pass writes `output/pagenum.aux`, the second resolves cross-references against it, which is when the page numbers actually land. `output/pagenum.aux` now has one `\newlabel{<slug>}{{...}{<page>}...}` line per heading. For a given Topical Index anchor:

```
grep -oE "newlabel\{<slug>\}\{\{[^}]*\}\{[0-9]+\}" guide/output/pagenum.aux | head -1
```

pulls the exact page. Collect one of these per anchor used in `## Topical Index`.

Edit `guide/output/source.md`'s `## Topical Index` list to append `— p. <N>` to each entry, using the numbers just collected (stop at the next `## ` heading — the same anchors can appear earlier, e.g. in the Table of Contents, and those must stay untouched). `guide/claude-api-web-app-guide.md` itself is never edited by this step.

Re-render the final PDF from the working copy with the exact step 3 render command (`output/source.md -o output/claude-api-web-app-guide.pdf`), so the shipped PDF's index matches the page numbers actually printed in it.

## Step 5 — Inspect the rendered PDF

Before opening anything visually, get a fast, exact signal on width overflow from pdflatex's own log — reuse the same `output/pagenum.*` compile from step 4 (or redo it if `output/` was wiped) and check:

```
grep -n "Overfull \\\\hbox" guide/output/pagenum.log
```

`Overfull \hbox` means a line is wider than its column/page and will visibly clip past the margin in the PDF — most often an unhyphenatable compound term (e.g. `Authentication/authorization`) stuck in an auto-sized table column. This is a real, exact defect, not a false positive: if it fires, the fix is in the Markdown source (rephrase the cell, shorten the term, or narrow the table), not a pandoc flag — flag it back to `update-guide` rather than patching around it here. This log check catches width problems; it does not replace visually checking page breaks, since pdflatex doesn't warn about an otherwise-valid page break landing at an awkward spot.

Then open the final, index-updated `guide/output/claude-api-web-app-guide.pdf` and check what only shows up once it's paginated:

- Every heading in the fixed pagination convention (step 3) actually starts a fresh page, and the sections meant to share one (Title+Revision History+Abstract; Introduction+How to Use This Guide; Glossary+Topical Index) do share it rather than each forcing their own break.
- Glossary+Topical Index and Introduction are allowed to spill onto a second page if they're long — the convention guarantees a *fresh* page, not a strict one-page limit, and content should never be trimmed just to force a page count.
- No paragraph is split with only a line or two stranded at the top or bottom of a page — confirm the `pdf-header.tex` penalties actually took effect; if a bad break still slipped through, rephrase or resize the surrounding content rather than fighting it in LaTeX.
- Page breaks don't land mid-code-block or split a table awkwardly.
- Code blocks wrap or shrink instead of clipping off the page edge.
- Tables stay narrow enough to read without horizontal scrolling.
- Callouts/admonitions (if any) render distinctly from body text.
- Images are legible at their rendered size and resolution.
- Every content page shows a page number, and the Topical Index's printed numbers match where each term actually lands.
- The topical index and table of contents are usable as navigation, not just present.

If something fails here, it's usually a Markdown authoring fix (narrower table, shorter code lines, split paragraph, a missing or misplaced `PAGEBREAK` marker) rather than a pandoc flag — fix it in the source and re-render from step 3.

The final deliverable is `guide/output/claude-api-web-app-guide.pdf`. It's a build artifact, not a source file, so it stays out of git along with everything else under `guide/output/`; hand it to wherever the guide gets published from.
