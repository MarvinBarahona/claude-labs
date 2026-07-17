# Technical — Architecture

Update as the system evolves.

How the frontend, backend, external data sources, and the Claude API communicate — the contract every feature and task plan must fit inside. This is not implementation guidance for any one of them (see `tech-stack.md` and `repo-layout.md` for that); it's the shape of the wiring between them.

## Communication boundaries

- **The frontend only ever talks to its own backend.** It holds no API keys and calls no third-party host directly. Every Claude API call, every external-data-source call, and every MCP connector call is made by the backend; the frontend consumes only this app's own routes.
- **Same origin via the Angular dev server, not a reverse proxy or CORS.** The frontend container runs the Angular CLI dev server (`ng serve`), whose own dev-server proxy forwards the backend's route prefix to the backend container over Docker Compose's service-name DNS. The browser only ever sees one origin — the dev server's — so there is no CORS configuration to maintain and no separate proxy container to run. A separate production configuration keeps this same one-origin property by an even simpler mechanism: no dev server and no proxy at all, because the backend serves the frontend's compiled static build directly out of the same process that serves `/api`.
- **The backend is the only holder of secrets.** The Claude API key, any data-source token, and any future credential are read through the app's typed config service and never appear in a response body or any payload sent to the frontend.
- **Shared functionality, not per-lab reimplementation.** Model-tier selection, external-data-source access, cache-breakpoint placement, and file/image delivery (Files API vs. inline) each live in exactly one shared backend module. A lab calls these shared modules; it never re-implements any of them, and never reaches an external host or the Claude API except through whichever shared module already covers that need.

## Request/response contract (the inspector's data shape)

Every lab's backend endpoint reports its Claude API activity for one turn in the same envelope, regardless of how many Claude API calls building that turn's answer took:

```
{
  request:    <exact JSON body of the (last) call made to the Messages API this turn>,
  response:   <exact JSON body of the (last) response from the Messages API this turn>,
  calls:      [ ...earlier { request, response } pairs from this same turn, in order ... ],  // omitted for a single-call turn
  usage:      { inputTokens, outputTokens, cacheCreationInputTokens?, cacheReadInputTokens? },
  stopReason: <the final call's stop_reason>,
  cache:      { read: boolean, write: boolean }  // omitted for a lab that never places a breakpoint
}
```

The shared inspector component renders exactly this shape — a lab exposes it, it never invents its own display, and it never hides a multi-call turn behind only the last call's data. `calls` exists because a single turn can involve more than one Messages API call (a tool loop, a routing-then-pipeline chain, a producer/grader iteration) — each earlier call is recorded in order so the inspector shows the whole turn, not just its final leg.

## Streaming transport

- A streaming turn is delivered to the frontend as Server-Sent Events on the same endpoint that serves the non-streaming response for that same lab — a streaming toggle in the UI picks which mode a given request asks for, not a different route.
- Because a turn's request body is non-trivial (messages, tool definitions, a system prompt), the frontend reads this stream via a `fetch()` response body reader, not the browser's native `EventSource` API — `EventSource` can't carry a POST body. Any shared frontend streaming utility is built around that constraint from the start.
- Each event Claude itself emits (`message_start`, `content_block_delta`, ...) is forwarded verbatim, named by its own `type` field. A turn that runs a backend-executed tool loop (see below) adds two app-level event types that aren't part of Claude's own stream — one marking the app's own function call starting, one marking its result — so the inspector can show the app's execution, not only Claude's request for it.
- The stream always ends with one terminal event carrying the full envelope described above, so the inspector has one consistent place to read final `usage`/`stopReason`/cache status whether or not that turn happened to stream.

## Server-owned session state

Every lab defaults to stateless-per-request — a caller sends its full input, gets back one turn's answer, nothing is remembered server-side between calls (a lab with its own multi-turn UI, like Messages Console, does it by having the *frontend* resend the entire `messages` array on every call). A feature departs from that default only when it genuinely needs server-side state for one of these reasons, not as a general upgrade:

- A custom tool's real execution has to live server-side regardless (per "Custom tools vs. server-executed tools" below), and that tool's own effect (e.g. a file it edits) is state only the backend can own.
- Re-sending a large attachment (a document, an image) on every follow-up call would be wasteful when a Files-API-mode upload already gives the backend a reusable reference — that reference only pays off if the backend keeps it instead of asking the frontend to keep resending the source bytes.
- A cache breakpoint's value depends on an exact byte-identical prefix across calls ([`caching-layer.md`](../shared/caching-layer.md)) — the backend rebuilding the same request prefix from its own stored state on every call guarantees this; relying on the frontend to reconstruct byte-identical history invites subtle cache-invalidating drift.

Where any of these apply, the standing shape (first established by Document Research Assistant, and reused rather than reinvented by any later feature in the same situation) is a service-level in-memory `Map<sessionId, ...>` holding whatever that feature's own session needs. No database, no persistence across a process restart — consistent with every other piece of app state (e.g. `FakeGithubClient`'s canned data) being in-memory only; this app has no persistence layer anywhere. A page refresh starts a new session rather than resuming a stale one — deliberate, not an oversight, since there's no resume affordance anywhere else in the app either. A feature that doesn't need any of the three reasons above stays stateless, same as most of the app.

## Custom tools vs. server-executed tools

- A **custom tool** — one whose function the backend itself implements — is run entirely by the backend: Claude returns a tool-use block, the backend executes the real function, and replies with a matching tool-result block in a new call, repeating until Claude's `stop_reason` is no longer `tool_use`. This is the only case that produces more than one entry in `calls` above, and the only case that needs the two app-level streaming events described above.
- A **server-executed tool** (a hosted search tool, a hosted code-execution tool, an MCP connector, or any other tool that runs on Anthropic's own systems) resolves inside a single Messages API call — its activity comes back as extra content blocks in that same response. The backend forwards those blocks through the same envelope unchanged; it does not loop, and does not need to implement the tool's function itself.
- A single turn can mix both kinds. The tool loop above only advances on tool-use blocks belonging to a tool the backend itself must execute; every other block in the response is just forwarded.
- **A custom-tool loop's request-params object is reassigned between iterations, never mutated in place.** `calls` stores one entry per iteration, each holding the exact request sent for that call — if the loop reuses the same object and mutates it (appending the next message, adding a tool result) before pushing the next `calls` entry, every earlier entry's stored `request` silently changes too, since they all reference the same mutated object rather than a snapshot. Build each iteration's params as a new object (e.g. spreading the previous one with the new message appended) instead.

## Error contract

- A failure from the Claude API, or from any external data source, surfaces to the frontend as a non-2xx HTTP response carrying `{ error: { message, source } }` (`source` names which system failed — the Claude API, the specific data source, or the app itself). It is never swallowed into a 200 with an empty or misleading body.
- Mid-stream, the same shape is sent as a terminal error event instead of an HTTP status, since the response has already started — and no closing envelope event follows it.
- A tool call's own failure (bad arguments from Claude, a not-found lookup, an edit that can't apply cleanly, etc.) is not a transport error — it's an ordinary tool-result block with `is_error: true`, exactly as the Claude API itself models it, so Claude sees the failure and can retry or self-correct.

## What this file doesn't cover

- Where a given piece of code physically lives — which module owns which route, or where shared frontend components sit relative to per-lab code — see `repo-layout.md`.
- How code is actually written in either stack (component style, module composition, DI, validation) — that's a coding-convention concern, not an architecture decision.
- Any one feature's own request shape — its specific tools, its specific prompt, its specific data source — that belongs entirely to that feature's own plan file, not here.
