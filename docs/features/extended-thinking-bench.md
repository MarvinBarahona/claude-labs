# Extended Thinking Bench

Re-runs one real, genuinely hard reasoning task — drafting a reply to an actual open GitHub issue from the subject repo — three times under different thinking settings, and shows the reasoning trace, latency, and answer quality side by side: thinking off, adaptive thinking at medium effort, and adaptive thinking at high effort.

## Backend

`backend/src/extended-thinking-bench/`:

- **`GET /api/extended-thinking-bench/issues`** → `200` `{ issues: { number: number; title: string }[] }` — the target repo's currently-open issues (`GithubClient.getIssues({ state: 'open', perPage: 100 })`), for the frontend's issue picker.
- **`POST /api/extended-thinking-bench/run`**:
  - Request: `{ issueNumber: number }` (positive integer, required).
  - `issueNumber` not found among currently-open issues → `404` (`NotFoundException`).
  - Fetches the issue, builds this feature's own "draft a response to this issue" prompt, and fires 3 concurrent Messages API calls, all on `ModelConfigService.getModel('default')` (model held constant — only the thinking setting varies):
    - `thinking-off` — no `thinking` field at all.
    - `thinking-medium` — `thinking: { type: 'adaptive', display: 'summarized' }`, `output_config: { effort: 'medium' }`.
    - `thinking-high` — same shape, `effort: 'high'`.
  - Success → `200`:
    ```ts
    {
      issue: { number: number; title: string };
      runs: {
        label: 'thinking-off' | 'thinking-medium' | 'thinking-high';
        envelope: TurnEnvelope;         // this run's own complete { request, response, usage, stopReason }
        latencyMs: number;
        answer: string;
        reasoningTrace: string | null;  // joined summarized thinking-block text; always null for thinking-off
      }[];  // always exactly 3 entries, in the order above
    }
    ```

This route is deliberately non-streaming — the point is comparing 3 finished runs against each other, not watching any one call's tokens arrive live.

`thinking.display` is always set to `"summarized"` on the two thinking-on runs — the default, `"omitted"`, still enables thinking but redacts the text, which would leave nothing to show as a reasoning trace. `reasoningTrace` is extracted by joining every `thinking`-typed content block's own `thinking` text; `thinking-off`'s response never has one, so its trace is always `null`.

This feature deliberately does not reuse Workflow Gallery's own draft-stage prompt-building logic — it writes its own prompt and hardcodes its own `medium`/`high` comparison set, since a side-by-side comparison needs several fixed effort levels at once rather than one configured default.

Wired via `ExtendedThinkingBenchModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `GithubProviderModule`) into `AppModule`. Like Workflow Gallery, there's no per-number "get one issue" method on the shared `GithubClient`, so both routes fetch the open-issues list and find the target by number client-side.

## Frontend

`frontend/src/app/extended-thinking-bench/` (`ExtendedThinkingBench`). Stacks `<app-docs-panel [slug]="'extended-thinking-bench'" />` → the demo (issue picker populated from `GET /issues`, Run button, a 3-column comparison view — one column per run, each showing its answer, reasoning trace (or "No thinking used for this run." for the off column), latency, and token usage) → three `<app-inspector-panel [title]="..." [call]="...">` instances, one per run, each titled `Inspector (<column heading>)` so the 3 stacked instances can be told apart.

The issue picker auto-selects the first loaded issue as soon as `GET /issues` resolves, so Run is usable immediately without an explicit selection — the picker's own placeholder `<option>` is `disabled`, and a real browser auto-displays the next option for it without ever firing a `change` event, so the component has to independently default-select the same issue or Run silently stays disabled. Per [`loading-states.md`](../technical/loading-states.md), the comparison view stays mounted with skeleton placeholders (3 columns' worth) while a run is in flight.

## In-app doc

`frontend/public/lab-docs/extended-thinking-bench.md` — covers adaptive thinking (`thinking: { type: 'adaptive' }`, `output_config.effort`, why `display: 'summarized'` is required for a readable trace), a real example request, how to read the `thinking`-block-bearing response, and the prefill/forced-tool_choice incompatibility gotcha.

## Testing

- `extended-thinking-bench.service.spec.ts` — unit tests with a fake `AnthropicClient`/`GithubClient` bound via DI: the `404` on an unknown `issueNumber`; exactly 3 concurrent calls in `thinking-off`/`thinking-medium`/`thinking-high` order, all on `getModel('default')`; the correct `thinking`/`output_config` shape per label; `reasoningTrace` extraction (`null` for `thinking-off`); `latencyMs` measured per run; each run carrying its own complete envelope.
- `extended-thinking-bench.e2e-spec.ts` — integration tests with `nock` intercepting the real Anthropic/GitHub HTTP calls, proving the full `200` shape (all 3 `runs` entries, including a `thinking`-bearing fixture for the two thinking-on runs) and the `GET /issues`/`404` paths end to end.
- `extended-thinking-bench.spec.ts` (frontend) — unit tests with `HttpTestingController`: the issue picker populating from `GET /issues` and auto-selecting the first issue (Run enabled with no manual interaction); the 3-column comparison rendering answer/reasoning-trace/latency/usage per run from a mocked response, with 3 separate inspector-panel instances receiving the right `envelope` and a distinct `title` each; the comparison skeleton holding for the minimum duration; the visible error state.
- `e2e/tests/extended-thinking-bench.spec.ts` (Playwright) — nav reachable right after Workflow Gallery; docs panel renders non-empty content; the picker already shows the auto-selected fake-mode issue with Run already enabled *before* any interaction (regression coverage for the auto-select behavior above); clicking Run with no prior `selectOption()` call renders all 3 comparison columns, each feeding its own inspector-panel instance.
