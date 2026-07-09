# Task — Project Scaffold

**Status:** Draft.

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

- [ ] `docker compose up` from a clean checkout starts both containers with no manual steps beyond that one command.
- [ ] The frontend's origin serves the Angular app shell.
- [ ] The frontend's smoke-test call reaches the backend's smoke-test route through the dev-server proxy and its response renders in the browser — proving requests actually cross the Compose network, not just that each container starts independently.
- [ ] Stopping and restarting `docker compose up` reaches the same working state, with no leftover state from the previous run.
- [ ] Each project's test command runs successfully using only placeholder environment values — no real `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, or other credential is required to build or test the project.

## To-do list

- [ ] Scaffold the Angular project in `frontend/` (latest Angular, standalone components, per `angular-conventions`).
- [ ] Install and wire in Spartan/ng per `tech-stack.md`.
- [ ] Scaffold the NestJS project in `backend/` on the Express adapter, per `tech-stack.md`.
- [ ] Add Zod and `@nestjs/axios` as backend dependencies (not wired into real code yet — that's `task-env-config.md`'s and later data-source tasks' job).
- [ ] Write the root `docker-compose.yml`: both containers, the frontend's dev-server proxy forwarding to the backend over Compose service-name DNS, per `architecture.md`.
- [ ] Add one minimal backend route and one minimal frontend call exercising it, as the end-to-end smoke test.
- [ ] Confirm `docker compose up` from a clean checkout reaches a working state with no extra manual steps.
- [ ] Confirm each project's test command runs with placeholder-only environment values, per `testing-strategy.md` — no real credential required.

## Open questions

- Whether this task also writes the initial `backend/.env.example` (currently `task-env-config.md`'s own to-do) or leaves that entirely to that task, since this task's scaffold doesn't need any real environment variable yet — leaning toward leaving it to `task-env-config.md`.
