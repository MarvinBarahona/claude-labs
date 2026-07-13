# Task — Production Docker Configuration

**Status:** Planned.

**Depends on:**

- [`project-scaffold.md`](../shared/project-scaffold.md), "Structure" — the current root `docker-compose.yml` (dev-only today: named-volume `node_modules`, `ng serve` dev server, healthcheck-gated startup) this task adds a second, prod-oriented configuration alongside, without changing.

## Consumers

- [`task-fake-mode.md`](task-fake-mode.md) — still `Planned`, sequenced after this task so it's planned already knowing a second Docker/Compose runtime exists, rather than only against today's single dev config. One of the two ways the prod configuration needs to run is with `FAKE_MODE=true` and only placeholder credentials; fake mode's own mechanism (`AppConfigService.fakeMode`, the DI switch, `GET /api/mode`) is runtime-agnostic per its "Interface," so its own test scenarios verify it once, under dev's `docker compose up`, rather than duplicating each scenario under this task's runtime too — see fake mode's own "Open questions" for why.

## Purpose

Today the app only runs one way: `docker compose up`, which starts both containers in dev mode — `node_modules` in a named volume (fast on repeat runs once dependencies haven't changed, per `CLAUDE.md`), and the frontend served by the Angular CLI dev server (`ng serve`), not a built bundle (`tech-stack.md`).

That's the right setup for active development, but it's not what's wanted for the case of just *running* the app without developing it — locally, or deployed to a server — where a dev server and its overhead aren't needed. This task adds a second, production-ready Docker configuration for that case, alongside (not replacing) the existing dev one.

**Goals, from the person who requested this task:**

- Keep the current dev setup exactly as it is — well-defined, fast on repeat runs, no regressions to the inner dev loop.
- Add a way to run a production-ready version of the app, usable either on a local machine or on a server, that doesn't run in dev/"app" mode (no dev server, no watch mode) when the point is just to run the app rather than develop it.
- That prod-ready version needs to support both of the app's credential modes once fake mode exists: with `FAKE_MODE` on and no real API key, or with a real `ANTHROPIC_API_KEY`.
- This should be a distinct Docker configuration from the dev one (a separate compose file and/or Dockerfile target), not a flag bolted onto the existing dev setup.

## Interface

- **Frontend serving:** the backend serves the Angular production build's static files directly, rather than a separate Nginx/static-file container. In prod, the app is a single container/single service — one origin trivially, no proxy config to write or maintain (see "Write decisions back" below for the corresponding `architecture.md`/`tech-stack.md` updates). NestJS's `@nestjs/serve-static` (`ServeStaticModule`) serves the built Angular assets, excluding the existing `/api` prefix (`app.setGlobalPrefix('api')`, per `project-scaffold.md`) so API routing is unaffected; unmatched non-`/api` routes fall back to `index.html` so Angular's own client-side routing still works on a hard refresh or deep link.
- **Build:** a new root-level `Dockerfile.prod`, multi-stage: one stage builds the Angular app for production (`ng build`), another builds the compiled Nest output (`nest build`), and a final slim runtime stage copies both build outputs plus production-only backend `node_modules` — installed straight into the image, no bind mount, no named volume (that volume's whole purpose in dev, per `tech-stack.md`, is fast iteration over a live source bind mount, which doesn't exist in this mode).
- **Compose file:** a new root-level `docker-compose.prod.yml`, fully separate from `docker-compose.yml` (not an override layered on it) — a single service building from `Dockerfile.prod`, no bind mounts, reading `backend/.env` the same way the dev backend already does (no new secrets mechanism), with a healthcheck against the same smoke-test route the dev backend already uses.
- **Credential modes:** this configuration passes `backend/.env` through unchanged — real key or (once `task-fake-mode.md` lands) `FAKE_MODE=true` both just work, since neither is specific to which Compose file started the container. No prod-specific mode-switching code is needed.

## Open questions

None. Resolved:

- **Frontend serving:** the backend serves the Angular production build directly (single container) — chosen over a separate Nginx reverse-proxy container specifically to preserve `architecture.md`'s one-origin/no-CORS property with no new proxy config to maintain, rather than reimplementing `frontend/proxy.conf.json`'s routing rule a second time in Nginx syntax.
- **Compose file shape:** fully separate `docker-compose.prod.yml`, not a base+override pair — appropriate given how much diverges from the dev file (build target, no bind mounts, no dev volume, one service instead of two).
- **`node_modules` handling:** installed straight into the prod image at build time; no named volume, no bind mount — see "Interface."
- **Env/secrets handling:** reuses `backend/.env` unchanged; a server deployment just needs that file present with real values, same mechanism as local dev, per `repo-layout.md`'s "Secrets."
- **Standing conflict with `tech-stack.md`/`architecture.md`:** resolved by revising both under "Write decisions back" below, rather than treating either as a blocker.
- **Fake-mode scenario:** not needed here at all, deferred or otherwise — this task's own generic placeholder-credentials boot scenario below already proves env-var-driven config reaches the app unchanged under this runtime, which is the only thing `FAKE_MODE` would need from this task; `task-fake-mode.md`'s own plan explains why it doesn't re-verify itself under this runtime either (see "Consumers").

## Test scenarios

- [ ] `docker compose -f docker-compose.prod.yml up --build` builds and starts a single container serving the whole app, with no dev server and no bind-mounted source.
- [ ] Requests to `/api/*` reach the backend as before; any other route (including a deep link like `/some-lab`, not just `/`) serves the Angular app's `index.html`, not a 404.
- [ ] No `node_modules` named volume or source bind mount exists for the prod service — dependencies are present only because the image installed them at build time.
- [ ] The prod image builds and the container boots successfully with only placeholder credentials in `backend/.env` — this doesn't require `FAKE_MODE` to exist yet, since no test scenario here makes a real external call.
- [ ] The prod service reports `(healthy)` via `docker compose ps` once ready, using the same smoke-test route the dev backend already exposes.
- [ ] The existing dev `docker compose up` workflow (two containers, `ng serve`, named `node_modules` volume) is unchanged by this task's additions.

## To-do list

- [ ] Add `@nestjs/serve-static` as a backend dependency.
- [ ] Wire `ServeStaticModule` (or equivalent) into the backend to serve a static assets folder, excluding the existing `/api` prefix, with an SPA fallback to `index.html` for unmatched non-API routes.
- [ ] Write `Dockerfile.prod` (repo root): multi-stage — build the Angular production bundle, build the compiled Nest output, copy both into a slim runtime image alongside production-only `node_modules` installed at build time.
- [ ] Write `docker-compose.prod.yml` (repo root): single service building from `Dockerfile.prod`, no bind mounts, no dev volume, reading `backend/.env`, healthcheck against the existing smoke-test route.
- [ ] Confirm `docker compose -f docker-compose.prod.yml up --build` serves the full app end to end (API + Angular routes) from one origin, with only placeholder credentials.
- [ ] Confirm the existing dev `docker compose up` workflow is unaffected by any of the above.

## Write decisions back

- `tech-stack.md`'s "Runtime" entry: revise to drop "there's no separate production build in scope" and describe the new prod path (compiled Angular + compiled Nest, backend-served, no dev volume) — done as part of this planning pass, see that file directly.
- `architecture.md`'s "Same origin via the Angular dev server" bullet: revise to note prod's simpler variant of the same one-origin property (backend serves the build directly, so there's nothing to proxy) — done as part of this planning pass, see that file directly.
- `docs/process-notes.md`: entry added noting `CLAUDE.md`'s "Running the app" section needs a prod command once this task is built (workflow doesn't own `CLAUDE.md`, so it can't apply this itself).
- `README.md`: once built, split a new "Development" section out from the current single Quick Start — this task is what first makes "running" ambiguous between dev and prod. That section should fold in what's currently only in `CLAUDE.md` (the dev `docker compose up` flow, the test commands, and the `npm run lint` type-check step) so a developer has one README section to read, not just `CLAUDE.md`.

## Build order & dependencies

Sequenced right before Fake Mode in `status.md` — this task defines the second Docker/Compose runtime first, so Fake Mode can be planned and built already aware of it (see "Consumers"), rather than only against today's single dev config.
