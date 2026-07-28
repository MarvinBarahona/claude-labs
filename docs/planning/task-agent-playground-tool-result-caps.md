# Task — Agent Playground Tool Result Caps

**Status:** 📋 Planned

**Target doc:** [`agent-playground.md`](../features/agent-playground.md)

## What

A real (non-fake-mode) run of the Agent Playground lab cost roughly $7. Inspecting the raw
request/response trace showed the run made only 2 Claude API calls — the second one alone
billed ~2.9M input tokens. The cause: `list_files` (called with no `path` filter, the
natural first move for an agent exploring an unfamiliar repo) returns the *entire* result
of `GithubClient.getFileTree()` — every file and directory in the configured target repo,
JSON-stringified whole into the tool result, no size limit. Against the default target repo
(`angular/angular`, tens of thousands of tree entries), that single tool result was ~2MB of
text. It's appended to conversation history and resent as input on the next call, which is
where the token spike came from.

`search` is built from the same unbounded `getFileTree()` call and has the identical
exposure. `read_file` has the same class of bug for file *content* rather than the tree — a
single large file in the target repo (a lockfile, a minified bundle) would blow up a tool
result the same way.

This task caps all three custom tool results at a fixed size in
`backend/src/agent-playground/agent-playground.service.ts`, so a run's per-call cost has a
predictable ceiling regardless of which repo `GITHUB_TARGET_REPO` points at.

## Why now

The lab is meant to be safe to run against a real key — this is the one lab in the app where
Claude chooses its own steps. An unbounded external payload landing in a tool result
defeats that: cost is currently unbounded by target-repo size, not by anything this app
controls. The bug is also invisible in fake mode — `FakeGithubClient`'s default tree fixture
is 2 entries — so nothing in the existing test suite would have caught it.

## Decisions

- **Truncation shape:** `list_files`/`search` always return
  `{ entries: { path, type }[], totalMatches: number, truncated: boolean }` — never a bare
  array — so the shape is uniform whether or not truncation actually happened
  (`totalMatches === entries.length` and `truncated: false` in the untruncated case). The
  `sha` field is dropped entirely: unused by the model (`read_file` takes a `path`, not a
  `sha`) and unused by the frontend (confirmed: no `.sha` reference anywhere under
  `frontend/src/app/agent-playground/`). `read_file` extends its existing
  `{ content, encoding }` shape with `truncated: boolean`; its existing not-found/error path
  (`is_error: true`) is untouched.
- **Caps:** `MAX_TREE_ENTRIES = 500` for `list_files`/`search`; `MAX_FILE_CONTENT_CHARS = 20_000`
  for `read_file`. Both are plain module-level constants in `agent-playground.service.ts`,
  easy to retune later — generous enough that the lab stays useful for exploring a large
  real repo's structure, small enough that even a full `ITERATION_CAP`-length run (worst
  case: every iteration hits both caps) stays cheap regardless of target-repo size.
- **`ITERATION_CAP`'s `mcp_tool_use` gap — explicitly out of scope.** `ITERATION_CAP` only
  counts the 3 custom tool calls; an `ask_deepwiki` (`mcp_tool_use`) call never advances it
  (by design — see `agent-playground.md`'s existing note), so a run leaning on repeated
  `ask_deepwiki` calls could still exceed 10 total round-trips even after this fix. Once
  every tool result is capped, each extra round-trip is cheap on its own — this residual
  risk is far smaller than the bug that caused the $7 run. Not addressed here; revisit only
  if it actually becomes a problem in practice.
- **New standing decision recorded:** `architecture.md`, "Custom tools vs. server-executed
  tools" — added a bullet ("A custom tool wrapping a size-unbounded external data source
  must cap what it returns") capturing this as a general rule for any future lab wrapping an
  unbounded external source in a custom tool, not just this one. Already applied as part of
  planning this task — `build-work-item` doesn't need to touch `architecture.md` again.

## Dependencies

- depends on: [`agent-playground.md`](../features/agent-playground.md) (target doc, read in
  full) — "Backend" section (current tool definitions, loop shape, response envelope) and
  "Testing" section (existing `agent-playground.service.spec.ts` coverage this task extends).
  Updated at graduation to describe the new result shapes and caps.
- depends on: [`github-provider.md`](../shared/github-provider.md) (read in full) —
  "Interface" section. `GithubClient`/`RealGithubClient`/`FakeGithubClient`/
  `GithubFileTreeEntry` are unchanged by this task: `getFileTree()`/`getFileContent()` stay a
  faithful, uncapped wrapper of GitHub's real API. The cap is applied entirely in
  `agent-playground.service.ts`, the only consumer of these two methods.
- depends on: [`architecture.md`](../technical/architecture.md), "Custom tools vs.
  server-executed tools" — the newly-added size-cap bullet (see "Decisions" above) is the
  standing rule this task's implementation follows.
- depends on: [`testing-strategy.md`](../technical/testing-strategy.md) — "Backend unit"
  bucket definition, and "Shared test doubles, not one ad hoc mock per lab" (this task's new
  tests drive `FakeGithubClient.setFileTree()`/`setFileContent()`, already exposed by the
  existing test double — no test-double change needed).

## Test scenarios

### Automated

All in `backend/src/agent-playground/agent-playground.service.spec.ts` (backend unit bucket,
`FakeGithubClient` bound via DI, no real network):

1. `list_files`, fixture tree at or under `MAX_TREE_ENTRIES` (the existing small fixtures) →
   result is `{ entries: [...], totalMatches: <fixture length>, truncated: false }`, entries
   carry no `sha` field.
2. `list_files`, fixture tree seeded with more than `MAX_TREE_ENTRIES` synthetic entries →
   `entries.length === MAX_TREE_ENTRIES`, `totalMatches === <full seeded count>`,
   `truncated: true`.
3. `list_files` with a `path` prefix filter still filters *before* capping/counting —
   `totalMatches` reflects the filtered count, not the whole unfiltered tree (extends the
   existing prefix-filter test to the new shape).
4. `search` — the same three scenarios as `list_files` (untruncated shape, truncation over
   `MAX_TREE_ENTRIES`, count reflects the substring-filtered set, not the whole tree),
   substituting the existing case-insensitive substring-match test.
5. `read_file`, fixture content at or under `MAX_FILE_CONTENT_CHARS` → 
   `{ content, encoding, truncated: false }`, content byte-for-byte unchanged.
6. `read_file`, fixture content over `MAX_FILE_CONTENT_CHARS` → `content` sliced to exactly
   the cap, `truncated: true`.
7. `read_file`'s existing not-found/error path is unaffected: still returns `is_error: true`
   with the tool-result message carrying `is_error: true`, per the existing test — regression
   check that truncation logic only touches the success path.
8. Existing full-loop tests (`toolActivity` ordering across tool kinds, `calls` in
   chronological order, `hitIterationCap` force-stop behavior, streaming frame sequence) still
   pass with their `list_files`/`search`/`read_file` result assertions updated to the new
   shapes — these aren't new scenarios, but every existing assertion on the old bare-array /
   `{content, encoding}` shape needs updating in place, not left stale.

No `agent-playground.e2e-spec.ts` or frontend changes are needed: the response envelope's
top-level shape (`calls`, `toolActivity`, `hitIterationCap`, `finalAnswer`) is unchanged —
only the `result`/`input` payload *inside* a `toolActivity` entry changes shape, and the
frontend already renders that generically (confirmed: no field-specific rendering of
`list_files`/`search`/`read_file` results anywhere under
`frontend/src/app/agent-playground/`) — no DOM-shape change, so no Playwright spec assertion
needs touching either, per `testing-strategy.md`'s DOM-shape-change callout.

### Manual

None required for verifying the code change itself — fully covered by the automated
scenarios above, and there's no DOM/UI change to eyeball.

Optional, user-run only (this task's own implementation and testing stays fake-mode/no real
credential throughout, per this project's real-key policy): after the fix lands, the user
may choose to re-run the lab for real against their own key and confirm token usage for a
`list_files`-against-`angular/angular` run now lands in the low thousands rather than
millions. Not part of this task's own definition of done.

## To-do list

- [ ] Add `MAX_TREE_ENTRIES = 500` and `MAX_FILE_CONTENT_CHARS = 20_000` constants to
      `agent-playground.service.ts`, alongside the existing `ITERATION_CAP`.
- [ ] Update `executeListFiles`/`executeSearch`: strip `sha` from each entry, cap to
      `MAX_TREE_ENTRIES`, return `{ entries, totalMatches, truncated }` as both
      `toolResultBlock.content` (JSON-stringified) and `displayResult`.
- [ ] Update `executeReadFile`'s success path: cap `content` to `MAX_FILE_CONTENT_CHARS`,
      return `{ content, encoding, truncated }`; leave the existing error/`is_error: true`
      path untouched.
- [ ] Update `agent-playground.service.spec.ts` per "Test scenarios" → "Automated" above:
      adjust existing assertions to the new shapes, add the new truncation-triggering cases.
- [ ] Run backend unit tests, lint, and build in-container and confirm all green (per
      `CLAUDE.md`'s required verification trio — `npm test` alone doesn't type-check, per
      `testing-strategy.md`).
- [ ] At graduation: update `agent-playground.md`'s "Backend" section to document the new
      `list_files`/`search`/`read_file` result shapes and the two caps; update its "Testing"
      section to describe the new spec coverage.
