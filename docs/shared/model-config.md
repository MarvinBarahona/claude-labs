# Config/Model Layer

The central place to pick a model tier per call: default Sonnet, drop to Haiku for classification-heavy steps, reserve Opus for the hardest single calls, and hold the adaptive-thinking effort-level choice. Every backend module that calls the Claude API goes through this instead of hardcoding a model string.

## Interface

`ModelConfigModule` (`backend/src/model-config/model-config.module.ts`) exports `ModelConfigService` (`model-config.service.ts`), which injects `AppConfigService` (see [`env-config.md`](env-config.md)) rather than reading `process.env` directly.

Two methods, kept separate because they return different shapes:

- `getModel(tier: ModelTier): string` — `ModelTier` is `'default' | 'classification' | 'hardest-call'` (`model-config.types.ts`). Current mapping:
  - `default` → `claude-sonnet-5` — the balanced tier every feature falls back to unless it asks for something else.
  - `classification` → `claude-haiku-4-5` — fastest/cheapest tier, for routing/extraction-style calls (e.g. Workflow Gallery's router).
  - `hardest-call` → `claude-opus-4-8` — deepest tier, for the single hardest call in a pipeline.
- `getThinkingEffort(): ThinkingEffort` — `ThinkingEffort` is `'low' | 'medium' | 'high' | 'xhigh' | 'max'`, the `output_config.effort` level to pass alongside `thinking: {type: "adaptive"}` (e.g. Extended Thinking Bench). This project targets only current-generation models (Sonnet, Opus, Haiku, Fable), none of which accept the older manual `budget_tokens` thinking configuration, so this service only ever hands back an effort level, never a token budget.

Fable is not part of this mapping — it's a distinct, pricier tier a feature can opt into explicitly (e.g. Foundations Console's model picker), never a default any tier falls back to.

Each of the three model tiers and the thinking-effort default is environment-overridable through `AppConfigService`: `MODEL_DEFAULT`, `MODEL_CLASSIFICATION`, `MODEL_HARDEST_CALL` (each defaulting to the model ID above), and `THINKING_EFFORT_DEFAULT` (defaulting to `medium`). `backend/.env.example` documents all four with placeholder values.

## Using it

Inject `ModelConfigService` via Nest DI and call `getModel(tier)` / `getThinkingEffort()` — don't hardcode a model string or read `MODEL_*`/`THINKING_EFFORT_DEFAULT` from `AppConfigService` directly in a consumer module. To change the tier→model mapping, edit the `MODEL_*` defaults in `config.schema.ts` (or override via env) — this is reflected everywhere the tier is consumed, without per-module edits.

## Potential other uses

Since it already knows the cost/speed tradeoff per tier, it's a natural place to also expose a per-call cost estimate (tokens × published price per tier) for an inspector panel to surface, if that's ever wanted — not committed, just a natural extension of the same lookup table.

## Testing

`backend/src/model-config/model-config.service.spec.ts` covers each tier lookup, the thinking-effort lookup, and a mapping-override test (stubbing `AppConfigService`) confirming the service reflects an overridden mapping with no per-consumer change. `config.schema.spec.ts`/`config.module.spec.ts` cover the four new env vars' defaulting, override, and invalid-enum-rejection behavior.
