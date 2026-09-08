# AgriSmart Backend — Stage 1 Engineering Audit

Scope: the codebase currently on disk (`server.js`, `app.js`, `config/db.js`, `middlewares/errorHandler.js`, `middlewares/rateLimiter.js`, `routes/health.routes.js`, `utils/logger.js`, `utils/requestId.js`, `package.json`). No files were changed to produce this document. `npm install` and `npm audit` were actually run against the current `package.json`; results are quoted below rather than assumed.

Honesty note up front: this codebase is what I called "Phase 1" last round — an infrastructure baseline, not a feature backend. It has zero business logic, zero data models, zero authentication, and zero IoT ingestion yet. That is not a hidden defect (nothing claimed otherwise), but it means most of your 26-point brief (auth, device identity, telemetry idempotency, commands, data model, validation layer, API versioning, tests) is **not yet built** rather than "built badly." The audit below separates *things that are wrong* from *things that are simply not there yet*, because those need different responses in Stage 2.

---

## 1. Architecture assessment

Current shape is `server.js` (process/cluster/lifecycle) → `app.js` (Express wiring) → `middlewares/*` + `routes/health.routes.js` + `config/db.js` + `utils/*`. That's a reasonable skeleton for a layered monolith, but it's only the skeleton: there are no `controllers/`, `services/`, `repositories/`, `models/`, or `validation/` directories at all, because no feature was built yet. `app.js` mounts one router (`/health`) and one raw inline `GET /`. The separation-of-concerns boundary you're asking for (thin controllers → services → repositories → models) doesn't exist yet to grade — it needs to be *created* in Stage 2, not refactored.

## 2. Security assessment

No authentication, authorization, or secrets-handling code exists yet (by design — Phase 1 was infra only), so there's nothing to break in that dimension yet. What *does* exist (Helmet, CORS, rate limiting, body limits, error redaction) has real, fixable problems — see A2, B2, B3, B7 below. Net: the perimeter hardening is a reasonable start but has at least one bug that turns a security control into a noisy false-alarm generator (A2), and the rate-limit keying strategy silently loses IP-format validation the library would otherwise give you for free (B3).

## 3. Scalability assessment

The single biggest structural risk is **B1: clustering and MongoDB connection pooling were never reasoned about together.** Each cluster worker calls `connectDB()` independently with its own `maxPoolSize` (default 20). Enable clustering on an 8-core box and you get up to 160 concurrent connections from *one* app instance, before a single horizontal replica is added — and Atlas shared/free tiers cap total connections far below that (M0/M2/M5 tiers: 500 or fewer, shared across every app instance and every developer's laptop hitting the same cluster). This is exactly the failure mode your own brief calls out in section 6, and it's real: nothing today reduces per-worker pool size when clustering is on, and nothing caps total-fleet connections.

## 4. Reliability assessment

Graceful shutdown, uncaught-exception handling, and unhandled-rejection handling all exist and were tested (see the "what was tested" note from last round). The gap is **A1: the custom reconnect loop in `config/db.js` fights Mongoose's own topology monitoring** — this is the single most important reliability finding in this audit, explained in full below, and it's precisely the anti-pattern your brief warns against in section 7 ("do not create competing reconnection systems").

## 5. Database assessment

Mongoose is used correctly at the connection-options level (sane `socketTimeoutMS`, `serverSelectionTimeoutMS`, `retryWrites`/`retryReads`, `autoIndex` disabled in production). But: no models exist yet, so there is nothing to say yet about schema design, indexes, or Time Series Collections for telemetry — that's Stage 2/3 work, not an audit finding against existing code. One real gap: disabling `autoIndex` in production is correct practice, but there is currently no replacement mechanism (a migration/init script) to actually create indexes in production, so as written, production would run with *no indexes at all, ever* — see B4.

## 6. IoT readiness assessment

Zero IoT-specific code exists: no device model, no device auth scheme, no telemetry endpoint, no idempotency key, no heartbeat/lastSeen tracking, no command queue. This entire section of your brief (section 8) is greenfield work for Stage 2/3, not a defect in what's here.

## 7. Dependency assessment

```
npm audit  → 0 vulnerabilities (info/low/moderate/high/critical all 0)
npm ls --depth=0:
  compression@1.8.1
  cors@2.8.6
  dotenv@16.6.1
  express@4.22.2
  express-rate-limit@7.5.1
  helmet@7.2.0
  mongoose@8.24.4
  morgan@1.12.0
```

All eight are maintained, mainstream, and each earns its place — no dependency here is decorative. `express` 4.x (not 5) is a deliberate, defensible choice: 4.x is still the actively-supported LTS line and has the largest middleware ecosystem; nothing in this codebase needs Express 5's changes yet. No logging library (pino/winston) was added — `utils/logger.js` is ~70 lines of `console.log` wrapped in JSON — which was a deliberate "don't add a dependency for prestige" call, but it's now a real gap once you need log levels, redaction rules, or transport to a log aggregator; flagged as C1 below, not urgent enough to block Stage 2.

---

## A. Critical issues

### A1 — Custom Mongoose reconnect loop competes with the driver's own topology management
**What's wrong:** `config/db.js` listens for the `disconnected` event and manually calls `connectDB()` (which calls `mongoose.connect()` again) on an exponential-backoff timer. But the MongoDB Node driver already runs its own background topology monitor and automatically re-establishes connections to replica set members once the underlying `MongoClient` exists — you don't drive that by calling `.connect()` a second time. Calling `mongoose.connect()` again while a `MongoClient` already exists is not the sanctioned way to "retry a drop"; the officially supported behavior is to let `bufferCommands`/`serverSelectionTimeoutMS` absorb the gap and let the driver's own monitor recover the topology.
**Why it matters:** A second `connect()` call racing against the driver's own reconnection can produce duplicate connection attempts, extra pooled sockets that never get cleaned up (a slow socket/memory leak under a flaky rural network — which is the exact condition this backend is built for), and inconsistent `readyState` transitions that make `getConnectionHealth()` lie to the `/health/ready` endpoint during a flap.
**Risk level:** Critical — this is a correctness bug in the component every other reliability guarantee in the app depends on, and it gets *exercised most* precisely under the network conditions AgriSmart is designed for (rural 2G/3G drops), not in the happy path.
**Recommended solution:** Remove the custom `scheduleReconnect`/`connectDB()`-on-`disconnected` loop entirely. Call `mongoose.connect()` exactly once at startup with the tuned options already present (`serverSelectionTimeoutMS`, `socketTimeoutMS`, `heartbeatFrequencyMS`, `retryWrites`/`retryReads`), let the driver's topology monitor own recovery, and keep only passive event *logging* (`connected`/`disconnected`/`reconnected`/`error`) for observability. `/health/ready` should read `mongoose.connection.readyState` directly — no custom retry state machine needed.
**Fix now:** No — Stage 1 is audit-only per your instructions. Flagged for Stage 3.

### A2 — A rejected CORS origin is misreported as a 500 "Internal server error," not a 403
**What's wrong:** In `app.js`, the CORS `origin` callback does `return callback(new Error(...))` for a disallowed origin. `cors` forwards that error into Express's error pipeline via `next(err)`. My own `errorHandler.js` gives any error without an explicit `statusCode` a default of 500 and (in production) replaces the message with the generic `"Internal server error."` — so a policy rejection that should be a clean, cheap `403 Forbidden` instead surfaces as a 500.
**Why it matters:** Two concrete harms: (1) every blocked cross-origin request pollutes error-level logs and alerting as if the *server* failed, when actually the *client* violated policy — this will drown real 500s in noise once a frontend team starts iterating against the API from a new preview URL that isn't allow-listed yet; (2) the client gets a useless, misleading error message instead of "origin not permitted," making frontend debugging slower.
**Risk level:** Critical for operability once any real traffic exists — this will actively mislead whoever is on call.
**Recommended solution:** Don't throw from the CORS origin callback. Call `callback(null, false)` for a disallowed origin (the `cors` package's documented pattern), which makes the middleware itself respond without CORS headers (browser blocks it client-side) — or, if you want a deliberate explicit 403 from the server, check the origin in Express middleware *before* `cors()` and throw a proper `ApiError(403, ...)` yourself.
**Fix now:** No — flagged for Stage 3.

---

## B. High-priority issues

### B1 — Clustering was enabled without reasoning about MongoDB connection-pool multiplication (your section 6, directly)
**What's wrong:** `ENABLE_CLUSTERING=true` forks one worker per CPU core; each worker independently calls `connectDB()` with the same `maxPoolSize` (default 20, from env `MONGO_MAX_POOL_SIZE`). Total connections to Atlas from one app instance = `numCPUs × maxPoolSize`, and that number is invisible anywhere in config — nothing scales pool size down as worker count goes up.
**Why it matters:** On an 8-core host that's up to 160 connections from a single container before any horizontal replicas exist. Atlas shared/free tiers (M0/M2/M5) allow roughly 500 or fewer total connections *cluster-wide*, shared across every environment pointed at that cluster (dev laptops included). Two clustered instances alone can exhaust it, causing intermittent, hard-to-diagnose `MongoServerSelectionError`s that look like network flakiness but are actually connection-limit exhaustion. There is also memory overhead (each worker is a full V8 heap + its own Express app + its own connection pool) and it complicates container orchestration: Kubernetes/ECS already give you horizontal scaling and per-container crash-restart, so process-level clustering *inside* a container duplicates what the orchestrator does, and makes CPU/memory requests-and-limits harder to reason about (you're now sizing for N workers per container, not 1).
**Risk level:** High — currently defaults to *off* (`ENABLE_CLUSTERING` is falsy unless explicitly set), so it is not live-critical today, but it is a loaded footgun for whoever flips it on later without reading this.
**Recommended solution:** Default posture for AgriSmart's actual stage (single modular monolith, not yet at the scale where per-core throughput is the bottleneck): **remove Node cluster mode from `server.js` entirely** and scale horizontally via multiple container/process instances behind a load balancer instead — that's what your own brief asks for in section 6's closing line, and it means one connection pool per real deployed instance, sized deliberately, with the orchestrator (not hand-rolled `cluster.fork()`) owning restart-on-crash and instance count. If a future profiling exercise shows single-instance CPU-bound throughput is actually the bottleneck (unlikely before there's real device-fleet traffic), reintroduce clustering *then*, with pool size divided by worker count.
**Fix now:** No — Stage 3.

### B2 — Custom `rateLimiter` keyGenerator silently discards the library's built-in IP validation and doesn't normalize IPv6
**What's wrong:** `express-rate-limit`'s default key generator validates `request.ip` and throws a clear `ERR_ERL_INVALID_IP_ADDRESS` if it's malformed (I confirmed this string exists in the installed `express-rate-limit@7.5.1` source). Supplying a **custom** `keyGenerator` (as `middlewares/rateLimiter.js` does, to key on `ip:deviceId`) bypasses that validation path entirely — I checked the installed package source and the validation only runs inside the library's own default generator, never against a user-supplied one. Additionally, the custom generator uses `req.ip` as a raw string; a single device on an IPv6-assigned network (increasingly common on Egyptian mobile carriers) can present a different address from its own delegated `/64` on almost every request, defeating the limiter without even trying, because each address is a distinct exact-match key.
**Why it matters:** This is precisely the "account for IPv4 and IPv6 correctly" requirement from your brief (section 14) failing silently — the rate limiter *looks* configured correctly (three tiers, sensible windows) but is not actually enforcing what it claims to under IPv6, and would accept malformed/spoofed IP-like header values that the library would otherwise have rejected with a clear error.
**Risk level:** High — a security control that appears present but has a bypass is worse than an absent one, because it creates false confidence.
**Recommended solution:** Normalize IPv6 addresses to their `/64` prefix before using them as a rate-limit key (the standard approach — punishing an individual /128 address doesn't stop an attacker who owns the whole delegated range), keep IPv4 exact-match, and add an explicit unit test asserting IPv6 addresses in the same subnet share a bucket. Keep the device-id compounding (`ip:deviceId`) for the NAT-sharing case, which is still the right idea.
**Fix now:** No — Stage 3.

### B3 — `autoIndex: false` in production with no replacement index-creation mechanism
**What's wrong:** Disabling `autoIndex` in production is correct (it avoids Mongoose silently building indexes under load on a live collection). But nothing else creates indexes in production — there is no migration script, no `syncIndexes()` call in a controlled startup/deploy step, nothing.
**Why it matters:** As written, a production deployment would run with **zero indexes**, forever, since the safety mechanism that was disabled was never replaced with the deliberate mechanism it presupposes. For a telemetry-heavy IoT backend this is severe — every device/telemetry query becomes a full collection scan the moment real data volume shows up.
**Risk level:** High — silent until data volume grows, then catastrophic (query timeouts, `serverSelectionTimeoutMS` failures that look like network problems again).
**Recommended solution:** Add an explicit, reviewable index-creation step (e.g. a `scripts/ensure-indexes.js` run in CI/CD before or during deploy, or a guarded `mongoose.syncIndexes()` call behind a `RUN_INDEX_SYNC=true` flag executed once per deploy, never on every process boot in a clustered/multi-instance fleet).
**Fix now:** No — there are no models/indexes yet to sync; this becomes actionable once Stage 2 introduces schemas.

### B4 — No environment-variable validation at startup; missing config fails silently, not loudly
**What's wrong:** Only `MONGODB_URI` is checked, and only lazily inside `connectDB()` (so a missing `.env` fails after the process has already started listening, not before). `CORS_ALLOWED_ORIGINS` unset silently becomes `[]` (blocks *all* browser cross-origin traffic with no startup warning). There's no central config module and no eager validation of `PORT`, `NODE_ENV`, or any of the future required secrets (`JWT_SECRET`, etc.).
**Why it matters:** "Fails silently" is the worst failure mode for a small team supporting a system across unreliable environments — a misconfigured `.env` in staging looks like a mysterious frontend bug ("CORS is broken??") instead of a clear boot-time error pointing at the actual cause.
**Risk level:** High — directly causes wasted debugging time and, for a missing `JWT_SECRET` once auth exists, a potential security footgun (a library might silently fall back to `undefined` as a signing secret if this isn't guarded).
**Recommended solution:** A single `config/env.js` that reads and validates every required environment variable exactly once at startup (a plain hand-written checklist is enough at this scale — no need for a schema-validation dependency yet), throws a clear, specific error and refuses to boot if anything required is missing, and is the *only* place in the codebase that reads `process.env` directly.
**Fix now:** No — Stage 3.

### B5 — Two of the three rate limiters (`authLimiter`, `deviceIngestLimiter`) are defined but never mounted
**What's wrong:** `middlewares/rateLimiter.js` exports three limiters. `app.js` imports and applies only `apiLimiter` (mounted on `/api`). `authLimiter` and `deviceIngestLimiter` exist in source but are dead code today — there are no auth or device-ingest routes yet for them to guard, but they should be flagged clearly as "written, not wired" rather than left to look finished.
**Why it matters:** Not a live bug (nothing calls the unmounted limiters, so nothing is unprotected that was supposed to be protected), but it's exactly the kind of "looks done, isn't" gap that causes a real incident later if someone adds an auth route and assumes `authLimiter` is already protecting it because the file exists.
**Risk level:** High-priority to *track*, not high-severity today — reclassify as it becomes load-bearing.
**Recommended solution:** Either mount them against a placeholder route now with a comment explaining they're pre-wired for Stage 2, or (cleaner) leave unmounted but add a Stage 2 acceptance checklist item: "every new `/api/v1/auth/*` route must use `authLimiter`; every new device-ingest route must use `deviceIngestLimiter`."
**Fix now:** No.

### B6 — In-memory rate-limit store has no seam for a future distributed store
**What's wrong:** All three limiters are constructed directly as `rateLimit({ ...options })` using the library's default in-memory `MemoryStore`. There's no abstraction layer between "a limiter" and "where its counters live."
**Why it matters:** Your own brief (section 14) explicitly asks for this seam even while agreeing Redis isn't needed *yet* — and it's right to ask, because in-memory counters are per-process: under horizontal scaling (multiple instances) or a future clustering decision, the *effective* limit multiplies by instance count and becomes inconsistent (a client rate-limited by instance A can freely retry against instance B). This is fine at "one instance, no scale" but becomes silently wrong the moment a second instance is deployed for availability.
**Risk level:** High readiness risk, not an active bug today (single-instance deployments are consistent).
**Recommended solution:** Introduce a thin `createLimiter(options)` factory in `middlewares/rateLimiter.js` that centralizes store selection (`MemoryStore` today, swappable for `rate-limit-redis` later via one env-gated branch), so call sites never change when the store does.
**Fix now:** No — Stage 3, low effort, worth doing early since it costs almost nothing now and a lot more once three limiters have three copies of the same logic.

### B7 — Production error logs strip the stack trace, exactly when it's needed most
**What's wrong:** `middlewares/errorHandler.js`'s `buildLogEntry()` sets `stack: process.env.NODE_ENV === 'production' ? undefined : err.stack`. This suppresses the stack trace from the **server-side structured log** in production. The HTTP *response* already correctly hides stack traces from the client regardless of environment (via the separate `isOperational` check) — that part is right. But the log line is for your own team, not the client, and hiding the stack there specifically in production removes the most useful debugging artifact during a real incident.
**Why it matters:** This is a real, avoidable own-goal: it looks like a security precaution but the thing it's protecting (the log file) isn't exposed to end users, so there's no security benefit — only a debuggability cost, paid exactly during production incidents.
**Risk level:** High-priority for observability/MTTR, though not a security or correctness bug.
**Recommended solution:** Always include `err.stack` in the structured log entry (logs are an internal artifact); continue excluding it from the HTTP response body in production as already implemented.
**Fix now:** No — Stage 3.

---

## C. Medium-priority issues

### C1 — Hand-rolled logger has no levels/redaction/transport story
**What's wrong:** `utils/logger.js` is a ~70-line `console.log(JSON.stringify(...))` wrapper. It works and produces valid structured JSON lines (verified last round), but has no configurable minimum level, no field-redaction helper (so a future call site *can* accidentally log a password/token — nothing stops it), and no transport abstraction (stdout only).
**Why it matters:** Fine for the current zero-feature codebase; becomes a liability the moment real request bodies (which may contain PII or credentials) start flowing through log statements written by different contributors under time pressure.
**Risk level:** Medium — not urgent, but should be resolved before any auth/PII-handling code lands, not after.
**Recommended solution:** Either keep it hand-rolled but add a `redact(fields)` helper used at every call site that logs a request/response body, or adopt `pino` (fast, structured, widely used, has built-in redaction) once Stage 2 introduces the first routes that touch user data. Not urgent enough to justify a dependency today.
**Fix now:** No.

### C2 — Morgan access logs aren't skipped for `/health/ready`
**What's wrong:** The `skip` predicate in `app.js` only excludes `/health/live` from access logging; `/health/ready` (which orchestrator/LB readiness probes hit on a short interval, often every few seconds) is logged on every poll.
**Why it matters:** Pure log-volume noise once a real health-check probe is attached; makes access logs harder to scan for actual traffic.
**Risk level:** Medium (Low severity, but cheap and worth batching with other Stage 3 changes).
**Recommended solution:** Skip both `/health/live` and `/health/ready` (or any path under `/health`).
**Fix now:** No.

### C3 — Helmet's Content-Security-Policy is configured for a browser-rendered page that doesn't exist
**What's wrong:** `app.js` sets a CSP (`default-src 'self'`, etc.) via Helmet. This is a pure JSON API with no HTML views — CSP only matters for content a browser renders, so this directive is inert for every current and near-future response.
**Why it matters:** Not harmful, just noise/complexity that doesn't do anything the way it reads — a future contributor could reasonably assume it's protecting something.
**Risk level:** Medium-to-low — no security exposure either way, just a "does this actually do anything" clarity question, which is exactly the "don't add complexity that isn't earning its keep" principle your brief asks me to apply to myself.
**Recommended solution:** Either drop `contentSecurityPolicy` entirely (Helmet's other defaults — `X-Content-Type-Options`, `X-Frame-Options` equivalent via `frameAncestors`, HSTS — still apply and are the parts that matter for a JSON API) or keep it with a one-line comment explaining it's there defensively in case a future admin/status HTML page is added under this same app. Low effort either way.
**Fix now:** No.

### C4 — HSTS `preload: true` is a one-way operational commitment, set casually
**What's wrong:** `hsts: { preload: true, includeSubDomains: true, maxAge: 63072000 }` is set in Helmet config. Submitting to the browser HSTS preload list is effectively irreversible for a long time (removal takes months and requires the site to have been fully HTTPS for a while first), and setting the header alone doesn't preload you — but it signals an intent to preload that a future deploy might act on without realizing the commitment.
**Why it matters:** Low risk today (nobody has submitted the domain to the preload list), but it's the kind of setting that should be a deliberate decision at domain-launch time, not a default baked into infrastructure code before there's even a production domain.
**Risk level:** Medium — no current harm, but worth a deliberate "yes we mean this" checkpoint before the domain goes live.
**Recommended solution:** Keep `includeSubDomains`/`maxAge`, set `preload: false` by default, and flip it on deliberately once the team has confirmed every subdomain is HTTPS-ready.
**Fix now:** No.

### C5 — No `models/`, `services/`, `controllers/`, `repositories/`, `validation/` directories exist yet
**What's wrong:** Named directly because your brief asks for this separation explicitly (section 3) — today there is nothing to separate because there's no feature code. This is the primary Stage 2 architecture-plan item, not a defect in what exists.
**Why it matters:** Getting this scaffold right *before* the first feature route is written is much cheaper than retrofitting it after three routes already have business logic sitting in inline handlers.
**Risk level:** Medium priority for Stage 2 planning.
**Recommended solution:** Addressed in the Stage 2 architecture plan, not here.
**Fix now:** No.

---

## D. Low-priority improvements

### D1 — `family: 4` in Mongo connect options forces IPv4-only resolution for the Atlas connection itself
**What's wrong:** `config/db.js` sets `family: 4` on the Mongoose connect options, forcing IPv4-only DNS resolution when dialing MongoDB Atlas. The comment attached to it (about keeping OS-level TCP keepalive through NAT) doesn't actually describe what this option does — `family` controls DNS resolution family, not TCP keepalive.
**Why it matters:** Harmless today (Atlas is universally reachable over IPv4), but the comment is misleading about its own purpose, and forcing IPv4 is an unnecessary constraint if the hosting provider ever sits on IPv6-only infrastructure.
**Risk level:** Low.
**Recommended solution:** Either remove `family: 4` (let the driver/OS resolve normally) or keep it with an accurate comment ("pin to IPv4 because our current hosting egress is IPv4-only"); fix the misleading comment either way.
**Fix now:** No.

### D2 — `package.json`'s `lint` script is a no-op placeholder
**What's wrong:** `"lint": "echo \"(configure eslint in Phase 2)\" && exit 0"` always exits 0 and does nothing.
**Why it matters:** If this is ever wired into CI as a required check, it gives false confidence — CI goes green without linting anything.
**Risk level:** Low today (nothing depends on it yet); becomes a real trap if added to a CI pipeline before ESLint is actually configured.
**Recommended solution:** Add real ESLint config in Stage 3 alongside the test suite; until then, don't reference this script from CI.
**Fix now:** No.

### D3 — `disconnectDB()` doesn't clear `listenersRegistered`/reset internal reconnect state
**What's wrong:** Minor state-hygiene issue: after `disconnectDB()` runs (e.g., in a test teardown that later reconnects), the module-level `listenersRegistered` flag stays `true`, and `reconnectAttempts` isn't reset. Not exploitable in the current single-boot production lifecycle, but would bite a future test suite that connects/disconnects repeatedly in the same process.
**Why it matters:** Test-suite-only concern today, since production never disconnects-then-reconnects within one process lifetime except via A1's mechanism (which is being removed anyway).
**Risk level:** Low, and it disappears entirely once A1 is fixed (the whole reconnect-state machine goes away).
**Recommended solution:** Resolved as a side effect of the A1 fix.
**Fix now:** No.

---

## Prioritized issue list (summary)

| # | Issue | Priority | Fixed in Stage 1? |
|---|---|---|---|
| A1 | Custom Mongo reconnect loop fights the driver's own topology monitor | Critical | No |
| A2 | Rejected CORS origin surfaces as 500 instead of 403 | Critical | No |
| B1 | Cluster mode multiplies Mongo connection pool with no coordination | High | No |
| B2 | Custom rate-limit key generator loses IP validation, doesn't normalize IPv6 | High | No |
| B3 | `autoIndex:false` in prod with no replacement index-creation step | High | No |
| B4 | No eager environment-variable validation at startup | High | No |
| B5 | `authLimiter`/`deviceIngestLimiter` defined but unmounted (dead code) | High (tracking) | No |
| B6 | Rate limiter has no seam for a future distributed store | High (readiness) | No |
| B7 | Production logs strip stack traces server-side (should only strip from client response) | High | No |
| C1 | Hand-rolled logger has no levels/redaction | Medium | No |
| C2 | `/health/ready` not excluded from access logs | Medium | No |
| C3 | Inert CSP config for a JSON-only API | Medium | No |
| C4 | HSTS `preload:true` set casually before domain launch | Medium | No |
| C5 | No layered directories yet (controllers/services/repositories/models/validation) | Medium (Stage 2 scope) | No |
| D1 | `family:4` has a misleading comment | Low | No |
| D2 | `lint` script is a no-op | Low | No |
| D3 | Reconnect-state hygiene on disconnect | Low | No (resolved by A1) |

Nothing in this list represents a live production incident today (there is no production traffic), but A1, A2, and B1 are the three I'd fix before writing a single feature route on top of this foundation — they're structural, and every future feature inherits them.

---

## What I did not evaluate here (explicitly out of scope for Stage 1)

Per your process, this is architecture/code audit only. I did not: design the improved directory structure (Stage 2), write any auth/device/telemetry code (Stage 3), or write tests (Stage 4). I also did not have a live MongoDB Atlas cluster to test actual failover/reconnect behavior against — the reconnect-loop finding (A1) is based on reading Mongoose/MongoDB Node driver documented behavior and the actual source of what's implemented, not on an observed failover test; that should be explicitly verified with a real replica-set failover drill once Stage 3 lands, and I'll flag it again there as untested-in-practice.
