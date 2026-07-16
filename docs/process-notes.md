# Process Notes

Append-only log of suggestions the drafting/build process can't apply itself: coding-convention/process changes, and changes to files it doesn't own (`README.md`, `CLAUDE.md`, other skills). Written during planning or graduation, never applied automatically. Reviewed and cleared manually, on your own schedule.

- `home-page`: extend `write-lab-doc`'s `SKILL.md` so that, after writing or refreshing a lab's in-app doc, it also adds/updates that lab's entry in `frontend/src/app/core/lab-catalog.ts`'s `LAB_CATALOG` (goal + Claude API concepts). See `feature-home-page.md`'s "write-lab-doc update" section for the exact addition and why `build-work-item` will log this rather than apply it directly.
