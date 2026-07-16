# Process Notes

Append-only log of suggestions the drafting/build process can't apply itself: coding-convention/process changes, and changes to files it doesn't own (`README.md`, `CLAUDE.md`, other skills). Written during planning or graduation, never applied automatically. Reviewed and cleared manually, on your own schedule.

- **`github-provider`:** when a real client's fixtures file needs the external API's raw response shapes, export those raw shapes from the real client's own file and import them into the fixtures file, rather than redefining them there — keeps one definition of "what the external API actually returns" per client. `real-github-client.ts` exports `GithubIssueResponse`/`GithubCommitResponse`/`GithubReleaseResponse`/`GithubRepoResponse`/`GithubTreeResponse` for exactly this reason, mirroring how `anthropic.fixtures.ts` already reuses `AnthropicMessage`/`AnthropicStreamEvent` from `anthropic-client.ts` instead of duplicating them.
