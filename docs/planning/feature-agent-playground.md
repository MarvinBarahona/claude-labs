# Feature — Agent Playground

**Status:** Draft.

**Nav position:** last.

## Claude API features

- **Abstract, combinable tool design** — favor a small set of general-purpose tools (list files, read file, search, ask DeepWiki MCP) over a bespoke tool per anticipated task; Claude composes primitives to cover cases nobody anticipated, and the tool surface doesn't grow unbounded as use cases grow (the same principle behind Claude Code's bash/read/edit/search toolset).
- **Environment inspection** — Claude can't tell whether an action worked unless it's given a way to check; nudge it (via the system prompt) to inspect its own output — re-read a file after "editing" it, check an API response shape, validate generated content — so it can track progress, catch errors, and adapt instead of operating blind.

## Main idea

The one deliberate agent in the app, built specifically to contrast with Workflow Gallery's fixed workflow. Given a goal ("figure out what this repo does and how it's structured") and a small set of abstract tools (list files, read file, search, ask DeepWiki MCP), Claude decides its own steps rather than following a pipeline. The UI surfaces environment-inspection checkpoints (what did Claude check before deciding it was done?) and ends with a short side-by-side comparison against Workflow Gallery: same underlying subject, workflow vs. agent execution.

## Dataset & env vars

- **GitHub REST API** + **DeepWiki MCP** — both already-built integrations, same subject repo (`GITHUB_TARGET_REPO`); no new integration or env vars.

## Build order & dependencies

Last, deliberately, since agents are the exception here, not the default (see `status.md` for current position).

- Requires the **GitHub data provider** ([`task-github-provider.md`](task-github-provider.md)).
- Requires the **DeepWiki MCP connector** ([`task-deepwiki-connector.md`](task-deepwiki-connector.md)), reused from Web & Repo Research Reporter.
- Requires **Workflow Gallery** to exist, since this feature closes with a direct comparison against it.

## Shared functionality used

- GitHub data provider ([`task-github-provider.md`](task-github-provider.md)).
- DeepWiki MCP connector ([`task-deepwiki-connector.md`](task-deepwiki-connector.md)).

## Files API / base64

Not applicable — no documents or images in this feature.

## Open questions

None.
