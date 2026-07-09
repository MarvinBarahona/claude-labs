---
name: abandon-work-item
description: This skill should be used to cleanly cancel a feature or task that was drafted or planned but never built — for example when asked to "abandon this feature", "cancel the caching task", "drop this draft", "we're not doing this anymore", or "roll back this planned item". Only applies before implementation starts; if the work item has already been built, this skill refuses and points to filing a new task instead.
---

# Abandoning a work item

An off-ramp from the draft/plan/build/graduate pipeline, not one of its numbered phases — it's only reachable from `Draft` or `Planned`, before `build-work-item` has touched anything. Removes a work item as if it had never been started: its plan file and its `docs/status.md` row.

## Status precondition

Only operate on a work item whose status is `Draft` or `Planned`.

If the status is `In progress` or `Done`, refuse. Say plainly: this work item cannot be rolled back with this skill, because implementation may already exist for it. To remove it, use `draft-work-item` to create a new **task** work item whose job is to remove that code and any docs it produced, then run that task through the normal Draft → Plan → Build → Graduate pipeline like anything else — deleting shipped work is itself a piece of work, not a rollback.

A work item that's only a `Not started` placeholder row — no plan file drafted yet — doesn't need this skill at all: there's nothing to check for dependents against and no plan file to delete. Just remove its `docs/status.md` row directly.

## Read first

1. The work item's own plan file (`feature-<slug>.md` or `task-<slug>.md`).
2. `docs/status.md` — to find its row.
3. Every other work item currently `Draft`, `Planned`, or `In progress` — grep each of their plan files for this work item's slug rather than reading them in full, to check whether any names this one as a dependency. (A `Done` work item's permanent doc can't cite a never-built item, since a dependency has to at least be drafted before another work item can plan against it — so completed work never needs checking here.)

## Check for dependents first

If step 3 above turns up another work item that depends on the one being abandoned, stop before deleting anything and flag it instead. Abandoning out from under a dependent leaves that work item's plan inaccurate, and fixing it is a human call — rescope the dependent work item, abandon it too, or decide the dependency claim was wrong. Don't silently edit another work item's plan file to paper over this.

## Abandon it

Once the precondition holds and no unresolved dependents remain:

1. Delete the work item's plan file (`docs/planning/feature-<slug>.md` or `task-<slug>.md`).
2. Remove its row from `docs/status.md`.

No new status value is introduced for this — abandoning removes all trace rather than leaving a terminal "Abandoned" row, since nothing was ever built. If the project wants a historical record of dropped ideas, that's a deliberate choice to make separately (e.g. a changelog entry), not something this skill does by default.

## Report

State what was deleted (plan file, status row) and flag anything the dependent-check in the previous section surfaced that still needs a human decision.
