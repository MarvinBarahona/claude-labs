# Task — Model Picker

**Status:** 📝 Draft.

## Description

A small shared frontend component wrapping the 3-tier model selector (Sonnet/Haiku/Opus, backed by `ModelTier`'s `'default' | 'classification' | 'hardest-call'`) currently defined inline inside `foundations-console.ts` (`MODEL_OPTIONS` constant plus its `<select>` markup and change handler). Every lab that calls the Claude API needs this exact same picker.

Splitting Foundations Console into Messages Console and Structured Output Console (see `task-retire-foundations-console.md`) means two lab areas now need it at once — the same promotion trigger `repo-layout.md` names ("the moment a second lab needs the same thing, it's promoted into a shared module") that `task-envelope-builder.md` applies on the backend side, mirrored here on the frontend. This task moves the existing markup/logic (unchanged) into its own shared component under `frontend/src/app/shared/model-picker/`, alongside this project's other shared frontend components (`inspector-panel/`, `docs-panel/`, `nav/`), rather than duplicating it into both new lab components.

## Open questions

- Exact component API — routine, left to the planning pass. Likely a `value` input (`ModelChoice`) plus a `valueChange` output, matching this app's existing non-`model()`-signal component style (`InspectorPanel`/`DocsPanel` both use `input`/`input.required`, not Angular's two-way `model()` API).

## Dependencies

- [`model-config.md`](../shared/model-config.md), "Interface" — the `ModelTier` union and the Sonnet/Haiku/Opus tier→label mapping this picker renders.
