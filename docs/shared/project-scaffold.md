# Project Scaffold

The repo's frontend/backend/Docker Compose foundation — an Angular project and a NestJS project, wired together and provably able to talk to each other.

## Structure

- `frontend/` — Angular (standalone components), Tailwind, Spartan/ng installed and wired in. `frontend/components.json` is present so `ng g @spartan-ng/cli:ui <name>` can generate further primitives non-interactively — see `tech-stack.md` for the CLI usage notes.
- `backend/` — NestJS on the Express adapter, with Zod and `@nestjs/axios` present as dependencies. Neither is wired into real config/data-source code yet — that's for whichever task or feature first needs them.
- Root `docker-compose.dev.yml` runs both together (a separate `docker-compose.prod.yml` also exists for running, not developing, the app — see `prod-docker.md`). The backend serves every route under an `/api` prefix (`app.setGlobalPrefix('api')` in `backend/src/main.ts`); the frontend's dev-server proxy (`frontend/proxy.conf.json`) forwards that prefix to the backend over Compose service-name DNS, so the browser only ever talks to one origin. See `tech-stack.md` for the Docker runtime decisions this relies on (named-volume `node_modules`, healthcheck-gated startup).
- A `GET /api/smoke-test` route (`backend/src/app.controller.ts` / `app.service.ts`) and a matching call from the frontend's root component (`frontend/src/app/app.ts`) exist purely as the connectivity proof this scaffold was built to establish. The first task or feature that adds real functionality should replace this wiring rather than build alongside it.

## Using it

Run the stack per `CLAUDE.md`'s "Running the app" section. A new backend route goes under the existing `/api` prefix and is immediately reachable from the frontend at `/api/<route>` through the dev-server proxy — no additional wiring needed.

## Testing

Each project has a working test command using only placeholder environment values — see `testing-strategy.md` for the strategy and `CLAUDE.md` for the actual commands (`docker compose -f docker-compose.dev.yml run --rm backend npm test`, `docker compose -f docker-compose.dev.yml run --rm backend npm run test:e2e`, `docker compose -f docker-compose.dev.yml run --rm frontend npm test -- --watch=false`).
