# Feature — Home Page

**Status:** 📋 Planned.

**Nav position:** `before messages-console`. Forced, not a style choice: `app-shell.md`'s "Interface" section says the root path redirects to whichever feature sits at index `0` of `FEATURE_ROUTES`, and that array order is also nav render order — so Home can only satisfy this feature's "default route" and "menu entry" requirements simultaneously by becoming that first entry. This needs zero changes to `Layout`/`Nav`/`build-feature-routes.ts` — Home is just one more `FEATURE_ROUTES` entry from the shell's point of view.

## Description

A landing page explaining the app's overall purpose plus a scannable index of every lab, so a visitor can quickly find the one they want. Two parts, deliberately different in how often they change:

- **Fixed prose** — what the app is and its general goal. Written once, directly in `Home`'s own template (see "Design" below) — general truths about the project, not facts about any specific lab, so it never needs touching as labs are added or changed.
- **Lab index** — one entry per graduated lab: its goal and the Claude API concept(s) it demonstrates, linking to its route. The only part of this page expected to change, and only when a lab is added or its scope changes.

**Why:** today the root route silently redirects to whichever lab happens to be first in `FEATURE_ROUTES`, with no orientation — a new visitor lands inside a random lab's live demo with no explanation of what the project is or what else exists. This gives them a real entry point.

**Keeping the lab index current:** `write-lab-doc` already runs directly against a lab's actual code whenever that lab's in-app doc is written or refreshed — the one point in the project where a lab's goal/concepts are already being freshly read and summarized. This feature extends that skill to also add or update that lab's entry in the lab index at the same time (see "write-lab-doc update" below), instead of a separate manual step that could drift out of sync with the doc itself.

## Guiding principles

- depends on: `guiding-principles.md`, "Docs travel with code" — this is the bullet `write-lab-doc`'s extension (below) is adding one more responsibility to; the doc-authoring step stays the single point where a lab's goal/concepts get written down from its real code.

## Dependencies

- depends on: `app-shell.md`, "Interface" and "Using it" — `FEATURE_ROUTES`' shape (`{ slug, label, loadComponent }`), array-order-is-nav-order and root-redirects-to-first-entry behavior, and the existing insertion procedure this feature reuses as-is.
- depends on: `messages-console.md` (full) — source material for backfilling its `LAB_CATALOG` entry (see to-do list).
- depends on: `structured-output-console.md` (full) — source material for backfilling its `LAB_CATALOG` entry.
- depends on: `testing-strategy.md`, "Five test buckets" → "Frontend unit" — `TestBed`, no real backend process involved; this feature's tests are all this one bucket, no backend work exists to test.

## Design

- **`frontend/src/app/core/lab-catalog.ts`** — new file, sibling to `feature-registry.ts`, same "hand-maintained registry" role `FEATURE_ROUTES` already plays:
  ```ts
  export interface LabCatalogEntry {
    readonly goal: string;
    readonly concepts: readonly string[];
  }

  export const LAB_CATALOG: Readonly<Record<string, LabCatalogEntry>> = {
    'messages-console': { goal: '…', concepts: ['…'] },
    'structured-output-console': { goal: '…', concepts: ['…'] },
  };
  ```
  Keyed by slug (a `Record`, not an array) deliberately — unlike `FEATURE_ROUTES`, this registry has no ordering concern of its own; `Home` derives display order from `FEATURE_ROUTES` (below), so adding an entry here is never a "where in the array" decision the way a `FEATURE_ROUTES` insertion is.

- **`frontend/src/app/home/home.ts`** (selector `app-home`) — new lab-style top-level area (per `repo-layout.md`'s "Lab areas", even though Home isn't itself a lab, it's keyed by slug the same way). No inputs. Template:
  1. The fixed intro prose (static markup in `home.html`, sourced from `README.md`'s pitch and `guiding-principles.md` — what the app is, its general goal; no per-lab specifics, nothing that needs updating when a lab is added).
  2. A lab index: `FEATURE_ROUTES.filter((f) => f.slug !== 'home')`, in that (already nav-ordered) array order — for each, its `label` and route (`routerLink="/" + slug`) from `FEATURE_ROUTES`, plus `goal` and `concepts` looked up from `LAB_CATALOG[slug]`.

  Does *not* follow `app-shell.md`'s docs → demo → inspector lab page composition — that convention is for an actual lab's route component; Home has no demo to run and nothing to inspect.

- **`FEATURE_ROUTES`** (`feature-registry.ts`) — insert at index `0` (per "Nav position" above):
  ```ts
  {
    slug: 'home',
    label: 'Home',
    loadComponent: () => import('../home/home').then((m) => m.Home),
  },
  ```

- **write-lab-doc update** — append to `.claude/skills/write-lab-doc/SKILL.md`'s "Write" section: after writing/refreshing `frontend/public/lab-docs/<slug>.md`, also add or update this lab's entry in `frontend/src/app/core/lab-catalog.ts`'s `LAB_CATALOG` (goal + concepts, grounded in the same code read for the doc itself — no invented content, same rule the rest of that section already states) — the one narrow, named exception to "don't read the rest of the frontend/backend tree beyond what this one lab touches," since `lab-catalog.ts` isn't part of any one lab's own area.

  **Caveat for whoever executes this to-do:** `.claude/skills/write-lab-doc/SKILL.md` is a skill file, and `build-work-item`'s own "Record development notes" section states it "never edits `docs/technical/`, `README.md`, `CLAUDE.md`, or skill files itself — only records the observation for later review." That rule is generic (it can't tell a project-owned skill from an outsider one), so it applies here too even though `CLAUDE.md` separately marks `write-lab-doc` as one of this project's own two skills, safe to edit directly. Practically: `build-work-item` will implement everything else below, then log this specific item as a `docs/technical/`-or-`README`/`CLAUDE.md`/skill-file dev note instead of editing `SKILL.md` itself — flag that explicitly when it comes up, and apply the actual `SKILL.md` edit as a direct, out-of-band edit (not through `graduate-work-item`'s `process-notes.md` routing) once the user confirms, since it's a small, self-contained text addition with no reason to wait for a full process-notes review cycle.

## Test scenarios

### Automated

- `home.spec.ts` (new): fixed intro prose renders. One lab-index entry renders per `FEATURE_ROUTES` entry excluding `home`, in `FEATURE_ROUTES` array order. Each entry's link targets `/<slug>`. Each entry displays the `goal` and `concepts` from `LAB_CATALOG[slug]`.
- `feature-registry.spec.ts` (new, small): `FEATURE_ROUTES[0].slug === 'home'` — a real regression guard, since a future lab insertion that doesn't respect this ordering would silently break the default-route requirement without any other test catching it.

### Manual

1. `docker compose -f docker-compose.dev.yml up`, visit `http://localhost:4200/` (dev) with nothing else in the URL — confirm it loads Home directly (not a redirect into a lab).
2. Confirm "Home" appears as the first link in the left nav, above the lab links.
3. Click each lab's index entry — confirm it navigates to that lab's own route.
4. Below the `lg` breakpoint, open the mobile nav overlay — confirm "Home" appears there too, first, and tapping it navigates and closes the overlay (existing `Nav`/`Layout` behavior, just confirming Home doesn't break it as one more entry).
5. Read the fixed intro prose — confirm it reads as general project description with no mention of specific lab detail that would need editing when a lab changes.

## To-do list

- [ ] Create `frontend/src/app/core/lab-catalog.ts` (`LabCatalogEntry`, `LAB_CATALOG`).
- [ ] Backfill `LAB_CATALOG` entries for `messages-console` and `structured-output-console`, sourced from their permanent docs (cited above).
- [ ] Create `frontend/src/app/home/` (`Home` component + template) per "Design" above.
- [ ] Insert Home's entry at index `0` of `FEATURE_ROUTES`.
- [ ] Write `home.spec.ts` and `feature-registry.spec.ts` (scenarios above).
- [ ] Handle the `write-lab-doc` `SKILL.md` update per its caveat above (dev note during build, direct edit once approved — not a normal to-do checkbox `build-work-item` can just tick off itself).
