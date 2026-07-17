# Feature — Workflow Gallery: Issue Triage Pipeline

**Status:** 📋 Planned.

**Nav position:** after `feature-vision-lab`.

## Claude API features

The four workflow patterns end to end:

- **Routing** — classify the input into a predefined category first, then send it down the one specialized pipeline built for that category; input only ever goes to one pipeline, not all of them.
- **Chaining** — split the task into sequential, dependent sub-tasks where each step's output feeds the next (e.g. draft → refine), optionally with non-LLM processing (validation, formatting, filtering) in between.
- **Parallelization** — split a decision into independent sub-tasks that don't depend on each other's output (e.g. grading tone, technical accuracy, policy compliance), run them concurrently, then aggregate the results.
- **Evaluator-optimizer** — a producer call generates output and a separate grader call checks it against explicit criteria, returning pass/fail plus feedback; failed attempts loop back to the producer with that feedback until it passes or hits a capped iteration count (always cap it — an unfixable output can otherwise loop forever).

## Main idea

The flagship feature, built on real open issues from the subject GitHub repo: **route** each issue to a category (bug / feature request / question / support), **chain** a draft-then-refine response, **parallelize** grading of the refined draft against several independent criteria, and run the whole thing through an **evaluator-optimizer** loop that keeps feeding grader feedback back into drafting until it passes or hits the iteration cap.

## Dataset & env vars

- **GitHub REST API** — real issues from `GITHUB_TARGET_REPO`, via the GitHub data provider; no new integration. Optionally uses `GITHUB_TOKEN`.

## Build order & dependencies

Right after Live Tool-Use Console proves the GitHub data provider and tool loop, and after the caching layer is built (see `status.md` for current position). This is the highest-value feature, so it's built early rather than last.

- Requires the **GitHub data provider** ([`github-provider.md`](../shared/github-provider.md)).
- Requires the **caching layer** ([`task-caching-layer.md`](task-caching-layer.md), built right before this feature) — the system prompt/tool definitions shared across this feature's routing/chaining/parallelization/evaluator-optimizer calls are cached, so this piece must already exist.
- Requires Live Tool-Use Console's proven tool-use/tool-loop patterns.
- **Feeds forward:** Extended Thinking Bench reuses this feature's real issue data for its thinking on/off comparison; Agent Playground ends with a side-by-side comparison against this feature's fixed-pipeline approach.

## Shared functionality used

- GitHub data provider ([`github-provider.md`](../shared/github-provider.md)) — `GithubClient.getIssues({ state: 'open', perPage: 100 })` is the only method this feature calls; there's no per-number "get one issue" method on the shared client (its interface only exposes list endpoints, see `github-provider.md`'s "Interface"), so both the issue-picker route and the run route fetch the open-issues list and find the target by number client-side rather than extending the shared provider for a single-feature need.
- Config/model layer ([`model-config.md`](../shared/model-config.md)) — notably, this is where routing drops to Haiku for the classification step.
- Caching layer ([`task-caching-layer.md`](task-caching-layer.md)), shared with Document Research Assistant.
- Response Envelope Builder ([`envelope-builder.md`](../shared/envelope-builder.md)) — builds each individual call's own envelope fragment; this feature assembles those into the extended response below.

## Files API / base64

Not applicable — no documents or images in this feature.

## Guiding principles

- [`guiding-principles.md`](../technical/guiding-principles.md), "Workflows first, agents last" — this feature *is* the workflows showcase; no tool loop, no open-ended agent behavior, every call sequence is fixed and predictable ahead of time.
- [`guiding-principles.md`](../technical/guiding-principles.md), "Minimize integrations" — reuses the GitHub data provider rather than a new integration.
- [`guiding-principles.md`](../technical/guiding-principles.md), "One inspector, many labs" — the full multi-stage trace renders through the shared inspector's existing `calls` field, not a bespoke display.

## Architecture

- [`architecture.md`](../technical/architecture.md), "Request/response contract" — `calls` exists in the envelope specifically for "a routing-then-pipeline chain, a producer/grader iteration," which is exactly this feature's shape; every stage's `{ request, response }` pair (route, draft, refine, each of the 3 parallel grading calls, repeated per evaluator-optimizer iteration) is recorded there in true chronological order.
- [`architecture.md`](../technical/architecture.md), "Error contract" — an `issueNumber` not found among currently-open issues is a client request-shape rejection (the requested resource doesn't exist), not a GitHub/Claude-API failure, so it surfaces as a plain Nest `404` (`NotFoundException`), not an `ExternalApiError`/`502`.

## Endpoint contract

This feature is deliberately **non-streaming** — the pipeline can run up to 16 Messages API calls in one turn (see "Evaluator-optimizer loop" below), and its own value is in showing the *structure* of that multi-call trace after the fact via the `calls` field (per the `architecture.md` citation above), not in streaming any one call's tokens live. This mirrors Structured Output Console's own precedent of skipping the streaming toggle where it wouldn't serve the feature's actual purpose.

`backend/src/workflow-gallery/`:

- **`GET /api/workflow-gallery/issues`** → `200` `{ issues: { number: number; title: string }[] }` — the target repo's currently-open issues (`GithubClient.getIssues({ state: 'open', perPage: 100 })`), for the frontend's issue picker.
- **`POST /api/workflow-gallery/run`**:
  - Request: `{ issueNumber: number }` (positive integer, required — plain `400` via the validation pipe otherwise).
  - `issueNumber` not found among currently-open issues → `404` (`NotFoundException`, passed through unchanged per the `architecture.md` citation above), not `502`.
  - Success → `200`:
    ```ts
    TurnEnvelope & {
      calls: { request: AnthropicMessageParams; response: AnthropicMessage }[];  // every stage's call, in chronological order — never omitted, this route always makes more than one call
      route: 'bug' | 'feature-request' | 'question' | 'support';
      draft: string;          // the final accepted (or last-attempted) refined draft text
      grading: { criterion: 'tone' | 'technical-accuracy' | 'policy-compliance'; pass: boolean; feedback: string }[];  // the final grading pass's per-criterion results
      iterations: number;     // how many evaluator-optimizer attempts it took; 1 = passed on the first attempt
      passed: boolean;        // false only when the iteration cap (3) was hit without all 3 criteria passing — the last attempt is still returned, per the "always cap it" rule above
      cache: { read: boolean; write: boolean };  // from CachingLayerService.readCacheStatus() off the final call's usage
    }
    ```
    `TurnEnvelope`'s own top-level `request`/`response`/`usage`/`stopReason` reflect the *last* call made (the final grading call of the accepted attempt), per `architecture.md`'s general contract; the full sequence lives in `calls`.

### Pipeline shape (drives the `calls`/`iterations` fields above)

One evaluator-optimizer **attempt** = 1 routing call (first attempt only) + 1 draft call + 1 refine call + 3 concurrent grading calls (tone / technical accuracy / policy compliance). Routing runs once per turn, not once per attempt — the category doesn't change across retries. If any of the 3 grading calls fails, that failing criterion's feedback is appended to the next attempt's draft-stage prompt and the draft→refine→grade sequence repeats; the loop stops at the first all-pass grading result or after 3 attempts, whichever comes first. Every call in every attempt is recorded in `calls`, in order.

The shared system prompt (repo/issue context common to every stage after routing) is marked as a cache boundary (`CachingLayerService.markBreakpoints(params, [{ region: 'system' }])`, see `task-caching-layer.md`) on every call after the first, so a run's later calls — and a same-issue re-run within the ~1-hour TTL — hit the cache instead of reprocessing the shared context at full price.

Model tiers: routing uses `ModelConfigService.getModel('classification')` (Haiku); every other call (draft, refine, all 3 grading calls) uses `getModel('default')`.

## Frontend

`frontend/src/app/workflow-gallery/` (`WorkflowGallery`). Stacks `<app-docs-panel [slug]="'workflow-gallery'" />` → the demo (issue picker populated from `GET /issues`, Run button, a stage-by-stage result view showing the routed category, the final draft, each criterion's pass/fail with feedback, and the iteration count/pass state) → `<app-inspector-panel [call]="inspectorCall()" />`, per the app-shell composition convention. No streaming toggle (see "Endpoint contract" above). The result view stays mounted (skeleton placeholders) for the run's duration per [`loading-states.md`](../technical/loading-states.md), since a run can take noticeably longer than a single-call lab.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Backend unit"/"Backend integration"/"Frontend unit" buckets:

- [ ] **Unit** — routing correctly classifies a fake `AnthropicClient` response into each of the 4 categories, and the draft stage's prompt reflects the routed category.
- [ ] **Unit** — the chain issues two sequential calls (draft, then refine), and the refine call's request includes the draft call's own output.
- [ ] **Unit** — the parallel grading stage issues exactly 3 concurrent calls (tone, technical accuracy, policy compliance) and aggregates all 3 results into `grading`.
- [ ] **Unit** — a failing criterion's feedback is appended to the next attempt's draft-stage prompt, and the draft→refine→grade sequence re-runs.
- [ ] **Unit** — the loop stops at the first attempt where all 3 criteria pass, with `iterations` reflecting the attempt count and `passed: true`.
- [ ] **Unit** — the iteration cap (3) is enforced: after 3 failing attempts, the route returns the last attempt's draft with `passed: false` and no 4th attempt is made.
- [ ] **Unit** — `calls` holds every stage's call across every attempt, in true chronological order.
- [ ] **Unit** — a cache boundary is present on every call after the first in a run, and `cache.read`/`cache.write` in the response match `CachingLayerService.readCacheStatus()` off the final call's usage.
- [ ] **Unit** — `POST /run` with an `issueNumber` absent from the currently-open issues list throws `NotFoundException` (404), not an `ExternalApiError`.
- [ ] **Integration** — a `nock`-intercepted end-to-end run against fixture Anthropic/GitHub responses proves the full `200` response shape (`calls`, `route`, `draft`, `grading`, `iterations`, `passed`, `cache`) and `GET /issues`' shape.
- [ ] **Frontend unit** — the issue picker populates from `GET /issues`; the Run button is disabled with no issue selected; the result view renders the routed category, final draft, per-criterion pass/fail, and iteration count from a mocked response; the inspector panel receives the full `calls` trace.

### Manual

1. With a real `ANTHROPIC_API_KEY` and `GITHUB_TARGET_REPO` (and optionally `GITHUB_TOKEN`) configured, pick a real open issue from the picker and click Run — confirm the routed category looks sensible for the issue's actual content, and the final draft reads as a plausible response to it.
2. Confirm the inspector panel's `calls` list shows the full real pipeline trace (route → draft → refine → 3 parallel grades, repeated per attempt if any criterion failed) in order, matching the "Pipeline shape" section above.
3. Run the same issue a second time within an hour and confirm the inspector panel reports `cache.read: true` on the second run's non-first calls.

## To-do list

- [ ] Implement `GET /api/workflow-gallery/issues`.
- [ ] Implement the routing stage (Haiku-tier classification into the 4 categories).
- [ ] Implement the chain (draft, then refine) stage.
- [ ] Implement the parallel grading stage (3 concurrent criteria calls).
- [ ] Implement the evaluator-optimizer loop (feedback-driven retry, capped at 3 attempts).
- [ ] Wire `CachingLayerService`'s system-prompt breakpoint across every call in a run.
- [ ] Assemble the full response (`calls`, `route`, `draft`, `grading`, `iterations`, `passed`, `cache`).
- [ ] Implement `POST /api/workflow-gallery/run`'s `404` handling for an unknown/no-longer-open `issueNumber`.
- [ ] Build the frontend issue picker, Run flow, and stage-by-stage result view.
- [ ] Wire `WorkflowGalleryModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `GithubProviderModule`, `CachingLayerModule`).

## Open questions

None.
