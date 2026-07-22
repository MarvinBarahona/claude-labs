# Technical — Session State

Update as the system evolves.

Every lab defaults to stateless-per-request — a caller sends its full input, gets back one turn's answer, nothing is remembered server-side between calls (a lab with its own multi-turn UI does this by having the *frontend* resend the entire `messages` array on every call). A feature departs from that default only when it genuinely needs server-side state for one of these reasons, not as a general upgrade:

- A custom tool's real execution has to live server-side regardless (per `architecture.md`'s "Custom tools vs. server-executed tools"), and that tool's own effect (e.g. a file it edits) is state only the backend can own.
- Re-sending a large attachment (a document, an image) on every follow-up call would be wasteful when a Files-API-mode upload already gives the backend a reusable reference — that reference only pays off if the backend keeps it instead of asking the frontend to keep resending the source bytes.
- A cache breakpoint's value depends on an exact byte-identical prefix across calls ([`caching-layer.md`](../shared/caching-layer.md)) — the backend rebuilding the same request prefix from its own stored state on every call guarantees this; relying on the frontend to reconstruct byte-identical history invites subtle cache-invalidating drift.

Where any of these apply, the standing shape is a service-level in-memory `Map<sessionId, ...>` holding whatever that feature's own session needs. No database, no persistence across a process restart — consistent with every other piece of app state being in-memory only; this app has no persistence layer anywhere. A page refresh starts a new session rather than resuming a stale one — deliberate, not an oversight, since there's no resume affordance anywhere else in the app either. A feature that doesn't need any of the three reasons above stays stateless, same as most of the app.
