---
name: write-lab-doc
description: This skill should be used to write or refresh a lab's in-app documentation — the Markdown its docs panel renders inline next to its live demo, for a developer learning a Claude API concept, not a repo maintainer. Use it once a lab's actual frontend/backend code exists, when asked to "write the docs for X", "document this lab", "update the in-app doc for X", or similar.
---

# Writing a lab's in-app documentation

This produces content the running app shows to its own users — developers exploring the Claude API. Write for that reader only: someone who's about to go use the Claude API themselves after reading this, not someone maintaining this repo. Get everything needed from the lab's own code and, if that's not enough, from the person asking.

## Precondition

The lab's code has to actually exist first. If it doesn't yet, there's nothing to document — say so and stop, rather than drafting a doc for functionality that isn't built.

## Read

The lab's actual implementation, and only this lab's:

- Its Angular route/component (`frontend/`) — what it demonstrates, what inputs it takes.
- Its NestJS module (`backend/`) — the real request(s) it sends to the Claude API: model, params, tool/thinking/caching config, whatever's actually there.

Don't read the rest of the frontend/backend tree beyond what this one lab touches — except `frontend/src/app/core/lab-catalog.ts`, below: it isn't part of any one lab's own area, but this skill is the one place a lab's entry there gets added or refreshed.

## Write

Produce or refresh `frontend/public/lab-docs/<slug>.md`, aimed at a developer who wants to learn the Claude API concept this lab demonstrates and walk away able to use it themselves:

- No top-level heading with the lab's name — the page's own HTML already renders that as an `<h1>` above the docs panel; a duplicate in the Markdown shows up as a repeated header on the page. Start straight in with the explanation below.
- A short, plain-language explanation of the Claude API concept/mechanic this lab demonstrates — what it is, when to reach for it.
- A real example request, taken from the actual code — not invented — showing the relevant parameters.
- The response shape worth knowing about (key fields, what to look for), again grounded in what the code actually handles.
- Any gotcha worth calling out (a limit, an incompatibility, a common mistake) — only if it's already evident from the code or its comments, not speculation.

## Update the lab index

Add or update this lab's entry in `frontend/src/app/core/lab-catalog.ts`'s `LAB_CATALOG` — a `goal` and a list of `concepts`, keyed by the lab's slug. Ground both in the same code just read above, not invented content, same rule as the doc itself.

## Keep current

Re-run this whenever a lab's code has changed enough that its in-app doc, or its `LAB_CATALOG` entry, would mislead a reader — that's a judgment call to make each time, not a scheduled step.
