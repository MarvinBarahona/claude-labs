# Task — Project Scaffold

**Status:** In progress.

## Purpose

The literal starting point of the repository: an Angular frontend project and a NestJS backend project actually created, wired together through Docker Compose exactly as `tech-stack.md` and `architecture.md` already decided, and proven to actually talk to each other with one minimal end-to-end request — not just two containers that each start independently. [`task-env-config.md`](task-env-config.md)'s own plan already assumes "the backend project scaffold" exists before it can be built; this task is what makes that assumption true, so it comes before every other task and feature in the project.

## Interface

Not a service with a call interface — this task's "interface" is the repo state it leaves behind:

- `frontend/` — an Angular project (latest version, standalone components) with Spartan/ng installed and its tooling wired in, per `tech-stack.md`.
- `backend/` — a NestJS project on the Express adapter, with Zod and `@nestjs/axios` present as dependencies (wiring them into real config/data-source code is later tasks' job — this task only needs them installed), per `tech-stack.md`.
- A root `docker-compose.yml` running both together, with the frontend container running `ng serve` and a dev-server proxy forwarding the backend's route prefix to the backend container over Compose's service-name DNS — no CORS, no separate reverse-proxy container — per `architecture.md`'s "Communication boundaries" section.
- One minimal backend route plus one minimal frontend call exercising it, proving a request actually crosses the proxy end to end.
- A working test command for each project (whatever the respective CLI scaffolds by default) that runs using only placeholder environment values — building and testing the project never requires a real credential, per `testing-strategy.md`.

## Consumers

Every other task and feature in the project — nothing can be built until the two project scaffolds and their Docker wiring exist. [`task-env-config.md`](task-env-config.md) is the most immediate consumer, since it's the very next thing built.

## Build order & dependencies

The very first thing built in the entire project, before [`task-env-config.md`](task-env-config.md) and everything after it (see `status.md` for current position). No dependencies on any other work item — it draws only on already-decided standing documentation: `tech-stack.md` (frameworks, chosen libraries, the dev-server-proxy runtime model), `architecture.md`'s "Communication boundaries" section (the same-origin connectivity rule this task's Docker Compose setup must satisfy), and `testing-strategy.md` (the no-real-credentials rule this task's own test command must already satisfy).

## Test scenarios

- [x] `docker compose up` from a clean checkout starts both containers with no manual steps beyond that one command.
- [x] The frontend's origin serves the Angular app shell.
- [x] The frontend's smoke-test call reaches the backend's smoke-test route through the dev-server proxy and its response renders in the browser — proving requests actually cross the Compose network, not just that each container starts independently.
- [x] Stopping and restarting `docker compose up` reaches the same working state, with no leftover state from the previous run.
- [x] Each project's test command runs successfully using only placeholder environment values — no real `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, or other credential is required to build or test the project.

## To-do list

- [x] Scaffold the Angular project in `frontend/` (latest Angular, standalone components, per `angular-conventions`).
- [x] Install and wire in Spartan/ng per `tech-stack.md`.
- [x] Scaffold the NestJS project in `backend/` on the Express adapter, per `tech-stack.md`.
- [x] Add Zod and `@nestjs/axios` as backend dependencies (not wired into real code yet — that's `task-env-config.md`'s and later data-source tasks' job).
- [x] Write the root `docker-compose.yml`: both containers, the frontend's dev-server proxy forwarding to the backend over Compose service-name DNS, per `architecture.md`.
- [x] Add one minimal backend route and one minimal frontend call exercising it, as the end-to-end smoke test.
- [x] Confirm `docker compose up` from a clean checkout reaches a working state with no extra manual steps.
- [x] Confirm each project's test command runs with placeholder-only environment values, per `testing-strategy.md` — no real credential required.

## Open questions

None. Resolved: `backend/.env.example` is entirely [`task-env-config.md`](task-env-config.md)'s to-do (see its own to-do list) — this task's scaffold doesn't need any real environment variable, so its to-do list above deliberately doesn't include it.

## Development notes

- **[technical: fixed a real gap]** The original `docker-compose.yml` bind-mounted each project's whole directory over `/app`, which **replaces** (not merges with) whatever the image built via `RUN npm install` — so it only "worked" because `node_modules` already existed on the host from this session's own scaffolding steps. A genuine fresh clone (`node_modules` is gitignored) would have hit an empty bind mount and failed to start, despite this task's test scenarios claiming a clean-checkout `docker compose up` was verified. Fixed by adding a named volume per project, layered over the bind mount and scoped to just `node_modules` (`backend_node_modules:/app/node_modules`, `frontend_node_modules:/app/node_modules` — the more specific path wins over the bind mount underneath it). Docker auto-seeds an empty named volume from the image's own build-time `node_modules` on first container creation, so the host never needs it at all. Re-verified end to end with host `node_modules` actually deleted (not just assumed absent): `docker compose up --build` still reached a working state, and `ls` on the host afterward shows `node_modules` as an empty directory (just the bind-mount stub) — real package content lives entirely in the named volume. **Caveat:** because the volume persists, changing `package.json` requires `docker compose down -v` (or removing that volume) alongside `--build` for the new dependencies to actually take effect — plain `--build` rebuilds the image but won't refresh an already-populated volume.
- **[technical: tech-stack.md]** Getting `node_modules` off the Windows bind mount and into a native Docker volume wasn't just a correctness fix — it measurably fixed the slowness this task hit repeatedly (multiple multi-minute `npm install`s, `ENOTEMPTY`/`ERR_INVALID_ARG_TYPE` rename races, a Vitest worker-pool timeout). Same test, same machine: frontend unit tests went from ~40-60s down to ~1.3s, and the Angular dev-server's initial build from ~10-14s down to ~2s, once run against the named-volume setup instead of the old plain bind mount. Worth noting in `tech-stack.md`'s Docker runtime bullet as the reason `node_modules` is volume-isolated, not bind-mounted, for anyone tempted to simplify it back to a single bind mount.
- **[technical: architecture.md or tech-stack.md]** Added a `healthcheck` to both Compose services (backend: hits its own `/api/smoke-test`; frontend: hits `/`) plus `depends_on: backend: condition: service_healthy` on the frontend, replacing the old plain `depends_on: - backend` (which only waited for the backend *container to start*, not for Nest to actually finish booting). This closes a real race also seen in this task's own logs: the frontend dev server proxying `ECONNREFUSED` for a few hundred ms right after startup because the backend hadn't finished initializing yet. It also gives `docker compose ps`/`docker ps` a visible `(healthy)` status instead of requiring a log read to know the app is actually up — worth documenting since it's a decision (real readiness gating, not just "container running") future services should follow rather than plain `depends_on`.
- **[non-owned-file: CLAUDE.md]** `tech-stack.md` already says "`CLAUDE.md` carries the actual `docker compose` commands once the projects are scaffolded" — that's now true, so CLAUDE.md needs a "Running the app" section. Suggested content (no real credential needed yet — `task-env-config.md` is what introduces `backend/.env`):

  ```md
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

  All three use only placeholder environment values — no real credential is needed to build or test either project.
  ```

  Not `testing-strategy.md`'s job to carry these — that file is explicitly scoped to strategy/decisions ("see `nest-conventions`/`angular-conventions` for the general test-writing mechanics ... this file only covers what those don't"), matching `technical.md`'s own decisions-only framing. All three commands were re-verified cleanly (no concurrent sessions) after the named-volume fix above; an earlier Vitest worker-pool timeout on the frontend command was confirmed to be CPU contention from a separate `docker compose up` session running at the same time, not a broken command.

- **[non-owned-file: README.md]** README.md's Stack line says "run exclusively via Docker Compose. See `technical.md` for details" but `technical.md` is a decisions index with no run commands — it only links to `tech-stack.md`, `repo-layout.md`, etc., none of which carry the actual command. Either point README's "See `technical.md` for details" at CLAUDE.md's new "Running the app" section instead, or give README its own one-line quick start (`docker compose up --build`, then the two URLs above) so it's not a dead-end pointer. Verified during this task, including from a truly clean checkout (host `node_modules` actually deleted, not just assumed absent): `docker compose up --build` reaches a working state with no extra manual steps, and stopping/restarting (`docker compose down` + `docker compose up`, with or without `--build`) reaches the same state again.

- **[technical: tech-stack.md]** Add a line to the Spartan/ng bullet: generating a new primitive via `ng g @spartan-ng/cli:ui <name>` requires a `frontend/components.json` (this task created one: `{ "componentsPath": "libs/ui", "style": "vega", "importAlias": "@spartan-ng/helm" }`) to exist first, or the generator prompts interactively and produces nothing under a non-interactive shell. Every future task/feature that adds a new Spartan primitive needs this — it's not obvious from spartan.ng's own docs, which assume a TTY.
- **[technical: tech-stack.md]** Also worth a line: `@spartan-ng/cli:init` rewrites `package.json`'s `devDependencies` wholesale, which will silently drop a manually-added `@spartan-ng/cli` entry if `init` is ever re-run. Not an issue going forward (init only runs once), but worth flagging so nobody "fixes" a missing `@spartan-ng/cli` dependency by re-running `init`.
- **[technical: no change needed]** `architecture.md`'s "Communication boundaries" section (same-origin via the Angular dev server, no CORS) and `repo-layout.md`'s monorepo layout were both implemented as already written — confirmed by the passing test scenarios above, nothing to amend.
- Not a technical decision, just implementation mechanics already visible in the repo (no doc needed): the concrete `angular.json` serve-target options (`host`, `allowedHosts`, `proxyConfig`) that make the dev-server proxy work, and the `.dockerignore` files needed to keep a Windows-built `node_modules` out of the Docker build context.
