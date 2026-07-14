# Process Notes

Append-only log of suggestions the workflow can't apply itself: coding-convention/process changes, and changes to files it doesn't own (`README.md`, `CLAUDE.md`, other skills). Written by `plan-work-item` and `graduate-work-item`, never applied by either. Reviewed and cleared manually, on your own schedule.

- `fake-mode`: no headless-browser tooling (Playwright/Puppeteer/`chromium-cli`) exists anywhere in this repo, and the dev host has no local Node install at all (everything runs via Docker). Manual UI verification for this task improvised a one-off `mcr.microsoft.com/playwright` container attached to the Compose network to screenshot the running frontend. Worth a proper run-skill pass at some point so this isn't reinvented per session.

