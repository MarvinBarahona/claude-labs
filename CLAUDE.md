# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@README.md

## Running the app and tests

See README's "Development" and "Production" sections above (imported via `@README.md`) for the actual commands, and its "Tests" list for what each one checks and why — dev and prod are separate Compose files and `-f` must always be given; bare `docker compose` doesn't auto-discover either.

## Git

Never run `git commit` as an automatic follow-on to finishing some other piece of work, no matter how many files it left changed. Only commit when the user's current message explicitly asks for it. Finishing a task is never, by itself, a request to commit.

## Skills

Two skills under `.claude/skills/` belong to this project: `browser-preview-check` (manual visual check of the running app) and `write-lab-doc` (writes or refreshes a lab's in-app documentation). Both are maintained alongside the app and safe to name anywhere in this repo.

Every other skill under `.claude/skills/` is generic tooling — coding-convention guidance, doc-writing rules, a planning/build process, and the like — that happens to be checked into this repo but isn't part of it: treat each one as an outsider, independent of the app's own code and docs. Any of them can be renamed, replaced, or deleted at any time without that being a change to the app, and doing so must never break anything or leave a dangling reference behind. Don't hard-code a reference to one of these by name anywhere outside `.claude/` (docs, `README.md`, this file, or application source comments) — if something one of them enforces genuinely needs to be on record, write it down as a plain rule in the relevant project doc instead of pointing at the skill that happens to enforce it today.
