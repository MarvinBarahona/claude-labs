# Technical — Unbounded External Data Sources

An external source with no inherent bound on response size (a full recursive file tree, a whole
file's contents, an unpaginated list, a large PDF or image, an unrestricted server-executed/MCP
tool operation) can hand back an amount of data whose token cost — and, once it's sitting in
conversation history, whose *repeated* cost on every later call — dwarfs everything else in a
turn. Which mitigation applies depends on how the data enters the request and whether it can be
cut down without breaking what it's for:

- **A custom-tool result truncates safely** — cap entries/characters returned and signal when it
  truncated (e.g. a `truncated: boolean` field), rather than either propagating the source's raw
  size unbounded or truncating silently. A signaled truncation lets the model act on a partial
  result instead of mistaking it for a complete one. This works because the backend's own code
  builds the result before anything is billed, so a cap applied there happens before the cost is
  incurred.
- **A document/image content block doesn't truncate safely** — cutting it down can invalidate
  structure Claude derives from the whole content (a PDF's page-based citations, for instance, no
  longer line up against a cut-down file). Here the mitigation is a warning surfaced to the user
  once the source's size is known, not a silent cap and not blocking the request outright — the
  user decides whether to proceed, informed that this particular input costs and runs slower than
  usual.
- **A server-executed tool's result can't be bounded by capping it after the fact.** A
  server-executed tool (an MCP connector, a hosted search/code-execution tool, or any other tool
  that runs on Anthropic's own systems) is generated and billed as input tokens the moment it
  resolves, mid-generation, inside the same call that requested it — before that response is ever
  returned to the calling backend. A cap applied after receiving the response can only bound what
  gets stored and resent on a *later* call; it cannot reduce the cost of the call that first
  resolves the tool. For an operation with no inherent size limit on the source side (an MCP tool
  that returns a whole document rather than a paginated slice, for instance), the only lever that
  actually bounds cost is controlling which operations the model can call at all — restricting the
  tool's own configuration (e.g. an MCP `mcp_toolset` entry's `default_config`/`configs`, enabling
  only specific named operations) rather than leaving every operation the server offers enabled. A
  post-receipt cap on the operations that remain enabled is still worth keeping as
  defense-in-depth, but it is not sufficient by itself for an unbounded one.
