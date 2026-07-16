# Feature — Structured Output Console

**Status:** 🔵 In progress.

**Nav position:** after `messages-console`.

## Description

A structured (JSON-schema) output demo: free-text input, a single blocking Messages API call with `output_config: {format: {type: "json_schema", schema}}` set to a fixed demo schema (`{ summary, sentiment, actionItems }`), and the parsed result rendered — carved out unchanged from Foundations Console's "Structured output demo" section (see `task-retire-foundations-console.md`, which retires that bundled page once this feature and `messages-console` (see `messages-console.md`) both exist). Demonstrates forcing a schema-conformant response, not the SDK's own `client.messages.parse()` convenience wrapper, which would bypass the shared `AnthropicClient` token — same reasoning the original Foundations Console doc already recorded. The demo schema itself stays exactly as it is today — not raised by the split, no reason found during this planning pass to change it.

This is a fresh feature (its own slug, not a follow-on) — Foundations Console's own permanent doc is a different feature identity, being retired rather than renamed; see `task-retire-foundations-console.md`.

## Guiding principles / standing decisions cited

- `app-shell.md`, "Lab page composition convention" — `DocsPanel` → demo → `InspectorPanel` stacking.

## Depends on

- `envelope-builder` (`Done`) — [`envelope-builder.md`](../shared/envelope-builder.md), "Interface" — `EnvelopeBuilderService.build(params, response): TurnEnvelope`, called after the schema-conformant response comes back.
- `model-picker` (`Done`) — [`model-picker.md`](../shared/model-picker.md), "Interface" — `ModelPicker` component and its exported `ModelChoice` type, used instead of an inline `<select>`.
- `model-config` (`Done`) — [`model-config.md`](../shared/model-config.md), "Interface" — `ModelConfigService.getModel(tier)`, resolving `modelChoice` to a real model ID.
- `anthropic-client` (`Done`) — [`anthropic-client.md`](../shared/anthropic-client.md), "Interface" — `AnthropicClient.createMessage()`, the single blocking call this feature makes.
- `inspector-panel` (`Done`) — [`inspector-panel.md`](../shared/inspector-panel.md), "Interface" — the `InspectorCall` shape this feature's page binds.
- `docs-panel` (`Done`) — [`docs-panel.md`](../shared/docs-panel.md), "Interface" — `DocsPanel` bound to `slug="structured-output-console"`. New doc content authored via `write-lab-doc` once this feature is built, not part of this plan.
- `app-shell` (`Done`) — [`app-shell.md`](../shared/app-shell.md), "Interface" — `FEATURE_ROUTES` registration at index 1, right after `messages-console`.

## Contract

Two independent tracks — backend (route/service) and frontend (component) — pinned here so either can be built and tested against this alone.

**`POST /api/structured-output-console/run`** — request body:
```ts
{
  modelChoice: 'default' | 'classification' | 'hardest-call';
  input: string;   // non-empty
}
```
- Validation failure (empty `input`, invalid `modelChoice`) → plain Nest `400` via the validation pipe.
- Fixed demo schema (unchanged from today):
  ```ts
  {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
      actionItems: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'sentiment', 'actionItems'],
    additionalProperties: false,
  }
  ```
- Success → `200` with body `TurnEnvelope & { parsed: { summary: string; sentiment: 'positive' | 'neutral' | 'negative'; actionItems: string[] } }` — `TurnEnvelope` from `envelope-builder`, `parsed` from `JSON.parse()`-ing the response's text block.
- If the response has no text block to parse → throws `ExternalApiError('anthropic', 'Structured response did not include a text block to parse')`, surfaced by the global exception filter as `502` `{ error: { message, source: 'anthropic' } }` — this route never streams, so no manual `shapeError()` call is needed here (unlike Messages Console).

**Frontend:** `frontend/src/app/structured-output-console/structured-output-console.ts` + `.html`, moved from `foundations-console.ts`'s existing structured-demo-only signals/logic (`structuredInput`, `structuredResult`, `structuredError`, the non-streaming trigger/switchMap pattern) — unchanged behavior, calling the new route above and using `<app-model-picker>` in place of the inline `<select>`.

## Test scenarios

**Automated:**
- [ ] A valid request returns `200` with a `TurnEnvelope` (via `EnvelopeBuilderService`) plus a `parsed` field matching the fixed schema.
- [ ] An invalid body (empty `input`, invalid `modelChoice`) returns a plain `400`.
- [ ] A response with no text block returns `502` with `{ error: { message, source: 'anthropic' } }`.
- [ ] A Claude API failure returns `502` via the global exception filter.
- [ ] (Frontend) Submitting free text renders the parsed `summary`/`sentiment`/`actionItems` fields.
- [ ] (Frontend) The inspector panel reflects the completed call's request/response/usage/stopReason.
- [ ] (Frontend) A failed request shows a visible error state, not a silent failure.

**Manual:**
1. Run `docker compose -f docker-compose.dev.yml up`. Navigate to Structured Output Console (right after Messages Console in the nav).
2. Pick a model, enter free text describing something with a clear sentiment and a couple of action items, submit — confirm `summary`/`sentiment`/`actionItems` render correctly and the inspector shows the request/response/usage.

## To-do list

**Backend:**
- [x] Create `backend/src/structured-output-console/` (controller, service, module, `dto/structured-demo.dto.ts`), moved from `foundations-console`'s existing structured-demo-only code (`structuredDemo`, `runStructuredDemo`, the fixed schema constant), with the local `buildEnvelope` call replaced by `EnvelopeBuilderService.build()`.
- [x] Wire `StructuredOutputConsoleModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`) into `AppModule`.
- [x] Add `structured-output-console.service.spec.ts` / `structured-output-console.e2e-spec.ts` covering the backend Test scenarios above.

**Frontend:**
- [x] Create `frontend/src/app/structured-output-console/structured-output-console.ts` + `.html` per "Contract" above, using `<app-model-picker>`, `<app-docs-panel slug="structured-output-console">`, and `<app-inspector-panel>`.
- [x] Register `{ slug: 'structured-output-console', label: 'Structured Output Console', loadComponent: ... }` right after `messages-console` in `FEATURE_ROUTES`.
- [x] Add `structured-output-console.spec.ts` covering the frontend Test scenarios above.
- [x] Once built, run `write-lab-doc` against this lab to author `frontend/public/lab-docs/structured-output-console.md`.

## Development notes

- [Resolved] `MODEL_CHOICES`/`ModelChoice` was duplicated verbatim in three DTO files — `messages-console`, `foundations-console`, and this feature's `dto/structured-demo.dto.ts` — each redeclaring the `'default' | 'classification' | 'hardest-call'` union purely so `class-validator`'s `@IsIn()` had a runtime array to check against. Fixed inline: promoted a `MODEL_TIERS` runtime array into the already-shared `model-config.types.ts` (deriving `ModelTier` from it, the same `(typeof X)[number]` pattern each DTO used locally), and pointed `messages-console`'s and `structured-output-console`'s DTOs at it instead of redeclaring. `foundations-console` was left untouched — it's already slated for deletion via `task-retire-foundations-console`, not worth updating. `docs/shared/model-config.md`'s Interface section now documents `MODEL_TIERS` as the tier list's single source of truth.
- [Coding-convention observation] Importing `ModelTier` into a class field carrying a validation decorator (`@IsIn(MODEL_TIERS) modelChoice: ModelTier;`) trips TS1272 (`emitDecoratorMetadata` needs a real value to reference, and a cross-file string-literal-union import doesn't qualify) unless the type is imported via `import type` specifically — a plain `import { MODEL_TIERS, ModelTier } from '...'` compiles fine for everything *except* a decorated field. Neither `npm test` (`ts-jest` + `isolatedModules`) nor `npm run lint` (type-aware eslint) caught this — only `tsc`, as run by the dev container's own `nest start --watch`, did. Worth a `docs/technical/` coding-convention note: any DTO field pairing a class-validator decorator with a cross-file-imported type must import that type with `import type`.
- Backend and frontend tracks were built in parallel by two subagents against the plan's pinned contract; integration (route path, request/response field names) was verified directly against both sides' source afterward and matches exactly — no adjustment needed.
