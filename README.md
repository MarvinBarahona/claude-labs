# Claude Labs

A full-stack reference app that exercises every major Claude API feature (tool use, server-side tools, MCP connector, extended thinking, multimodal input, prompt caching, and the four workflow patterns — evaluator-optimizer, parallelization, chaining, routing — plus one deliberate agent example) against real public data sources. It is meant to serve as both a working demo and self-contained documentation: each lab's doc is rendered inline next to its live demo in the app. It's a hands-on companion to Anthropic's official Claude API documentation — see real requests and responses and try each concept yourself — not a replacement for reading the docs themselves.

**Status:** see [`status.md`](docs/status.md).

**Stack:** Angular (frontend) + NestJS (backend), run exclusively via Docker Compose. See [`technical.md`](docs/technical/technical.md) for details.

**Quick start:**

```
cp backend/.env.example backend/.env
docker compose -f docker-compose.dev.yml up --build
```

Frontend: http://localhost:4200 · Backend: http://localhost:3000

## Development

Everything runs via Docker Compose — no local Node/Angular/Nest CLI install needed, even for a fresh clone. Dev and prod are two separate Compose files, and `-f` must always be given; bare `docker compose` doesn't auto-discover either one.

- `docker compose -f docker-compose.dev.yml up --build` — first run, or after a dependency (`package.json`) change
- `docker compose -f docker-compose.dev.yml up` — subsequent runs (fast — reuses the built image and installed dependencies)
- `docker compose -f docker-compose.dev.yml down` — stop and remove containers
- If dependencies changed and `--build` alone doesn't seem to pick them up, also run `docker compose -f docker-compose.dev.yml down -v` first — `node_modules` lives in a named volume that persists across restarts and isn't refreshed by `--build` alone.

`docker compose -f docker-compose.dev.yml ps` shows `(healthy)` once both services are actually ready to use, not just started.

Set `FAKE_MODE=true` in `backend/.env` to run the app for development or manual exploration without a real credential — every external client is swapped for a fake implementation, so no real `ANTHROPIC_API_KEY` (or other data-source key) is needed.

**Tests** — run a project's test command in its own container without starting the whole stack:

- `docker compose -f docker-compose.dev.yml run --rm backend npm test` — backend unit tests
- `docker compose -f docker-compose.dev.yml run --rm backend npm run test:e2e` — backend integration tests
- `docker compose -f docker-compose.dev.yml run --rm frontend npm test -- --watch=false` — frontend unit tests
- `docker compose -f docker-compose.dev.yml run --rm backend npm run lint` — type-aware lint; `npm test` alone (`ts-jest` with `isolatedModules: true`) doesn't type-check, so a genuine type error can slip through the test command alone

All four use only placeholder environment values — no real credential is needed to build or test either project.

## Production

For just *running* the app (locally or on a server) rather than developing it — a compiled build, no dev server, no bind-mounted source:

- `docker compose -f docker-compose.prod.yml up --build` — builds and runs a single container serving the whole app from http://localhost:3000
- `docker compose -f docker-compose.prod.yml down` — stop and remove the container

Reads `backend/.env` the same way dev does — a real `ANTHROPIC_API_KEY`, or `FAKE_MODE=true`, both work unchanged. Dev and prod bind the same host port (3000), so only one can run at a time on a given machine.
