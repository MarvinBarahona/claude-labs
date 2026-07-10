# Task — Fake Mode

**Status:** Draft.

**Depends on:**

- [`env-config.md`](../shared/env-config.md) — the app's one place reading environment variables; whatever signal ends up choosing the mode (see open questions) is read through it too, not through a second ad hoc `process.env` read.
- [`task-test-doubles.md`](task-test-doubles.md) — the fake implementations of each external client (Anthropic SDK, GitHub, Open-Meteo, arXiv, Wikimedia Commons) that this task wires into the actual running app, not just into test suites. Building fake mode before test-doubles exists would mean maintaining two separate sets of fakes for the same clients.
- [`project-scaffold.md`](../shared/project-scaffold.md) — Docker Compose already runs both projects; this task only adds a mode switch on top of that, not a new runtime.

## Purpose

The app needs to run in two distinct modes:

- **Real mode** — a real `ANTHROPIC_API_KEY` (and other credentials) in `backend/.env`; every external call goes out for real. This is how the project owner actually uses the app day to day for manual testing, and how anyone else it's shared with is expected to run it: add keys to `.env`, `docker compose up`, nothing else.
- **Fake mode** — no real credentials, no outbound call to the Claude API or any external data source at all; every external client returns canned/fake data instead. For developing and manually exploring the running app — including a coding agent driving it — without needing a real key or spending real API budget just to click through a lab.

This is distinct from [`task-test-doubles.md`](task-test-doubles.md), which only covers automated test suites (booting an isolated module or a throwaway app instance for a single test run). Fake mode is about the actual long-running app process, started the normal way (`docker compose up`), behaving fully without any real credential — someone (or something) can open the frontend, click into any lab, and get a working demo end to end on fabricated data.

## Open questions

- **How is the mode selected?** An explicit flag (e.g. `FAKE_MODE=true` in `.env`) is unambiguous but one more thing to set or forget. Auto-detecting from whether `ANTHROPIC_API_KEY` looks like a real key is more "just works" but fuzzier to define correctly (what counts as a placeholder vs. a real key?) and risks silently landing in fake mode from a typo'd real key. Needs a decision in `plan-work-item`.
- **Tension with `guiding-principles.md`'s "Real data, not fixtures.**" That principle governs each lab's actual designed behavior in real mode — no lab is built to secretly rely on canned data as its normal operation. Fake mode is a separate, clearly-labeled runtime mode layered on top for dev/demo use, not a replacement for any lab's real design — but the two read as contradictory side by side unless that scoping is written down explicitly. `plan-work-item` should resolve this, likely by adding an explicit carve-out to `guiding-principles.md` itself.
- **Guardrail against untestable-in-CI tests.** No test in this project's suites is currently allowed to need a real credential at all (`testing-strategy.md`), so this risk doesn't exist today — but once fake mode exists, it could tempt someone into writing a test that only makes sense against a real key, silently never run in an automated suite (which never carries a real credential). `plan-work-item` should decide whether to state this explicitly as a non-goal: fake mode is for manual/interactive use, never a justification for a test gated on real-credential presence.
- **How much fake data per lab?** Does every lab need its own bespoke fake responses, or is a smaller set of generic canned responses (largely reusing `task-test-doubles.md`'s fakes) enough for fake mode to feel usable end to end? Likely answered incrementally, per lab, the same way `task-test-doubles.md` adds its fakes.
- **Is the mode visible anywhere in the UI** (e.g. a small "fake mode" badge), so it's never mistaken for real mode, or is it dev-only enough that it doesn't need one?

## Likely dependents

Every task or feature that talks to an external client (the Claude API, GitHub, or any future data source) needs its DI binding to respect whichever mode the app is running in — this task sits upstream of most of the backlog, the same way `env-config.md` and `task-test-doubles.md` already do.
