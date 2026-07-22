# Claude Labs — Technical

Permanent index of project-level technical decisions — tech stack, repo layout, testing strategy, and further decisions as they're made. This file holds no decision content itself, only a pointer to the one file that does: each row below links to the file where that topic actually lives.

This is decisions only — not documentation for a lab's own shared functionality. Those live in `docs/shared/<slug>.md` instead.

The linked files never link to each other or back to this index — this table is the only place that can go stale when a topic is added, split, or retired, and it's the only entry point for finding technical detail.

| Topic | When to read | File |
|---|---|---|
| Tech stack | Read when picking a library/framework, scaffolding something new, or wondering why nothing runs outside Docker | [`tech-stack.md`](tech-stack.md) |
| Repo layout | Read when deciding where a new file/module belongs, handling a secret, or removing a lab | [`repo-layout.md`](repo-layout.md) |
| Architecture | Read when a work item touches how the app talks to the Claude API or a data source — request/response shape, streaming, tool loops, or error handling | [`architecture.md`](architecture.md) |
| Session state | Read when a feature might need server-side state between calls — a stateful multi-turn session, a cache-dependent rebuild, or anything the backend keeps beyond one request | [`session-state.md`](session-state.md) |
| Testing strategy | Read when writing or planning any test — which bucket it belongs in, and how to mock an external client | [`testing-strategy.md`](testing-strategy.md) |
| Guiding principles | Read before planning or building any lab or shared functionality — always applies | [`guiding-principles.md`](guiding-principles.md) |
| Forms | Read when building a form anywhere in the app | [`forms.md`](forms.md) |
| Loading states | Read when a section's content loads asynchronously and hiding/resizing it while loading would look glitchy | [`loading-states.md`](loading-states.md) |

Coding conventions that would hold in any project using this stack — general Angular or Nest style — aren't architecture decisions and don't belong here. A project-specific design-system convention (exact styling, spacing, or layout rules particular to this app's own UI, as opposed to a general framework practice) is a standing decision about this project and does belong here.
