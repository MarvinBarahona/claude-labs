# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@README.md

## Running the app and tests

See README's "Development" and "Production" sections above (imported via `@README.md`) for the actual commands — dev and prod are separate Compose files and `-f` must always be given; bare `docker compose` doesn't auto-discover either.

Always run `npm run lint` too before calling backend or frontend work verified. For the backend this closes a real gap — `npm test` alone (`ts-jest` with `isolatedModules: true`) doesn't type-check and can pass with a genuine type error present. The frontend's `npm test` already type-checks (the Angular compiler, not a transpile-only transform), so its lint step is for Angular/TypeScript style and template-accessibility rules instead.

## Git

Never run `git commit` as an automatic follow-on to finishing some other piece of work, no matter how many files it left changed. Only commit when the user's current message explicitly asks for it. Finishing a task is never, by itself, a request to commit.
