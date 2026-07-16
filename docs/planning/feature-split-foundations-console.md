# Feature — Split Foundations Console

**Status:** 📝 Draft.

**Target doc:** [`foundations-console.md`](../features/foundations-console.md).

## Description

Foundations Console currently bundles two independent demo interactions behind one route: the raw Messages API transcript demo, and the structured (JSON-schema) output demo (see `foundations-console.md`'s "Frontend" section). This work item splits those into two standalone labs, each with its own route and nav entry, rather than two sections sharing one page. The two demos are already independent internally — separate endpoints, no shared state beyond the model picker — so this is mostly about promoting each to a first-class lab rather than untangling coupled logic.

Also in scope: search every existing reference to the app's current lab count across docs, UI copy, and tests, and rephrase any that hardcode a specific number so it doesn't need editing again the next time a lab is added, split, or retired. A first-pass grep done while drafting this item found no literal hardcoded lab count anywhere in the repo yet (README, status.md, guiding-principles.md, and the frontend nav copy all describe the app without citing a number) — this needs a more thorough pass at build time (UI copy, alt text, docs prose, test assertions/fixtures) to confirm nothing was missed, and to keep it that way going forward.

## Open questions

- What are the two new labs' names/slugs? Naming deferred to planning.
- Does each new lab keep the shared model-picker pattern Foundations Console uses today, or does each get its own?
- Nav positions for the two new labs, relative to each other and to the rest of the nav (decided during planning per `writing-docs`' nav-position convention).
- Does `foundations-console.md` get retired once both new labs graduate, or kept around as historical context? Either way its `docs/status.md` row stays as history, per `writing-docs`.
- One shared backend module split by route, or two fully separate backend modules?
- Does `task-frontend-browser-e2e-tests.md`, which cites `foundations-console.md`'s two demo interactions for its first spec file, need its own follow-up once this split lands?

## Dependencies

- [`foundations-console.md`](../features/foundations-console.md) — the existing, already-`Done` feature being split; this work item's target doc.
