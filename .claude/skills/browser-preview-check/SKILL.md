---
name: browser-preview-check
description: Use this skill when asked to visually check the running app in a browser — "screenshot the frontend", "check the app live", "does this UI change actually render", "look at this in a browser" — for anything beyond what Angular/Nest unit or integration tests already cover. Not for starting the dev/prod stack itself (see README's "Development"/"Production" sections) and not for automated test suites (see `testing-strategy.md`) — this is a one-off manual visual check.
---

# Browser preview check

This repo has no local Node install and no headless-browser tooling (Playwright, Puppeteer, `chromium-cli`) installed anywhere — everything runs via Docker. To actually look at the running frontend in a browser, spin up a throwaway Playwright container attached to the dev stack's Compose network, rather than trying to install browser tooling into `frontend`'s own dev container.

## Prerequisites

Only run this on the user's explicit request — asking directly, or explicitly delegating a check back to you after asking you to hold off. Never spin this up on your own initiative to verify work before reporting it; starting the live app spends the user's own usage on a check they'd otherwise run for free themselves.

The dev stack must already be up and both services `(healthy)` — see README's "Development" section for the commands. A screenshot taken before the frontend dev server is actually ready just shows a blank page or connection error, not a real check. Whoever starts that stack must run it with `FAKE_MODE=true` in `backend/.env` — never a real credential, per `fake-mode.md`.

## Taking a screenshot

The dev stack's Compose project network is `claude-labs_default` — a container attached to it can reach the frontend by service name (`http://frontend:4200`) without publishing extra ports. Confirm the network name with `docker network ls` if the project directory name ever changes.

1. Write a small script to the scratchpad directory, e.g. `screenshot.js`:

   ```js
   const { chromium } = require('playwright');

   (async () => {
     const browser = await chromium.launch();
     const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
     await page.goto(process.argv[2] || 'http://frontend:4200', { waitUntil: 'networkidle' });
     await page.screenshot({ path: '/work/out.png', fullPage: true });
     await browser.close();
   })();
   ```

2. Run it inside a one-off `mcr.microsoft.com/playwright` container, mounting the scratchpad directory and joining the dev stack's network:

   ```
   docker run --rm \
     --network claude-labs_default \
     -v "<scratchpad-dir>:/work" \
     -w /work \
     mcr.microsoft.com/playwright:v1.48.0-noble \
     bash -c "npm init -y >/dev/null 2>&1 && npm install playwright@1.48.0 >/dev/null 2>&1 && node screenshot.js http://frontend:4200/<path>"
   ```

   Pin the `playwright` npm package version to match the image tag — a mismatch can pull down browser binaries the image doesn't already have baked in, which is slow and sometimes fails offline.

3. Read the resulting `<scratchpad-dir>/out.png` with the `Read` tool to actually view it.

The container is `--rm` and only ever mounts the scratchpad directory — it never touches `frontend`'s or `backend`'s own containers, volumes, or source, and leaves nothing running afterward.

## When this isn't needed

Prefer the app's own test suites (`testing-strategy.md`) for anything a test can assert — this skill is for actually *looking* at rendered output (layout, styling, an element showing up where expected), which no test in this repo's four buckets does.
