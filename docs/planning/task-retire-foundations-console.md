# Task — Retire Foundations Console

**Status:** 📋 Planned.

**Target doc:** [`foundations-console.md`](../features/foundations-console.md).

## Description

Foundations Console bundled two independent demo interactions behind one page/route (see its own "Frontend" section: a "Transcript" section and a "Structured output demo" section, sharing one model picker). [`feature-messages-console.md`](feature-messages-console.md) and [`feature-structured-output-console.md`](feature-structured-output-console.md) carve those two sections out into two standalone, independently-graduating labs. This task is what actually retires the old bundled page once both replacements exist and work: deleting the old lab area, removing its nav entry, and updating `foundations-console.md`'s permanent doc to reflect that the feature was split rather than continuing to describe a page that no longer exists.

Per `graduate-work-item`'s own note ("removing shipped code is its own new task work item"), this is why the split isn't planned as a single feature work item — a plan file can only ever produce one permanent doc at its own slug, and this split produces two new ones plus a retirement of the original.

**Build order:** this task cannot be built until both `feature-messages-console.md` and `feature-structured-output-console.md` are `Done` — removing the old page only makes sense once its replacements exist. It's registered right after them in `docs/status.md` for that reason, but its own implementation waits on their graduation regardless of table position.

## Guiding principles / standing decisions cited

- [`guiding-principles.md`](../technical/guiding-principles.md), "Docs travel with code" — the old page's in-app doc is removed alongside the page, not left orphaned once nothing renders it.
- [`repo-layout.md`](../technical/repo-layout.md), "Lab areas" and "In-app lab docs" — confirms exactly which directories/files constitute the lab area and doc asset being deleted.
- [`app-shell.md`](../shared/app-shell.md), "Feature registry" — where the old nav entry is removed from (`FEATURE_ROUTES`).

## Depends on

- `messages-console` (`Draft`) — [`feature-messages-console.md`](feature-messages-console.md), read in full; must be `Done` before this task's own build starts.
- `structured-output-console` (`Draft`) — [`feature-structured-output-console.md`](feature-structured-output-console.md), read in full; must be `Done` before this task's own build starts.
- `foundations-console` (`Done`) — [`foundations-console.md`](../features/foundations-console.md), read in full; this task's target doc, updated in place at graduation.
- `frontend-browser-e2e-tests` (`Planned`) — [`task-frontend-browser-e2e-tests.md`](task-frontend-browser-e2e-tests.md), named here (not a build-order dependency the other direction — this task doesn't wait on it) because this task's own to-do list below updates it.

## Test scenarios

**Automated:**
- [ ] Once the old backend module is removed, `POST /api/foundations-console/messages` and `POST /api/foundations-console/structured` both return 404 rather than the app silently keeping dead routes alive.
- [ ] `FEATURE_ROUTES` (`frontend/src/app/core/feature-registry.ts`) no longer contains a `foundations-console` entry.
- [ ] A repo-wide search for a hardcoded lab-count reference (the check originally run while drafting this split — see this work item's history for why) still turns up nothing once both new labs have landed; fix anything either of their builds introduced.

**Manual:**
- [ ] Run `docker compose -f docker-compose.dev.yml up`. Confirm Foundations Console no longer appears in the nav, the root path redirects to Messages Console instead, and both Messages Console and Structured Output Console work end to end (same behavior the old bundled page had, now on two pages).
- [ ] Confirm nothing in the running app links to `/lab-docs/foundations-console.md` after it's deleted (no dangling reference producing a 404 a user could actually hit).

## To-do list

- [ ] Confirm both `feature-messages-console.md` and `feature-structured-output-console.md` are `Done` before starting.
- [ ] Delete `backend/src/foundations-console/` (controller, service, module, DTOs, specs) and remove `FoundationsConsoleModule` from `AppModule`'s imports.
- [ ] Delete `frontend/src/app/foundations-console/` and remove its entry from `FEATURE_ROUTES`.
- [ ] Delete `frontend/public/lab-docs/foundations-console.md`.
- [ ] Re-run a repo-wide search for hardcoded lab-count references and fix anything found.
- [ ] Update `docs/features/foundations-console.md` in place: replace its content with a short note that the feature was split, pointing at `docs/features/messages-console.md` and `docs/features/structured-output-console.md`, per `graduate-work-item`'s follow-on merge rule.
- [ ] Update `task-frontend-browser-e2e-tests.md`: its "Contract" and "Test scenarios" sections currently target the old bundled page (one page, both demos, one shared inspector switching between them, reachable as the app's first nav entry) — flagged directly in that file's own text (added during this task's planning pass) since that page no longer exists once this task ships. Split `foundations-console.spec.ts` into two spec files, one per new lab, each written against `messages-console.md`/`structured-output-console.md`'s own "Frontend"/"Interface" sections instead of the retired `foundations-console.md`.
