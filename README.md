# Claude Labs

A full-stack reference app that exercises every major Claude API feature (tool use, server-side tools, MCP connector, extended thinking, multimodal input, prompt caching, and the four workflow patterns — evaluator-optimizer, parallelization, chaining, routing — plus one deliberate agent example) against real public data sources. It is meant to serve as both a working demo and self-contained documentation: each lab's doc is rendered inline next to its live demo in the app.

**Status:** see [`status.md`](docs/status.md).

**Stack:** Angular (frontend) + NestJS (backend), run exclusively via Docker Compose. See [`technical.md`](docs/technical/technical.md) for details.

**Quick start:**

```
cp backend/.env.example backend/.env
docker compose up --build
```

Frontend: http://localhost:4200 · Backend: http://localhost:3000
