---
name: build-work-item
description: This skill should be used when starting implementation of a planned work item in this repo — a feature (feature-<slug>.md) or a task (task-<slug>.md) — for example when asked to "build the search feature", "implement the data provider", "start on the caching task", or "execute this work item's plan". Covers the execute-then-test sequence and stops for manual approval before anything is marked done; closing the work item out happens separately, afterward.
---

# Building a work item

A **work item** is anything with its own plan file under `docs/planning/`: a feature (`feature-<slug>.md`) or a task (`task-<slug>.md`). This skill covers implementing and testing a work item. Closing it out — marking it done, writing its permanent doc — is a separate, later action that only happens after explicit manual approval.

**Phase 3 of 4 — Draft → Plan → Build → Graduate.** Previous: `plan-work-item`. Next: `graduate-work-item`. Once a work item reaches this phase it can no longer be reversed with `abandon-work-item` — see that skill for what to do instead if it turns out not worth finishing.

## Read first

Read only the work item's own plan file (`feature-<slug>.md` or `task-<slug>.md`) — nothing else, by default. Plan files in this repo are written to be self-contained, so the file already carries whatever guiding principles, decisions, and dependency context this work item needs; there's no need to also open `docs/status.md` or other work items' plan files.

If the plan file names a dependency (another work item it needs already graduated), don't open that dependency's planning file or its source code to understand it — go straight to its permanent doc instead. For a feature, that's `docs/features/<slug>.md`. For a task, that's `docs/shared/<slug>.md` — go straight there directly, no index lookup needed (unlike `docs/technical/`, `docs/shared/` isn't indexed; the dependency's exact slug is already known). Either way, that doc holds everything a later work item needs in order to consume this dependency.

Coding conventions — how to actually write the frontend or backend code, as opposed to what a dependency does — aren't part of any plan file; apply whatever conventions govern the code being touched.

## Status precondition

Only operate on a work item whose status is `Planned` (starting fresh) or `In progress` (resuming), as recorded in the plan file's own `**Status:**` line — this skill never reads `docs/status.md` to check it. Set the plan file's status to `In progress` at the start of Phase 1, and leave it there through testing and the approval wait. Refuse `Not started`, `Draft`, or `Done` — a work item that isn't fully planned yet, or is already shipped, isn't this skill's to touch.

This phase's one deliberate, narrow exception to "never touch `docs/status.md`": mirror that same `In progress` write there too, at the same moment, so the table stays accurate in real time while a work item is actively being built. Nothing else in this skill reads or writes `docs/status.md` — don't extend this exception to any other purpose.

## Phase 1 — Execute

Implement the work item per its plan file. Reuse other work items' output that has already graduated rather than re-implementing it; if this work item depends on something whose permanent doc doesn't exist yet, stop and say so instead of building around the gap.

As tasks are completed, check them off in the plan file's `## To-do list` section — this skill only keeps that list updated, it doesn't define it.

## Phase 2 — Test

Test against the scenarios defined in the plan file's `## Test scenarios` section (run them manually or programmatically, per what that section specifies).

If the plan file has no `## Test scenarios` section yet, stop and flag it — test scenarios are authored during `plan-work-item`, not invented ad hoc here.

## Record development notes

Append a `## Development notes` section to the work item's own plan file (create it if it doesn't exist yet) recording anything that deviated from the plan, any ad hoc decision made during implementation, or anything a future work item should know about. Tag each note by kind so `graduate-work-item` can route it correctly: a technical decision made during implementation (tag it for `docs/technical/`); a fact that would change what `README.md`, `CLAUDE.md`, or another skill should claim (tag it as a non-owned-file suggestion); or a coding-convention/process observation. This skill never edits `docs/technical/`, `README.md`, `CLAUDE.md`, or skill files itself — only records the observation for later review.

Keep this write scoped to the work item's own plan file — don't edit other plan files from here. These notes get read and acted on later, during `graduate-work-item`, not by this skill.

If implementation reveals the plan itself was wrong in a way that needs re-scoping (not just a note), that's handled outside this skill: roll the code back to before this work item's build started (e.g. `git reset`) and return to `plan-work-item` to re-plan, rather than pushing ahead against a plan known to be wrong.

## Stop and wait

Do not mark the work item done or write its permanent doc. Report what was built and how it was tested, then wait for the user's explicit manual approval. Closing the work item out happens only after that approval, as a separate action, in `graduate-work-item`.
