# Process Notes

Append-only log of suggestions the drafting/build process can't apply itself: coding-convention/process changes, and changes to files it doesn't own (`README.md`, `CLAUDE.md`, other skills). Written during planning or graduation, never applied automatically. Reviewed and cleared manually, on your own schedule.

- `workflow-gallery` — README's claim that `npm run lint` closes the type-check gap `npm test` leaves open is now known to be incomplete: a genuine `tsc` diagnostic (TypeScript's weak-type-detection check on a generic constrained to an all-optional shape) passed both `npm test` and `npm run lint` with zero errors while the real dev container was crash-looping on it — only an actual `nest build`/`tsc --noEmit` catches this class (see `testing-strategy.md`, updated directly). Worth supplementing the documented two-command safety net with an explicit `tsc --noEmit` step, or narrowing the README claim to note the exception.
