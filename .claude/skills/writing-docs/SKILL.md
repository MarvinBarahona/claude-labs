---
name: writing-docs
description: This skill should be used when creating, editing, or locating a Markdown documentation file in this repository — for example when asked to "add a plan file", "write a new doc", "add a README for this module", "update the architecture doc", "document this module", "find where X is documented", or any edit under `docs/`, `README.md`, or `CLAUDE.md`. Covers file naming, where docs live, how to link between them, and which docs are temporary vs. permanent. Pure reference — it does not define the draft/plan/build/graduate/abandon workflow itself; see the `*-work-item` skills for that.
---

# Writing documentation files

This is a reference for doc mechanics only — naming, location, linking. It has no opinion on *when* a doc gets created or what workflow phase produced it; that logic lives in the `draft-work-item` / `plan-work-item` / `build-work-item` / `graduate-work-item` / `abandon-work-item` skills, which cite this one for the mechanical questions.

A **work item** is this project's unit of planned, built, and shipped work — either a **feature** (user-facing functionality) or a **task** (technical, behind-the-scenes work: shared services, tooling). Every work item has its own plan file while it's being designed and built.

## Keep the workflow and the project separate

This skill, and every `*-work-item` skill, stays project-agnostic: no project-specific file names, feature names, tech stack, or other-skill names — only the generic vocabulary already used throughout this skill (work item, feature, task, plan file, permanent doc, slug). If a concrete example is ever needed, invent a clearly hypothetical one rather than naming something that actually exists in this project.

The reverse holds too: files this workflow doesn't own (`README.md`, `CLAUDE.md`, any other project documentation, any skill outside the `*-work-item` set) carry zero workflow terminology — no "work item," no phase name, no `*-work-item` skill name, no `docs/planning`/`docs/features`/`docs/shared` reference. The one allowed exception is a minimal pointer to `docs/status.md` — a single short line, not an explanation of what feeds it or how. If a non-workflow file needs to explain itself, it does so entirely in its own terms.

The workflow's own data files — `docs/status.md`, `docs/planning/*.md`, `docs/features/*.md`, `docs/shared/*.md` — are the one place project-specific content and workflow terminology are both expected to coexist; that's their job. This separation is about the *skills* (this one included) and about every *non-workflow* file, not about the workflow's own output.

## Where docs live

- `README.md` (root) — short project pitch + pointers. Loaded into every Claude Code session via `CLAUDE.md`'s `@README.md` import.
- `docs/status.md` — the single source of truth for what's next and what's already done: one ordered table listing every work item, its current status, its slug, and a link to whichever doc currently describes it (its plan file, or its permanent doc once graduated). Linked only from `README.md`; not imported anywhere and not duplicated elsewhere. Each work item's own plan file (or permanent doc) describes what it *is*; this table only tracks where it *stands* — don't restate descriptive content here.
- `docs/process-notes.md` — append-only log of suggestions the workflow can't apply itself: coding-convention/process changes, and changes to files it doesn't own (`README.md`, `CLAUDE.md`, other skills). Written by `plan-work-item` and `graduate-work-item`, never applied by either. Not linked from anywhere else; reviewed and cleared manually, on the user's own schedule.
- `CLAUDE.md` (root) — AI-instructions only: imports, build/lint/test commands, and any standing behavioral rule for an AI working in this repo (e.g. a git-commit policy). Not general project info, not guiding principles, not status.
- `docs/technical/technical.md` — permanent, project-level **index only**: one row per standing technical or architectural decision, each linking to the file that actually holds it. Never holds decision content itself once a topic has its own file. Update this table when a topic is added, split, or retired. Decisions only — never a graduated task's permanent doc; that's `docs/shared/`, below.
- `docs/technical/<name>.md` (`<name>` = kebab-case slug of the topic) — one file per granular technical decision. Self-contained and leaf-only: never links to another file under `docs/technical/`, including `technical.md` itself — the index is the only inbound link, so no leaf file ever needs updating when the index changes. Coding conventions (how to write the code, as opposed to what was decided) don't belong here.
- `docs/planning/feature-<slug>.md` (`<slug>` = kebab-case slug of the feature's name) — one file per feature work item, detail specific to it while it's being designed, built, and graduated. See the `draft-work-item` / `plan-work-item` skills for what it must contain at each stage.
- `docs/planning/task-<slug>.md` (`<slug>` = kebab-case slug of the task's name) — one file per task work item, same role as a `feature-<slug>.md` file but for technical/behind-the-scenes work rather than user-facing functionality.
- `docs/features/<slug>.md` — permanent, maintainer-facing reference for a *completed* feature: what it does, how to build on it, key decisions, for whoever implements a future dependent work item. Doesn't exist until that feature ships; see `graduate-work-item`.
- `docs/shared/<slug>.md` — permanent reference for a *completed* task: shared services, tooling, data pipelines other work items depend on. Doesn't exist until that task ships; see `graduate-work-item`. Same role as `docs/features/<slug>.md` but for tasks, and, unlike `docs/technical/`, has no index — a dependent already knows this task's exact slug (from `docs/status.md` or its own dependency citation), so there's nothing to look up first.

## Naming convention

Use lowercase kebab-case for every doc filename and directory — e.g. `technical.md`, `docs/planning/`.

Exception — files whose name is fixed by tooling, which always stay uppercase and exactly as named:
- `README.md` — any directory. GitHub (and most doc tooling) specially renders a directory's `README.md`.
- `CLAUDE.md` — repo root only. Claude Code auto-loads this exact filename for instructions.

Never invent a new tool-mandated filename casing. When in doubt, use lowercase kebab-case.

A work item's slug is a short kebab-case version of its own name, chosen when it's drafted — drop subtitles after a colon (e.g. "Search: Fuzzy Match Ranking" → `feature-search.md`); the full name still belongs in the file's `# Feature — <full name>` (or `# Task — <full name>`) heading, and its short name and slug are recorded in its `docs/status.md` row. `docs/status.md`'s ordered table is what orders work items by *build* order, feature or task alike — plan files don't carry a build-order number by default. A feature's *display* order (e.g. its tab position in the app's nav) is a separate concern from build order — see "Feature nav position" below.

## Feature nav position (optional)

Only relevant for a project that actually has a navigation concept — e.g. a left-nav of numbered tabs — needing a stable display order independent of build order. This is a per-project fact, not something this workflow assumes: a project with no such navigation (a CLI, an API-only backend, a single-page tool) skips this entirely. When it does apply, a `**Nav position:**` line is decided during `plan-work-item`, not `draft-work-item` — drafting doesn't need to commit to display order.

Don't centralize this in a single ordered file (a project-wide index that needs renumbering every time an item is inserted is exactly the maintenance hazard this convention avoids elsewhere). Instead, when nav applies, each feature's plan file (and, unlike most planning-only content, its permanent doc too — the running app needs this after the feature ships) carries a `**Nav position:**` line, set relative to whichever features already exist:

- `first` — only valid for the very first feature ever drafted.
- `last` — the default when nothing more specific is asked for or specified.
- `before <slug>` / `after <slug>` — for a deliberate insertion elsewhere in the nav, naming the specific feature it sits next to.

Because each feature only ever states its position relative to its immediate neighbor(s), inserting a new feature anywhere in the nav never requires touching any other feature's file. Never restate a feature's absolute nav number in prose elsewhere (another file's cross-reference, `docs/status.md`, etc.) — a number goes stale the moment something is inserted before it; a relative pointer doesn't. Tasks don't get a nav position — they have no UI surface of their own. Neither does a feature in a project with no navigation concept at all.

## Multiple work items on the same feature or task

A feature or task's permanent doc slug is a stable identity — e.g. `docs/features/search-cache.md` — that can outlive the single work item that first created it. A later, separate piece of work that revisits an already-`Done` feature or task (extends it, reworks part of it, fixes a gap found later) is its own new work item, not a reopening of the old one: it gets its own plan file and its own row in `docs/status.md`, and goes through Draft → Plan → Build → Graduate like anything else. See `draft-work-item` for exactly when this applies (only once the target has actually graduated) versus when new scope just belongs in the target's own still-open work item.

Two slugs are in play for such a **follow-on** work item, and they're usually different:

- Its **own slug** — derived from its own name the normal way, naming its plan file (`docs/planning/feature-<own-slug>.md` / `task-<own-slug>.md`) and its row in `docs/status.md`.
- Its **target slug** — the permanent doc it ultimately updates (`docs/features/<target-slug>.md`, or the `docs/shared/<target-slug>.md` it revises), recorded in the plan file via a `**Target doc:**` line. Never present for a first-time (fresh) work item, since its own slug and target slug are the same thing there.

Because the target already has a permanent doc, a follow-on work item's own name almost never collapses to the target's base name — keep enough of the distinguishing detail (rather than dropping a subtitle the way a fresh work item would) that its slug doesn't collide with the target's, or with any other follow-on already recorded in `docs/status.md`'s history.

`docs/status.md` keeps one row per work item forever, including graduated ones — so it's normal and expected for several rows, spanning multiple build phases over time, to all resolve to the same Doc link once more than one work item has graduated against the same target. That row history is exactly what makes the target's evolution traceable without cluttering the permanent doc itself with changelog prose.

## Linking between docs

Every reference to another doc file — a clickable Markdown link or a plain inline mention — shows only the bare filename, never a path.

- Plain mention: `` `status.md` ``, not `` `docs/status.md` ``.
- Markdown link: the **label** is the bare filename; the **href** is whatever relative path actually resolves. From `README.md`, linking to a file in another directory:
  ```markdown
  [`technical.md`](docs/technical/technical.md)
  ```
  From one work item's plan file, linking to a sibling in the same directory, label and href are identical:
  ```markdown
  [`feature-search.md`](feature-search.md)
  ```

This keeps prose scannable — the reader sees `status.md`, not a three-segment path — while links still resolve. Work out the href from the actual relative path between the two files; don't guess.

## Avoid circular references

Reading order is linear: `CLAUDE.md` → `README.md` (its only import) → everything else. `README.md` is the hub; it points down to `status.md`, `technical.md`, and per-work-item docs. None of those files point back up to `README.md` — the reader already came from there.

Sibling docs must not cite each other back and forth either. A work item's plan file may reference `technical.md` or another work item's permanent doc (temporary → permanent is a legitimate one-way pointer); permanent docs (`technical.md`, `docs/features/<slug>.md`, `docs/shared/<slug>.md`) must never cite a plan file back, since the temporary side is expected to go stale or be retired and a permanent doc can't depend on it.

Two still-open work items' plan files are a second exception: a dependency's plan file may list its known consumers (a `## Consumers` section naming and linking each dependent work item), and each of those consumers' own plan files separately cites the dependency back (a `depends on: X` citation, per `plan-work-item`). This isn't the back-and-forth the rule above forbids — both sides are temporary, neither is expected to stay stable, and since there's no central dependency map anywhere in this project, a dependency's own `## Consumers` section is the only reverse-index of its fan-out. The one-way rule still applies the moment either side graduates: a permanent doc must never cite the other's (still-temporary) plan file back, per the paragraph above.

The one legitimate two-way link involving a permanent or semi-permanent file is `docs/status.md` and each work item's own doc: `status.md`'s Doc column links down to whichever doc currently describes a work item (its plan file, or its permanent doc once graduated), and that doc may point back up to `status.md` for build-order/current-position context. Keep this.

`docs/technical/*.md` is stricter still: `technical.md` indexes each topic file, but the topic files never link back to `technical.md` and never link to each other — no two-way exception here, unlike `status.md`/work-item files. That keeps every topic file's content stable no matter how the index or its neighbors change; `technical.md` is the only file that can ever go stale. `docs/shared/*.md` has no index to go stale in the first place, so it just follows the general leaf-doc rule: self-contained, no citing a retired planning doc.

## Keep README.md short

`CLAUDE.md` imports `README.md` with `@README.md`, so every line in `README.md` loads into context on every session, unlike the rest of `docs/`, which is only read on demand. Keep `README.md` to a handful of short paragraphs: what the project is, a one-line stack summary, and pointers to `status.md`/`technical.md` for depth. Link to `status.md` rather than restating status facts inline — status changes often and should have exactly one home. If a paragraph is only useful when actively working on a specific area, put it in a linked doc instead.

## Temporary vs. permanent docs

`docs/planning/*.md` capture point-in-time design decisions, one file per work item — accurate while that work item is being designed and built, expected to be retired once it graduates. `docs/technical/*.md` (the index and every topic file), `docs/features/*.md`, and `docs/shared/*.md` are the living references for how the system is actually built, kept in sync as the system evolves. A fact that stays true regardless of build phase (tech stack, repo layout, permanent conventions, what a shipped feature or task does) belongs in the permanent side. A fact that stops mattering once building is finished (build order, open questions, "why X over Y") belongs in that work item's own plan file — not centralized anywhere else.

## Work item status

Every `feature-<slug>.md` / `task-<slug>.md` plan file carries a `**Status:**` line, and `docs/status.md`'s table mirrors it — update both together, never just one. Valid values, in lifecycle order:

`Not started` (no plan file yet, just a row in `docs/status.md`) → `Draft` (plan file exists) → `Planned` (self-contained, ready to build) → `In progress` (being implemented and tested) → `Done` (graduated).

What moves a work item between these, what each stage must contain, and how a plan file turns into its permanent doc are defined by the `draft-work-item` / `plan-work-item` / `build-work-item` / `graduate-work-item` / `abandon-work-item` skills, not here — this file only defines what the status values mean and where they're recorded.

`docs/status.md`'s own status-values note should carry a short "triggered by" reference next to each transition (which skill performs it, and, for `build-work-item`, that it fires at the start of Phase 1 rather than at completion) — so a reader of `status.md` alone sees the whole lifecycle without opening every skill file. This is a summary pointer, not a second copy of the logic: the skills above stay authoritative, and the reference only needs to change if a transition's owning skill changes.

## Recording a technical decision

Before filing something under `docs/technical/`, check what kind of fact it actually is: a standing decision about *this* project (architecture, stack, layout, guiding principles) belongs here; a rule about *how to write code* that would hold in any project using this stack does not — even if no dedicated file currently owns it. Don't invent a `docs/technical/<name>.md` topic for a coding convention just because it needs a home; flag it instead (a `docs/process-notes.md` entry, per its own description above) so it gets enforced wherever this project's conventions actually live.

When something needs to be recorded in `docs/technical/`: check `technical.md`'s index first. If an existing topic file already covers it, update that file. Otherwise create a new `docs/technical/<name>.md` (kebab-case topic slug, no cross-links per the rule above) and add a row for it to `technical.md`'s index. Never append decision content directly into `technical.md`'s own body — it only ever grows by adding index rows. This procedure is only for standing decisions — a graduated task's own permanent doc goes to `docs/shared/<slug>.md` instead (no index), per `graduate-work-item`.
