# Task — Demo deploy

**Status:** 📝 Draft.

## Description

A GitHub Actions workflow that runs on every push to `main` and deploys a real, persistently-reachable demo instance of the app — built from `Dockerfile.prod`, run via `docker-compose.prod.yml`, in fake mode (`FAKE_MODE=true`, placeholder env values — no real credential ever touches CI or the deployed instance). This is a genuine deploy, not just a CI smoke check: after the workflow finishes, the demo app is actually up and reachable somewhere, updated to match the latest `main`.

Needed because the repo currently has no `.github/` workflows and no running public instance at all — anyone wanting to see the app currently has to clone it and run it themselves.

Fake mode is what makes this safe to expose publicly: per [`fake-mode.md`](../shared/fake-mode.md), the whole stack boots and behaves fully with only placeholder env values, and per `README.md`'s mode matrix, fake+prod is the only combination meant for a public deploy — no real credential is ever needed as a repository secret or present on the deployed host.

## Open questions

- **Hosting target — the main undecided piece.** Where the container actually runs persistently after the workflow deploys it: a remote host reached via SSH (`docker compose -f docker-compose.prod.yml up -d --build` run there, needs a host + SSH credentials as repo secrets), a managed container platform (Fly.io/Render/Railway/etc., needs an account + API token as a repo secret), or something else. Not decided yet — settle this during detailed planning before committing to a specific workflow implementation, since the rest of the workflow's shape (registry push vs. direct build-on-host, secrets needed, redeploy mechanics) follows from this choice.
- Whether this workflow's scope should also include running the existing lint/unit/integration test commands (`npm run lint`, `npm test`, `npm run test:e2e`, per `CLAUDE.md`/`README.md`) as a gate before deploying, or whether that's a separate task — the repo has no CI at all yet, so both are currently uncovered.
- Whether pull requests (not just pushes to `main`) should get a build/validation check (without deploying) — the user's ask was specifically "every push to main branch" for the deploy itself, but a pre-merge check could still be useful and is worth deciding.
- How re-deploys are verified as healthy post-deploy (e.g. hitting `/api/smoke-test`, per `prod-docker.md`, against the live hosted URL) and what happens if a deploy fails partway — whether the workflow should roll back or just fail loudly.
- Whether the deployed URL needs to be stable/documented anywhere (e.g. linked from `README.md`) once a hosting target is chosen.

## Likely dependencies

- [`prod-docker.md`](../shared/prod-docker.md) — the exact build (`Dockerfile.prod`) and run (`docker compose -f docker-compose.prod.yml up --build`) commands this workflow drives, and the `/api/smoke-test`-backed `(healthy)` signal it checks for.
- [`fake-mode.md`](../shared/fake-mode.md) — `FAKE_MODE=true` plus placeholder env values is what lets this workflow boot the full stack without a real credential as a CI secret.
