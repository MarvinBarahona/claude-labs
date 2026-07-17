# Demo Deploy

A GitHub Actions workflow that runs on every push to `main`: gates on this repo's documented lint/unit/integration/browser-E2E commands, then builds `Dockerfile.prod` and deploys it to Google Cloud Run — a real, persistently-reachable public demo instance, always in fake mode. This is the only automated deploy path in the repo; there is no PR-only validation workflow.

**Live demo:** linked from `README.md`.

## Workflow

**`.github/workflows/deploy.yml`**, two jobs:

- **`test`** — checks out the repo, then runs the exact commands `README.md`'s "Tests" section documents (`backend`/`frontend` lint, `backend` unit + integration tests, `frontend` unit tests), then the `frontend-browser-e2e-tests` suite (`docker compose -f docker-compose.dev.yml run --rm e2e`). `backend/.env` is created from `backend/.env.example` with `FAKE_MODE` forced to `true` immediately after checkout, before any `docker compose run` — not just before the `e2e` step. This matters because `frontend`'s own `depends_on: backend: condition: service_healthy` in `docker-compose.dev.yml` means *any* `docker compose run --rm frontend ...` also starts and health-gates on `backend`, not only a command that actually needs it; without a `.env` already in place, `backend` fails `env-config.md`'s required-`ANTHROPIC_API_KEY`-at-startup check and never turns healthy, failing the frontend steps. Any future CI job that touches this Compose file's dependency graph needs its placeholder `.env` in place before the *first* command that could trigger a health-gated service, not just the step that most obviously needs it.
- **`deploy`** (`needs: test`) — authenticates via Workload Identity Federation, builds and pushes `Dockerfile.prod`'s image to Artifact Registry, then deploys it to Cloud Run (`google-github-actions/deploy-cloudrun`) and polls `/api/smoke-test` on the resulting URL as a post-deploy health check.

Pinned action versions (Node 24-targeting, current as of this task): `actions/checkout@v5`, `google-github-actions/auth@v3`, `google-github-actions/setup-gcloud@v3`, `google-github-actions/deploy-cloudrun@v3`.

## Deploy target and fake mode

- **Cloud Run service:** `claude-labs-demo`, region `us-central1`, image pushed to `us-central1-docker.pkg.dev/<project>/claude-labs/app:<sha>`. `--allow-unauthenticated --min-instances=0 --max-instances=1` — publicly reachable, scales to zero when idle, capped at one instance as a deliberate cost ceiling for a single-container demo (not a capacity need).
- **Env vars set on the deployed service:** `FAKE_MODE=true`, `ANTHROPIC_API_KEY=placeholder-fake-mode-key`, `REPO_URL=${{ github.server_url }}/${{ github.repository }}`. Per `README.md`'s mode matrix, fake+prod is the only combination this workflow ever deploys — no real credential is ever a repo secret or present on the deployed host. `ANTHROPIC_API_KEY`'s placeholder value exists only to satisfy `env-config.md`'s "must be set" startup check (`fake-mode.md`'s `AppConfigService.fakeMode` never reads it for a real call). `REPO_URL` is derived entirely from the GitHub Actions execution context rather than hand-maintained, so the deployed fake-mode banner's repo link (`fake-mode.md`'s `AppConfigService.repoUrl`) always matches whichever remote actually ran the deploy.
- `docker-compose.prod.yml` is not part of the deploy path — Cloud Run runs `Dockerfile.prod`'s build output directly as a single container (Cloud Run itself manages restarts/routing/scaling), not via Compose.

## Failure behavior

No auto-rollback: Cloud Run only shifts traffic to a new revision once it passes its own startup check, so a failed `deploy` job (a bad test, a broken build, an invalid deploy flag/env var) fails the workflow loudly (red run) while the previously-deployed revision keeps serving traffic untouched. Confirmed by deliberately breaking each of a unit test, the browser E2E suite, and a deploy flag (each reverted immediately after) — the `test` job blocks `deploy` in the first two cases, and the `deploy` job itself fails without disrupting live traffic in the third.

## One-time GCP setup (for a new project or a lost/rotated credential)

Done once, via the GCP Console and GitHub's web UI (no `gcloud` CLI):

1. Enable, on the GCP project: Cloud Run Admin API, Artifact Registry API, IAM Service Account Credentials API.
2. Create an Artifact Registry Docker repo named `claude-labs`, format Docker, region `us-central1`.
3. Create a deploy service account (`claude-labs-deploy`) and grant it `roles/run.admin`, `roles/iam.serviceAccountUser`, and `roles/artifactregistry.writer` on the project.
4. Create a Workload Identity Federation pool + OIDC provider (issuer `https://token.actions.githubusercontent.com`), with an attribute condition restricting trust to this exact GitHub repo (`attribute.repository == '<owner>/<repo>'`), then grant `claude-labs-deploy` to principals matching that condition (`roles/iam.workloadIdentityUser`) — this is what lets GitHub Actions impersonate the service account with no long-lived key ever stored as a secret.
5. Add three repo secrets (GitHub → Settings → Secrets and variables → Actions): `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER` (the WIF provider's full resource name), `GCP_SERVICE_ACCOUNT_EMAIL`.
