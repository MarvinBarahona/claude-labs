# Task — API error handling

**Status:** 📝 Draft.

## Description

A shared global Nest exception filter, plus one normalized exception class every external-client wrapper throws on failure, that together produce the response shape [`architecture.md`](../technical/architecture.md)'s "Error contract" section already commits every feature to: a non-2xx HTTP response carrying `{ error: { message, source } }` (`source` names which system failed — the Claude API, a specific data source, or the app itself), never swallowed into a misleading 200. Mid-stream, the same shape goes out as a terminal SSE error event instead of an HTTP status.

Needed because nothing in the backend currently implements this — there is no global exception filter and no normalized "external call failed" exception type anywhere in `backend/src/`. `architecture.md` documents the contract as a standing decision every feature/task plan must already fit inside, but until this task exists, a real failure (e.g. a bad `ANTHROPIC_API_KEY` surfacing on an actual Messages API call) would just propagate as whatever Nest's default unhandled-exception response happens to look like, not the documented shape.

This surfaced while planning `task-anthropic-client.md`: once `RealAnthropicClient` makes an actual SDK call, its failures need somewhere to land. Every future task that adds a real external-data-source client (`task-github-provider`, `task-deepwiki-connector`, etc.) will need the exact same shaping, so this is its own shared task rather than folded into `anthropic-client`'s scope — same reasoning as why `anthropic-client` itself was split out of `feature-foundations-console`.

## Open questions

- Exact `source` values the normalized exception carries (`"anthropic"` vs. a more generic `"claude-api"`, plus whatever a future data-source task will need) — settle this during detailed planning by checking what `architecture.md`'s existing prose already implies and keeping it consistent with `key-health.md`'s existing `AuthenticationError`-classification pattern (a precedent for distinguishing a real auth failure from a transient one, though that check has no fake counterpart and isn't itself routed through this filter).
- Whether one generic normalized exception class suffices for every external client (parameterized by `source` and `message`) or each client needs its own subclass — likely the former, given there's only ever one shape to produce, but worth confirming no client has a genuinely distinct error case once GitHub's own client exists.

## Likely dependencies

- [`architecture.md`](../technical/architecture.md), "Error contract" — the exact response shape and streaming/non-streaming behavior this task implements.
- [`task-anthropic-client.md`](task-anthropic-client.md) — its first consumer: `RealAnthropicClient` needs to throw this task's normalized exception (rather than letting the raw Anthropic SDK error propagate) whenever a real call fails.
- [`key-health.md`](../shared/key-health.md) — existing precedent for classifying an `AuthenticationError` from the Anthropic SDK; this task's own error classification should stay consistent with it, though `KeyHealthService` itself isn't routed through this filter (it never throws to a controller — it returns a cached status).
- [`repo-layout.md`](../technical/repo-layout.md), "Shared functionality" — governs where the new shared module folder goes (`backend/src/shared/<concern>/`).
