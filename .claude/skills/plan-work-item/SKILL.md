---
name: plan-work-item
description: This skill should be used before planning or designing any feature or task in this repo — for example when asked to "plan the search feature", "check the caching task", "should this be an agent or a workflow", "add a new data source", "how should file uploads work here", "write test scenarios for this work item", or any other build-order/architecture-adjacent decision. States which files to read first and defines what a work item's plan file must contain before implementation can begin.
---

# Planning a work item

**Phase 2 of 4 — Draft → Plan → Build → Graduate.** Previous: `draft-work-item`. Next: `build-work-item`. If planning surfaces a reason this item isn't worth building after all, it can still be reversed with `abandon-work-item` instead of carrying it forward.

## Read first

Before planning or building anything in this repo, read, in order:

1. `docs/status.md` — current build order and status of every work item.
2. `technical.md`'s index — read in full any topic that applies project-wide regardless of which work item is being planned (e.g. a recorded set of guiding principles or standing decisions, if this project keeps one — check the index for it). For everything else, skim the index and open only the specific topic file that actually bears on this work item; don't read every technical file.
3. `docs/features/*.md` and `docs/shared/*.md` — skim for any already-completed work item this one might depend on or build alongside (don't read every one, only what looks relevant). If this work item's plan file carries a `**Target doc:**` line (a follow-on, per `draft-work-item`), read that target doc in full — it's the baseline this work item is about to change.
4. The relevant `feature-<slug>.md` or `task-<slug>.md` — this work item's own plan file, in whatever state it's already in, including any sibling task/feature it was drafted alongside (per `draft-work-item`'s common-functionality split) — read that sibling's plan file directly too, since it's this item's own named dependency.
5. Every other dependency this work item's own plan file already names — read it directly, in full: its permanent doc (`docs/features/<slug>.md` or `docs/shared/<slug>.md`) if it's `Done`, otherwise its own plan file, whatever its status (`Draft`, `Planned`, or `In progress`), including any `## Development notes` section it already carries. A dependency's current doc — permanent or plan, whichever it has right now — is the only source of truth about it, so read the whole thing rather than guessing which section matters; step 3 above is for discovering *un*named overlap, not for this.

Then apply this work item's dependencies and the project's standing principles/decisions found above.

## Clarify

Most calls made while turning a Draft into a `Planned`, self-contained plan file are fine to make directly — the user reviews the finished plan file afterward regardless. Ask the user instead of deciding alone only for a genuinely hard decision: more than one reasonable approach, real cost to reversing later, or one that shapes the rest of the plan (e.g. agent vs. workflow, an endpoint/data contract another work item will build against, how to resolve a scope boundary surfaced by "Mid-plan splits" below). Routine calls — naming, which existing pattern to reuse when one already fits, exact test-scenario wording — are this skill's own call, not a question. "Feature nav position" below is one recurring instance of a hard call worth asking about; it isn't the only one.

## Status precondition

Only operate on a work item whose plan file exists and whose status is `Draft` or `Planned` — never one with no plan file yet (`Not started`), and never one that's `In progress` or `Done`. When finished, set the plan file's status to `Planned` (and mirror it in `docs/status.md`).

## Feature nav position

For a fresh feature only (never a task, never a follow-on): decide whether it needs a `**Nav position:**` line, per `writing-docs`' "Feature nav position" section. First check whether this project has a navigation concept at all (skim `technical.md`'s index, or just ask) — if it doesn't, skip this entirely, for this feature and every other one in the project. If it does, ask the user which position they want unless they've already said; default to `last` when they don't specify one.

## Mid-plan splits

Detailed planning can surface the same kind of split `draft-work-item`'s "Feature or task?" section handles at draft time, just discovered later: this work item turns out to bundle a separable technical dependency, or other distinct scope, that wasn't obvious when it was first drafted. Don't plan around it as if it were one item. Instead, right now: draft a new work item for the split-off piece via `draft-work-item` (its own plan file, `Draft` status, its own `docs/status.md` row), then update this work item's own plan file to name it as a dependency per "A work item's plan file must be self-contained" below, narrowing this item's own scope to what's left. Continue planning this item only once the split-off piece has its own registered Draft — an implied dependency that exists only in this file's prose is invisible to future planning passes, same as at draft time.

## A work item's plan file must be self-contained

Whoever implements this work item later reads only its own plan file, plus exactly whatever files and sections that plan file cites — never other work items' plan files wholesale, never this skill, and never more of a cited file than the citation names. So detailed planning isn't done until the plan file names everything implementation will need, precisely enough to go straight to it:

- The specific guiding principles/standing decisions that actually bear on this work item — cite the exact file and section (e.g. "`<topic>.md`, 'Error handling'"), not the whole file. Don't copy their content in: a precise citation is enough for `build-work-item` to go read exactly that section, and it keeps this plan file accurate if that section is ever revised later.
- Each dependency stated as "depends on: X" with the exact file and section needed from it — X's permanent doc if `Done`, or X's own plan file otherwise; either way, already read in full per "Read first" step 5 above. A dependency doesn't need to be finished to be planned against, only to be built against. Same rule as above: cite precisely, don't copy X's content in — that way, if X's permanent doc changes later (e.g. via a follow-on against X), this plan file's citation still resolves to the current version instead of a stale copy.
- For a follow-on work item: the same treatment — cite the exact section(s) of its `**Target doc:**` this work item is going to change, not a copy of their content.
- A `## Test scenarios` section — concrete, testable scenarios covering the work item's functionality, written now, not invented later during `build-work-item`.
- A `## To-do list` section — a checklist (`- [ ]` items) of concrete implementation tasks, to be checked off as `build-work-item` completes them.

## Independent implementation tracks

When the to-do list spans genuinely independent tracks — most often frontend and backend, but any grouping where one track doesn't need another track's output to proceed — pin down the contract between them now rather than leaving it to be worked out during implementation: the exact request/response shape, endpoint route and method, error cases, and field names each track relies on. State it precisely enough that either track could be implemented and tested against that contract alone, without reading the other track's code or waiting on it. This is a property of the plan's precision, not an instruction about how the work gets carried out later — the plan file should read the same regardless of who or how many end up building it.

If the to-do list doesn't actually split into independent tracks — one track structurally depends on another's output, or there's only one track — skip this; don't force an artificial contract onto work that isn't actually separable.

## Automated vs. manual test scenarios

Within the `## Test scenarios` section, split scenarios into two labeled groups:

- **Automated** — anything a unit or integration test can assert, per `testing-strategy.md`'s four buckets. `build-work-item` implements and runs these itself, in-container, no running app process involved.
- **Manual** — anything that needs a person looking at the actually-running app to judge (layout, styling, an interaction only visible in a real browser, a real multi-step click-through) and can't be asserted by a test. Write each as a concrete, numbered step ("do X, expect Y") precise enough for the user to execute directly against their own `docker compose -f docker-compose.dev.yml up` instance — `build-work-item` hands this list to the user to run rather than running it itself by default; see that skill's "Manual test scenarios" section.

A work item fully covered by automated scenarios can leave the manual group empty — don't invent manual steps just to have some.

## Write decisions back

If detailed planning surfaces something that reaches beyond this one work item's file, write it back where future planning passes will actually see it, not only into the work item's own file:

- A build-order change, or a new/shifted dependency that affects ordering → reorder `docs/status.md`'s table accordingly.
- A fact or need that reaches beyond this one work item (a shared data source, a piece of common functionality another feature will also need) → if a work item already owns that scope, update its own plan file directly; if none does yet, draft a new task for it now, per `draft-work-item`'s common-functionality trigger, rather than leaving it stated only here.
- A lasting technical or product decision → record it under `docs/technical/`, following the `writing-docs` skill's "Recording a technical decision" procedure.
- A suggested change to a file not owned by the workflow (`README.md`, `CLAUDE.md`, another skill) → append it to `docs/process-notes.md` (create it if it doesn't exist yet — see `writing-docs`), one entry naming this work item's slug and a one-line summary, so it doesn't get lost.

A decision left stranded only in one work item's plan file is invisible to every other planning pass. There is no central dependency map anywhere in this project — a dependency belongs solely in the work item's own plan file, per "A work item's plan file must be self-contained" above.
