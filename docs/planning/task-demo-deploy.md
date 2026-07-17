# Task — Demo deploy

**Status:** 🔵 In progress.

## Description

A GitHub Actions workflow that runs on every push to `main`, gates on the existing lint/test commands, then builds `Dockerfile.prod` and deploys it to Google Cloud Run — a real, persistently-reachable demo instance, updated to match the latest `main`, in fake mode (`FAKE_MODE=true`, placeholder env values, no real credential ever touches CI or the deployed instance).

Needed because the repo currently has no `.github/` workflows and no running public instance at all — anyone wanting to see the app currently has to clone it and run it themselves.

Fake mode is what makes this safe to expose publicly: per [`fake-mode.md`](../shared/fake-mode.md), the whole stack boots and behaves fully with only placeholder env values, and per `README.md`'s mode matrix, fake+prod is the only combination meant for a public deploy — no real credential is ever needed as a repository secret or present on the deployed host.

Built right after the GitHub data provider and Live Tool-Use Console (see `docs/status.md`'s build order) rather than at the very end of the roadmap — the point of a public demo is to have one up early, not only once every planned feature is done. No dependency on either of those two — this task's own "Depends on" section below is unchanged — this is purely a build-order placement, next in line once they're done.

## Decisions made during this planning pass

- **Hosting target: Google Cloud Run**, on the user's existing GCP account/free tier — not the SSH-to-a-host or Render/Railway alternatives considered in draft. Cloud Run's own free tier already fits a single low-traffic demo container; `--min-instances=0` (below) keeps it scaling to zero, so idle time costs nothing.
- **Auth: Workload Identity Federation (WIF)**, not a long-lived service-account JSON key — Google's recommended approach for GitHub Actions, and it avoids ever holding a static GCP credential as a repo secret. Requires one-time manual setup (see "Manual one-time setup" below); the coding agent has no access to the user's GCP account or this repo's GitHub secrets to do that setup itself.
- **Test gate: yes.** `test` job (existing lint/unit/integration commands) must pass before the `deploy` job runs — a broken `main` never reaches the public demo.
- **PR-only validation check: out of scope for this task.** Only the push-to-`main` deploy is built here; a separate PR-check-without-deploy workflow is a distinct, later task if wanted.
- **Deploy failure/health-check failure: fail loudly, no auto-rollback.** The workflow run goes red and the previous revision keeps serving traffic (Cloud Run only routes to a new revision once it's healthy, so a failed deploy can't itself take the demo down) — no rollback automation is built.
- **Test gate also runs the browser E2E suite** (`frontend-browser-e2e-tests`, `Done` — see "Depends on" below), added during this task's own re-planning pass — a broken real-browser flow (page navigation, streaming, the inspector panel) should block the public demo the same way a broken unit test already does, not stay a manual-only/local-only check once an automated suite for it exists. This is why this task now has an actual dependency where it previously had none.

## Guiding principles / standing decisions cited

- `README.md`, "Modes" — "Never give a publicly-reachable instance a real key"; fake+prod is the only mode combination this task ever deploys.
- [`prod-docker.md`](../shared/prod-docker.md), "Build" and "Interface" — `Dockerfile.prod` (repo-root context) is exactly what this workflow builds and pushes; no changes needed to it or to `docker-compose.prod.yml` for this task (Cloud Run runs the built image directly, not via Compose — see "Contract" below for why `docker-compose.prod.yml` itself isn't part of the deploy path).
- [`fake-mode.md`](../shared/fake-mode.md), "Interface" (`AppConfigService.fakeMode`, backed by `FAKE_MODE`) — what the deployed Cloud Run service's env vars set to `true`.
- [`env-config.md`](../shared/env-config.md), "Interface" (`anthropicApiKey` — required to be *set*, never checked for validity) — why a placeholder `ANTHROPIC_API_KEY` env var on the Cloud Run service satisfies startup validation with no real key ever involved.
- [`testing-strategy.md`](../technical/testing-strategy.md), "No container that runs tests ever holds a real credential" — the workflow's `test` job runs the exact same placeholder-credentialed commands `CLAUDE.md`/`README.md` already document for local dev; nothing about running them in CI changes this rule. Also cited: "CI isn't in scope yet... but whatever CI is eventually added follows this same rule unchanged" — this task is that CI.
- `backend/src/main.ts`'s existing `app.listen(process.env.PORT ?? 3000)` — already reads `PORT` from the environment, which is exactly how Cloud Run tells a container which port to listen on; no code change needed for Cloud Run compatibility.
- [`frontend-browser-e2e-tests.md`](../shared/frontend-browser-e2e-tests.md), "Running it" — the `e2e` Compose service (profile-gated, `depends_on: frontend: condition: service_healthy`, itself chained to `backend`'s own health) this task's `test` job now runs; `docker compose run` respects those health conditions the same as `up` does, so no separate manual wait step is needed.
- `backend/.env.example` — the placeholder env values (`FAKE_MODE=false` by default, `ANTHROPIC_API_KEY` required-but-unchecked) this task's CI step overrides to `FAKE_MODE=true` before bringing the live stack up, since the browser E2E suite's own global-setup guard aborts otherwise.

## Depends on

- `frontend-browser-e2e-tests` (`Done`) — [`frontend-browser-e2e-tests.md`](../shared/frontend-browser-e2e-tests.md), read in full; its `e2e` Compose service is what this task's `test` job now runs.
- `prod-docker`, `fake-mode`, `env-config` (all `Done`, cited above) — no change from the original planning pass.

## Manual one-time setup (the user, not the coding agent)

Requires the user's own GCP account access and this repo's GitHub secrets settings — neither is something the coding agent can do itself, same reasoning as `task-anthropic-client.md`'s manual real-key testing rows.

**User has confirmed they'll do this via the GCP Console and GitHub web UI, not the `gcloud` CLI.** At build time, walk through the five steps below one at a time as console/web click-paths (translating any `gcloud`-flavored step below into its Console equivalent), confirming each step actually succeeded before moving to the next, rather than handing over the whole list at once and assuming it's done.

1. Enable, on the GCP project: Cloud Run Admin API, Artifact Registry API, IAM Credentials API.
2. Create an Artifact Registry Docker repo: `gcloud artifacts repositories create claude-labs --repository-format=docker --location=us-central1`.
3. Create a deploy service account (e.g. `claude-labs-deploy`) and grant it `roles/run.admin`, `roles/iam.serviceAccountUser`, and `roles/artifactregistry.writer` on the project.
4. Set up a Workload Identity Federation pool + provider for GitHub Actions, and bind the service account to this specific GitHub repo (`roles/iam.workloadIdentityUser`, attribute-condition-restricted to this repo) — follow `google-github-actions/auth`'s own current WIF setup docs at the time this is built, since exact `gcloud` commands for WIF have shifted across GCP CLI versions.
5. Add three repo secrets (GitHub → Settings → Secrets and variables → Actions): `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER` (the WIF provider's full resource name), `GCP_SERVICE_ACCOUNT_EMAIL`.

## Contract (single GitHub Actions workflow, no independent tracks)

**`.github/workflows/deploy.yml`** (new):

```yaml
name: Deploy demo
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f docker-compose.dev.yml run --rm backend npm run lint
      - run: docker compose -f docker-compose.dev.yml run --rm backend npm test
      - run: docker compose -f docker-compose.dev.yml run --rm backend npm run test:e2e
      - run: docker compose -f docker-compose.dev.yml run --rm frontend npm run lint
      - run: docker compose -f docker-compose.dev.yml run --rm frontend npm test -- --watch=false
      - name: Configure fake mode for the live dev stack
        run: |
          cp backend/.env.example backend/.env
          sed -i 's/^FAKE_MODE=.*/FAKE_MODE=true/' backend/.env
      - run: docker compose -f docker-compose.dev.yml run --rm e2e
      - if: always()
        run: docker compose -f docker-compose.dev.yml down

  deploy:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write   # required for Workload Identity Federation
    steps:
      - uses: actions/checkout@v4
      - id: auth
        uses: google-github-actions/auth@v2
        with:
          project_id: ${{ secrets.GCP_PROJECT_ID }}
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT_EMAIL }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
      - name: Build and push image
        run: |
          IMAGE=us-central1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/claude-labs/app:${{ github.sha }}
          docker build -f Dockerfile.prod -t "$IMAGE" .
          docker push "$IMAGE"
          echo "IMAGE=$IMAGE" >> "$GITHUB_ENV"
      - uses: google-github-actions/deploy-cloudrun@v2
        with:
          service: claude-labs-demo
          region: us-central1
          image: ${{ env.IMAGE }}
          flags: --allow-unauthenticated --min-instances=0 --max-instances=1
          env_vars: FAKE_MODE=true,ANTHROPIC_API_KEY=placeholder-fake-mode-key
      - name: Post-deploy health check
        run: |
          URL=$(gcloud run services describe claude-labs-demo --region us-central1 --format='value(status.url)')
          for i in $(seq 1 10); do
            if curl -fsS "$URL/api/smoke-test" > /dev/null; then echo "healthy"; exit 0; fi
            sleep 5
          done
          echo "Deploy health check failed" >&2
          exit 1
```

Notes on choices baked into this YAML:

- The `test` job runs the exact commands `README.md`'s "Tests" section already documents — no CI-only test mechanism invented alongside the documented local one.
- `docker-compose.prod.yml` itself is not part of the deploy path — Cloud Run runs a single container image directly (its own platform manages restarts/routing/scaling), so only `Dockerfile.prod`'s build output matters here, not the Compose file that wraps it for a local/host run.
- `--min-instances=0` lets the service scale to zero when idle (free-tier-friendly for a low-traffic demo); `--max-instances=1` is a deliberate cost ceiling for a single-container demo, not a capacity need.
- `ANTHROPIC_API_KEY=placeholder-fake-mode-key` exists only to satisfy `env-config.md`'s "must be set" startup check — never a real key, never treated as one, per `FAKE_MODE=true` never reading it for a real call.
- No rollback step: Cloud Run only shifts traffic to a new revision once it passes its own startup check, so a bad deploy fails the workflow (per the "fail loudly" decision above) without the previous revision ever going down.
- The `e2e` step needs a real `backend/.env` (not just placeholder env vars passed inline) because it's a live `docker compose up`/`run` process, not a Jest run — `backend/test/setup-env.ts`'s placeholder-env mechanism only applies to the Jest-driven unit/integration buckets, not a container actually booting `AppConfigModule` from its bind-mounted `.env` file.
- `if: always()` on the teardown `down` step so a failed `e2e` run still stops the containers it started, rather than leaving them running into the next step (or, on a self-hosted runner, into the next job).

## Test scenarios

This task adds no new application code, so there's nothing to unit-test — its own "test scenarios" are verification of the workflow's behavior, most of it necessarily manual (a live push to `main`, a real GCP deploy) rather than something an automated spec can cover:

Manual-only (run once by the user after the workflow and its one-time GCP setup are both in place — never run by the coding agent, since it requires the user's own GCP account and this repo's real remote):
- A normal push to `main` runs the `test` job, then the `deploy` job, and both go green; the Cloud Run URL (via `gcloud run services describe`, or the Cloud Console) is reachable and shows the fake-mode banner (proving `FAKE_MODE=true` actually took effect on the deployed instance).
- `/api/smoke-test` on the live URL returns `200`.
- A deliberately-broken test (a throwaway failing assertion, reverted right after) on a throwaway branch/PR proves the `test` job actually blocks `deploy` from running — confirms the gate is real, not just present in the YAML.
- A deliberately-invalid deploy flag or env var (reverted right after) proves the workflow's `deploy` job fails loudly (red run) rather than silently leaving a stale revision serving traffic without anyone noticing the workflow failed.
- The `e2e` step actually runs (visible in the job log, not skipped) and passes against the CI-provisioned fake-mode stack; a deliberately-broken browser E2E scenario (reverted right after, same throwaway-branch approach as the unit-test check above) confirms it blocks `deploy` too, not just the pre-existing unit/integration checks.

## To-do list

- [x] Confirm `frontend-browser-e2e-tests` is `Done` before starting (its `e2e` Compose service is what the `test` job's new step runs).
- [x] Manual, one-time (user): GCP project setup, WIF, and repo secrets, per "Manual one-time setup" above.
- [x] Add `.github/workflows/deploy.yml` per Contract above, including the `e2e`-suite step and its `backend/.env` setup step.
- [x] Push to `main` once secrets are in place; confirm both jobs go green, including the new `e2e` step.
- [x] Manually verify the live Cloud Run URL (fake-mode banner renders, `/api/smoke-test` returns `200`).
- [x] Add the live demo URL to `README.md` (one short line) once it's known — not before, since the URL doesn't exist until the first successful deploy.
- [x] Deliberately break a test once (throwaway commit/branch) to confirm the gate blocks a deploy, then revert — per Test scenarios above.
- [x] Deliberately break a browser E2E scenario once (throwaway commit/branch) to confirm it also blocks a deploy, then revert — per Test scenarios above.
- [x] Deliberately break the deploy job itself (invalid gcloud flag) to confirm it fails loudly without the previous revision losing traffic, then revert — per Test scenarios above.

## Open questions

None — resolved during this planning pass (hosting target, auth method, test gating, PR-check scope, failure handling, and — added during this task's re-planning pass — the browser E2E suite's inclusion in the deploy gate, all above).

## Development notes

- Tagged for `docs/technical/` review: the `deploy` job's `env_vars` line was built with a third entry beyond the original Contract, `REPO_URL=${{ github.server_url }}/${{ github.repository }}` — derived entirely from the GitHub Actions execution context (not a repo secret, not hand-maintained), so the deployed fake-mode banner's repo link always matches whatever remote actually ran the deploy. This is additive to the plan's original `env_vars: FAKE_MODE=true,ANTHROPIC_API_KEY=placeholder-fake-mode-key` — no other line in the Contract changed. Cited alongside [`fake-mode.md`](../shared/fake-mode.md)'s existing `AppConfigService.repoUrl`/`REPO_URL` interface, which this only supplies a value for; no code change to that interface was needed.
- `.github/workflows/deploy.yml` created at the repo root exactly per the Contract above (plus the `REPO_URL` addition noted above) — no other files touched.
- Remaining to-do items are all manual/user-only per the plan's own "Manual one-time setup" and "Test scenarios" sections (GCP/WIF setup, first push-to-`main`, live URL verification, README demo-URL line, and the two deliberate-break checks) — none of them can be done by the coding agent.
- Tagged for `docs/technical/` review: the first live run of the `test` job failed with `dependency failed to start: container claude-labs-backend-1 is unhealthy` on the `frontend` steps. Root cause was step ordering, not the Contract's job structure — `docker compose run --rm frontend ...` implicitly starts `backend` too (frontend's own `depends_on: backend: condition: service_healthy` in `docker-compose.dev.yml`), but the original Contract placed the "Configure fake mode" step (which creates `backend/.env`) *after* the frontend lint/test steps. With no `.env` yet, backend booted without `ANTHROPIC_API_KEY` set, failed `env-config.md`'s required-at-startup check, never came up, and its health check never passed. Fix: moved the `.env`-creation step to immediately after checkout, before any `docker compose run` — every step in the job now has a working fake-mode `.env` available for the entire job, not just the final `e2e` step. Worth recording generally for any future CI job that touches `docker-compose.dev.yml`'s dependency graph: create `backend/.env` before the *first* command that could trigger backend's health-gated startup, not just before the step that most obviously needs it.
- Also bumped `actions/checkout@v4` → `v5` in both jobs (unrelated to the above) — GitHub's runners are deprecating the Node 20 runtime `v4` targets and were already silently forcing it onto Node 24 with a warning; `v5` targets Node 24 natively.
