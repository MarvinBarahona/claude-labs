---
name: commit-job
description: Use this skill when the user asks to "commit the job" or otherwise commit the currently pending changes in this repository. Groups the working tree into atomic, conventional-commit-style commits that tell a coherent history of the project, creates them one at a time, and ends with a summary of what was committed. Does not push, amend, or rewrite history.
---

# Committing the job

A standing instruction for this repository: when asked to commit pending work, don't dump everything into one commit and don't commit file-by-file either — group changes into atomic commits, each telling one coherent piece of the project's story.

## Survey before grouping

Run `git status` and `git diff` (plus `git diff --staged` if anything is already staged) to see the full set of changed, added, and deleted files before deciding anything. Never group files by directory alone — read what actually changed and group by what the change *is*: one work item drafted, one technical decision recorded, one shared piece of tooling added, one bug fixed. Two files in the same folder can belong in different commits; two files in different folders can belong in the same one.

## Grouping into atomic commits

- Each commit is one coherent, self-contained change — something a future reader of `git log` could understand on its own, without needing the commit before or after it to make sense.
- Split unrelated changes into separate commits even if they happened to be worked on in the same session. Combine files that only make sense together (e.g. a plan file and the `status.md` row that registers it) into the same commit.
- Prefer more, smaller commits over fewer, large ones — but don't fragment a single coherent change into pieces that don't stand on their own.
- Never stage with `git add -A` or `git add .`. Stage the exact files that belong to the commit being made, by name.

## Commit message format

- Title: **conventional commit** style — `type(scope): summary`, imperative mood, no trailing period. Pick whichever type actually fits (`feat`, `fix`, `docs`, `refactor`, `test`, `build`, `chore`, `ci`, `style`, `perf`, `revert`); include a scope when it clarifies which part of the project changed, omit it when the type alone is already clear.
- **Never use emojis** — not in the title, not in the body, not anywhere in the commit message.
- Add a body only when something genuinely needs explaining beyond the title — a non-obvious reason, a tradeoff, a caveat. Most commits don't need one; don't pad a body just to have one.

## Execution

- Create the commits one at a time: stage the files for the first group, commit, confirm it succeeded, then move to the next group. Don't stage everything up front and split afterward.
- Follow the repository's standard git safety rules otherwise (no `--no-verify`, no force-push, no amending or rewriting existing history, never push unless separately asked).

## When done

Summarize every commit created, in order — short hash and title for each — so the user can see the resulting history at a glance.
