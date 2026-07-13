# Technical — Repo Layout

Update as the system evolves.

- **Structure:** single monorepo — `frontend/` and `backend/` at the repo root, with a root-level Docker Compose file that runs both together.

- **Deciding where a piece of code goes:** two questions, asked in order, place any new code — a lab's own logic, a shared module, a shared component — without needing a central map that lists every file:
  1. **Frontend or backend?** Anything that calls the Claude API, reaches an external data source, or holds a secret is backend (see `architecture.md`); anything about presentation or user interaction is frontend. Many labs have a piece on each side.
  2. **Lab-specific, or shared functionality?** If only one lab needs it today, it lives inside that lab's own area. The moment a second lab needs the same thing, it's promoted into a shared module (backend) or shared component (frontend) instead of being copied — one shared home per concern, never one per consuming lab. A lab's own plan naming another lab's already-built piece as a dependency is exactly the signal that piece has become shared functionality, rather than staying private to whichever lab introduced it first.

- **Lab areas:** each lab gets its own area, named after its slug, holding whichever backend and/or frontend code is specific to it and reused by nothing else.

- **Shared functionality:** each cross-cutting concern gets its own shared module (backend) or shared component (frontend), one per concern — reading config/secrets, picking a model tier, reaching a given external data source, placing cache breakpoints, and building a file/image content block on the backend; page layout/navigation, the inspector panel, and the docs renderer on the frontend. A shared module or component is never folded into whichever lab happened to need it first, and never duplicated once a second lab needs the same one.

  On the frontend, every shared component lives under `frontend/src/app/shared/<concern>/` (e.g. `frontend/src/app/shared/inspector-panel/`), kept separate from each lab area's own top-level folder (named after its slug, per below) — this keeps the two categories this decision model already distinguishes visually distinct in the file tree as more labs and shared components are added. The backend has no equivalent `shared/` prefix: `backend/src/model-config/` and other shared modules sit at the top level next to lab-specific modules, since a backend `shared/` grouping hasn't been needed yet.

  How code is organized *within* a lab area, a shared module, or a shared component is a coding-convention concern, not a layout decision, and isn't tracked here.

  Test-only shared code follows the same one-home-per-concern rule but lives under its own top-level `backend/src/testing/<concern>/` (e.g. `backend/src/testing/anthropic/`, `backend/src/testing/http-fixtures/`, see `test-doubles.md`), kept out of `backend/tsconfig.build.json`'s build (mirroring how `**/*spec.ts` is already excluded) so test-only tooling never ends up in `dist`.

- **Secrets:** `backend/.env` (git-ignored) holds environment variables; `backend/.env.example` documents them with placeholder values.
- **In-app lab docs:** each lab's in-app documentation (the Markdown its docs panel renders — Claude API concepts, example requests/responses, written for a developer using the API, not a repo maintainer) lives at `frontend/public/lab-docs/<slug>.md` as a static asset. Authored and kept current by the `write-lab-doc` skill, run directly against a lab's code.
