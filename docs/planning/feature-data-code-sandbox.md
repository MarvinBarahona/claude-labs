# Feature — Data & Code Sandbox

**Status:** 📝 Draft.

**Nav position:** after `feature-web-repo-research-reporter`.

## Claude API features

- **Code execution tool** — server tool (no implementation to write); runs Python in an isolated Docker sandbox with no network access; can execute multiple times per conversation, iterating on results; response mixes `text`, `server_tool_use` (the code that ran), and `code_execution_tool_result` (stdout/errors/output file refs) blocks.
- **Files API (mandatory here)** — upload a file once, get a file ID, reference it in a message instead of inline base64; the only way to move data into/out of the sandbox since it has no network access — data goes in via file ID, results come out via file ID.
- **Agent Skills** — a packaged `SKILL.md` (frontmatter `name`/`description`) plus scripts/resources, loaded via `container.skills` alongside the code execution tool (needs both the `code-execution` and `skills` beta headers); progressive disclosure keeps an unused skill's full instructions out of context until Claude judges it relevant; up to 8 skills per request; skill output files land in the Files API.

## Main idea

Pull real activity data for the subject repo (issues/commits/stars over time, via the GitHub provider), upload it through the Files API, and have Claude write and run Python in the sandbox to analyze it and produce charts/reports — output files flow back out through the Files API too. Where it fits naturally, layers in an Agent Skill (e.g. spreadsheet export) running in the same sandbox.

## Dataset & env vars

- **GitHub REST API** — same subject repo, reused via the GitHub data provider; no new integration. Uses `GITHUB_TARGET_REPO` and, optionally, `GITHUB_TOKEN`.

## Build order & dependencies

Right after Document Research Assistant (see `status.md` for current position).

- Requires the **GitHub data provider** ([`github-provider.md`](../shared/github-provider.md)).
- Requires the **content-block builder** ([`task-content-block-builder.md`](task-content-block-builder.md), first used by Document Research Assistant) to already exist, since Files API is mandatory here — this is why this feature is built after Document Research Assistant rather than earlier.

## Shared functionality used

- GitHub data provider ([`github-provider.md`](../shared/github-provider.md)).
- Content-block builder ([`task-content-block-builder.md`](task-content-block-builder.md)), used in **Files-API-only mode** (see below).

## Files API / base64

The code-execution sandbox has no network access, so the **Files API is the only way to get data in and out** — there is no base64 fallback path here, unlike Document Research Assistant and Vision Lab. The shared content-block builder is used strictly in its Files API mode.

## Open questions

None.
