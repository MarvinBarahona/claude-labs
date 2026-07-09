---
name: draft-work-item
description: This skill should be used when starting a brand-new feature or task that doesn't have a plan file yet — for example when asked to "add a new feature", "draft a task for X", "start planning the search-cache work", or "propose a new cross-cutting feature". Creates the new plan file in Draft status and registers it in the project's overview and status table; detailed planning happens afterward, as a separate action.
---

# Drafting a new work item

A **work item** is a feature or a task with its own plan file. This skill creates that file for the first time, in `Draft` status — before detailed planning, before implementation.

**Phase 1 of 4 — Draft → Plan → Build → Graduate.** Next: `plan-work-item`. If this item turns out not worth pursuing before it reaches Build, it can be reversed with `abandon-work-item` instead of carrying it forward.

## Read first

1. `docs/status.md` — the full ordered list of work items and their current status, including graduated ones; confirm the new one isn't already there (including as a `Not started` placeholder row — see "Register the work item" below), get a sense of where it would realistically sit, and check whether a *prior* work item already graduated against the same feature or task (needed for "Fresh work item or follow-on?" below). This is also where overlap with other drafted-or-planned work items should surface — each has its own row here, so there's no need to open every other plan file just to check for overlap.
2. `docs/features/*.md` and `docs/shared/*.md` — already-completed work items this new one might depend on or overlap with.
3. `technical.md`'s index — skim it for any standing decision that bears on this item, and open only the specific topic file(s) it points to that plainly apply; don't read the rest of `docs/technical/`.

## Clarify

Before deciding kind, slug, or scope: if the ask's motivation or boundaries aren't already clear from context, ask the user what's needed and why. A vague ask drafted without this risks the wrong feature/task split (see "Feature or task?" below) or a description future planning can't act on. Skip this only when the what/why is already unambiguous from the request itself.

## Feature or task?

Every work item is exactly one of two kinds — decide this next, since it determines the file name and, later, where the permanent doc ends up:

- **Feature** — delivers something an end user directly interacts with or experiences. Permanent home once graduated: `docs/features/<slug>.md`.
- **Task** — technical or behind-the-scenes work with no direct user-facing surface: shared services, tooling, data pipelines. Permanent home once graduated: `docs/shared/<slug>.md`.

If a piece of work seems to have both a technical backbone and a user-facing surface, split it: the user-facing part is a feature, the technical part is a task the feature depends on. Don't file one work item as both kinds. Draft both now, not just the one that was asked for — give the task its own Draft entry (row + plan file) alongside the feature's, so the dependency is a real, registered work item rather than an implicit reference the feature's plan file names but that doesn't exist anywhere yet.

The same split applies even when the original ask is purely user-facing: if drafting it surfaces a need for some common, reusable technical functionality that doesn't already exist as its own work item (shared plumbing, a data integration, a service more than this one feature will need), draft a task for that functionality too, right now, alongside the feature — with the feature's dependencies naming it. Don't leave a first-time technical need undrafted just because nobody asked for it directly; an undrafted dependency is invisible to `plan-work-item` and `build-work-item` alike.

## Fresh work item or follow-on?

If `docs/status.md`'s history shows no prior work item graduated against this same feature or task, this is a **fresh** work item — proceed normally, its own slug is also its target slug.

If a prior work item on this same feature/task is already `Done`, this is a **follow-on** — a separate, later piece of work that extends, reworks, or fixes something in an already-shipped feature/task, tracked as its own work item rather than reopening the old one. A follow-on:

- Needs its own distinguishing name and slug per `writing-docs`' "Multiple work items on the same feature or task" — don't collapse it to the target's base name, since that slug is already taken.
- Records a `**Target doc:**` line in its plan file, pointing at the existing permanent doc (`docs/features/<target-slug>.md` or `docs/shared/<target-slug>.md`) it will update at graduation.
- Lists that target doc among its dependencies, per "Draft the work item" below.

If a prior work item on this same feature/task exists but isn't `Done` yet (`Draft`, `Planned`, or `In progress`), don't draft a follow-on — that scope belongs in the still-open work item instead. Only once a target has actually graduated does new work on it become a separate work item.

## Draft the work item

Write a new plan file (per the `writing-docs` skill's naming, location, and linking conventions) containing:

- A description of what this work item is and why it's needed.
- Open questions worth flagging now, before detailed planning has to commit to answers.
- Likely dependencies, stated plainly — on already-completed work, on already-drafted-or-planned work, or both. Before stating each, read it in full — its permanent doc (`docs/features/<slug>.md` / `docs/shared/<slug>.md`) if `Done`, otherwise its own plan file whatever its status — the same way `plan-work-item`'s "Read first" step 5 does; the general skim in "Read first" above is only for discovering *un*named overlap, not for confirming a dependency this item is actually about to name.
- For a follow-on work item only: the `**Target doc:**` line from "Fresh work item or follow-on?" above, with that target doc also listed as a dependency.

Set its status to `Draft`. A fresh feature's `**Nav position:**` line, if the project has a navigation concept at all, is decided later during `plan-work-item` — not here.

## Register the work item

`docs/status.md`: if a `Not started` placeholder row already exists for this work item, update it in place (status → `Draft`, slug, add the link) rather than adding a duplicate row. Otherwise add a new row at its likely position, status `Draft`, with its slug and a link to the new file. A follow-on work item always gets a brand-new row — never reuse or overwrite the target's earlier, already-`Done` row, which stays exactly as it is, as history.

A drafted work item that isn't registered here is invisible to future planning.

## Hand off

Detailed planning — fully self-contained content, test scenarios, a to-do list — happens afterward, in `plan-work-item`, once this work item is registered. This skill stops once the work item exists in `Draft` status.
