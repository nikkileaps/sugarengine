# New Game: Web Deploy Guide

Steps to create a new game in SugarEngine and deploy it to a web target.

## 1. Create the game

- Open SugarEngine editor (`npm run dev`)
- Game menu → New Game
- Enter game name, slug, and game root directory (a separate repo outside sugarengine)
- Click Create Game

## 2. Initialize the game repo

```bash
cd <game-root>
git init
```

## 3. Add a .gitignore

Create `.gitignore` in the game root with at minimum:

```
node_modules/
dist/
dist-game/
exports/web/.artifacts/
release/targets/web/.artifacts/
runtime/bin/
runtime/models/
.env
.env.*
!.env.example
.DS_Store
Thumbs.db
infra/terraform/.terraform/
infra/terraform/*.tfstate
infra/terraform/*.tfstate.backup
infra/terraform/*.tfvars
!infra/terraform/*.tfvars.example
.vscode/
.idea/
*.swp
*.swo
.netlify
```

## 4. Install backend dependencies

The scaffolded game-api needs a lockfile for CI:

```bash
cd <game-root>/release/targets/web/game-api
npm install
```

Commit the generated `package-lock.json`.

## 5. Set up Google Cloud

Prerequisites: a GCP project with these APIs enabled:
- Cloud Run
- Artifact Registry
- Secret Manager

### Provision infrastructure with Terraform

Create `infra/terraform/` in the game repo with terraform config for:
- Artifact Registry Docker repo
- Cloud Run runtime service account
- GitHub Actions deployer service account
- Workload Identity Federation for GitHub OIDC
- Secret Manager secrets (cookie-secret, shared-alpha-username, shared-alpha-password-hash per environment)
- Cloud Run services (one per environment)

```bash
cd <game-root>/infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your project ID and GitHub repo
terraform init
terraform plan
terraform apply
```

### Authenticate Terraform (first time)

```bash
gcloud auth application-default login
```

### Set secret values

Generate a bcrypt hash for the shared alpha password:

```bash
node -e 'const b = require("bcryptjs"); b.hash("your-password", 12).then(console.log)'
```

Note: use single quotes around the `-e` argument to avoid zsh interpreting `!` in passwords.

Store the secrets (repeat for each environment — staging and production):

```bash
echo -n "alpha" | gcloud secrets versions add <game>-api-staging-shared-alpha-username --data-file=- --project=<project-id>

echo -n '$2b$12$...' | gcloud secrets versions add <game>-api-staging-shared-alpha-password-hash --data-file=- --project=<project-id>

openssl rand -base64 32 | tr -d '\n' | gcloud secrets versions add <game>-api-staging-cookie-secret --data-file=- --project=<project-id>
```

Note: use single quotes around the bcrypt hash so `$` characters aren't interpreted by the shell.

## 6. Set up Netlify

```bash
netlify login
netlify sites:create --name <game>-staging
netlify sites:create --name <game>
```

Note the Site IDs from the output.

Generate a personal access token at https://app.netlify.com/user/applications/personal

## 7. Add GitHub Actions secrets

Go to the game repo → Settings → Secrets → Actions and add:

| Secret | Value |
|---|---|
| `GCP_PROJECT_ID` | Your GCP project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | From terraform output `workload_identity_provider` |
| `GCP_SERVICE_ACCOUNT` | From terraform output `deployer_sa_email` |
| `NETLIFY_AUTH_TOKEN` | From Netlify personal access token |

## 8. Update deployment profiles

Edit `release/targets/web/profile.staging.json` and `profile.production.json`:

- `cloudRun.projectId` → your GCP project ID
- `artifactRegistry.projectId` → your GCP project ID
- `artifactRegistry.repository` → your Artifact Registry repo name
- `backend.imageRepository` → full image path from terraform output
- `frontend.siteId` → Netlify site ID
- `frontend.gameApiBaseUrl` → Cloud Run service URL from terraform output
- `frontend.host` → your custom domain or Netlify default URL

## 9. Set up game content

- Create regions, NPCs, quests, dialogues in the editor
- Enable SugarAgent plugin if using AI chat NPCs
- Enable Sugarlang plugin if using language learning features
- Configure lore and re-ingest if using SugarAgent
- Install language packs in Sugarlang settings if needed
- Create scenarios from quests for Sugarlang

## 10. Publish and deploy

- Save the game in the editor
- Game menu → Publish
- Commit the published exports and any changes to the game repo
- Push to main — GitHub Actions will deploy frontend to Netlify and backend to Cloud Run

## Gotchas

- `npm ci` in CI requires `package-lock.json` — run `npm install` in `release/targets/web/game-api/` before first push
- `@sugarengine/sugaragent-runtime-core` is not yet published to a registry — for now it is vendored as a tarball in `release/targets/web/game-api/vendor/`. Regenerate it with `npm pack` from `packages/sugaragent-runtime-core/` in the sugarengine repo when the package changes. This will be replaced by a GitHub Packages dependency once published.
- The `exports/` directory must not be fully gitignored — the web client build needs to be committed
- Bcrypt hashes contain `$` — always use single quotes when passing them to shell commands
- Passwords containing `!` will be interpreted by zsh — use single quotes around the whole command
- GCP org policies may block `allUsers` IAM bindings — use `INGRESS_TRAFFIC_ALL` on Cloud Run instead and let the app handle auth
