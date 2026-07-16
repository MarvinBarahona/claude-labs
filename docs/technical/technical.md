# Claude Labs — Technical

Permanent index of project-level technical decisions — tech stack, repo layout, testing strategy, and further decisions as they're made. This file holds no decision content itself, only a pointer to the one file that does: each row below links to the file where that topic actually lives.

This is decisions only — not documentation for a lab's own shared functionality. Those live in `docs/shared/<slug>.md` instead.

The linked files never link to each other or back to this index — this table is the only place that can go stale when a topic is added, split, or retired, and it's the only entry point for finding technical detail.

| Topic | One-line summary | File |
|---|---|---|
| Tech stack | Frontend/backend frameworks, Docker-only runtime | [`tech-stack.md`](tech-stack.md) |
| Repo layout | Monorepo structure, decision model for where new code goes, secrets files, how a lab gets removed | [`repo-layout.md`](repo-layout.md) |
| Architecture | How frontend, backend, data sources, and the Claude API communicate: request/response envelope, streaming transport, tool-loop vs. server-tool handling, error contract | [`architecture.md`](architecture.md) |
| Testing strategy | Unit/integration test levels, the no-real-credentials-in-tests rule, and how external clients get mocked | [`testing-strategy.md`](testing-strategy.md) |
| Guiding principles | Project-wide design principles applying to every lab and shared functionality | [`guiding-principles.md`](guiding-principles.md) |
| Forms | Field label styling, checkbox labeling, responsive layout, and spacing conventions for building a lab's settings forms | [`forms.md`](forms.md) |

Coding conventions that would hold in any project using this stack — general Angular or Nest style — aren't architecture decisions and don't belong here. A project-specific design-system convention (exact styling, spacing, or layout rules particular to this app's own UI, as opposed to a general framework practice) is a standing decision about this project and does belong here.
