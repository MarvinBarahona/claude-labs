A "workflow" is a fixed, predictable sequence of separate Claude calls wired
together in code — as opposed to a single call, or an open-ended agent loop
that decides its own next step. This lab runs a real support-triage pipeline
against an actual open issue from this project's GitHub repo, composing all
four common workflow patterns end to end: **route** the issue to a category,
**chain** a draft into a refined reply, **parallelize** grading it against
several criteria at once, and repeat that grade-and-revise cycle as an
**evaluator-optimizer** loop until it passes or hits a retry cap.

## Routing

The first call classifies the issue into exactly one category, so the rest
of the pipeline can specialize for it instead of handling every issue type
the same way:

```json
{
  "model": "claude-haiku-4-5",
  "system": "You are triaging and drafting a response to a GitHub issue.\n\nIssue #<n>: <title>\n\n<body>",
  "messages": [{ "role": "user", "content": "Classify this GitHub issue into exactly one category." }],
  "output_config": {
    "format": {
      "type": "json_schema",
      "schema": {
        "type": "object",
        "properties": { "category": { "type": "string", "enum": ["bug", "feature-request", "question", "support"] } },
        "required": ["category"],
        "additionalProperties": false
      }
    }
  }
}
```

Routing is the cheapest step, so it runs on Haiku rather than the model
every other stage uses — a routing call only has to pick a lane, not write
anything a user will read.

## Chaining

Once routed, the reply itself is built in two sequential calls rather than
one: a draft call writes a first pass addressed to the routed category, then
a refine call is handed that draft back (as the assistant's own prior turn)
and asked to polish it for clarity, tone, and completeness. Each call's
output only makes sense as input to the next — that dependency is what makes
this chaining rather than two independent calls.

## Parallelization

The refined draft is graded against three independent criteria — tone,
technical accuracy, policy compliance — as three concurrent calls rather
than three sequential ones, since none of those criteria depends on the
others' outcome:

```json
{
  "messages": [{ "role": "user", "content": "Grade the following drafted reply strictly against the \"tone\" criterion. Reply with whether it passes and, if not, actionable feedback.\n\nDraft:\n<refined draft>" }],
  "output_config": {
    "format": {
      "type": "json_schema",
      "schema": {
        "type": "object",
        "properties": { "pass": { "type": "boolean" }, "feedback": { "type": "string" } },
        "required": ["pass", "feedback"],
        "additionalProperties": false
      }
    }
  }
}
```

## Evaluator-optimizer loop

If any criterion fails, its feedback is appended to the next attempt's draft
prompt and the draft → refine → grade sequence runs again — the grader
(evaluator) and the drafter (optimizer) are separate calls, not one call
asked to critique itself. This repeats until every criterion passes, or
until 3 attempts have run, whichever comes first: an evaluator-optimizer
loop always needs a hard cap, since a criterion a draft genuinely can't
satisfy would otherwise retry forever. Hitting the cap still returns the
last attempt's draft, marked as not passed, rather than failing the request.

## Prompt caching

Every call after routing shares the same system prompt (the issue's own
number, title, and body), so it's marked as a cache breakpoint — the first
of those calls pays full price to write it into the cache, and every later
call in the same run, or a same-issue re-run within the cache's lifetime,
reads it back instead of reprocessing it. The inspector panel below shows
whether the run's final call read from or wrote to the cache.

## The trace

The inspector panel shows every call this run made, in order — route, draft,
refine, three grading calls, repeated once per attempt if any criterion
failed — not just the last one, since the point of this lab is the shape of
the whole multi-call pipeline, not any single reply.

## Gotcha

This lab is deliberately non-streaming: a run can take up to 16 calls
(1 route + up to 3 attempts × 5 calls each), and its value is in the
after-the-fact trace of that whole structure, not in watching any one
call's tokens arrive live.
