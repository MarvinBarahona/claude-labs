# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@README.md

## Running the app

Everything runs via Docker Compose — no local Node/npm install needed, even for a fresh clone.

- `docker compose up --build` — first run, or after a dependency (`package.json`) change
- `docker compose up` — subsequent runs (fast — reuses the built image and installed dependencies)
- `docker compose down` — stop and remove containers
- If dependencies changed and `--build` alone doesn't seem to pick them up, also run `docker compose down -v` first — `node_modules` lives in a named volume that persists across restarts and isn't refreshed by `--build` alone.

`docker compose ps` shows `(healthy)` once both services are actually ready to use, not just started.

Frontend: http://localhost:4200
Backend: http://localhost:3000 (also reachable through the frontend's dev-server proxy at http://localhost:4200/api/...)

## Running tests

Also Docker-only — run a project's test command in its own container without starting the whole stack:

- `docker compose run --rm backend npm test` — backend unit tests
- `docker compose run --rm backend npm run test:e2e` — backend integration tests
- `docker compose run --rm frontend npm test -- --watch=false` — frontend unit tests
- `docker compose run --rm backend npm run lint` — type-aware lint; run this too before calling backend work verified, since `npm test` alone (`ts-jest` with `isolatedModules: true`) doesn't type-check and can pass with a genuine type error present

All four use only placeholder environment values — no real credential is needed to build or test either project.

## Git

Never run `git commit` as an automatic follow-on to finishing some other piece of work, no matter how many files it left changed. Only commit when the user's current message explicitly asks for it. Finishing a task is never, by itself, a request to commit.
