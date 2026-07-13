# Production Docker Configuration

A second, production-ready Docker/Compose runtime, alongside the dev one — for just *running* the app (locally or on a server), not developing it.

## Interface

- **Run it:** `docker compose -f docker-compose.prod.yml up --build`. A single `app` service, built from the root-level `Dockerfile.prod`, reads `backend/.env` the same way dev does — no separate secrets mechanism, and both credential modes (a real `ANTHROPIC_API_KEY`, or `FAKE_MODE=true` with placeholder values once `fake-mode` lands) just work unchanged, since neither is specific to which Compose file started the container.
- **Frontend serving:** the backend serves the Angular production build's static files directly — no separate Nginx/static-file container, one origin, no proxy config. `backend/src/app.module.ts` wires `@nestjs/serve-static`'s `ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'public'), exclude: ['/api{/*splat}'] })`; unmatched non-`/api` routes fall back to `index.html` so Angular's client-side routing still works on a hard refresh or deep link, while `/api/*` continues to 404 normally when unmatched rather than falling back. See `tech-stack.md`'s "Runtime" for why the exclude pattern must use the named-wildcard form (`{*splat}`, not bare `*`/`(.*)`) and why `rootPath` resolving to a nonexistent path under dev is harmless.
- **Build:** `Dockerfile.prod` (repo root) is a three-stage build — an Angular production bundle, a compiled Nest output, and a final runtime image that installs production-only backend `node_modules` straight into the image (no bind mount, no named volume) alongside both build outputs. A root-level `.dockerignore` covers this build's context (the repo root, not a subpackage).
- **No dev-runtime overhead:** no dev server, no watch mode, no source bind mount — dependencies and build output are baked into the image at build time.
- **Port collision:** both the dev and prod services bind host port 3000, so only one runtime can be up on a given machine at a time — `docker compose -f docker-compose.dev.yml down` (or vice versa) before switching.

## Using it

- Prod: `docker compose -f docker-compose.prod.yml up --build`, `docker compose -f docker-compose.prod.yml down`.
- Dev is unaffected in behavior, but its own config was renamed for symmetry with this task: `docker-compose.yml` → `docker-compose.dev.yml`, `backend/Dockerfile` → `backend/Dockerfile.dev`, `frontend/Dockerfile` → `frontend/Dockerfile.dev`. Dev now requires the same explicit `-f docker-compose.dev.yml` flag prod needs — see `CLAUDE.md` for the actual current command set.
- `docker compose -f docker-compose.prod.yml ps` reports `(healthy)` once ready, via the same smoke-test route (`/api/smoke-test`) the dev backend already exposes.
