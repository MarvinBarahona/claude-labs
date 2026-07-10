# Task — DeepWiki MCP Connector

**Status:** Draft.

## Purpose

The shared DeepWiki MCP integration (`mcp.deepwiki.com`, no auth required) — a public remote MCP server that answers questions about a public GitHub repo's codebase. Originally embedded inline in Web & Repo Research Reporter's plan, but reused as-is by Agent Playground — the same "more than one feature will need it" shape `task-github-provider.md` and `task-caching-layer.md` already cover, so it's pulled out as its own task rather than left as an implicit reference in one feature's file.

## Interface

Backend wiring for the MCP connector call shape: `mcp_servers` config (the DeepWiki HTTPS URL; no OAuth token needed, since the server requires no auth) and a `tools` entry of `type: "mcp_toolset"` allowlisting/denylisting which of DeepWiki's tools are enabled, pointed at `GITHUB_TARGET_REPO`. Consumers get back `mcp_tool_use`/`mcp_tool_result` blocks through the normal Messages API response.

## Consumers

- [`feature-web-repo-research-reporter.md`](feature-web-repo-research-reporter.md) — first consumer; combines this connector with the web search tool for a cited research brief.
- [`feature-agent-playground.md`](feature-agent-playground.md) — reuses this connector as one of the agent's abstract tools (alongside GitHub REST calls) for open-ended repo exploration.

## Potential other uses

Any later feature that wants codebase-aware Q&A about the subject repo can call this instead of standing up its own MCP client wiring — the interface is already generic to "ask DeepWiki about `GITHUB_TARGET_REPO`," not specific to either current consumer's UI.

## Build order & dependencies

Right before Web & Repo Research Reporter (see `status.md` for current position) — nothing built before it depends on it, and it unlocks both Web & Repo Research Reporter and, later, Agent Playground. Shares `GITHUB_TARGET_REPO` with the GitHub data provider (via [`env-config.md`](../shared/env-config.md)) but doesn't depend on the GitHub data provider itself — DeepWiki is a separate, already-key-free integration, the same relationship Web & Repo Research Reporter's own plan file already describes.

## Open questions

None.
