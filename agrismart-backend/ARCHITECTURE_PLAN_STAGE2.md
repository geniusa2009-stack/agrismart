# AgriSmart Backend — Stage 2 Architecture & Migration Plan

No implementation files have been touched to produce this document. Everything below is a plan for Stage 3 review and approval.

---

## 1. Architecture assessment (recap, for context)

Stage 1 found a solid but incomplete infrastructure skeleton with two critical bugs (competing Mongo reconnect logic, CORS-error misclassification) and several high-priority readiness gaps (cluster/pool math, IPv6-unsafe rate limiting, no index-management story, no eager config validation, logs stripping stack traces in production). Nothing in Stage 1 was a live incident — there's no traffic yet — but every one of those bugs would be inherited by every feature built on top, so Stage 2 designs around fixing them before any domain code lands.

---

## 2. Target architecture

**Modular monolith, organized by domain module, with a thin set of shared cross-cutting layers.** Not pure horizontal layering (a top-level `controllers/`, `services/`, `models/` each holding 15 unrelated files) — at the scale this brief describes (12+ API modules, IoT ingestion, commands, irrigation safety), horizontal-only layering means every feature touches five different top-level folders, which is exactly the kind of shotgun-surgery that makes a monolith unpleasant to work in. Instead: each domain module (`devices`, `telemetry`, `commands`, …) is self-contained (routes → controller → service → repository → model → validators all live together), and only genuinely cross-cutting concerns (auth, error handling, logging, DB connection, rate limiting) live in shared top-level folders.

This also directly serves your "must be able to decompose later without a rewrite" requirement: a domain module that's already isolated (own routes, own service, own repository, minimal cross-module imports) is the exact shape you'd extract into a standalone service later — the module boundary IS the future service boundary. Horizontal layering doesn't give you that for free; package-by-feature does.

---

## 3. Complete target folder tree

```text
agrismart-backend/
├── src/
│   ├── server.js                        # process/HTTP lifecycle only (no cluster.fork())
│   ├── app.js                           # Express app assembly, mounts routes/index.js
│   ├── config/
│   │   ├── env.js                       # loads + validates every env var once, fails fast
│   │   └── index.js                     # typed config object built from env.js, only source other modules import
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── mongoose.js              # single connect()/disconnect()/health, no custom reconnect loop
│   │   │   └── indexes/
│   │   │       └── ensureIndexes.js     # explicit index sync, run in CI/CD, not on every boot
│   │   └── mqtt/
│   │       └── ingestionGateway.js      # transport-agnostic interface; HTTP calls it today, MQTT subscriber calls it later — business logic never imports an MQTT client directly
│   ├── security/
│   │   ├── password.js                  # bcrypt hash/verify
│   │   ├── jwt.js                       # access/refresh token sign+verify, rotation helpers
│   │   ├── deviceAuth.js                # device credential verification (API key over TLS today)
│   │   └── rbac.js                      # role/permission table, ownership-check helpers
│   ├── middleware/
│   │   ├── requestId.js                 # request ID + correlation ID
│   │   ├── errorHandler.js              # ApiError, notFoundHandler, errorHandler, asyncHandler
│   │   ├── rateLimiter.js               # IPv6-safe key generation, store abstraction, 4 limiter classes
│   │   ├── authenticate.js              # verifies user JWT, attaches req.user
│   │   ├── authorizeRole.js             # RBAC role gate
│   │   ├── authorizeOwnership.js        # resource-ownership gate (the anti-IDOR layer)
│   │   ├── authenticateDevice.js        # verifies device credential, attaches req.device
│   │   └── validate.js                  # generic zod-schema-driven body/params/query validator
│   ├── observability/
│   │   ├── logger.js                    # pino instance, redaction config, log levels
│   │   ├── httpLogger.js                # pino-http wiring (replaces morgan)
│   │   └── metrics.js                   # in-memory counters for the metric names in §13; swappable for prom-client later
│   ├── utils/
│   │   ├── pagination.js                # offset + cursor helpers
│   │   └── asyncPool.js                 # small concurrency helper (used by batch telemetry processing)
│   ├── routes/
│   │   └── index.js                     # mounts /health (unversioned) and every /api/v1/* module router
│   └── modules/
│       ├── health/
│       │   └── health.routes.js
│       ├── auth/
│       │   ├── auth.routes.js
│       │   ├── auth.controller.js
│       │   ├── auth.service.js
│       │   ├── auth.repository.js       # RefreshToken persistence
│       │   ├── refreshToken.model.js
│       │   └── auth.validators.js
│       ├── users/
│       │   ├── user.model.js
│       │   ├── users.repository.js
│       │   ├── users.service.js
│       │   ├── users.controller.js
│       │   ├── users.routes.js
│       │   └── users.validators.js
│       ├── farms/            # farm.model.js, farms.repository.js/service.js/controller.js/routes.js/validators.js
│       ├── fields/           # same pattern
│       ├── crops/            # same pattern
│       ├── devices/
│       │   ├── device.model.js
│       │   ├── devices.repository.js
│       │   ├── devices.service.js       # provisioning, rotation, suspension
│       │   ├── devices.controller.js
│       │   ├── devices.routes.js
│       │   └── devices.validators.js
│       ├── sensors/          # sensor.model.js + repository/service/controller/routes/validators
│       ├── telemetry/
│       │   ├── telemetry.model.js       # Time Series collection
│       │   ├── telemetry.repository.js
│       │   ├── telemetry.service.js     # idempotency, normalization, processing
│       │   ├── telemetry.controller.js  # HTTP ingestion endpoint (calls ingestionGateway)
│       │   ├── telemetry.routes.js
│       │   └── telemetry.validators.js
│       ├── commands/
│       │   ├── deviceCommand.model.js
│       │   ├── commands.repository.js
│       │   ├── commands.service.js      # state machine, timeout sweep
│       │   ├── commands.controller.js
│       │   ├── commands.routes.js
│       │   └── commands.validators.js
│       ├── irrigation/
│       │   ├── valve.model.js
│       │   ├── pump.model.js
│       │   ├── irrigationEvent.model.js
│       │   ├── irrigation.repository.js
│       │   ├── irrigation.service.js    # safety limits: max duration, daily allowance, emergency stop
│       │   ├── irrigation.controller.js
│       │   ├── irrigation.routes.js
│       │   └── irrigation.validators.js
│       ├── notifications/    # notification.model.js + repository/service/controller/routes/validators
│       └── auditLog/
│           ├── auditLog.model.js
│           └── auditLog.repository.js   # write-only from other services, no public routes
├── scripts/
│   └── seedDev.js                       # optional local dev seed data
├── tests/
│   ├── setup/
│   │   └── testDb.js                    # mongodb-memory-server bootstrap, used by every integration/API test
│   ├── unit/                            # services + utils, mocked repositories
│   ├── integration/                     # repository <-> in-memory MongoDB
│   ├── api/                             # supertest against createApp()
│   ├── security/                        # authn/authz/IDOR/rate-limit tests
│   └── iot/                             # duplicate/invalid telemetry, heartbeat, command lifecycle
├── .env.example
├── .eslintrc.cjs
├── .prettierrc
├── jest.config.js
├── package.json
├── README.md
├── AUDIT_STAGE1.md                      # kept as historical record
└── ARCHITECTURE_PLAN_STAGE2.md          # this document
```

**What belongs where, what must not:**

- **`modules/<name>/`** — everything specific to one domain: its Mongoose schema, its DB access, its business rules, its HTTP surface, its input schemas. Must NOT import another module's repository directly (cross-module reads go through that module's *service*, never its repository, so ownership of "how X is queried" stays with X's owner).
- **`middleware/`** — request-pipeline concerns that apply across modules (auth, validation, rate limiting, error handling). Must NOT contain business logic (e.g., `authorizeOwnership.js` checks "does this user own this farmId," not "is this a valid irrigation schedule").
- **`security/`** — pure, stateless crypto/token/RBAC-table logic. Must NOT touch the database or HTTP objects directly (keeps it unit-testable with zero mocking).
- **`infrastructure/`** — anything that talks to an external system (MongoDB, and later MQTT/Redis). Must NOT contain domain business rules — `mongoose.js` knows how to connect; it has no idea what a "farm" is.
- **`observability/`** — logging/metrics plumbing only. Must NOT be where redaction *decisions* are scattered (redaction rules live centrally in `logger.js`, not re-implemented per call site).
- **`config/`** — the only code allowed to read `process.env` directly. Every other file imports the validated config object from `config/index.js`. Must NOT contain any logic beyond reading/validating/shaping env vars.
- **Repositories** — the only files allowed to call Mongoose model methods (`.find`, `.create`, `.updateOne`, aggregation pipelines). Must NOT contain HTTP-layer concepts (no `req`/`res`).
- **Models** — schema definition, indexes, schema-level validation, and small schema-attached helpers (a virtual, an instance method like `device.isOnline()`). Must NOT contain multi-step business workflows (that's the service's job) or reference other modules' models directly (relationships are IDs; joins happen in the service/repository via explicit queries or `$lookup`, not tight Mongoose `ref` population coupling everywhere).
- **Controllers** — parse the already-validated request, call exactly one service method, shape the HTTP response. Must NOT contain business rules, must NOT call a repository directly, must NOT be more than a few lines.
- **Services** — all business logic lives here (irrigation safety limits, command state transitions, idempotency decisions). Must NOT know about `req`/`res`/HTTP status codes (services throw `ApiError`/domain errors; controllers translate them to HTTP).

---

## 4. Layer boundaries

**HTTP path:**
`Route (path + method + middleware chain) → validate() → authenticate()/authenticateDevice() → authorizeRole()/authorizeOwnership() → Controller → Service → Repository → Mongoose Model → MongoDB`

Each arrow is a one-way call; nothing calls backward (a repository never calls a service, a service never touches `req`). Controllers are intentionally "boring" — the acceptance bar for a controller function is that it could be rewritten for gRPC or a CLI without touching the service layer at all.

**IoT path:**
`ESP32 → Transport (HTTP endpoint today; MQTT subscriber later) → infrastructure/mqtt/ingestionGateway.js → authenticateDevice() → validate() (telemetry schema) → telemetry.service (idempotency check → normalization → processing) → telemetry.repository → Time Series collection → (async/batch) analytics aggregation`

The critical design point: **both the HTTP controller and the future MQTT subscriber call the same `ingestionGateway.ingest(deviceId, payload, transportMeta)` function.** Nothing downstream of that function knows or cares whether the bytes arrived over HTTPS or MQTT. This is how MQTT gets introduced later "without forcing the entire application to depend directly on the broker" — the broker client, when it exists, is a thin adapter that calls the same gateway function an HTTP route calls today.

Business logic leak prevention, concretely: `errorHandler.js` and `rateLimiter.js` never make a business decision (they don't know what a farm is); Mongoose models never orchestrate a multi-step workflow (a `DeviceCommand` model has a `status` enum and validation, but the *state machine transition rules* live in `commands.service.js`); routes are declarative (`router.post('/', validate(schema), authenticate, controller.create)`) with zero inline logic.

---

## 5. Fix plan for every Stage 1 finding

### A — MongoDB reconnect lifecycle (A1, D3)

Remove `scheduleReconnect()`, the retry timer, and the manual re-`connect()`-on-`disconnected` handler entirely. The corrected lifecycle:

- **Initial connection:** `mongoose.connect(uri, options)` is called exactly once, at boot, inside `src/infrastructure/database/mongoose.js`. `serverSelectionTimeoutMS` bounds how long this call waits.
- **Connection loss:** the MongoDB Node driver's own background topology monitor (started internally the moment `connect()` is called, independent of whether that initial call succeeded or timed out) keeps probing servers and will fire Mongoose's `disconnected`/`connected`/`reconnected` events on its own. Our code does not call `connect()` again — it only *listens* to those events for logging and for `/health/ready`.
- **Driver recovery:** happens automatically inside the driver; the application takes no action beyond observing state via `mongoose.connection.readyState`.
- **Application readiness:** `/health/ready` reads `readyState` directly (1 = connected = ready; anything else = 503). No custom state machine needed — `readyState` already is one, maintained by the driver.
- **Shutdown:** `mongoose.connection.close()` once, no timers to clear (there are none left).
- **Fatal startup failure policy (explicit, since the old code was ambiguous about this):** if the *initial* `connect()` call throws, log the error at `error` level with full context, but **do not exit the process** — the driver's background monitor keeps trying, and a container/orchestrator restart wouldn't fix an actual outage anyway (only masks it while adding restart-loop noise). The process stays alive and reports itself not-ready until the driver connects. The one deliberate exception: **CI/test environments** run with `DB_STARTUP_FAIL_FAST=true` (a config flag, default `false`), where a failed initial connect *does* exit non-zero immediately — because in CI, "MongoDB isn't reachable" is a setup bug that should fail the pipeline loudly, not retry silently for minutes.

### B — CORS error classification (A2)

Stop throwing from the `cors` package's `origin` callback. CORS is a **browser-enforced** boundary — it only protects a browser from letting page JavaScript read a cross-origin response; it does nothing to stop a non-browser client (curl, a compromised script, our own mobile app which doesn't send an `Origin` header at all) from getting the response. Given that, throwing a server error for a rejected browser origin was already the wrong mental model — it was trying to make CORS do authorization's job.

Corrected design: `origin(origin, callback) { ... return callback(null, allowedOrigins.includes(origin)); }` — never `callback(new Error(...))`. A disallowed origin gets `callback(null, false)`, which makes the `cors` middleware simply omit the `Access-Control-Allow-Origin` header; the browser blocks the response client-side; the server still returns its normal status code (whatever the route would have returned) because CORS was never meant to gate the *server's* execution. We log rejected origins at `warn` (not `error`) via a small counter in `observability/metrics.js`, purely for visibility into misconfigured frontend deployments — never as an application error passed to `errorHandler`.

### C — Cluster mode (final recommendation: remove)

**Removed from `server.js` entirely.** Reasoning, addressing each point you asked for directly:

- **MongoDB connection pool implications:** each cluster worker is a separate Node process with its own `mongoose.connect()` call and its own pool (`maxPoolSize`). Total connections from one *container* = `workers × maxPoolSize`, invisible in any single config value, and easy to blow through Atlas's shared-tier connection ceiling with just two clustered containers.
- **Worker count:** `os.cpus().length` in a container is often misleading — containers frequently see the *host's* full core count even when their CPU limit (cgroup quota) is a fraction of a core, causing over-forking relative to actual allocated capacity.
- **Memory overhead:** each worker is a full V8 heap + its own copy of every loaded module + its own connection pool — N workers is closer to N× baseline memory than a shared-thread model would be.
- **Deployment implications:** clustering duplicates what a container orchestrator (or even PM2 outside a container) already does — restart-on-crash, multi-process supervision — inside a single container, making CPU/memory requests-and-limits harder to size correctly (you're sizing for N workers per container instead of 1).
- **Container orchestration compatibility:** container platforms scale by adding *containers* (each independently scheduled, health-checked, and billed), not by growing threads inside one container. Fighting that model with in-process clustering adds complexity without the platform-level benefits (independent restart, independent scheduling, independent scaling per instance).
- **Horizontal scaling:** the architecture scales the way your brief asks for in section 6's closing line — **multiple stateless app instances behind a load balancer**, each with its own deliberately-sized connection pool, added/removed by the orchestrator based on load. This is simpler to reason about, simpler to size, and matches how MongoDB Atlas connection limits are actually documented (per-cluster total, so you want a small number of well-understood instances, not an unpredictable worker-count multiplier).

If a future profiling exercise on real traffic shows genuine single-instance CPU-bound throughput limits (not expected before real device-fleet volume exists), the correct reintroduction path is **PM2 in cluster mode at the process-manager level** (which has mature pool-aware tooling) rather than hand-rolled `cluster.fork()`, and only after confirming horizontal scaling (more/cheaper containers) isn't the simpler fix first.

### D — Rate limiting (correct IPv4/IPv6 + device-aware design)

Four limiter classes, each keyed by the *most specific verified identity available*, not blanket IP:

| Limiter | Applies to | Key | Window/ceiling (starting point, tune empirically) |
|---|---|---|---|
| `publicApiLimiter` | Unauthenticated public routes | normalized IP (IPv4 exact; IPv6 masked to /64) | 300 / 15 min |
| `authLimiter` | `/api/v1/auth/*` (login, refresh, password reset) | normalized IP **+** the attempted account identifier from the request body (email/phone) | 20 / 15 min per (IP, identifier) pair |
| `deviceIngestLimiter` | Telemetry ingestion | **authenticated `deviceId`** (post `authenticateDevice()`), never IP | 120 / min per device |
| `commandLimiter` | Device command issuance (valve/pump control) | `(userId, deviceId)` pair | 10 / min per pair |

**Why this avoids punishing farmers behind shared NAT:** the moment a request carries a verified identity (a device credential, or a logged-in user's JWT), that identity — not the network address — becomes the rate-limit key. Egyptian mobile carrier NAT means dozens of unrelated devices can share one public IPv4, and IPv6 delegation means one device can rotate through many addresses in its own `/64`; keying by IP in either direction is wrong for our traffic shape. IP-based keying is reserved for the two places where no verified identity exists yet: `publicApiLimiter` (nothing to authenticate) and `authLimiter` (the request *is* the authentication attempt, so it's necessarily pre-auth) — and `authLimiter` compounds IP with the claimed identifier specifically so one malicious IP can't lock out a legitimate account, and one legitimate shared-NAT IP with many different farmers logging in doesn't get blanket-blocked either (each (IP, email) pair gets its own bucket).

**IPv6 normalization:** a small `normalizeIp(req)` helper (in `middleware/rateLimiter.js`) parses `req.ip`; for IPv4 it's used as-is; for IPv6 it's masked to the first 4 hextets (`/64`, the standard "one customer" delegation size), so an attacker or an innocuous DHCPv6 renewal rotating through the same `/64` still shares one bucket instead of getting a fresh one per request.

**Store:** stays `MemoryStore` (in-process) at this stage — correct today since there's a single instance — but every limiter is built through one `createLimiter(options)` factory, so swapping the store to `rate-limit-redis` later (Stage C, once horizontal scaling makes per-process counters inconsistent) is a one-line change in that factory, not a rewrite of four call sites.

### E — MongoDB index management

- **Development/test:** `autoIndex: true` (Mongoose default) — convenient, safe on empty/small local and CI databases.
- **Production:** `autoIndex: false` always (unchanged from Stage 1 — correct to avoid surprise index builds under production load), paired with the missing piece: **`scripts/ensureIndexes.js`**, an explicit script (invoked as a CI/CD deploy step, or manually before first launch) that calls `Model.syncIndexes()` for every registered model. Indexes themselves are declared once, on the schema, in each model file (`schema.index({...})`) — the single source of truth; the script has no index definitions of its own, it just triggers the sync.
- **Migrations:** no dedicated migration framework yet — additive index/schema changes go through `syncIndexes()` as above. If a genuinely breaking change is ever needed (renaming a field with existing production data, a non-additive index change), introduce a lightweight runner (`migrate-mongo`) *then*, listed as OPTIONAL LATER in §12, not added speculatively now.
- **Telemetry indexes:** on the Time Series collection, MongoDB auto-manages an internal index on the `timeField`; we add one compound secondary index on `(deviceId, recordedAt)` for the dominant "readings for device X in range" query pattern (subject to MongoDB server version's time-series index support — verify against the actual Atlas tier/version before relying on anything beyond that).
- **TTL/retention:** native `expireAfterSeconds` on the Time Series collection handles raw telemetry retention (a specific retention window is a business decision to confirm with you before Stage 3, not invented here); pre-aggregated hourly/daily rollups live in a separate regular collection with no TTL, retained indefinitely for historical analytics/AI training — "raw hot data expires, aggregates live forever."
- **Unique constraints:** `user.email` unique; `device.deviceId` unique; a compound **unique** index on `(deviceId, messageId)` in telemetry — this is the database-level backstop for idempotency (§7/§8), not just an application-level check.

### F — Environment validation

`src/config/env.js` reads every required variable exactly once at process start using `zod` (the same library used for request/telemetry validation — one dependency, two jobs, justified reuse rather than a second validation library). On any missing/malformed required variable, it throws immediately and `server.js` lets that exception propagate to a hard, logged `process.exit(1)` **before** attempting to bind a port or connect to MongoDB — this is the one place in the whole architecture where fail-fast-and-exit is the correct policy (contrast with §A's MongoDB-unreachable case, which is deliberately *not* fail-fast). No other file reads `process.env` directly; everything imports the validated, typed object from `config/index.js`.

### G — Logging

Replace the hand-rolled `console.log` wrapper and `morgan` with **`pino`** + **`pino-http`**:

- **Levels:** `fatal`/`error`/`warn`/`info`/`debug`/`trace`, controlled by `LOG_LEVEL` (default `info` in production, `debug` in development).
- **Request ID / correlation ID:** `middleware/requestId.js` generates a `requestId` per hop (as today) and additionally honors an inbound `X-Correlation-Id` header, generating one if absent — `correlationId` is the end-to-end trace value (useful once the mobile app or a future IoT gateway starts propagating it across calls), `requestId` stays per-hop. Both attach to every log line via `pino-http`'s child-logger binding, automatically, with no per-call-site boilerplate.
- **Error context:** the log line always includes `err.stack` **regardless of `NODE_ENV`** — fixing B7. The HTTP response continues to hide stack traces from the client in production (unchanged, already correct) — the fix is specifically "don't also hide it from the log," since the log is an internal artifact.
- **Sensitive-data redaction:** `pino`'s built-in `redact` option, configured centrally in `observability/logger.js`, masks `req.headers.authorization`, `*.password`, `*.token`, `*.refreshToken`, `*.deviceSecret` wherever those keys appear in anything passed to the logger — defined once, applies everywhere, not left to each call site to remember.

---

## 6. Security architecture

**Users — authentication:**
- Passwords hashed with `bcrypt` (cost factor 12), never stored or logged in any form.
- **Access tokens:** short-lived JWT (15 min), stateless, signed with `JWT_ACCESS_SECRET`. Deliberate trade-off stated plainly: a stateless access token cannot be revoked before it expires, which is exactly why it's kept short — this bounds the blast radius of a stolen token to 15 minutes rather than eliminating revocability, which would require a much heavier stateful-check-on-every-request design not justified at this stage.
- **Refresh tokens:** long-lived (30 days), opaque random value, stored **hashed** in a `RefreshToken` collection (never the raw value) alongside `userId`, device/user-agent metadata, and a `familyId`. Every refresh call **rotates** the token (issues a new one, invalidates the old) — a standard, well-understood defense. If an already-rotated (i.e., already-used) refresh token is ever presented again, that's a signal of token theft; the entire token *family* (every token descended from that original login) is revoked immediately, forcing re-login.
- **Logout:** revokes the presented refresh token's record. **Logout-everywhere:** revokes every `RefreshToken` record for that `userId`.

**Authorization — RBAC + ownership:**
- Roles: `farmer`, `agronomist`, `technician`, `admin`, `super_admin`. **Devices are not a "role"** — they are a completely separate principal type authenticated through `authenticateDevice()`, never issued a user JWT, never subject to RBAC role checks (they go through `deviceAuth.js` instead).
- `authorizeRole(...roles)` middleware checks the role claim on `req.user`. This alone is **not sufficient** for farm/device/telemetry-scoped resources.
- `authorizeOwnership()` middleware (and, as defense-in-depth, the repository query itself) enforces the ownership boundary you specifically called out: **a farmer must never access another farmer's farm/device/telemetry by changing an ID in the URL.** Concretely: every farm-scoped resource carries a `farmId`; the authenticated principal's accessible farm IDs (owned directly, or granted via a future `FarmMembership` collection for agronomists/technicians) are computed once per request and threaded into **every repository call for that resource as a mandatory filter** — not just checked once in middleware and then trusted. This means even a missed or buggy middleware check still can't leak cross-tenant data, because the underlying MongoDB query itself is scoped to the caller's accessible farm IDs; an ID for a farm you don't have access to simply doesn't match the query and returns 404 (not 403 — deliberately: revealing "that ID exists but isn't yours" via a 403 is itself a minor information leak about ID existence; a 404 for "not found or not yours" is the safer default for farm-scoped resources).

---

## 7. Device security architecture

Devices are **never** users. Distinct model, distinct auth path.

- **Registration/provisioning:** a technician or admin (human, RBAC-gated) provisions a device via `POST /api/v1/devices`, generating a `deviceId` (server-assigned) and a high-entropy `deviceSecret` (random, returned **exactly once** in the provisioning response, never retrievable again — only its hash is stored, using the same `bcrypt` primitive as passwords).
- **Device authentication (Stage 3 pragmatic choice):** the device sends its `deviceSecret` as a bearer-style header (`X-Device-Key`) over TLS on every ingestion/status request. TLS-in-transit is the actual protection for the secret here — this is a deliberate, stated scope decision, not an oversight: HMAC request-signing (where the secret itself is never transmitted, only a per-request signature derived from it) is the stronger design and is documented here as the **explicit future hardening step** once the device fleet is large enough that key-rotation logistics and firmware-extraction risk justify the added complexity on both backend and firmware. Building HMAC signing today, for a zero-device fleet, would be exactly the kind of unjustified complexity your brief asks me to avoid.
- **Credential rotation:** a single active secret per device (no keyring) — an admin/technician action generates a new secret and immediately invalidates the old one. Simple and adequate at this scale; a multi-active-secret keyring (for zero-downtime rotation across a live fleet) is a later concern, flagged not built.
- **Revocation:** `device.status` enum — `provisioned → active → suspended / revoked`. Suspended or revoked devices fail `authenticateDevice()` immediately regardless of a technically-valid secret. Every status change writes an `AuditLog` entry (who, when, why).
- **Device ownership:** every device belongs to exactly one `farmId`; the same ownership-scoping pattern from §6 applies — a farmer/agronomist/technician can only see/command devices on farms they have access to.
- **Compromised device handling:** an admin/technician can suspend a device instantly (blocks all ingestion and all commands), rotate its secret, and any commands currently pending for that device are force-expired — a suspected-compromised device is never left able to silently keep operating on its old credential.

---

## 8. IoT telemetry architecture

```text
ESP32
  ↓  (HTTPS today; MQTT later, same downstream code)
Transport (telemetry.routes.js today; a future mqtt subscriber calls the same gateway)
  ↓
infrastructure/mqtt/ingestionGateway.js   — single entry point, transport-agnostic
  ↓
authenticateDevice()                       — verify device credential, resolve deviceId
  ↓
validate() (telemetry.validators.js)       — strict zod schema, reject unknown fields, enforce sensor value ranges/enums
  ↓
telemetry.service — idempotency check      — (deviceId, messageId) already seen? short-circuit success, no double-write
  ↓
telemetry.service — normalization          — unit conversion, attach receivedAt (server time, authoritative)
  ↓
telemetry.service — processing             — device.lastSeen update, device-health fields, (later) trigger irrigation-relevant checks
  ↓
telemetry.repository → Time Series collection
  ↓
(async, batched) analytics/rollup aggregation → daily/hourly rollup collection → AI/mobile app reads
```

**MQTT decision:** not introduced now — HTTP ingestion is sufficient and simpler for the current (zero-to-low) device count, and it's what the existing rate-limiting/auth middleware chain already targets. It is deliberately built **behind the `ingestionGateway` abstraction** from day one specifically so that adding an MQTT broker later (Stage C, §14) means writing one new adapter file that calls `ingestionGateway.ingest(...)`, not touching `telemetry.service.js`, `commands.service.js`, or any validation/auth logic.

---

## 9. Offline / unreliable connectivity design

- **Server timestamp (`receivedAt`)** — always server-authoritative, set the moment a message is accepted; used for retention/TTL and as the default sort/query field.
- **Device timestamp (`deviceReportedAt`)** — stored as-received for reference and drift analysis, **never trusted alone** for ordering, security decisions, or retention.
- **Message ID (`messageId`)** — device-generated UUID per reading; combined with `deviceId` as the idempotency key.
- **Idempotency handling** — a compound **unique** index on `(deviceId, messageId)` is the database-level guarantee; the service layer attempts an insert and treats a duplicate-key error as a successful no-op (returns success, doesn't create a second document, doesn't surface an error to the device) — the correct idempotent-API pattern, not an application-level "check then insert" race.
- **Sequence number** — an optional per-device monotonically increasing integer, stored for future gap-detection alerting ("device X skipped readings 104–110"); not required for correctness (idempotency already prevents corruption), purely a health/observability signal.
- **Out-of-order messages** — naturally handled since `receivedAt` (server truth, used for primary ordering) reflects arrival order; `deviceReportedAt` is available for drift-aware analytics with a documented caveat, never assumed accurate.
- **Reconnect storms** — after an outage, many devices flush queued readings simultaneously; `deviceIngestLimiter`'s ceiling needs to tolerate a legitimate catch-up burst, not just steady-state load — starting values are a tuning parameter to validate against real device behavior once a fleet exists, not a number to treat as final today.
- **Clock drift** — device-claimed timestamps are never used for security-sensitive decisions (auth window comparisons use server receipt time); a device timestamp that deviates from server receipt time beyond a configurable threshold is flagged/logged as a device-health signal rather than silently trusted or silently corrected.
- **Power failure / prolonged offline** — `device.lastSeen` plus a configurable `offlineThresholdSeconds` derive an `isOnline` status exposed to the mobile app; this status directly gates irrigation automation decisions (§10) — a device that hasn't reported in past the threshold is never assumed to still be executing correctly.

---

## 10. Telemetry database strategy

**Devices, Sensors, Farms, Fields, Crops, Users, Valves, Pumps, DeviceCommands, IrrigationEvents:** standard MongoDB collections via Mongoose schemas — these are entity/state documents with in-place updates (a command transitions through 8 states; a valve's confirmed state changes), which is exactly what Time Series Collections are *not* designed for (they're built for immutable, append-only inserts). This is worth stating explicitly because "commands" and "irrigation events" look time-stamped/event-shaped and are a common place people reach for Time Series incorrectly — they stay regular collections here on purpose.

**Telemetry: Time Series Collection**, justified rather than asserted:

- **Expected write volume:** even a modest deployment (hundreds of devices reporting every 30–60s) is thousands of inserts per minute; your own long-term vision (millions of devices) makes this unambiguously a high-cardinality, high-frequency, append-only, rarely-if-ever-updated time-stamped workload — the canonical case Time Series Collections exist for.
- **Query patterns:** "readings for device X over the last 24h," "average field moisture over 7 days" — time-bucketed range scans and aggregation, which MongoDB's time-series storage engine optimizes internally (automatic bucketing, materially better compression than an equivalent regular collection for this exact data shape).
- **Indexes:** MongoDB auto-manages an index on the declared `timeField`; a compound secondary index on `(deviceId [metaField], recordedAt)` covers the dominant per-device query — noting explicitly that time-series index flexibility is more constrained than a regular collection and version-dependent, to be verified against the actual Atlas tier before relying on anything exotic.
- **Retention:** native `expireAfterSeconds` on the collection handles raw-data TTL with zero custom cron code; the specific retention duration is a product/business decision to confirm with you, not invented here.
- **Aggregation/historical analytics:** MongoDB's aggregation framework runs against time-series collections (with some pipeline-stage limitations that improve each server version) — sufficient for the trend/AI-feature-extraction needs described at this stage; a dedicated analytics warehouse is explicitly out of scope until aggregation pipelines genuinely stop being enough (Stage D/E territory, §14).

---

## 11. API architecture

`/api/v1/...` prefix for every business route; `/health/live` and `/health/ready` stay unversioned (infrastructure endpoints, not business API surface). Response envelope, consistent everywhere: `{ success: boolean, data?: ..., error?: { code, message, statusCode, requestId, details? }, meta?: { page, pagination... } }`. Error `code` values are a fixed, documented enum (`VALIDATION_ERROR`, `AUTH_INVALID_CREDENTIALS`, `AUTH_TOKEN_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `DEVICE_UNAUTHORIZED`, `CONFLICT_DUPLICATE`, `INTERNAL_ERROR`, …) so clients (mobile app, firmware) can branch on `error.code`, never on parsing `error.message` text. Pagination: cursor-based for telemetry/high-volume listing endpoints (offset pagination degrades badly on large, constantly-growing collections); simple page/limit offset pagination for small admin-style lists (users, farms). Every response, success or error, carries the `X-Request-Id` header and echoes `requestId` in the error body for support/debugging correlation.

**Per-module summary** (routes/controller/service/repository/model/validators all follow the pattern in §3; authorization requirement is the notable per-module detail):

| Module | Key authorization requirement |
|---|---|
| `auth` | Public (register/login); refresh/logout require a valid refresh token |
| `users` | Self-service for own profile; `admin`/`super_admin` for managing other users |
| `farms` | Owner or granted membership; `authorizeOwnership` on every farm-scoped route |
| `fields`, `crops` | Scoped through their parent farm's ownership |
| `devices` | Provisioning: `technician`/`admin`+; read/status: farm ownership |
| `sensors` | Scoped through parent device's farm ownership |
| `telemetry` | Ingestion: `authenticateDevice` (not user auth); read: farm ownership |
| `commands` | Issue: farm ownership + `commandLimiter`; read status: farm ownership |
| `irrigation` | Farm ownership; emergency-stop always allowed regardless of other throttles |
| `notifications` | Self-service, recipient-scoped only |
| `auditLog` | `admin`/`super_admin` read-only; no public write route (services write to it internally) |

---

## 12. Observability strategy

Structured JSON logs via `pino`, with `requestId`/`correlationId` on every line (§5G). `/health/live` (process up) vs `/health/ready` (process up **and** MongoDB reachable — unchanged distinction from Stage 1, extended later to include any newly-added hard dependency, e.g., an MQTT broker connection once one exists) stays the liveness/readiness split your brief asks for. Latency: `pino-http` records response time per request automatically; a lightweight `observability/metrics.js` module tracks the counters you listed (`telemetry_messages_received`, `telemetry_messages_rejected`, `telemetry_duplicates`, `device_online_count`, `device_offline_count`, `command_success_rate`, `command_failure_rate`, `irrigation_events`, `api_latency`, `database_latency`) as **in-memory counters, logged periodically as structured events** — deliberately not wired to Prometheus yet (`prom-client` is listed OPTIONAL LATER in §16, added only once there's an actual Prometheus/Grafana stack to scrape it; until then, the metric *names* and *values* already exist and are visible in logs, so nothing about adding a scrape endpoint later requires redesigning how metrics are counted).

---

## 13. Scalability strategy

| Stage | Device count | What changes |
|---|---|---|
| **A — Prototype** | <10 | Current design as planned here: single instance, no Redis, no MQTT, Atlas free/shared tier. |
| **B — Hundreds** | ~100s | 2 instances behind a load balancer (availability, not throughput yet); Atlas M10+ dedicated tier; Time Series + index strategy already paying off. |
| **C — Thousands** | ~1,000s | Introduce a managed MQTT broker (adapter behind `ingestionGateway`, per §8) for persistent low-power device connections; horizontal scale to N instances; **Redis becomes justified** — distributed rate-limit store (§15) and a real job queue for command-timeout sweeping, since an in-process `setInterval` sweep run independently by N instances would double/triple-process the same expiring commands. |
| **D — Hundreds of thousands** | ~10^5 | The `telemetry` module — already isolated per §2's module-boundary design — is the first candidate to extract into its own horizontally-scaled ingestion service; a message broker/queue between ingestion and MongoDB writes smooths write bursts. This is the point where a microservice becomes justified by measured load, not speculation. |
| **E — Millions** | ~10^6+ | MongoDB sharding strategy, cold-telemetry export to a data warehouse/lake for AI training, multi-region — explicitly out of scope to design in detail now; noted only so today's module boundaries don't foreclose it. |

The initial implementation targets Stage A/B only. Nothing in §14/§15 below is built until its stage's trigger condition is actually met.

---

## 14. Caching / Queues / Redis — NOW / LATER / NOT NEEDED

| Technology | Verdict | Why |
|---|---|---|
| **Redis** | LATER (Stage C) | Not needed while there's one app instance (in-memory rate-limit counters are already consistent). Becomes justified the moment there are 2+ instances, for distributed rate limiting and as BullMQ's backing store. |
| **BullMQ** | LATER (Stage C) | Needed once (a) volume makes in-process timers insufficient, or (b) multiple instances make "exactly one instance should run this sweep" a real requirement (command-timeout expiry, notification delivery) — an in-process `setInterval` breaks correctness the moment there are 2+ instances each independently sweeping. |
| **MQTT broker** | LATER (Stage C) | HTTP ingestion is sufficient for the current and near-term device count; MQTT's persistent-connection efficiency matters once battery/bandwidth at real field scale makes HTTP's per-request overhead costly. Built behind an abstraction now (§8) so this is additive later. |
| **General message queue (Kafka-class)** | NOT NEEDED at any stage described here | Stage D/E territory at earliest, explicitly out of scope for this plan. |

---

## 15. Testing architecture

- **Unit** — services and pure utils (RBAC ownership logic, idempotency-key derivation, irrigation safety-limit calculations), with repositories mocked; `jest`.
- **Integration** — repository layer against a **real MongoDB**, but an ephemeral in-memory one via **`mongodb-memory-server`** (downloads and runs an actual `mongod` binary per test run, no Atlas credentials, no shared/stateful test data, no network dependency in CI) — this is the direct answer to "testable without requiring a production Atlas database."
- **API** — `supertest` against the Express app object returned by `createApp()` (never booting the real network layer in `server.js`), exercising real routes end-to-end against the same in-memory MongoDB.
- **Security** — expired/missing/malformed JWTs, wrong-role access attempts, and — critically — an explicit **IDOR test**: farmer A authenticated, requesting farmer B's `farmId`/`deviceId`, asserting 404 (never data, never a 403 that confirms existence — per §6).
- **IoT** — duplicate telemetry (same `(deviceId, messageId)` twice → one document, second call still returns success), invalid telemetry (out-of-range sensor value → 4xx, never stored), device reconnect (a gap in `lastSeen` followed by a new reading updates state correctly), heartbeat/offline-threshold transition, and the full command lifecycle (issue → simulate ACK → simulate execution result → COMPLETED, and a separate test simulating a timeout using Jest fake timers → EXPIRED).
- **Failure tests** — MongoDB unreachable at boot (app still starts, `/health/ready` is 503, no crash — asserts the §5A fix); a mocked DB timeout mid-request surfaces as a clean 5xx through `errorHandler`, never a hang; a missing required env var causes a fast, specific, non-zero exit (asserts the §5F fix, the one legitimate fail-fast case); graceful shutdown mid-request lets it finish (asserts the existing SIGTERM handling still works after the A1 simplification removes its interaction with the old reconnect timers).
- **CI:** `npm test` runs the full suite against `mongodb-memory-server` — zero real MongoDB or Atlas dependency anywhere in the pipeline.

---

## 16. Deployment architecture

```text
Internet
  ↓
Reverse proxy / load balancer  (a managed cloud LB, or Nginx — not assumed to be Kubernetes)
  ↓
N stateless AgriSmart containers (no cluster.fork() — one Node process per container, per §5C)
  ↓
MongoDB Atlas
```//
and later, additively:
```text
ESP32 → MQTT broker → ingestionGateway adapter → (same app instances above)
```

- **Environment separation:** development / staging / production as fully separate Atlas projects/clusters and fully separate secret sets — never shared credentials across environments.
- **Secrets:** injected as environment variables by the deployment platform's own secret manager; never committed, never baked into a Docker image layer, validated eagerly at boot per §5F.
- **Health checks:** the orchestrator/LB uses `/health/live` for restart decisions and `/health/ready` for traffic-admission decisions — already-correct distinction, unchanged.
- **Graceful shutdown:** unchanged pattern (stop accepting new connections → drain in-flight → close DB → exit), simplified by §5A removing the old reconnect-timer interaction.
- **Horizontal scaling:** add/remove container instances behind the LB; each instance's Mongo pool sized deliberately (`maxPoolSize` chosen from expected concurrent operations ÷ instance count, tuned empirically — not guessed).
- **Zero-downtime deploy:** rolling deployment — start a new instance, wait for its `/health/ready` to pass, register it with the LB, then drain and terminate an old instance. This is a standard pattern supported by a simple VM+PM2+Nginx setup, a managed container platform (Render/Railway/Fargate/App Runner), or Kubernetes if you're already there — **Kubernetes is not assumed or required** at this stage, consistent with your instruction not to reach for it prematurely.

---

## 17. File-by-file migration plan

| Current file | Action | Target | Reason |
|---|---|---|---|
| `server.js` | Modify + Move | `src/server.js` | Remove `cluster` module entirely (§5C); keep lifecycle/shutdown logic, simplified since §5A removes reconnect-timer interaction |
| `app.js` | Modify + Move | `src/app.js` | Fix CORS callback (§5B); mount `routes/index.js`; extend Morgan→pino-http skip list to both health routes |
| `config/db.js` | Modify + Move | `src/infrastructure/database/mongoose.js` | Remove custom reconnect loop (§5A); keep tuned connection options |
| `middlewares/errorHandler.js` | Modify + Move | `src/middleware/errorHandler.js` | Add `code` field to `ApiError`/response envelope (§11); keep stack in log unconditionally (§5G) |
| `middlewares/rateLimiter.js` | Modify + Move | `src/middleware/rateLimiter.js` | IPv6-safe `normalizeIp`, `createLimiter` factory, add `commandLimiter`, actually mount `authLimiter`/`deviceIngestLimiter` where relevant (§5D) |
| `routes/health.routes.js` | Modify + Move | `src/modules/health/health.routes.js` | No functional change beyond relocation; readiness check extended if/when a new hard dependency is added |
| `utils/logger.js` | Delete | — (replaced by) `src/observability/logger.js` | Hand-rolled console logger replaced by `pino` (§5G, §7 of Stage 1 audit) |
| `utils/requestId.js` | Modify + Move | `src/middleware/requestId.js` | Add correlation-ID support (§5G) |
| `package.json` | Modify | (stays at repo root) | Dependency changes per §19 below |
| `.env.example` | Modify | (stays at repo root) | New required vars: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `LOG_LEVEL`, `DB_STARTUP_FAIL_FAST`, plus module-specific vars as they land |
| `.gitignore` | Keep | (repo root) | No change needed |
| `package-lock.json` | Keep | (repo root) | Regenerates automatically on dependency changes |
| `AUDIT_STAGE1.md` | Keep | (repo root) | Historical record |
| — | Create | `src/config/env.js`, `src/config/index.js` | §5F |
| — | Create | `src/security/{password,jwt,deviceAuth,rbac}.js` | §6, §7 |
| — | Create | `src/middleware/{authenticate,authorizeRole,authorizeOwnership,authenticateDevice,validate}.js` | §6, §7, §11 |
| — | Create | `src/observability/{logger,httpLogger,metrics}.js` | §5G, §12 |
| — | Create | `src/infrastructure/database/indexes/ensureIndexes.js` | §5E |
| — | Create | `src/infrastructure/mqtt/ingestionGateway.js` | §8 |
| — | Create | `src/routes/index.js` | Mounts all module routers |
| — | Create | `src/modules/{health,auth,users,farms,fields,crops,devices,sensors,telemetry,commands,irrigation,notifications,auditLog}/**` | §3, §11 — not implemented until each phase in §18 is reached |
| — | Create | `tests/setup/testDb.js`, `tests/{unit,integration,api,security,iot}/**` | §15 |
| — | Create | `scripts/seedDev.js` | Local dev convenience, optional |
| — | Create | `.eslintrc.cjs`, `.prettierrc`, `jest.config.js` | §19 |
| — | Create | `README.md` | §21 of your brief; not written in Phase 1 |

---

## 18. Dependency plan

**KEEP** (all still earn their place, unchanged from Stage 1's audit): `express`, `mongoose`, `helmet`, `cors`, `compression`, `dotenv`, `express-rate-limit`.

**REMOVE:** `morgan` — superseded by `pino-http`, which integrates directly with the new structured logger and removes the need for two separate HTTP-logging mechanisms.

**ADD (Stage 3, each justified individually):**
- `pino`, `pino-http` — structured logging with levels and built-in redaction (§5G); `pino-pretty` as a **devDependency only**, for human-readable local dev output.
- `zod` — one validation library serving two jobs: environment-variable validation (§5F) and HTTP/telemetry request-schema validation (§11) — deliberately not two separate libraries for two similar jobs.
- `jsonwebtoken` — access/refresh token signing and verification (§6).
- `bcrypt` — password and device-secret hashing (§6, §7). (If native-module compilation becomes a deployment friction point on a given host, `bcryptjs` is a documented drop-in pure-JS fallback — noted, not added speculatively.)
- `jest`, `supertest`, `mongodb-memory-server` — **devDependencies**, the entire testing foundation from §15.
- `eslint`, `prettier`, `eslint-config-prettier` — **devDependencies**, replacing the current no-op `lint` script with a real one.

**OPTIONAL LATER** (explicitly not added now — each has a stated trigger condition from §13/§14): `mqtt` (client library, once a broker is introduced at Stage C), `ioredis` (once Redis is justified at Stage C), `bullmq` (same trigger), `rate-limit-redis` (store adapter, same trigger), `prom-client` (once an actual Prometheus/Grafana stack exists to scrape it), `migrate-mongo` (only if a genuinely breaking schema/index migration is ever needed beyond additive `syncIndexes()`).

---

## 19. Implementation order

Adjusted from your suggested skeleton in one respect, explained inline: I moved a minimal **testing harness** setup earlier (phase 5) rather than treating "testing" as one late phase — the harness (Jest config + `mongodb-memory-server` bootstrap + one smoke test) needs to exist before domain phases start, so phases 8–12 are built test-first against a working harness instead of having tests bolted on afterward. The bulk of actual test-writing still happens *within* each domain phase, not deferred to the end; phase 13 is a final hardening/coverage pass, not "when testing starts."

1. **Configuration** (§5F) — everything else depends on validated config existing first.
2. **Error architecture** (`ApiError` with `code`, corrected `errorHandler`) — needed before any new route so every subsequent phase handles errors consistently from the start, not retrofitted.
3. **Database lifecycle** (§5A) — corrected single-connect Mongoose setup, needed before any model/repository work.
4. **Observability** (§5G, §12) — logger, request/correlation ID, extended health checks — built early so every later phase already logs correctly instead of retrofitting logging into finished code.
5. **Testing harness** — Jest + `mongodb-memory-server` + one smoke test proving phases 1–4 work together; proves the foundation before building on it.
6. **Security foundations** (§6, §7) — password hashing, JWT sign/verify, RBAC table, device-auth primitives — built before any route needs them.
7. **Validation foundation** (§11, `zod` schemas + generic `validate()` middleware) — built before routes so every route from here on is validated by construction.
8. **Core domain models + repositories** — `User`, `Farm`, `Field`, `Crop` — establishes the repository pattern other modules follow.
9. **Auth + Users module** (with tests) — first real feature, exercises phases 1–8 end-to-end.
10. **Device identity module** (with tests) — depends on security foundations + RBAC (who's allowed to provision a device).
11. **Telemetry ingestion** (with tests) — depends on device identity existing, since telemetry must be attributed to an authenticated device.
12. **Device commands + Irrigation safety** (with tests) — depends on telemetry existing (safety decisions may reference recent readings) and device identity.
13. **Final hardening pass** — full security review of everything built in 1–12, rate-limit tuning sanity check, complete test-suite run, lint, `npm audit`, documentation pass.

---

## 20. Definition of Done (Stage 3 acceptance criteria)

Each item below is independently verifiable, not aspirational:

- `npm install` succeeds; `npm audit` reports 0 high/critical vulnerabilities.
- `npm run lint` performs real linting (not the current no-op) and passes.
- `npm test` passes — unit, integration, API, security, and IoT suites — entirely against `mongodb-memory-server`, with zero Atlas/network dependency in CI.
- The app boots successfully with a valid `.env`; a missing/invalid **required** env var causes an immediate, specific, non-zero exit before the port binds or MongoDB connect is attempted (§5F).
- MongoDB unreachable at boot: the app still starts, `/health/live` returns 200, `/health/ready` returns 503, no crash, no crash-loop — and code review confirms exactly one `mongoose.connect()` call site exists (no duplicate reconnect timers, §5A).
- A disallowed CORS origin: the browser blocks the response client-side (no `Access-Control-Allow-Origin` header returned); the event is logged at `warn`, not `error`, and never reaches `errorHandler` as a 500 (§5B).
- Graceful shutdown: an in-flight request started before `SIGTERM` completes before the process exits; the process always exits within the configured shutdown timeout.
- No secrets appear in any log line — verified by a dedicated redaction unit test that logs a payload containing `password`/`token`/`deviceSecret` fields and asserts each is masked (§5G).
- Malformed or out-of-range telemetry is rejected with a 4xx and a specific `VALIDATION_ERROR` code — never silently coerced, clamped, or stored (§11).
- Duplicate telemetry (same `deviceId` + `messageId`) is idempotent — an integration test asserts the document count stays at 1 after two identical submissions (§9).
- An authenticated farmer requesting another farmer's farm/device/telemetry by ID receives 404, never the data — a specific automated IDOR test (§6, §15).
- A request with a missing, invalid, or revoked device credential is rejected by `authenticateDevice()` before any service logic runs.
- `scripts/ensureIndexes.js` run against a fresh database creates every declared index; running it a second time is a no-op with no errors (§5E).
- An automated test confirms two distinct IPv6 addresses within the same `/64` share one rate-limit bucket, and two distinct devices behind the same shared IPv4 NAT do not throttle each other (§5D).

---

## 21. Risks and trade-offs (stated explicitly, not hidden)

- **Device auth via API key over TLS, not HMAC signing, for now** — a deliberate scope decision (§7) given zero live devices today; documented as the specific future hardening step rather than an oversight.
- **HTTP telemetry ingestion instead of MQTT, for now** — less battery/bandwidth-efficient than a persistent MQTT connection, acceptable while the device fleet is small; the `ingestionGateway` abstraction (§8) exists specifically so this trade-off is cheap to reverse later.
- **Time Series Collection feature/index limitations are MongoDB-version-dependent** — this plan assumes a reasonably current Atlas tier/version; that assumption needs verifying against whatever is actually provisioned before Stage 3 finalizes the telemetry schema.
- **In-process command-timeout sweeping works correctly on exactly one instance.** The moment horizontal scaling begins (Stage B/C, §13), this must move behind a single-owner mechanism (a DB-based lock, or BullMQ) — flagged now specifically so it isn't forgotten when a second instance is added, since N independent instances each sweeping the same expiring commands would double-process them.
- **Removing cluster mode trades theoretical single-box throughput for operational simplicity and connection-pool correctness at current traffic levels** — reversible later with real profiling data (§5C), not reversed on assumption.
- **`zod` is a new dependency** — justified by serving two purposes (env + request validation) rather than adding two separate libraries.
- **A specific telemetry retention window is not decided in this document** — it's a product/business call (§5E, §10) that needs your input before the TTL index is finalized in Stage 3.

---

**Awaiting your approval before Stage 3 — Implementation.**
