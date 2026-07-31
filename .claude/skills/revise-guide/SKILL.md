---
name: revise-guide
description: Use this skill to close out a round of edits to guide/guide.md as a new publishable revision — for example "cut a new revision of the guide", "publish the guide", "check the guide before release", or "convert the guide to PDF". Runs the pre-publication checks, bumps the revision metadata, and renders the PDF. Not for adding or changing guide content — see update-guide for that.
---

# Publishing a new revision of the guide

`update-guide` is for authoring: adding or changing content in `guide/guide.md`. This skill is for the separate act of turning a batch of those edits into a new numbered, dated, PDF-rendered revision. Run it after content edits are done, not while still drafting.

## Precondition

Only run this once the edits for the revision are actually finished. If content is still being drafted or a requested change hasn't been made yet, that's `update-guide`'s job — come back here afterward.

## Step 1 — Pre-publication checks

Work through all of these against `guide/guide.md` before touching version metadata or rendering anything:

- No `SCREENSHOT TODO` is left unresolved — each either has a real image in place at its `assets/` path (see `update-guide`'s resolution step) or a deliberate decision to drop the figure and its dependent prose.
- Internal links (table of contents, cross-references) and image paths still resolve, and every `Chapter N` mention in running prose still names the chapter it means — a renumbering leaves those pointing at the wrong chapter while every link still resolves.
- Every technical claim about model/API behavior or limits is accurate against current Anthropic documentation, and every link still resolves. **This is the check the guide's dating convention rests on.** The guide carries no per-claim access dates by design (`update-guide` forbids them); instead `References` states that every reference and link was checked on this revision's publication date. Cutting a revision without actually re-verifying makes that statement false for the whole document rather than stale in one paragraph, so this bullet is not a formality — work through the cited pages and confirm the numbers, names, and behaviors the guide asserts.
- Code and request/response examples match the API shape described in the cited documentation.
- No repo-specific names, slugs, routes, or file paths leaked in, except where the repo is explicitly and deliberately named as an optional case study.
- The content reads as generalized guidance, not a restatement of one lab's specific implementation.
- Every heading that should start a fresh PDF page has its `<!-- PAGEBREAK -->` marker immediately before it (see the fixed pagination convention in step 3) — a new chapter or appendix added without one will silently share the previous section's page.
- **References** is reconciled against the guide's current full content: does it still cover what's actually cited across chapters, and nothing that isn't? This section is deliberately *not* touched during ordinary chapter edits (that's `update-guide`'s restraint, not an oversight) — this is the one place it gets revisited, so it's also the one place its staleness would otherwise go unnoticed. Title/subtitle, Abstract, and Introduction are different: `update-guide` already checks those on every content edit, so they shouldn't be stale here — but a quick sanity check against the guide's current full content is still worth doing before cutting a revision.

Fix anything that fails before proceeding — don't render a PDF from a guide that still has open issues.

**Explicit preview exception.** If the user explicitly asks to cut a revision anyway despite a known-failing check — most commonly "cut it without the images for now, I want to look at the structure" — that's a deliberate, one-off preview, not a real publish. State plainly which check is being skipped and why, then proceed through the remaining steps normally. Treat the result as disposable: if the user later asks to revert it, undo it completely — remove the row Step 2 added to `## Revision History` and delete the rendered PDF from `guide/output/` — so no trace of the test revision remains in either the tracked source or the build output.

## Step 2 — Bump the revision metadata

`guide/guide.md` has a `## Revision History` table right below the title, with columns `Version | Date | Changelog` — no author column; the table records what changed and when, not who made the change. It's the single source of truth for version and date — there is no separate title-page metadata block to keep in sync with it. Every revision adds exactly one row. Propose both fields for the user to confirm or override:

- Suggested version: increment from the highest version currently in the table (e.g. `0.1` → `0.2`), keeping a `(working draft)` suffix on the version number until told otherwise. Drop the suffix, and move toward `1.0`, only on explicit direction that the guide is past its working-draft phase.
- Suggested changelog: one sentence, concrete about what actually changed since the last row — based on the edits made this session, or `git diff` against the guide file if the session doesn't have that context. Don't write a generic "updates" placeholder.

**Compute the target PDF filename and check for a collision before confirming.** The rendered PDF's name encodes the version: `claude-api-features-<version>.pdf`, with the version's dots replaced by dashes and any `(working draft)` suffix dropped — e.g. version `0.2 (working draft)` becomes `claude-api-features-0-2.pdf`. Check whether `guide/output/claude-api-features-<version>.pdf` already exists (most likely because a previous attempt at this exact version was left in place after step 5 didn't pass, per step 6's note that this is expected). If it does, ask the user:

- **Substitute** — proceed as normal; this run's render overwrites that file.
- **Create a new revision instead** — pick a different (usually incremented) version number, which targets a different filename and avoids the collision entirely.

Don't silently overwrite an existing target file without asking.

Once the version is confirmed, append the new row to `## Revision History` with today's date, keeping the existing column-width formatting (see step 3's table-formatting note — it's set once in the separator row and a new row doesn't need to repeat it). That's the entire metadata update for this step.

## Step 3 — Prepare the working copy and render (first pass)

Convert the Markdown to PDF with a containerized `pandoc` so no local install is required, matching this repo's usual Docker-only tooling pattern. Everything this and the following steps generate goes under `guide/output/`, which is entirely gitignored (`guide/output/`) — nothing under it is source.

Don't delete or regenerate anything under `guide/output/` mid-process. Every file created along the way (the Dockerfile, `pdf-header.tex`, the working copy, every `pagenum.*` intermediate, any other scratch file a render or a debugging step needs) stays in place until step 6's final cleanup — later steps re-read earlier output (page numbers from `pagenum.aux`, warnings from `pagenum.log`), and deleting early just forces redoing work that's already done. Create whatever temporary files rendering or troubleshooting actually needs; nothing here is limited to a fixed named set.

**Fixed pagination convention.** The guide has a fixed front-matter layout and a "each major section starts on its own page" rule for everything after it: Title+Revision History+Abstract share page 1, and every other `##` section gets its own page from there on — Table of Contents, Introduction, each numbered chapter, Putting It Together, References, and any Appendix. This is encoded as an `<!-- PAGEBREAK -->` HTML comment on its own line immediately before every heading that should start fresh — invisible on GitHub (comments don't render), meaningless to a plain Markdown reader, but this step turns it into a real page break for the PDF. `update-guide` is responsible for keeping a marker in place before any new chapter/appendix-level heading; step 1 checks that.

This convention costs roughly half a page of trailing whitespace per section, which is the intended trade. If a page-count target is ever in play, note that removing or merging a section saves that whitespace on top of its own content — but never delete a `PAGEBREAK` to reclaim it while leaving the section in place.

**Centering convention.** The title and subtitle are wrapped in a paired `<!-- CENTER -->` / `<!-- /CENTER -->` HTML comment — same idea as `PAGEBREAK`, invisible on GitHub, meaningless to a plain Markdown reader, resolved into real LaTeX centering only in this working copy at render time.

Create the directory and the working copy:

```
mkdir -p guide/output
cp guide/guide.md guide/output/source.md
```

**Build the render image once.** The stock `pandoc/latex` image is missing the font packages this guide's PDF uses (verified: `mathpazo`/`tgtermes`/etc. fail to load — the `.sty` loads but the actual Type 1 font metrics aren't installed, so text silently falls back to `nullfont` and prints as nothing). Write a small Dockerfile and build a tagged image from it — Docker's build cache makes every build after the first nearly instant, since the Dockerfile content never changes:

```dockerfile
FROM pandoc/latex
RUN tlmgr update --self && tlmgr install collection-fontsrecommended tex-gyre
```

Save that as `guide/output/Dockerfile`, then:

```
docker build -t claude-labs-guide-pdf -f guide/output/Dockerfile guide/output
```

Every `docker run` from here on in this skill uses `claude-labs-guide-pdf`, not `pandoc/latex` directly.

Now write the small LaTeX header pandoc needs at render time, as `guide/output/pdf-header.tex`:

```latex
\usepackage{tgtermes}
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\fancyfoot[R]{\thepage}
\renewcommand{\headrulewidth}{0pt}
\clubpenalty=10000
\widowpenalty=10000
```

- `tgtermes` (TeX Gyre Termes, a Times-metric-compatible serif face) replaces LaTeX's default Computer Modern with a more conventional business/report typeface. If a different look is wanted later, swapping this one line for `tgpagella` (Palatino-like) or `mathpazo` is enough — all three were verified to work once the image above is built.
- `fancyhdr` puts the page number at the bottom **right** instead of LaTeX's default bottom-center: `\fancyhf{}` clears the default header/footer, `\fancyfoot[R]{\thepage}` places just the page number on the right, and `\renewcommand{\headrulewidth}{0pt}` removes the header rule `fancy` would otherwise draw (there's no header content, so a rule under nothing would look like a stray line). This fully replaces the earlier `-V pagestyle=plain` approach — don't pass that variable anymore, it would fight with `\pagestyle{fancy}`.
- `\clubpenalty` and `\widowpenalty` are core TeX primitives (no extra package needed) that forbid a paragraph break from leaving only its first or last line stranded alone on a page — the mechanism behind "no paragraph split across two pages." Setting both to the maximum forces LaTeX to push the whole paragraph to the next page instead.

**Table formatting convention.** Pandoc sizes a Markdown pipe table's columns in the PDF proportionally to the dash-count in each column's separator segment, not to actual content — equal dashes give equal width regardless of content length. `## Revision History`'s separator row (`|------------|--------------|:---...---:|`) is deliberately skewed: short runs for `Version`/`Date` (~12%/~14% of the page width) and a long run for `Changelog` (~74%), with `:---:` centering that column's content. Don't "clean up" those dashes back to a plain `|---|---|---|` — that regresses to equal-width columns and was verified to cause `Overfull \hbox` warnings (the narrow `Version`/`Date` columns can't fit their own content, let alone a real value like `2026-07-27`).

Now convert every marker in the working copy into real LaTeX, in place — both `PAGEBREAK` and the `CENTER` pair:

```
awk '{
  if ($0 == "<!-- PAGEBREAK -->")  { print "```{=latex}"; print "\\" "newpage";        print "```" }
  else if ($0 == "<!-- CENTER -->") { print "```{=latex}"; print "\\" "begin{center}"; print "```" }
  else if ($0 == "<!-- /CENTER -->") { print "```{=latex}"; print "\\" "end{center}";   print "```" }
  else { print }
}' guide/output/source.md > guide/output/source.md.tmp && mv guide/output/source.md.tmp guide/output/source.md
```

Every LaTeX command string here is two concatenated literals (`"\\" "newpage"`, not `"\\newpage"`) — deliberately. gawk's escape processing mangles a single literal `"\\newpage"` (verified: it silently drops the `n`, producing `\ewpage`), but leaves the concatenated form alone. Don't "simplify" any of these back to one string.

This has to happen at the Markdown level, on the copy, before pandoc ever sees the file — pandoc silently strips HTML comments during conversion (verified: they don't survive into the `.tex` output at all), so there's no marker left to find or convert afterward. The fenced block with the `{=latex}` attribute is pandoc's native raw-passthrough syntax (the `raw_attribute` extension, on by default — no extra flag needed) and becomes a literal `\newpage` in the LaTeX output. `guide/guide.md` itself is never touched by this substitution.

Render from the working copy, not the tracked source, from here on, into the target filename computed in step 2 (`claude-api-features-<version>.pdf`, e.g. `claude-api-features-0-2.pdf`):

```
docker run --rm -v "${PWD}/guide:/data" -w /data claude-labs-guide-pdf \
  -f markdown+gfm_auto_identifiers \
  output/source.md -o output/claude-api-features-<version>.pdf \
  -V geometry:margin=1in --include-in-header=output/pdf-header.tex \
  -V colorlinks=true -V linkcolor=blue -V urlcolor=blue
```

(On Windows Git Bash, prefix the command with `MSYS_NO_PATHCONV=1` — otherwise Git Bash rewrites the `/data` container path into a bogus host path before Docker ever sees it.)

- Keeping the container's working directory at `/data` (mapped to `guide/` itself, not `guide/output/`) is required, not incidental — the guide's images use guide-relative paths like `assets/example.png`, and those only resolve if pandoc runs from `guide/`. The input (`output/source.md`) and output (`output/claude-api-features-<version>.pdf`) living one level down, as paths relative to that same working directory, doesn't disturb that resolution.
- `-f markdown+gfm_auto_identifiers` is required, not optional: without it, pandoc generates its own heading identifiers instead of GitHub-style slugs, and every internal link the guide's own anchors depend on — table of contents, cross-references — silently breaks in the PDF (LaTeX logs it as `Hyper reference ... undefined`) even though the same anchors resolve fine when the file is read as plain Markdown. Confirm the render log has no `undefined` hyper reference warnings before moving on.
- Do not pass `--toc`: the guide already has its own hand-authored `## Table of Contents` section, kept as ordinary Markdown so it also works on GitHub. Pandoc's `--toc` inserts a second, auto-generated table of contents (`\tableofcontents`) ahead of it, so the PDF ends up with two. The manual section is the only one that should exist in either output.
- `-V colorlinks=true -V linkcolor=blue -V urlcolor=blue` makes every hyperlink — internal cross-references and external URLs alike — render in blue instead of unstyled black text, so a reader can tell something is a link before clicking it. `colorlinks=true` also removes hyperref's default behavior of drawing a colored box around links, which looks worse in print than plain colored text.
- If a figure is missing or a `SCREENSHOT TODO` slipped through, pandoc will still render — that's what step 1 is for, not this step.

## Step 4 — Add page numbers to the Table of Contents (second pass, same working copy)

The Table of Contents (`## Table of Contents`) links to a section anchor but has no page numbers in the source — Markdown has no concept of a page, and page numbers shift on nearly any edit (a paragraph added, an image resized, a page-break marker moved). Storing them in `guide/guide.md` would make them go stale the moment anything upstream of an entry changes, silently, with nothing to catch it. So they are never written to the tracked source — only injected into `guide/output/source.md`, the same working copy from step 3, on the fly, every time.

Compile the intermediate LaTeX from that working copy — it already has the page breaks applied, which matters here: discovering page numbers from a version *without* the page breaks would give numbers that don't match the final, paginated PDF.

```
docker run --rm -v "${PWD}/guide:/data" -w /data claude-labs-guide-pdf \
  -f markdown+gfm_auto_identifiers \
  output/source.md -o output/pagenum.tex \
  -V geometry:margin=1in --include-in-header=output/pdf-header.tex \
  -V colorlinks=true -V linkcolor=blue -V urlcolor=blue

docker run --rm -v "${PWD}/guide:/data" -w /data --entrypoint sh claude-labs-guide-pdf -c \
  "pdflatex -interaction=nonstopmode -output-directory=output output/pagenum.tex >/dev/null 2>&1; \
   pdflatex -interaction=nonstopmode -output-directory=output output/pagenum.tex >/dev/null 2>&1"
```

Same flags as step 3 (no `--toc`, same header, same geometry, same image) — the page count has to match exactly, or the numbers this step discovers won't match the PDF step 3 already rendered.

`-output-directory=output` is required: pdflatex otherwise writes its job files (`.aux`/`.log`/`.toc`/`.pdf`, named after the jobname) into the current working directory — `guide/` itself — regardless of which subdirectory the `.tex` source lives in, which would leak build output back out of `output/`. Keeping the container's working directory at `/data` (not `/data/output`) is still what makes `assets/...` resolve, exactly as in step 3.

Run `pdflatex` twice — the first pass writes `output/pagenum.aux`, the second resolves cross-references against it, which is when the page numbers actually land. `output/pagenum.aux` now has one `\newlabel{<slug>}{{...}{<page>}...}` line per heading. For a given anchor:

```
grep -oE "newlabel\{<slug>\}\{\{[^}]*\}\{[0-9]+\}" guide/output/pagenum.aux | head -1
```

pulls the exact page. Collect one of these per anchor used in `## Table of Contents`.

Edit `guide/output/source.md`'s `## Table of Contents` list, appending `— p. <N>` to each entry using the numbers just collected. Bound the edit to that section (stop at the next `## ` heading). `guide/guide.md` itself is never edited by this step.

Re-render the final PDF from the working copy with the exact step 3 render command (`output/source.md -o output/claude-api-features-<version>.pdf`), so the shipped PDF's ToC matches the page numbers actually printed in it.

## Step 5 — Inspect the rendered PDF

Before opening anything visually, get a fast, exact signal on width overflow from pdflatex's own log — reuse the same `output/pagenum.*` compile from step 4 (or redo it if `output/` was wiped) and check:

```
grep -n "Overfull \\\\hbox" guide/output/pagenum.log
```

`Overfull \hbox` means a line is wider than its column/page and will visibly clip past the margin in the PDF — most often an unhyphenatable compound term (e.g. `Authentication/authorization`) stuck in an auto-sized table column. This is a real, exact defect, not a false positive: if it fires, the fix is in the Markdown source (rephrase the cell, shorten the term, or narrow the table), not a pandoc flag — flag it back to `update-guide` rather than patching around it here. This log check catches width problems; it does not replace visually checking page breaks, since pdflatex doesn't warn about an otherwise-valid page break landing at an awkward spot.

If this environment can't render PDF pages for visual inspection (no `pdftoppm`/`poppler-utils` available), the log-based checks above still run in full, but the visual checklist below has to be done by the user directly — say so plainly rather than silently skipping it or claiming the visual pass happened.

Then open the final, index-updated `guide/output/claude-api-features-<version>.pdf` and check what only shows up once it's paginated:

- Every heading in the fixed pagination convention (step 3) actually starts a fresh page, and the one pairing meant to share one (Title+Revision History+Abstract) does share it.
- The title and subtitle actually render centered, not left-aligned — confirms the `CENTER` marker substitution took effect.
- Any section is allowed to spill onto a further page if it's long — the convention guarantees a *fresh* page, not a strict one-page limit, and content should never be trimmed just to force a page count.
- No paragraph is split with only a line or two stranded at the top or bottom of a page — confirm the `pdf-header.tex` penalties actually took effect; if a bad break still slipped through, rephrase or resize the surrounding content rather than fighting it in LaTeX.
- Page breaks don't land mid-code-block or split a table awkwardly.
- Code blocks wrap or shrink instead of clipping off the page edge.
- The `## Revision History` table isn't a cramped, equal-width block — Version/Date stay narrow and Changelog fills the remaining width with centered text.
- Every other table stays narrow enough to read without horizontal scrolling.
- Callouts/admonitions (if any) render distinctly from body text.
- Images are legible at their rendered size and resolution.
- The body text is set in the professional serif face configured in `pdf-header.tex`, not the default Computer Modern — if any text looks blank/missing, that's the `nullfont` fallback from a font package that didn't load; rebuild `claude-labs-guide-pdf` and check the log for `not loadable`.
- Every content page shows a page number in the **bottom-right** corner, not centered.
- The Table of Contents shows page numbers, those numbers match where each entry actually lands, and it is usable as navigation rather than merely present.
- Internal cross-reference links and external URLs are visibly colored (blue), not plain black text indistinguishable from body prose.

If something fails here, it's usually a Markdown authoring fix (narrower table, shorter code lines, split paragraph, a missing or misplaced `PAGEBREAK` marker) rather than a pandoc flag — fix it in the source and re-render from step 3. Once these checks are done, move straight to step 6 — cleanup is automatic and doesn't wait for a separate explicit approval.

## Step 6 — Clean up

Delete everything under `guide/output/` except this run's target PDF (from step 2, `claude-api-features-<version>.pdf`) — the Dockerfile, `pdf-header.tex`, the working copy, every `pagenum.*` file, and any other scratch file picked up along the way. Do this right after step 5, every time, without pausing for the user to accept the PDF first. This also removes any differently-named PDF a previous, separate revision might have left behind — `guide/output/` only ever holds the current revision's deliverable, not an accumulating history of past ones (that history lives in `## Revision History`, not as files):

```
find guide/output -mindepth 1 ! -name 'claude-api-features-<version>.pdf' -delete
```

`guide/output/` is gitignored either way, so leaving the intermediates around wouldn't leak into git — this is purely about not handing back a folder cluttered with build byproducts. The final deliverable is a build artifact rather than a source file, so it stays out of git too; hand it to wherever the guide gets published from. If a later look at the delivered PDF turns up something that still needs fixing, that's a normal return to step 3 (or `update-guide` for a content fix) followed by a fresh render — not a reason to have held onto the intermediates from this run.
