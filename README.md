# A2A Gateway Console

A management console for an Agent-to-Agent (A2A) gateway: agent registry and discovery, protocol routing, access control, in-flight prompt guard, telemetry and tracing, and spend / runaway-loop controls.

- **Front end:** React 18 + TypeScript + Vite (`app/`)
- **API:** Azure Functions v4, Node 20, TypeScript (`api/`)
- **Hosting:** Azure Static Web Apps (serves the front end and runs the API as managed functions under `/api`)

> **Sample data.** The API serves realistic sample data from an in-memory store (`api/src/store.ts`). Changes you make in the UI (activating agents, editing permissions, resetting circuits…) persist until the Functions host restarts. See [Connecting real data](#connecting-real-data).

## Screens

| Path | Screen | Feature-matrix item |
|---|---|---|
| `/` | Overview | Real-time A2A telemetry (summary) |
| `/registry` | Agent Registry | Agent Card discovery & URL rewriting · semantic search · approvals |
| `/routing` | A2A Protocol Routing | JSON-RPC / HTTP+JSON / gRPC routing, Task & Context ID extraction, protocol validation |
| `/access` | Access Control | mTLS, OAuth 2.0 scopes, JWT · scope → agent ACLs · CEL policies · on-behalf-of chains |
| `/guard` | Prompt Guard | In-flight prompt-injection prevention, sanitizer plugins |
| `/telemetry` | Telemetry & Tracing | p50/p95/p99 by method / agent / status · OpenTelemetry trace waterfall |
| `/spend` | Spend & Loops | Token, request and dollar caps · runaway-loop circuit breaker |

## Project layout

```
app/                       React front end (Vite)
  public/staticwebapp.config.json   SWA routing, SPA fallback, security headers
  src/pages/               One file per screen
  src/components/          Layout (left rail) and shared UI
api/                       Azure Functions API
  src/data/seed.ts         Sample data
  src/store.ts             In-memory store and business logic  ← replace to go live
  src/routes.ts            Route table (shared by Azure Functions and the local dev server)
  src/functions/index.ts   Registers each route as an Azure Function
  src/dev-server.ts        Plain Node server for local development
infra/main.bicep           Azure Static Web App resource
deploy/staticwebapp.config.secure.json   Locked-down config (sign-in + role required)
.github/workflows/         GitHub Actions deployment
```

## Run locally

Requires Node.js 20 or later.

```bash
npm run install:all

# terminal 1 — API on http://localhost:7071/api
npm run dev:api

# terminal 2 — front end on http://localhost:5173 (proxies /api to the API)
npm run dev:app
```

The local API server (`api/src/dev-server.ts`) needs no Azure tooling. To run the API exactly as Azure does, install [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local), copy `api/local.settings.sample.json` to `api/local.settings.json`, then `cd api && npm run build && func start`. The [SWA CLI](https://azure.github.io/static-web-apps-cli/) also works: `npx @azure/static-web-apps-cli start` (uses `swa-cli.config.json`, and emulates sign-in at `/.auth/login/aad`).

## Deploy to Azure

You need an Azure subscription and the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli).

### Option A — GitHub Actions (recommended)

1. Push this folder to a GitHub repository (branch `main`).
2. Create the Static Web App:
   ```bash
   az login
   az group create -n rg-a2a-console -l eastasia
   az deployment group create -g rg-a2a-console -f infra/main.bicep -p name=a2a-gateway-console
   ```
3. Get the deployment token and save it as a repository secret named `AZURE_STATIC_WEB_APPS_API_TOKEN_YELLOW_DESERT_0AD732700` (the name `.github/workflows/azure-static-web-apps.yml` expects; change both together if you rename it) (GitHub → Settings → Secrets and variables → Actions):
   ```bash
   az staticwebapp secrets list -n a2a-gateway-console -g rg-a2a-console --query "properties.apiKey" -o tsv
   ```
4. Push to `main` (or run the workflow manually). The workflow type-checks both projects, builds them, and deploys. Pull requests get their own preview URLs.
5. Find the site URL:
   ```bash
   az staticwebapp show -n a2a-gateway-console -g rg-a2a-console --query defaultHostname -o tsv
   ```

### Option B — Deploy from your machine (no GitHub)

After steps 2–3 above:

```bash
npm run install:all && npm run build
npx @azure/static-web-apps-cli deploy ./app/dist \
  --api-location ./api \
  --api-language node --api-version 20 \
  --deployment-token <token-from-step-3> \
  --env production
```

### Option C — Azure portal

Create a **Static Web App**, choose **GitHub** as the source, and set *App location* `app`, *Api location* `api`, *Output location* `dist`. Azure commits its own workflow (with `output_location: build` and no API), which fails for this project. Delete it and point `.github/workflows/azure-static-web-apps.yml` at the secret name Azure created.

## Restricting access

By default the console is public (it only shows sample data). To require sign-in with Microsoft Entra ID and an explicit role:

1. Replace `app/public/staticwebapp.config.json` with `deploy/staticwebapp.config.secure.json` and redeploy.
2. In the Azure portal → your Static Web App → **Role management** → **Invite**, choose provider *Microsoft Entra ID*, enter the user's email, and role `console-admin`. The user opens the invitation link once to accept.
3. Anyone else who signs in sees a "you don't have access" page; signed-out visitors are sent to the Microsoft sign-in page.

To restrict sign-in to your own tenant (rather than any Microsoft account), use the **Standard** plan (`-p sku=Standard`) and register a custom Entra ID provider, as described in [Custom authentication in Azure Static Web Apps](https://learn.microsoft.com/azure/static-web-apps/authentication-custom).

The avatar in the bottom-left corner shows the signed-in user's initials (`/api/me` reads the `x-ms-client-principal` header that Static Web Apps adds) and links to sign in or out.

## API

All endpoints are under `/api` and return JSON.

| Method | Path | Purpose |
|---|---|---|
| GET | `me` · `health` | Signed-in user · health check |
| GET | `overview?range=24h\|7d\|30d` | Overview dashboard |
| GET | `agents` · `agents/{id}` · `agents/{id}/card` | Registry · one agent · rewritten Agent Card |
| POST | `agents` `{name, id, backendUrl, binding, auth, skills[], owner, trust, description}` | Register an agent (held for approval) |
| POST | `agents/{id}/status` `{active}` · `agents/{id}/sync` | Activate/deactivate · re-sync card |
| POST | `search` `{query}` | Capability search |
| GET / POST | `approvals` · `approvals/{id}` `{decision}` | Pending approvals |
| GET | `routing/routes` · `routing/traffic` · `routing/rules` | Routes · live calls · validation rules |
| POST | `routing/rules/{key}` `{enabled}` | Toggle a validation rule |
| GET | `access` | Identity, ACL, policies, OBO chain |
| POST | `access/acl` `{scope, agent, granted}` · `access/publish` · `access/policies/{id}` `{enabled}` | Edit ACL · publish · toggle policy |
| GET | `guard` | Prompt Guard data |
| POST | `guard/mode` `{mode}` · `guard/plugins/{key}` `{enabled}` · `guard/events/{id}/false-positive` | Mode · plugin · feedback |
| GET | `telemetry?group=method\|agent\|status` · `traces/{id}` | Metrics · trace |
| GET | `governance` | Spend, caps, loop incident |
| POST | `governance/circuit` `{state}` · `governance/kill-context` · `governance/rules/{key}` `{enabled}` | Circuit · terminate context · loop rule |

## Connecting real data

Every screen reads from the functions in `api/src/store.ts`; the UI does not need to change when you swap them. Typical replacements:

- **Registry, approvals, ACLs, policies:** Azure Cosmos DB or Table Storage, or your gateway's admin API.
- **Semantic search:** Azure AI Search vector index over Agent Card skills (replace `search()`).
- **Telemetry and traces:** Azure Monitor / Application Insights (KQL over OpenTelemetry spans), or your existing metrics backend.
- **Backend credentials:** keep them in Azure Key Vault and reference them from app settings; never return them from the API.

App settings (Azure portal → Static Web App → Environment variables): `GATEWAY_PUBLIC_HOST` sets the host shown in rewritten Agent Card URLs.

## Scripts

| Command | What it does |
|---|---|
| `npm run install:all` | Install both projects |
| `npm run dev:api` / `npm run dev:app` | Run locally |
| `npm run build` | Build API (`api/dist`) and front end (`app/dist`) |
| `npm run typecheck` | Type-check both projects |
