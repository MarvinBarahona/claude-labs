# Workflow Gallery

A support-triage pipeline against a real open issue from the subject GitHub repo, composing all four workflow patterns end to end: **route** the issue to a category, **chain** a draft-then-refine reply, **parallelize** grading the refined draft against several independent criteria, and run the whole thing through an **evaluator-optimizer** loop that feeds failing-criterion feedback back into drafting until it passes or hits a retry cap.

## Backend

`backend/src/workflow-gallery/`:

- **`GET /api/workflow-gallery/issues`** → `200` `{ issues: { number: number; title: string }[] }` — the target repo's currently-open issues (`GithubClient.getIssues({ state: 'open', perPage: 100 })`), for the frontend's issue picker.
- **`POST /api/workflow-gallery/run`**:
  - Request: `{ issueNumber: number }` (positive integer, required — plain `400` via the validation pipe otherwise).
  - `issueNumber` not found among currently-open issues → `404` (`NotFoundException`), not `502`.
  - Success → `200`:
    ```ts
    TurnEnvelope & {
      calls: { request: AnthropicMessageParams; response: AnthropicMessage }[];  // every stage's call, in chronological order
      route: 'bug' | 'feature-request' | 'question' | 'support';
      draft: string;          // the final accepted (or last-attempted) refined draft text
      grading: { criterion: 'tone' | 'technical-accuracy' | 'policy-compliance'; pass: boolean; feedback: string }[];  // the final grading pass's per-criterion results
      iterations: number;     // how many evaluator-optimizer attempts it took; 1 = passed on the first attempt
      passed: boolean;        // false only when the iteration cap (3) was hit without all 3 criteria passing
      cache: { read: boolean; write: boolean };  // from CachingLayerService.readCacheStatus() off the final call's usage
    }
    ```
    `TurnEnvelope`'s own top-level `request`/`response`/`usage`/`stopReason` reflect the *last* call made (the final grading call of the accepted attempt); the full sequence lives in `calls`.

This route is deliberately non-streaming — a run can make up to 16 Messages API calls in one turn, and its value is in the *structure* of that multi-call trace after the fact, not in streaming any one call's tokens live.

### Pipeline shape

One evaluator-optimizer **attempt** = 1 draft call + 1 refine call + 3 concurrent grading calls (tone / technical accuracy / policy compliance). A single routing call runs once per turn, before the first attempt — the category doesn't change across retries. If any of the 3 grading calls fails, that failing criterion's feedback is appended to the next attempt's draft-stage prompt and the draft→refine→grade sequence repeats; the loop stops at the first all-pass grading result or after 3 attempts, whichever comes first. Every call in every attempt is recorded in `calls`, in order.

Model tiers: routing uses `ModelConfigService.getModel('classification')` (Haiku); every other call (draft, refine, all 3 grading calls) uses `getModel('default')`. The shared system prompt (repo/issue context common to every stage after routing) is marked as a cache boundary (`CachingLayerService.markBreakpoints(params, [{ region: 'system' }])`, see `caching-layer.md`) on every call after the first, so a run's later calls — and a same-issue re-run within the cache's TTL — hit the cache instead of reprocessing the shared context at full price.

Wired via `WorkflowGalleryModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `GithubProviderModule`, `CachingLayerModule`) into `AppModule`. There's no per-number "get one issue" method on the shared `GithubClient` (its interface only exposes list endpoints, see `github-provider.md`), so both routes fetch the open-issues list and find the target by number client-side.

## Frontend

`frontend/src/app/workflow-gallery/` (`WorkflowGallery`). Stacks `<app-docs-panel [slug]="'workflow-gallery'" />` → the demo (issue picker populated from `GET /issues`, Run button, a stage-by-stage result view showing the routed category, the final draft, each criterion's pass/fail with feedback, and the iteration count/pass state) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. No streaming toggle, matching the backend's non-streaming route. The result view stays mounted (skeleton placeholders) for the run's duration, held for a minimum readable duration in fake mode the same way every other lab's loading state is.

## In-app doc

`frontend/public/lab-docs/workflow-gallery.md` — covers the four workflow patterns (routing, chaining, parallelization, evaluator-optimizer) as this pipeline actually implements them, real example requests for the routing and grading calls, and the prompt-caching boundary shared across a run, rendered inline by `DocsPanel`.

## Testing

- `workflow-gallery.service.spec.ts` — unit tests with a fake `AnthropicClient`/`GithubClient` bound via DI: routing into each of the 4 categories, the sequential draft→refine chain, the 3 concurrent grading calls, feedback-driven retry, the first-all-pass stop condition, the 3-attempt cap, chronological `calls` ordering, the cache boundary on every call after the first, and the `404` on an unknown `issueNumber`.
- `workflow-gallery.e2e-spec.ts` — integration tests with `nock` intercepting the real Anthropic/GitHub HTTP calls, proving the full `200` response shape and `GET /issues`' shape end to end.
- `workflow-gallery.spec.ts` (frontend) — unit tests with `HttpTestingController`: the issue picker populating from `GET /issues`, the Run button's disabled state, the full result view and inspector rendering from a mocked response, the "did not pass" cap wording, the result skeleton holding for the minimum duration, and the visible error state.
