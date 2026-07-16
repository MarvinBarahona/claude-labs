# Home Page

The app's landing page: fixed intro prose (what Claude Labs is, in general terms that don't need updating as labs change) plus a lab index generated from the current lab registry, so a visitor can quickly see what's available and jump to a specific lab. Registered as the app's default route (root `/`) and the first link in the nav.

## Frontend

`frontend/src/app/home/` (`Home`, no inputs). Template renders, in order: the fixed intro prose (static markup, no per-lab specifics), then a lab index — one entry per `FEATURE_ROUTES` entry excluding `home` itself, in that array's order, each showing its `label`/route from `FEATURE_ROUTES` and its `goal`/`concepts` looked up from `LAB_CATALOG[slug]`. Doesn't follow the docs → demo → inspector lab page composition convention — Home has no demo to run and nothing to inspect.

`frontend/src/app/core/lab-catalog.ts` exports `LabCatalogEntry` (`{ goal, concepts }`) and `LAB_CATALOG`, a `Record<string, LabCatalogEntry>` keyed by slug — one entry per graduated lab, kept in sync by hand whenever a lab's in-app doc changes. Unlike `FEATURE_ROUTES`, this registry has no ordering concern of its own; `Home` derives display order from `FEATURE_ROUTES` itself.

`Home` is registered in `FEATURE_ROUTES` (`feature-registry.ts`) like any other feature, at index `0` — the only reason the shared root-redirects-to-first-entry and nav-render-order behavior (`app-shell.md`) makes it both the default route and the first nav link, with no changes to `Layout`/`Nav`/`build-feature-routes.ts`.

## Testing

- `frontend/src/app/home/home.spec.ts` — fixed intro prose renders; one lab-index entry renders per `FEATURE_ROUTES` entry excluding `home`, in array order, each linking to `/<slug>` and displaying its `LAB_CATALOG` goal/concepts.
- `frontend/src/app/core/feature-registry.spec.ts` — `FEATURE_ROUTES[0].slug === 'home'`, a regression guard for the default-route requirement.
