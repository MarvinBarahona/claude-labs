# Task — Model Picker

**Status:** 📋 Planned.

## Description

A small shared frontend component wrapping the 3-tier model selector (Sonnet/Haiku/Opus, backed by `ModelTier`'s `'default' | 'classification' | 'hardest-call'`) currently defined inline inside `foundations-console.ts` (`MODEL_OPTIONS` constant plus its `<select>` markup and change handler). Every lab that calls the Claude API needs this exact same picker.

Splitting Foundations Console into Messages Console and Structured Output Console (see `task-retire-foundations-console.md`) means two lab areas now need it at once — the same promotion trigger `repo-layout.md` names ("the moment a second lab needs the same thing, it's promoted into a shared module") that `task-envelope-builder.md` applies on the backend side, mirrored here on the frontend. This task moves the existing markup/logic (unchanged) into its own shared component under `frontend/src/app/shared/model-picker/`, alongside this project's other shared frontend components (`inspector-panel/`, `docs-panel/`, `nav/`), rather than duplicating it into both new lab components.

## Interface

`ModelPicker` (`frontend/src/app/shared/model-picker/model-picker.ts`, selector `app-model-picker`, template `model-picker.html` — matching this project's existing shared-component convention of a separate template file):

- `value = input.required<ModelChoice>()` / `valueChange = output<ModelChoice>()` — matches this app's existing non-`model()`-signal component style (`InspectorPanel`/`DocsPanel` both use `input`/`input.required`, not Angular's two-way `model()` API).
- Renders the 3 fixed options, labeled Sonnet/Haiku/Opus in that display order, moved verbatim from `foundations-console.ts`'s current `MODEL_OPTIONS` constant.
- This file also exports the `ModelChoice` type (`'default' | 'classification' | 'hardest-call'`) and the `MODEL_OPTIONS` constant itself, so a consuming lab imports both the type and the component from one place instead of redeclaring the union itself.

## Depends on

- `model-config` (`Done`) — [`model-config.md`](../shared/model-config.md), "Interface" — the `ModelTier` union (`'default' | 'classification' | 'hardest-call'`) this picker's `ModelChoice` type mirrors, and the Sonnet/Haiku/Opus tier→label mapping it renders.

## Test scenarios

**Automated:**
- [ ] Renders all 3 options, labeled Sonnet/Haiku/Opus, in that order.
- [ ] Selecting an option emits `valueChange` with the corresponding `ModelChoice` value.
- [ ] The rendered selection reflects the current `value` input, including when it changes externally after the component is mounted.

No manual scenarios — fully covered by a frontend unit test, no behavior only visible in a real browser.

## To-do list

- [ ] Create `frontend/src/app/shared/model-picker/model-picker.ts` + `model-picker.html` per "Interface" above, moved from `foundations-console.ts`'s existing `MODEL_OPTIONS`/select markup/change handler.
- [ ] Add `frontend/src/app/shared/model-picker/model-picker.spec.ts` covering the Test scenarios above.
