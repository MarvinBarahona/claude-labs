# Feature — Extended Thinking Bench

**Status:** 📋 Planned.

**Nav position:** after `feature-workflow-gallery`.

## Claude API features

- **Adaptive thinking** — `thinking: {type: "adaptive"}` lets Claude decide when and how much to think, returning `thinking` content blocks before the final answer; depth is tuned via `output_config: {effort: "low" | "medium" | "high" | "xhigh" | "max"}`, not a manual token budget — current models (Sonnet, Opus) reject the older `budget_tokens` field with a 400. `thinking.display` must be set to `"summarized"` explicitly to get readable reasoning text back; the default, `"omitted"`, streams `thinking` blocks with empty text. Incompatible with message prefilling and a forced (non-`auto`) `tool_choice`; decide whether to enable it with evals — only worth it once plain prompting plateaus, not a default-on setting.

## Main idea

Re-run a genuinely hard reasoning step from Workflow Gallery's triage pipeline (e.g. a contentious or ambiguous real issue) with thinking off vs. adaptive-on at a couple of effort levels, showing the reasoning trace, latency/cost delta, and answer-quality difference side by side — framed as "only worth turning on once plain prompting plateaus," not a default-on setting.

## Dataset & env vars

- Reuses **Workflow Gallery's real issue data** — no new integration, no new env vars.

## Build order & dependencies

Layers directly onto Workflow Gallery (see `status.md` for current position).

- Requires **Workflow Gallery** to be built first: this feature picks a specific hard issue out of the same open-issues data Workflow Gallery's own picker uses, and re-runs a comparable "draft a response" reasoning step under different thinking settings.
- Does not call the GitHub data provider directly for issue *content* reuse of Workflow Gallery's own code — see "A deliberate non-dependency" below for why this feature refetches via `GithubClient` itself rather than importing Workflow Gallery's internal draft-prompt logic.

## Shared functionality used

- GitHub data provider ([`github-provider.md`](../shared/github-provider.md)) — `getIssues()`, same as Workflow Gallery's own picker.
- Config/model layer ([`model-config.md`](../shared/model-config.md)) — `getModel('default')` only; see "A deliberate non-dependency" below for why `getThinkingEffort()` is deliberately *not* used here.
- Response Envelope Builder ([`envelope-builder.md`](../shared/envelope-builder.md)) — builds each of the 3 runs' own envelope.

## Files API / base64

Not applicable — no documents or images in this feature.

## Guiding principles

- [`guiding-principles.md`](../technical/guiding-principles.md), "One inspector, many labs" — each of the 3 comparison runs is a fully valid, independent `TurnEnvelope`, so each gets its own inspector-panel instance rather than a bespoke comparison display.

## A deliberate non-dependency

Workflow Gallery's own draft-stage prompt-building logic is *not* imported here, even though this feature is explicitly built to compare against "a hard reasoning step from Workflow Gallery's triage pipeline." [`repo-layout.md`](../technical/repo-layout.md)'s rule ("a lab's own plan naming another lab's already-built piece as a dependency is exactly the signal that piece has become shared functionality") would normally mean promoting that logic to a shared module the moment this feature names it as a dependency — but Workflow Gallery is itself only `Planned`, not yet built, and this feature's actual pedagogical point (the thinking-on/off delta) doesn't require byte-identical prompt text between the two features, only a comparably hard reasoning task over the same real issue data. So this feature writes its own independent "draft a response to this issue" prompt, refetching the chosen issue via `GithubClient` directly rather than reaching into Workflow Gallery's module. This keeps the two features decoupled and avoids a premature shared-module extraction for a narrow, one-off resemblance — worth a second look once both features actually exist, in case the two prompts drift further apart than intended.

`ModelConfigService.getThinkingEffort()` is deliberately unused here too, for a related reason: it returns *the one configured default* effort level for a feature that just wants "whatever this environment is set to." This feature's entire point is comparing several different, hardcoded effort levels against each other in one run, which is the opposite use case — so it hardcodes its own fixed comparison set (`medium`, `high`) rather than going through that single-value lookup.

## Endpoint contract

Non-streaming — 3 independent runs finish and are shown side by side as a finished comparison, not as live text.

`backend/src/extended-thinking-bench/`:

- **`GET /api/extended-thinking-bench/issues`** → same shape as Workflow Gallery's own `GET /issues` (`{ issues: { number: number; title: string }[] }`), independently backed by the same `GithubClient.getIssues({ state: 'open', perPage: 100 })` call — no code sharing with Workflow Gallery's route, just both being thin wrappers over the same already-shared client.
- **`POST /api/extended-thinking-bench/run`**:
  - Request: `{ issueNumber: number }` (positive integer, required).
  - `issueNumber` not found among currently-open issues → `404` (`NotFoundException`), same precedent as Workflow Gallery's own `issueNumber` handling.
  - Fetches the issue, builds this feature's own "draft a response to this issue" prompt (see "A deliberate non-dependency" above), and fires 3 concurrent Messages API calls, all on `ModelConfigService.getModel('default')` (model choice held constant — only the thinking setting varies):
    - `thinking-off` — no `thinking` field at all.
    - `thinking-medium` — `thinking: { type: 'adaptive', display: 'summarized' }`, `output_config: { effort: 'medium' }`.
    - `thinking-high` — same shape, `effort: 'high'`.
  - Success → `200`:
    ```ts
    {
      issue: { number: number; title: string };
      runs: {
        label: 'thinking-off' | 'thinking-medium' | 'thinking-high';
        envelope: TurnEnvelope;       // this run's own complete { request, response, usage, stopReason } — architecture.md's per-turn contract holds per run, not violated by the 3-way wrapper
        latencyMs: number;
        answer: string;
        reasoningTrace: string | null;  // extracted from summarized thinking-block text; always null for thinking-off
      }[];  // always exactly 3 entries, in the order above
    }
    ```

## Frontend

`frontend/src/app/extended-thinking-bench/` (`ExtendedThinkingBench`). Stacks `<app-docs-panel [slug]="'extended-thinking-bench'" />` → the demo (issue picker populated from `GET /issues`, Run button, a 3-column comparison view — one column per run, each showing its answer, reasoning trace (or "no thinking" for the off column), latency, and token usage) → three `<app-inspector-panel [call]="...">` instances, one per run, per the app-shell composition convention extended for a multi-run comparison. Per [`loading-states.md`](../technical/loading-states.md), the comparison view stays mounted with skeleton placeholders (3 columns' worth) while a run is in flight.

## Test scenarios

### Automated

Per [`testing-strategy.md`](../technical/testing-strategy.md)'s "Backend unit"/"Backend integration"/"Frontend unit" buckets:

- [ ] **Unit** — `POST /run` with an `issueNumber` absent from the currently-open issues list throws `NotFoundException` (404).
- [ ] **Unit** — exactly 3 concurrent calls are issued, with the correct `thinking`/`output_config` shape per label (`thinking-off` has no `thinking` field; `thinking-medium`/`thinking-high` have `thinking: { type: 'adaptive', display: 'summarized' }` and the matching `output_config.effort`), and all 3 use `getModel('default')`.
- [ ] **Unit** — `reasoningTrace` is extracted from summarized thinking-block text for the two thinking-on runs, and is `null` for `thinking-off`.
- [ ] **Unit** — `latencyMs` is measured per run.
- [ ] **Integration** — a `nock`-intercepted end-to-end run against 3 fixture Anthropic responses proves the full `200` shape (`issue`, all 3 `runs` entries) and the `GET /issues`/`404` paths.
- [ ] **Frontend unit** — the issue picker populates from `GET /issues`; the Run button is disabled with no issue selected; the 3-column comparison renders answer/reasoning-trace/latency/usage per run from a mocked response, with 3 separate inspector-panel instances receiving the right `envelope` each; the comparison-view skeleton holds for the minimum duration per `loading-states.md`.

### Manual

1. With a real `ANTHROPIC_API_KEY`, pick a genuinely ambiguous or contentious real issue and run the comparison — confirm the two thinking-on runs show a visible reasoning trace absent from `thinking-off`, and eyeball whether the `thinking-high` answer reads as more thorough than `thinking-off`'s.
2. Confirm the 3 inspector-panel instances show correctly differing `usage` (and, qualitatively, latency) across the 3 runs.

## To-do list

- [ ] Implement `GET /api/extended-thinking-bench/issues`.
- [ ] Implement the independent "draft a response" prompt for the comparison harness.
- [ ] Implement the 3 concurrent calls (`thinking-off`/`thinking-medium`/`thinking-high`) with the correct request shapes.
- [ ] Implement `reasoningTrace` extraction and `latencyMs` measurement.
- [ ] Implement `POST /run`'s `404` handling for an unknown/no-longer-open `issueNumber`.
- [ ] Build the frontend: issue picker, Run flow, 3-column comparison view with 3 inspector-panel instances.
- [ ] Wire `ExtendedThinkingBenchModule` (imports `ModelConfigModule`, `AnthropicClientModule`, `EnvelopeBuilderModule`, `GithubProviderModule`).

## Open questions

None.
