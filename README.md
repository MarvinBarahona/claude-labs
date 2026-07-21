# Claude Labs

A full-stack reference app exercising every major Claude API feature — tool use, server-side tools, MCP connector, extended thinking, multimodal input, prompt caching, the four workflow patterns (evaluator-optimizer, parallelization, chaining, routing), and one deliberate agent example — against real public data sources. Each lab's doc renders inline next to its live demo: a working demo and self-contained documentation in one. A hands-on companion to Anthropic's official Claude API docs — real requests/responses to try yourself — not a replacement for reading them.

**Live demo:** https://claude-labs-demo-325114792854.us-central1.run.app — always fake mode, so it's safe to click around freely; no real credential is ever involved.

**Status:** see [`status.md`](docs/status.md).

**Stack:** Angular (frontend) + NestJS (backend), run exclusively via Docker Compose. See [`technical.md`](docs/technical/technical.md) for details.

**Quick start** (running the app for real, against your own key — see "Modes" below):

```
cp backend/.env.example backend/.env
```

Set a real `ANTHROPIC_API_KEY` in `backend/.env`, then:

```
docker compose -f docker-compose.prod.yml up --build
```

`--build` is only needed the first time — omit it on later starts for a faster boot.

App: http://localhost:3000

## Modes

Independent axes, always exactly one of each: **mode** — fake (`FAKE_MODE=true`, every external call swapped for a fake, no real credential ever read, valid or not) vs. real (default; needs a genuine `ANTHROPIC_API_KEY` — a missing/invalid key is caught proactively and shown as an in-app banner, a valid one makes every feature actually call Claude) — and **stack** — dev vs. prod.

|  | Dev (`docker-compose.dev.yml`) | Prod (`docker-compose.prod.yml`) |
|---|---|---|
| Fake | Everyday development | Only mode meant for a public deploy |
| Real | Manual feature testing with a real key | Running the app locally for real, with your own key |

Never give a publicly-reachable instance a real key. Detail: [`fake-mode.md`](docs/shared/fake-mode.md), [`key-health.md`](docs/shared/key-health.md).

## Development

Everything runs via Docker Compose — no local Node/Angular/Nest CLI needed, even for a fresh clone. Dev and prod are separate Compose files; `-f` must always be given — bare `docker compose` doesn't auto-discover either.

- `docker compose -f docker-compose.dev.yml up --build` — first run, or after a dependency (`package.json`) change
- `docker compose -f docker-compose.dev.yml up` — subsequent runs (fast — reuses the built image and installed dependencies)
- `docker compose -f docker-compose.dev.yml down` — stop and remove containers
- If `--build` alone doesn't pick up a dependency change, also run `docker compose -f docker-compose.dev.yml down -v` first — `node_modules` lives in a named volume that persists across restarts and isn't refreshed by `--build` alone.

`docker compose -f docker-compose.dev.yml ps` shows `(healthy)` once both services are actually ready to use, not just started.

See "Modes" above for `FAKE_MODE` — most day-to-day development happens in fake mode, no real credential needed.

**Tests** — run a project's test command in its own container without starting the whole stack:

- `docker compose -f docker-compose.dev.yml run --rm backend npm test` — backend unit tests
- `docker compose -f docker-compose.dev.yml run --rm backend npm run test:e2e` — backend integration tests
- `docker compose -f docker-compose.dev.yml run --rm frontend npm test -- --watch=false` — frontend unit tests
- `docker compose -f docker-compose.dev.yml run --rm e2e` — Playwright browser E2E suite, driving a real browser against the running dev stack; only ever runs against a fake-mode instance (checks `GET /api/mode` before any spec runs)
- `docker compose -f docker-compose.dev.yml run --rm backend npm run lint` — type-aware lint; `npm test` alone (`ts-jest` with `isolatedModules: true`) doesn't type-check, so a genuine type error can slip through the test command alone
- `docker compose -f docker-compose.dev.yml run --rm frontend npm run lint` — Angular/TypeScript style and template-accessibility rules; unlike the backend, frontend `npm test` already type-checks (the Angular compiler, not a transpile-only transform), so this lint step isn't filling a type-check gap the way the backend's is
- `docker compose -f docker-compose.dev.yml run --rm backend npm run build` — a real `nest build` compile; a small class of `tsc` diagnostics passes both the backend's `npm test` and `npm run lint` with zero errors and only surfaces here

Treat all of these as required before calling a change verified, not just `npm test` — lint and (for the backend) build each catch a real class of error `npm test` alone doesn't. All commands use only placeholder environment values — no real credential is needed to build or test either project.

## Production

For running the app (locally or on a server) rather than developing it — compiled build, no dev server, no bind-mounted source:

- `docker compose -f docker-compose.prod.yml up --build` — builds and runs a single container serving the whole app from http://localhost:3000
- `docker compose -f docker-compose.prod.yml down` — stop and remove the container

Reads `backend/.env` the same way dev does — see "Modes" above. Dev and prod bind the same host port (3000), so only one can run at a time on a given machine.
