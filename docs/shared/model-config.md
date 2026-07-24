# Config/Model Layer

The central place to pick a model tier per call: default Sonnet, drop to Haiku for classification-heavy steps, reserve Opus for the hardest single calls, and hand back the one shared `max_tokens` default. Every backend module that calls the Claude API goes through this instead of hardcoding a model string or a repeated `max_tokens` literal.

## Interface

`ModelConfigModule` (`backend/src/shared/model-config/model-config.module.ts`) exports `ModelConfigService` (`model-config.service.ts`), which injects `AppConfigService` (see [`env-config.md`](env-config.md)) rather than reading `process.env` directly.

Two methods, kept separate because they return different shapes:

- `getModel(tier: ModelTier): string` — `ModelTier` is `'default' | 'classification' | 'hardest-call'`, derived from the `MODEL_TIERS` runtime array (`model-config.types.ts`) — the single source of truth for valid tiers. A DTO's `@IsIn()` validates against `MODEL_TIERS` directly (`import { MODEL_TIERS, ModelTier } from '.../shared/model-config/model-config.types'`) instead of redeclaring its own list, so adding/removing a tier is a one-line edit here rather than a per-DTO change. Current mapping:
  - `default` → `claude-sonnet-5` — the balanced tier every feature falls back to unless it asks for something else.
  - `classification` → `claude-haiku-4-5` — fastest/cheapest tier, for routing/extraction-style calls (e.g. Workflow Gallery's router).
  - `hardest-call` → `claude-opus-4-8` — deepest tier, for the single hardest call in a pipeline.
- `getDefaultMaxTokens(): number` — the `max_tokens` every lab sends (`4096`). Not env-configurable, unlike the tier mapping above — there's no per-lab reason to vary it, so it's a plain constant inside the service rather than another `AppConfigService` field.

Fable is not part of this mapping — it's a distinct, pricier tier a feature can opt into explicitly, never a default any tier falls back to. No feature currently does.

The three model tiers are environment-overridable through `AppConfigService`: `MODEL_DEFAULT`, `MODEL_CLASSIFICATION`, `MODEL_HARDEST_CALL` (each defaulting to the model ID above). `backend/.env.example` documents all three with placeholder values. `getDefaultMaxTokens()`'s `4096` is not among them — see above.

A lab that needs adaptive thinking (`thinking: {type: "adaptive"}`) passes its own `output_config.effort` value directly rather than going through this service — there's no shared "default effort" concept here, since the one existing thinking-enabled lab (Extended Thinking Bench) needs several fixed effort levels side by side, not a single configured default, and no other lab has needed one since.

## Using it

Inject `ModelConfigService` via Nest DI and call `getModel(tier)` / `getDefaultMaxTokens()` — don't hardcode a model string, a `max_tokens` literal, or read `MODEL_*` from `AppConfigService` directly in a consumer module. To change the tier→model mapping, edit the `MODEL_*` defaults in `config.schema.ts` (or override via env) — this is reflected everywhere the tier is consumed, without per-module edits.

## Potential other uses

Since it already knows the cost/speed tradeoff per tier, it's a natural place to also expose a per-call cost estimate (tokens × published price per tier) for an inspector panel to surface, if that's ever wanted — not committed, just a natural extension of the same lookup table.

## Testing

`backend/src/shared/model-config/model-config.service.spec.ts` covers each tier lookup, the default-max-tokens lookup, and a mapping-override test (stubbing `AppConfigService`) confirming the service reflects an overridden mapping with no per-consumer change. `config.schema.spec.ts`/`config.module.spec.ts` cover the three env vars' defaulting and override behavior.
