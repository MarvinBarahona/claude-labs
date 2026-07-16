# Structured Output Console

**Nav position:** after `messages-console`.

A structured (JSON-schema) output demo: free-text input, a single blocking Messages API call forcing a schema-conformant reply, and the parsed result rendered. Demonstrates `output_config`, not the SDK's own `client.messages.parse()` convenience wrapper, which would bypass the shared `AnthropicClient` token.

## Backend

`POST /api/structured-output-console/run` (`backend/src/structured-output-console/`):

Request body:
```ts
{
  modelChoice: 'default' | 'classification' | 'hardest-call';
  input: string;   // non-empty
}
```

- Validation failure (empty `input`, invalid `modelChoice`) → plain Nest `400` via the validation pipe.
- Fixed demo schema (not user-editable):
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
- Success → `200` with body `TurnEnvelope & { parsed: { summary: string; sentiment: 'positive' | 'neutral' | 'negative'; actionItems: string[] } }` — `TurnEnvelope` from `envelope-builder.md`, `parsed` from `JSON.parse()`-ing the response's text block.
- If the response has no text block to parse → `ExternalApiError('anthropic', 'Structured response did not include a text block to parse')`, surfaced by the global exception filter as `502` `{ error: { message, source: 'anthropic' } }`. This route never streams.

Wired via `StructuredOutputConsoleModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`) into `AppModule`. `modelChoice` validates against `MODEL_TIERS` (`backend/src/shared/model-config/model-config.types.ts`, see `model-config.md`) — the single source of truth for valid tiers, not a locally redeclared list.

## Frontend

`frontend/src/app/structured-output-console/` (`StructuredOutputConsole`, registered right after `messages-console` in `FEATURE_ROUTES`). Stacks `<app-docs-panel [slug]="'structured-output-console'" />` → the demo (model picker, free-text input, Run button, parsed `summary`/`sentiment`/`actionItems` result) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. Uses the shared `<app-model-picker>` for model selection; a failed request surfaces a visible error state rather than failing silently.

## In-app doc

`frontend/public/lab-docs/structured-output-console.md` — covers the `output_config`/JSON-schema mechanic, an example request/response, and the gotcha distinguishing it from tool-use's `input_schema`, rendered inline by `DocsPanel`.

## Testing

- `structured-output-console.service.spec.ts` — unit tests with a fake `AnthropicClient` bound via DI, covering schema-on-every-call, tier resolution, parsed-output shaping via `EnvelopeBuilderService`, and the no-text-block `ExternalApiError` path.
- `structured-output-console.e2e-spec.ts` — integration tests with `nock` intercepting the real SDK's outbound call, covering the `200`/`400`/`502` paths end to end.
- `structured-output-console.spec.ts` (frontend) — unit tests with `HttpTestingController`, covering parsed-field rendering, the inspector panel reflecting the completed call, and the visible error state on a failed request.
