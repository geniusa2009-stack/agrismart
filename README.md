# AgriSmart — IoT & AI Smart Farming

AgriSmart is a smart-irrigation platform: a farmer registers, sets up a farm
and a device, watches real soil telemetry arrive, and issues irrigation
commands whose lifecycle (queued → sent → acknowledged → executing →
completed) and physical confirmation are tracked honestly and separately from
the mere act of requesting them. Alongside the core IoT product, the
repository also contains a full machine-learning workstream (data ingestion,
feature engineering, training, evaluation, and inference over real
third-party agricultural datasets) and a farmer Community/Economy layer
(social feed, equipment rentals, paid services, a marketplace) built as a
separate, Arabic-first module.

This is a working prototype, not a finished commercial product — the
"Current prototype status" section near the end of this document says
plainly what is real, what is simulated, and what is not built yet.

## Repository layout

```
agrismart-backend/    Node.js + Express + MongoDB (Mongoose) REST API
  src/                 Core application: auth, farms, devices, telemetry,
                        commands, irrigation, dashboard, users, AI routes,
                        community/economy modules, security & middleware
  ai/                   The AI/ML subsystem (see "AI architecture" below):
                        data adapters, feature engineering, training,
                        evaluation, inference, model registry & artifacts
  scripts/              Demo simulator, AI CLI entry points (train/evaluate/
                        predict/prepare)
  scripts/ai/           npm run ai:* CLI wrappers around ai/
  colab/                A standalone Google Colab notebook mirroring the
                        local training pipeline for GPU/cloud experimentation
  tests/                Jest test suites (IoT, security, AI, community,
                        marketplace, equipment, services)
  *.md                  Architecture, security, dataset, and AI reports
                        written during development (see "Further reading")

agrismart-frontend/    React 19 + Vite + Tailwind CSS SPA
  src/pages/             Dashboard, Irrigation, Devices, Farm, Analytics,
                        Alerts, Settings (English/LTR) + Community, Profile,
                        Equipment, Services, Marketplace, Notifications,
                        Moderation (Arabic/RTL)
  src/components/        Shared UI, charts, AI insight card, auth branding
  src/i18n/              Small in-house localization layer (Arabic today,
                        architected for a second locale later)
  src/lib/               API client + pure, framework-free logic modules
                        (e.g. command-selection logic, independently
                        unit-tested with plain Node `assert`)
  e2e/                   Playwright end-to-end specs
```

## Core IoT product loop

```
MEASURE  → sensor telemetry ingested from a device
UNDERSTAND → soil moisture compared against a threshold
DECIDE   → open/close the valve if a threshold is crossed
ACT      → a command is issued to the device
VERIFY   → the device reports back; only THEN is physical state considered confirmed
```

**The system never presents "AgriSmart requested OPEN" as "the valve is
physically open."** Every valve has two separate fields —
`commandedState` (what was requested) and `confirmedState` (what the device
actually reported back, defaulting to `unknown`) — and the frontend renders
both, explicitly, everywhere this matters (Dashboard's irrigation lifecycle
card, the Irrigation Control page's Command Lifecycle card). Only a
device-reported command result (`POST /commands/:id/result`) ever changes
`confirmedState`. Commands progress through a real, enforced state machine
(`pending → queued → sent → acknowledged → executing → completed/failed`,
with any non-terminal state able to expire) — the backend never marks a
command "completed" just because it was sent; only the device's own report
can do that.

## System architecture

```
                     ┌───────────────────────┐
   React SPA  ─HTTP─▶│   Express REST API    │──┐
 (Vite, Tailwind)    │   /api/v1/*           │  │
                     └───────────────────────┘  │
                                │                │
                                ▼                ▼
                     ┌────────────────┐   ┌─────────────────┐
                     │  MongoDB Atlas  │   │  AI subsystem    │
                     │  (Mongoose)     │   │  (ai/, see below)│
                     └────────────────┘   └─────────────────┘
                                ▲
                                │ (simulated today — see
                                │  "Simulated vs. physical hardware")
                     ┌────────────────────┐
                     │  ESP32 device       │
                     │  (real firmware not │
                     │   built; demo       │
                     │   simulator stands  │
                     │   in for it)        │
                     └────────────────────┘
```

The frontend talks only to the backend's REST API; the backend is the single
source of truth in MongoDB. The AI subsystem (`agrismart-backend/ai/`) is
architecturally isolated from the core irrigation logic — it reads telemetry
and produces advisory predictions, and cannot issue device commands itself
(see "Safety boundary" in `ai/README.md`).

## Backend API surface (`agrismart-backend/src/routes/index.js`)

All business routes are mounted under `/api/v1`, plus an unversioned
`/health`:

| Path | Module | Purpose |
|---|---|---|
| `/auth` | `modules/auth` | Registration, login, tokens |
| `/farms` | `modules/farms` | Farm records |
| `/devices` | `modules/devices` | Device provisioning, heartbeat |
| `/telemetry` | `modules/telemetry` | Sensor data ingestion |
| `/commands` | `modules/commands` | Device command lifecycle |
| `/irrigation` | `modules/irrigation` | Valve open/close, automation, emergency stop |
| `/dashboard` | `modules/dashboard` | Aggregated views for the frontend |
| `/users` | `modules/users` | User profile |
| `/ai` | `modules/ai` | AI prediction endpoints (see below) |
| `/community` | `modules/community` | Posts, comments, reactions, follows, profiles |
| `/moderation` | `modules/moderation` | Content reports |
| `/notifications` | `modules/notifications` | In-app notifications |
| `/equipment`, `/rentals` | `modules/equipment` | Equipment listings + rental requests |
| `/services`, `/service-requests` | `modules/services` | Paid agricultural services |
| `/marketplace` | `modules/marketplace` | Buy/sell listings, saved items |

The Community/Economy layer's own architecture, API reference, and security
posture are documented in detail in `COMMUNITY_ARCHITECTURE.md`,
`COMMUNITY_API.md`, and `COMMUNITY_SECURITY.md` at the repo root.

## AI architecture (`agrismart-backend/ai/`)

The AI workstream is a complete, tested, production-shaped pipeline — not
just a prediction API bolted onto the UI:

```
raw telemetry / external CSVs
   → adapters (ai/external/adapters/*.js — one per data source, mapping
     into a canonical schema) + quality/leakage checks
     (ai/external/quality/, ai/external/leakage/)
   → feature engineering (ai/features/)
   → chronological train/test split (ai/training/splitChronological.js,
     per-dataset variants — never a random shuffle, to avoid leaking
     future data into training)
   → training (ai/training/**/train.js — one pipeline per target/dataset)
   → evaluation (ai/evaluation/ — metrics, regression metrics, an
     out-of-distribution check) + a versioned model registry
     (ai/models/modelRegistry.js, ai/models/artifacts/*.json)
   → inference (ai/inference/) → ai/services/aiInsightService.js
   → src/modules/ai/ (controller + routes) → POST /api/v1/ai/*
   → agrismart-frontend/src/components/AiInsightCard.jsx
```

It was trained and evaluated against **real, external, third-party
agricultural datasets** (not just synthetic data) — see `DATASETS.md` for
the full catalog of every dataset investigated, and `AI_DATASET_INVENTORY.md`
for the forensic per-dataset audit (row counts, quality issues, license
status, each independently verified rather than taken from the source's own
description). Three real datasets were fully ingested and trained on:

- A Mendeley tomato-irrigation dataset (soil/agronomic sensor fusion).
- The "Evolving Tomato Cultivation Testbed" (University of Parma /
  Stuard, Italy — 3 growing seasons, real LoRaWAN sensor + valve data).
- A precision-irrigation field trial from Arnesano, Apulia, Italy (5
  sectors, 4 crop types, real valve telemetry).

**Honest current status: every trained model is `candidate`, none is
`validated` or `active`.** `AI_MODEL_CARD.md` documents each model's target,
training data, metric, and — for every one — why it did not beat its
baseline well enough to be promoted. Nothing in this codebase claims a model
is production-accurate; `ai/models/modelRegistry.js`'s `dataSource` and
status fields are checked by every consumer specifically so an unpromoted or
synthetic-data model can never be silently presented as validated.

**Raw third-party dataset files are intentionally not committed to this
public repository** (see the comment in `.gitignore`): their redistribution
license is unconfirmed or explicitly "all rights reserved" per the source.
All ingestion code, adapters, trained model artifacts, and documentation
*are* included — only the raw CSV bytes are excluded. To reproduce training
locally, re-download the originals from the URLs/DOIs listed in
`DATASETS.md` and place them under
`agrismart-backend/ai/external/adapters/pending/` (matching the existing
subfolder names each adapter expects).

Relevant `npm run` scripts (from `agrismart-backend/`):

```bash
npm run ai:prepare              # data readiness checks
npm run ai:train                # train the core (synthetic-dev) pipeline
npm run ai:evaluate              # evaluate a trained model
npm run ai:predict               # run inference
npm run ai:tomato:train          # train on the Mendeley tomato dataset
npm run ai:evolvingTomato:train  # train on the Evolving Tomato Testbed
npm run ai:arnesano:train        # train on the Arnesano field trial
npm run bench:run                # cross-dataset benchmark
npm run bench:cross              # cross-dataset comparison report
```

`agrismart-backend/colab/AgriSmart_Colab_Training_Workspace.ipynb` mirrors
this pipeline for cloud/GPU experimentation outside the local Node
environment.

Further reading: `agrismart-backend/ai/README.md` (full pipeline + safety
boundary), `AI_ARCHITECTURE_AUDIT.md`, `AI_TRAINING_REPORT.md`,
`AI_DATA_QUALITY_REPORT.md`, `AI_ABLATION_REPORT.md`,
`AI_FINAL_JUDGMENT_AND_SELF_CRITIQUE.md`.

## Quick start — see it running in under 2 minutes (zero setup)

This is the fastest way to see the whole product loop for real, no database to
install:

```bash
cd agrismart-backend
npm install
npm run demo        # starts the real backend + a simulated ESP32 device,
                     # runs one full measure→decide→act→verify irrigation
                     # cycle, then shuts itself down. See DEMO.md.
```

In a second terminal, while the demo is running:

```bash
cd agrismart-frontend
npm install
npm run dev          # http://localhost:5173
```

Log in with the credentials the demo prints (`demo-farmer@agrismart.local` /
`DemoPassword123!`) and watch the Dashboard and Irrigation Control page update
live as the simulated device drives real telemetry through the real backend
services. **Full detail, including what to do if the one-time MongoDB binary
download is blocked by your network:** [`agrismart-backend/DEMO.md`](agrismart-backend/DEMO.md).

`npm run demo` needs no `MONGODB_URI` — it boots a throwaway in-memory
MongoDB automatically. **Do not set `MONGODB_URI` in `.env` if you want this
zero-setup path** (see the comment in `agrismart-backend/.env.example`).

## Full local development (persistent server, not just the bounded demo)

Useful when you want to test registration/onboarding/Dashboard at your own
pace instead of the demo's bounded ~2-minute run.

1. **A real MongoDB is required for this path.** Pick one:
   - Local: `docker run -d -p 27017:27017 --name agrismart-mongo mongo:7`, or install MongoDB Community Edition.
   - Cloud: a free-tier [MongoDB Atlas](https://www.mongodb.com/atlas) cluster — you'll need to create that account yourself; nobody else can generate that connection string for you.
2. `cd agrismart-backend && cp .env.example .env`, then set `MONGODB_URI` to whichever you chose above, and generate real JWT secrets with the command in the comment above them:
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
3. `PORT` defaults to `5000` in `.env.example`; this project's own working `.env` runs the backend on **5001** (a common local port-conflict workaround). Either set `PORT=5001` in the backend `.env`, or change `VITE_API_BASE_URL` in `agrismart-frontend/.env` (copy from `agrismart-frontend/.env.example`) to match whatever port you choose — just keep them consistent.
4. `CORS_ALLOWED_ORIGINS` in `.env.example` only lists production-style domains. For local browser development add the Vite dev server's origin: `CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`.
5. `npm run dev` (backend) and, separately, `npm run dev` (frontend).

None of this is optional guesswork — every value above is read from
`agrismart-backend/src/config/env.js`, which fails fast with a clear message
if something required is missing.

## Ports

| Service  | Default (`.env.example`) | This project's working `.env` | Notes |
|----------|---------------------------|-----------------------------|-------|
| Backend  | `5000`                    | `5001`                      | 5000 commonly conflicts with other local services (e.g. macOS AirPlay Receiver). |
| Frontend | `5173` (Vite default)     | `5173`                      | `agrismart-frontend/.env`'s `VITE_API_BASE_URL` must point at whatever port the backend actually runs on. |

## Environment variables

Every variable is validated at startup by `agrismart-backend/src/config/env.js`
(zod schema) — see `agrismart-backend/.env.example` for the full list with
inline documentation, and `agrismart-frontend/.env.example` for the
frontend's one variable. Never commit a real `.env`; only `.env.example` and
`.env.test` are tracked in git (enforced by `.gitignore`).

## Tests

```bash
cd agrismart-backend
npm test              # full suite — requires a real or downloadable-in-memory MongoDB
npm run test:offline  # diagnostic: runs WITHOUT a database — see the header
                       # comment in jest.offline.config.js. Tests that don't
                       # touch the database pass for real; tests that do fail
                       # fast and honestly rather than hanging, so you can see
                       # exactly which ones need a real MongoDB.
```

The offline suite covers, among others: request-ID/PII log redaction, rate
limiter config validation, RBAC role-comparison logic, environment schema
validation, and graceful behavior when MongoDB is unavailable — all real
pure-logic tests, not stubs. The full suite additionally covers IoT command
lifecycle/safety, IDOR/authorization, the AI pipeline (adapters, feature
engineering, training splits, leakage guards, inference safety boundaries),
and the community/marketplace/equipment/services modules.

Frontend:

```bash
cd agrismart-frontend
npm run lint
npm run build
node src/lib/commandSelection.test.mjs  # plain-Node unit test for the
                                         # Irrigation page's command
                                         # selection logic (no test
                                         # framework is installed for
                                         # the frontend — see below)
```

The frontend has no unit-test framework installed (no vitest/jest/RTL) —
`e2e/` (Playwright) covers end-to-end flows, and a small number of
pure/framework-free logic modules under `src/lib/` ship their own
plain-Node `assert` test files as a lightweight substitute where extracting
pure logic was practical.

## Irrigation safety, verified by the test suite (`agrismart-backend/tests/iot/irrigation.test.js`, `tests/security/idor.test.js`)

- **Maximum duration**: a request above `IRRIGATION_MAX_DURATION_SECONDS` is
  silently clamped server-side to the configured maximum — the backend never
  trusts the caller's requested duration alone.
- **Daily allowance**: cumulative open duration for a valve is checked
  against `IRRIGATION_DAILY_ALLOWANCE_SECONDS` *before* issuing a command;
  exceeding it returns a `409` with `IRRIGATION_SAFETY_VIOLATION`.
- **Idempotency**: an `idempotencyKey` (unique-indexed on `DeviceCommand`)
  means a retried open/close request issues the same command, not a second
  one.
- **Emergency stop**: closes every valve on a farm, and deliberately bypasses
  the normal command rate limiter (`irrigation.routes.js`) — safety actions
  are never throttled.
- **Anti-IDOR**: every farm/device/valve-scoped route re-checks ownership
  server-side (`middleware/authorizeOwnership.js`,
  `middleware/authorizeFarmAccess.js`, `middleware/authorizeResourceOwnership.js`)
  — a valve/device/community-resource ID guessed or copied from another
  account's session cannot be acted on. The community/marketplace/equipment/
  services layer has its own dedicated security pass — see
  `COMMUNITY_SECURITY.md`.

## Simulated vs. physical hardware — be precise about this

- `agrismart-backend/scripts/demoSimulator.js` drives the **real, unmodified**
  backend service functions (`telemetry.service.ingest`,
  `irrigation.service.openValve/closeValve`,
  `commands.service.acknowledge/reportExecutionResult`) — nothing about the
  backend logic is faked for the demo. The only simulated thing is the sensor
  itself.
- No physical ESP32 has been connected as part of this build. Onboarding's
  Device Setup step provisions a device *record* in AgriSmart
  (`status: 'provisioned'`) and is explicit that this is "Configured in
  AgriSmart" — **not** proof of a physical connection. `POST
  /devices/:deviceId/activate` is a user-triggered status flag with no
  hardware verification behind it; the only real signal of physical activity
  is a device-authenticated `POST /devices/heartbeat` call, which only real
  firmware (or the demo simulator, standing in for it) ever makes.
- Real command dispatch to non-demo hardware over an actual transport
  (MQTT/HTTP long-poll) is not implemented — `commands.service.markSent()`
  exists and is exercised by the demo/tests, but has no HTTP route a real
  device would call yet. This is a known, intentional MVP boundary, not a bug.

## Current prototype status — implemented vs. future

**Implemented and working end-to-end today:**
- Full auth (register/login), farm/device provisioning, telemetry ingestion.
- The real command state machine (pending → queued → sent → acknowledged →
  executing → completed/failed/expired), with server-enforced safety limits,
  idempotency, and emergency stop.
- Honest physical-state tracking (`commandedState` vs `confirmedState`),
  verified live against a real MongoDB Atlas cluster and a real provisioned
  device record.
- A complete AI data/training/evaluation/inference pipeline, trained and
  evaluated against real third-party datasets, with a versioned model
  registry and an honest `candidate`-only promotion status.
- A full Community/Economy layer (social feed, equipment rentals, paid
  services, marketplace) with its own security hardening pass, in
  Arabic/RTL.

**Simulated, not physical:**
- All device telemetry and command execution shown in the demo comes from
  `scripts/demoSimulator.js`, not a real ESP32 (see above).

**Not yet built (deliberately, not by oversight):**
- A real device-facing dispatch transport (MQTT/HTTP long-poll) for commands
  to reach non-demo hardware.
- Any AI model at `validated`/`active` status — every model is `candidate`
  and is not used to actuate a valve.
- English-locale UI for the Community/Economy pages (currently Arabic-only
  by explicit scope decision; the i18n layer is architected to add a second
  locale later — see `src/i18n/index.js`).
- A frontend unit-test framework (only Playwright e2e + a couple of
  plain-Node logic tests exist today).

## Further reading

- [`agrismart-backend/DEMO.md`](agrismart-backend/DEMO.md) — full demo walkthrough and troubleshooting.
- [`agrismart-backend/ARCHITECTURE_PLAN_STAGE2.md`](agrismart-backend/ARCHITECTURE_PLAN_STAGE2.md) — backend architecture decisions and rationale.
- [`agrismart-backend/ai/README.md`](agrismart-backend/ai/README.md) — AI pipeline detail and safety boundary.
- [`agrismart-backend/DATASETS.md`](agrismart-backend/DATASETS.md) — external dataset catalog (sources, licenses, ingestion status).
- [`agrismart-backend/AI_MODEL_CARD.md`](agrismart-backend/AI_MODEL_CARD.md) — every trained model, its metric, and why it is or isn't promoted.
- [`COMMUNITY_ARCHITECTURE.md`](COMMUNITY_ARCHITECTURE.md), [`COMMUNITY_API.md`](COMMUNITY_API.md), [`COMMUNITY_SECURITY.md`](COMMUNITY_SECURITY.md), [`COMMUNITY_TESTING.md`](COMMUNITY_TESTING.md) — the Community/Economy layer in detail.
