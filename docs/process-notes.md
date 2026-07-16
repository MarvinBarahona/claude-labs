# Process Notes

Append-only log of suggestions the drafting/build process can't apply itself: coding-convention/process changes, and changes to files it doesn't own (`README.md`, `CLAUDE.md`, other skills). Written during planning or graduation, never applied automatically. Reviewed and cleared manually, on your own schedule.

- **`frontend-browser-e2e-tests`** — `structured-output-console.html`'s result div picked up a `data-testid="structured-result"` during that task's build, mirroring `messages-console`'s existing `data-testid="transcript-list"` convention, so a browser-driven test could scope its assertions past the inspector panel's own JSON dump (which can coincidentally contain the same rendered text). Worth keeping in mind as a precedent — a lab's own demo-result container getting a `data-testid` for exactly this scoping reason — if a future lab's browser-E2E spec runs into the same ambiguity.
