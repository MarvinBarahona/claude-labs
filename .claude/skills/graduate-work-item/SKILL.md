---
name: graduate-work-item
description: This skill should be used once a work item's implementation has been manually approved after testing, to formally close it out — for example when asked to "graduate the search feature", "mark the caching task done", or "ship this work item". Marks the plan complete, writes the work item's permanent doc, and updates project status. Must only run after a work item's implementation and testing have been explicitly, manually approved — never runs on its own.
---

# Graduating a work item

Closes out a work item (a feature or a task) once its implementation and testing have been explicitly, manually approved. This is the only point where a work item's planning doc turns into a permanent one, project status gets updated, and any cross-work-item fallout gets reconciled.

**Phase 4 of 4 — Draft → Plan → Build → Graduate.** Previous: `build-work-item`. This is the final phase — there's no next skill. `abandon-work-item` doesn't apply here either: a `Done` work item is never rolled back by that skill; removing shipped code is its own new task work item.

This workflow only ever writes inside `docs/`. It never edits `README.md`, `CLAUDE.md`, or skill files directly, no matter what a development note suggests — changes to any of those are always a separate, deliberate, human-triggered action, flagged via `process-notes.md` instead.

## Status precondition

Only operate on a work item whose status is `In progress`. Refuse `Not started`, `Draft`, `Planned`, or `Done` — this phase only ever runs after implementation and testing are complete and manually approved. Setting status to `Done` is part of writing the permanent doc below.

## Read first

The work item's own plan file, including its `## Development notes` section if one was left during `build-work-item`.

## Propagate development notes

Split the development notes by scope:

- A note that only matters to this work item: fold it into the permanent doc written below, then move on.
- A note that affects a *different* work item (a dependency's actual interface/behavior turned out to differ from what that work item's plan assumed, a gap was discovered that work item needs to account for, etc.): if that other work item hasn't graduated yet, open its plan file and merge the relevant context into it directly, so it stays self-contained when it's implemented later. If it has already graduated (`Done`), its plan file is retired — update its permanent doc directly instead (`docs/features/<slug>.md`, or `docs/shared/<slug>.md`), the same way a follow-on work item's target doc gets updated below.
- A note that reveals a cross-cutting fact or need beyond this work item and its already-named dependencies (not just this work item's own detail, and not a dependency's interface): update the work item that already owns that scope, or draft a new task for it now (per `draft-work-item`'s common-functionality trigger) if none does yet — the same way `plan-work-item`'s "Write decisions back" section would.
- A note tagged as a technical decision made during build: apply it directly — update the relevant `docs/technical/<topic>.md` (create it if none exists) and `technical.md`'s index, per `writing-docs`' "Recording a technical decision" procedure. Do not route this through `process-notes.md`.
- A note tagged as a non-owned-file suggestion (a fact that would change what `README.md` or `CLAUDE.md` claims, or a coding-convention/process observation): don't apply it here. Append it to `docs/process-notes.md` instead (create the file if it doesn't exist yet — see `writing-docs`), one entry per suggestion naming this work item's slug and a one-line summary, so it doesn't get lost. Also mention it in the report below.

## Write the permanent doc

Turn the work item's planning doc into its permanent doc, following the `writing-docs` skill's naming/location conventions for exactly where each file lives.

First, resolve the target: if the plan file carries a `**Target doc:**` line, this is a follow-on work item (per `draft-work-item`) — the target is that existing permanent doc, and it gets **updated in place**, merging in what this work item added or changed, rather than replaced wholesale. Otherwise this is a fresh work item — the target is created for the first time, under this work item's own slug.

**For a feature:**
1. Fresh: create `docs/features/<slug>.md` from `docs/planning/feature-<slug>.md`. Follow-on: open the existing `docs/features/<target-slug>.md` and merge this work item's changes into it. Either way, keep only lasting reference material — what the feature does, how to use it, key API/behavior decisions. Drop planning-only content: build-order position, dependency notes, open questions, test scenarios, development notes, and — if present — the plan file's `**Nav position:**` line. That line already did its one-time job of placing this feature's entry in `FEATURE_ROUTES` (`docs/shared/app-shell.md`) during build; the array's order is the durable record from then on, so restating the line in the permanent doc would only leave a relative pointer (`after <slug>`) that silently goes stale the moment a later feature is inserted between them.
2. This exact path is what a later work item looks for when it depends on this feature — never deviate from it, and never rename it out from under a follow-on.
3. The doc must be self-contained per `writing-docs`' circular-reference rule — it must not cite any retired planning doc.

**For a task:**
1. Fresh: create `docs/shared/<slug>.md` from `docs/planning/task-<slug>.md`. Follow-on: open the existing `docs/shared/<target-slug>.md` and merge this work item's changes into it. Same content rule as features — what it does, how it's used, key decisions, written for a future dependency-consumer, not a human summary or changelog.
2. This exact path is what a later work item looks for when it depends on this task — never deviate from it, and never rename it out from under a follow-on. No index to update: unlike `docs/technical/`, `docs/shared/` isn't indexed — a dependent already knows this task's slug from `docs/status.md` or its own dependency citation.
3. The doc must be self-contained per `writing-docs`' circular-reference rule — it must not cite any retired planning doc.

## Redirect dependents, then retire the plan file

Scan `docs/status.md` for any other work item still `Draft`, `Planned`, or `In progress`, then grep each candidate's plan file for this work item's slug rather than reading it in full — cheaper, and all that's needed to tell whether it names this one as a dependency and cites its plan file (`docs/planning/feature-<slug>.md` / `task-<slug>.md`). For each one found, update that citation to point at the permanent doc just written instead. This is a mechanical link swap, not a rescope — unlike `abandon-work-item`'s dependent check, it never needs to stop and ask a human, because graduating always produces a valid replacement target to redirect to.

Once every dependent is redirected, delete this work item's own planning doc (`docs/planning/feature-<slug>.md` or `task-<slug>.md`) outright — nothing should be citing it anymore. Fix any other doc that still cites it regardless (should be rare now, but check).

## Either way

- Update `docs/status.md`'s row for this work item: status → `Done`, Doc column → the target doc (new or updated). This always happens, for every graduated work item. A follow-on's row is a brand-new row (per `draft-work-item`), so this never overwrites the earlier work item's own `Done` row — both rows now legitimately point at the same doc, which is expected: `docs/status.md` keeps one row per work item as permanent history, and several rows can share a target over time.
- If the work item materially changes what `README.md` or `CLAUDE.md` should claim (e.g., a project-setup task graduating means `CLAUDE.md` now needs real build/lint/test commands), don't edit them directly — that suggestion should already be flagged in `docs/process-notes.md` per "Propagate development notes" above; if it isn't yet, append it there now. Most work items don't touch either file.

## Report

Summarize what was graduated. List any notes that were propagated into other work items' plan files, and any technical decision applied directly to `docs/technical/`. Separately, list any coding-convention, process-change, or non-owned-file suggestion appended to `docs/process-notes.md` — flagged there for manual review, not applied by this skill.
