The **code execution tool** runs Python for Claude in an isolated, sandboxed
container with no network access — reach for it whenever a task needs
Claude to actually compute something (crunch numbers, generate a chart,
transform a file) rather than just talk about it. Because the sandbox has
no network access, getting data in and files out has to go through the
**Files API** instead. This lab fetches real issue/commit data from this
project's own GitHub repo, uploads it, and lets Claude write and run Python
against it — optionally reaching for a custom **Agent Skill** along the way.

## Getting data into the sandbox

The dataset never gets typed into the prompt as text — it's uploaded once,
and the sandbox reads it as a real file:

```json
{
  "model": "claude-sonnet-5",
  "tools": [{ "type": "code_execution_20250825", "name": "code_execution" }],
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "container_upload", "file_id": "file_abc123" },
        { "type": "text", "text": "Chart commit frequency by month." }
      ]
    }
  ]
}
```

`file_abc123` is the ID returned by uploading the serialized issues+commits
JSON via the Files API beforehand. This call always sends the
`files-api-2025-04-14` beta header, regardless of anything else this lab
does — a `container_upload` block only resolves with that header present.

## Reading what Claude ran

Every time Claude executes a shell command, the response carries a matched
pair of blocks: a `server_tool_use` block naming the command, and a
`bash_code_execution_tool_result` right after it with the outcome:

```json
{ "type": "server_tool_use", "id": "srvtoolu_1", "name": "bash_code_execution", "input": { "command": "python analyze.py" } }
```

```json
{
  "type": "bash_code_execution_tool_result",
  "tool_use_id": "srvtoolu_1",
  "content": { "stdout": "chart saved", "stderr": "", "return_code": 0 }
}
```

This lab pairs each `server_tool_use`/result by matching `tool_use_id` back
to the block's own `id`, and lists every pair below, in the order Claude
ran them — a single prompt can trigger several rounds of code before
Claude answers.

## Getting files back out

A file Claude's code creates (a chart, a spreadsheet) doesn't come back as
bytes directly — it shows up as a `file_id` inside the result block's own
`content.content[]` array:

```json
{
  "content": {
    "stdout": "", "stderr": "", "return_code": 0,
    "content": [{ "type": "bash_code_execution_output", "file_id": "file_out_1" }]
  }
}
```

This lab downloads every such `file_id` via the Files API right after the
call and renders it below: an image media type renders inline, anything
else (like a generated `.xlsx`) offers a download link instead.

## Agent Skills

Turning the "Use Spreadsheet Export Skill" toggle on attaches a **custom
Agent Skill** — a packaged `SKILL.md` plus a helper script — to the request,
telling Claude it has a better option than a plain CSV for tabular output:

```json
{
  "container": { "skills": [{ "type": "custom", "skill_id": "skill_abc123", "version": "latest" }] }
}
```

A custom skill needs registering once before it has a `skill_id` at all
(`POST /v1/skills`, a separate call this lab makes lazily on its first use
and then caches for the rest of the process's lifetime) — there's no way to
point a request at a `SKILL.md` file path directly. Loading a skill also
adds the `skills-2025-10-02` beta header, on top of the Files API one this
lab always sends.

## Gotcha

There's no dedicated block or field that says "the skill was used" — Claude
just runs bash commands, and if it decided the skill was relevant, one of
those commands references the skill's own files. This lab's "skill used"
badge is inferred from that: it checks whether any executed command
mentions the skill by name, not from any explicit signal the API returns.
Toggling the skill on only makes it *available* — Claude still decides for
itself whether the task actually calls for a spreadsheet over a CSV.
