---
name: nest-conventions
description: This skill should be used when writing or editing any NestJS code in this repo's `backend/` app — for example when asked to "add a module", "build the GitHub provider", "wire up a new lab's backend", or any other backend implementation task. Covers general, up-to-date NestJS coding conventions (module composition, DI, validation, error handling) applicable to any Nest codebase; not this project's architecture decisions (see `repo-layout.md`, indexed from `technical.md`).
---

# NestJS coding conventions

General best practices for writing modern NestJS code, independent of any one project's specifics.

## Stay project-agnostic

Never reference another skill by name here, project-specific or otherwise — this skill should read the same in any repo it's dropped into. A skill checked into a given project besides that project's own listed skills is generic tooling that can be renamed, replaced, or deleted independently of the project — this skill included — so a hard-coded reference to one would go stale silently.

## Module composition

- Each feature module is composed of a **controller + service + DTOs** (plus providers as needed) — controllers stay thin and delegate all business logic to services.
- Depend on interfaces/abstract classes via DI tokens for anything that has more than one implementation or needs mocking in tests (e.g. an external API client) — don't `new` up collaborators inside a service.
- Favor constructor injection; use `inject()`-style property injection only where constructor injection is impractical (e.g. circular deps that can't be restructured).

## DTOs and validation

- DTOs are plain classes decorated with `class-validator` decorators (`@IsString()`, `@IsInt()`, etc.), transformed with `class-transformer`.
- Enable a global `ValidationPipe` (`whitelist: true`, `transform: true`) rather than validating manually in controllers.
- Keep request/response shapes explicit — a DTO per request body and, where the response shape matters for consumers, a response DTO — rather than passing loosely-typed objects through.
- When a DTO field pairs a `class-validator` decorator with a type imported from another file (e.g. `@IsIn(MODEL_TIERS) modelChoice: ModelTier;`), import that type with `import type` specifically — a plain `import { X, Y } from '...'` compiles fine for every other usage but trips TS1272 (`emitDecoratorMetadata` needs a real value to reference a cross-file string-literal-union type) on the decorated field. Neither `ts-jest` (`isolatedModules: true`) nor type-aware `eslint` catches this; only `tsc` itself does, so it can slip past `npm test` and `npm run lint` and only surface at `nest start`/build time.

## Configuration

- Use `@nestjs/config` with typed configuration factories (a `registerAs` per concern) instead of reading `process.env` directly in services.
- Validate configuration at startup (e.g. a Joi/Zod schema passed to `ConfigModule.forRoot({ validate })`) so missing env vars fail fast rather than surfacing as runtime errors deep in a request.

## Cross-cutting concerns

- **Guards** for authN/authZ, **interceptors** for logging/caching/response transformation, **pipes** for validation/coercion, **exception filters** for turning domain errors into HTTP responses — use the mechanism Nest provides for each concern rather than handling it ad hoc inside a service or controller method.
- Throw Nest's built-in HTTP exceptions (`NotFoundException`, `BadRequestException`, etc.) or a custom exception caught by a global exception filter — avoid returning error-shaped success responses.

## Async and data flow

- Prefer `async`/`await` for request-handling code; reach for RxJS only where Nest's API surface is itself Observable-based (e.g. microservice message streams) or genuine multi-value streams are involved.
- Keep providers stateless where possible; anything that must hold state across requests should be deliberate (and scoped correctly — singleton vs. request-scoped) rather than accidental.

## Testing

- Unit-test services in isolation using `Test.createTestingModule` with mocked providers — don't spin up the full Nest application for logic tests.
- Use Nest's testing utilities (`@nestjs/testing` + `supertest`) for controller-level/e2e tests that need to exercise the full HTTP pipeline (guards, pipes, filters included).

## General

- Strict TypeScript throughout (`strict: true`); avoid `any` at module boundaries.
- Use a structured logger (Nest's built-in `Logger` at minimum) instead of `console.log`.
- Comments are the exception, not the rule — if the code is clear enough on its own, add none. When one is genuinely warranted, keep it to one short line; a longer WHY (a design rationale, a workaround, a decision worth preserving) belongs in the relevant doc, not a multi-line comment block in the source.
