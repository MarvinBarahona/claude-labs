# Process Notes

Append-only log of suggestions the drafting/build process can't apply itself: coding-convention/process changes, and changes to files it doesn't own (`README.md`, `CLAUDE.md`, other skills). Written during planning or graduation, never applied automatically. Reviewed and cleared manually, on your own schedule.

- **`chat-transcript`:** when a work item's plan cites `testing-strategy.md`'s "Automated" test buckets for a lab whose DOM shape is changing, the plan-work-item/build-work-item process should also check `e2e/tests/<lab>.spec.ts` for hard-coded structural assertions (element counts, class checks) — the plan for this task only cited the "Frontend unit" bucket, and a Playwright spec's hard-coded per-message `<li>` count broke silently until caught during the build's own test run, not from anything the plan itself flagged.

