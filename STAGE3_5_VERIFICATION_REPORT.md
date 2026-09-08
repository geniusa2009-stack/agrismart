# AgriSmart Backend — Stage 3.5 Verification Report

**Full Local Verification, Failure Testing & Security Hardening**

Date: 2026-08-28
Environment: Node.js v22.22.2, npm 10.9.7, Linux sandbox container
Codebase version: agrismart-backend@2.0.0

---

## 1. Executive Summary

This stage was scoped as verification and hardening only — no new domain
features were built. The codebase from Stage 3 was inspected, the full
dependency/lint/audit pipeline was run for real, every avenue for
running a real local MongoDB (direct binary download, Docker, system
package, alternate binary cache) was exhausted and is documented below,
every test that *could* run without a database was run for real and
passed, and the server was exercised as a live running process against
a real (unreachable) MongoDB target to verify boot behavior, health
endpoints, CORS classification, rate limiting, malformed-input handling,
and graceful shutdown — none of which require the test database.

Two real bugs were found and fixed during this pass (duplicate Mongoose
index declarations, and error-code misclassification of database
timeouts / malformed bodies / oversized payloads as generic
`INTERNAL_ERROR`). One real, pre-existing authorization gap was found
and is **not** fixed — it requires a data-model decision (see §11) that
is out of scope for a verify-and-fix-only stage.

The database-backed test suite (auth flows, authorization/IDOR matrix,
device credential lifecycle, telemetry idempotency, command lifecycle,
irrigation safety, adversarial IDOR tests — 33 of the repo's 46 written
tests) could **not** be executed in this sandbox. This is a sandbox
network-policy limitation, not a codebase defect — reproduced,
diagnosed, and documented in full in §2 and §6, exactly as instructed.

**Production readiness: 🟡 Requires fixes** (see §12 for the full
reasoning — the blocker is test coverage, not known-broken code; two
real bugs were fixed live in this pass, and one real authorization gap
needs a product decision before it can be closed).

---

## 2. Environment

- Node.js: v22.22.2
- npm: 10.9.7
- OS: Linux (ephemeral cloud sandbox container)
- `docker`: CLI v29.4.3 present; daemon not running by default (no
  systemd), started manually — see §6.
- `mongod` / `mongosh` / `mongo`: **not present** anywhere on this
  system, and not installable via `apt` (MongoDB Community Server was
  dropped from Debian/Ubuntu's main archive due to the SSPL license
  change — `apt-cache search mongodb` returns only client libraries/
  drivers for other languages, no server package).
- Outbound network: allowlisted. Reachable during this session: `npmjs.org`,
  `github.com`, `pypi.org`, `archive.ubuntu.com`. **Blocked** (proxy
  returns `403`): `fastdl.mongodb.org` (MongoDB's binary CDN) and, when
  tested as a fallback, every container registry tried —
  `registry-1.docker.io`, `gcr.io`, `quay.io`, `ghcr.io`,
  `public.ecr.aws`, `mcr.microsoft.com` — all rejected identically at
  the CONNECT-tunnel level, i.e. an organization-wide egress policy, not
  a MongoDB-specific block.

---

## 3. Commands Executed (exact, real, in this session)

```
npm install
npm run lint
npm audit
npx cross-env NODE_ENV=test jest --runInBand          # full suite — FAILED at globalSetup
docker version / docker info / docker ps
docker pull mongo:7                                    # FAILED — 403
npx jest --config /tmp/jest.nodb.config.js --runInBand <5 DB-independent suites>
node -e "require('./src/config/env').loadEnv(...)"     # x5 scenarios
node -e "require('./src/infrastructure/database/mongoose').connectDB()"  # malformed URI
node src/server.js   (spawned as a real background process, 4 separate runs,
                       against an intentionally unreachable MongoDB URI)
curl ... (against the live process: /health/live, /health/ready, 404 route,
          CORS allowed/disallowed origin, auth rate limiter x8, malformed JSON,
          oversized payload, wrong content-type, NoSQL-injection-style body,
          path-traversal-style URL, malformed/missing JWT)
kill -TERM <server pid>   (graceful shutdown, x4)
```

No results below were fabricated or simulated. Every PASS/FAIL, every
status code, and every log line quoted was produced by an actual command
run in this session.

---

## 4. Test Results

### 4.1 `npm install`

**PASS.** 555 packages installed, 0 vulnerabilities reported at install
time.

### 4.2 `npm run lint`

**PASS.** `eslint . --max-warnings=0` — zero errors, zero warnings.
(Re-verified after the Stage 3.5 code fixes below; still clean.)

### 4.3 `npm audit`

**PASS.** 0 vulnerabilities (0 critical, 0 high, 0 moderate, 0 low).

### 4.4 `npm test` (full suite via the project's own `jest.config.js`)

**FAILS to start.** `globalSetup.js` calls
`MongoMemoryServer.create()`, which attempts to download a real `mongod`
binary from `fastdl.mongodb.org` and receives `403`. Because this is a
Jest `globalSetup` (not a per-file setup), the failure aborts the entire
run before any test file — including the ones that need no database at
all — gets to execute. Full reproduction:

```
TEST: npm test (full suite)
STATUS: BLOCKED
REASON: tests/setup/globalSetup.js calls MongoMemoryServer.create(), which
        downloads a real mongod binary from https://fastdl.mongodb.org.
        That host is rejected by this sandbox's outbound proxy with
        "403 (MongoDB's 404)" — a network/organization-policy block, not
        an application defect.
WHAT WAS ATTEMPTED:
  1. Ran `npm test` as-is — confirmed the DownloadError with the exact
     stack trace below.
  2. Checked for a local mongod binary on disk — none found, and no apt
     package exists (MongoDB Community Server was removed from Debian/
     Ubuntu's main archive; `apt-cache search mongodb` returns only
     driver/client libraries for other languages).
  3. Checked mongodb-memory-server's local binary cache
     (/root/.cache/mongodb-binaries) — empty, no prior successful
     download to reuse.
  4. Checked whether Docker could provide MongoDB instead (per this
     stage's explicit instructions) — the Docker daemon was not running
     by default (no systemd in this container); started it manually
     (`dockerd &`), confirmed it came up correctly (`docker info`
     succeeded, showing a live daemon). Then attempted
     `docker pull mongo:7` — rejected with the SAME class of error:
     "failed to resolve reference ... Forbidden". Probed every other
     major container registry (Docker Hub, GCR, Quay, GHCR, Amazon
     ECR Public, even Microsoft Container Registry as a sanity check)
     directly via curl — all returned "CONNECT tunnel failed, response
     403" identically. This is a proxy-level policy blocking container
     registries as a class, not a MongoDB-specific block, so Docker is
     not a viable fallback in this sandbox either.
  5. Considered alternative test-DB strategies: no pure-JS package
     provides real MongoDB wire-protocol compatibility for a Mongoose
     application (mongomock-style shims exist for Python's pymongo, not
     for Node/Mongoose, and would not exercise the real driver/index/
     Time-Series behavior this codebase relies on regardless). No safe
     alternative was found. Per this stage's explicit instructions, the
     production Atlas database was NOT used as a substitute, and no
     production code was altered to hide this failure.
HOW TO RUN LOCALLY: On a machine with normal internet access (or an
  internal MongoDB binary mirror configured via
  `MONGOMS_DOWNLOAD_URL`/`MONGOMS_SYSTEM_BINARY`), `npm test` will
  download a real mongod once (cached afterward) and the full suite
  (46 tests across 12 files) will run against it. Alternatively, run
  `docker run -d -p 27017:27017 mongo:7` on a machine with registry
  access and point `MONGODB_URI` at it, adjusting
  tests/setup/globalSetup.js to skip mongodb-memory-server in that mode.
```

Exact error captured:
```
Starting the MongoMemoryServer Instance failed, enable debug log for more information. Error:
 DownloadError: Download failed for url "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-6.0.14.tgz", Details:
Status Code is 403 (MongoDB's 404)
```

### 4.5 Tests executed for real, without a database (bypassing `globalSetup`/`testDb.js`)

Since the blocker is specifically `globalSetup.js`'s binary download —
not the test files themselves — every test file that does not depend on
a live MongoDB connection was run directly against an alternate Jest
config that skips global setup, with real env vars supplied. This is
strictly more evidence than Stage 3 produced (which ran 4 suites/12
tests; this pass adds the DB-unavailable failure test, for 5 suites/13
tests):

```
PASS tests/unit/env.test.js            (4 tests)
PASS tests/unit/rateLimiter.test.js    (3 tests)
PASS tests/unit/rbac.test.js           (4 tests)
PASS tests/security/redaction.test.js  (1 test)
PASS tests/failure/mongoUnavailable.test.js (1 test)

Test Suites: 5 passed, 5 total
Tests:       13 passed, 13 total
```

These are not stubs or mocks of the real test files — they are the
actual project test files in `tests/`, executed unmodified, with only
the Jest *config* (global setup/teardown) swapped out because that
config's only job is starting the now-unavailable database.

### 4.6 Test suites that remain blocked

```
TEST: tests/api/auth.test.js (5 tests — registration, duplicate email,
      login, wrong password, token issuance)
STATUS: BLOCKED
REASON: Requires a live MongoDB connection (User collection reads/writes).
WHAT WAS ATTEMPTED: Ran directly against the no-DB Jest config; hangs on
  Mongoose command buffering, then times out — confirming the DB
  dependency rather than a code defect (the equivalent live-process
  behavior, a 503 with proper classification, was verified directly;
  see §5).
HOW TO RUN LOCALLY: `npm test` on a machine where mongodb-memory-server
  can download its binary, or with Docker+registry access.

TEST: tests/api/health.test.js — "/health/ready returns 200 when
      MongoDB is connected" (1 of 3 tests in this file)
STATUS: BLOCKED (the other 2 tests in this file — live 200, 404 well-
        formed — were verified directly against a live process; see §5)
REASON: Requires an actually-connected MongoDB to assert readyState 1.
HOW TO RUN LOCALLY: same as above.

TEST: tests/api/cors.test.js (3 tests)
STATUS: PARTIALLY VERIFIED — the CORS allow/reject behavior itself was
  verified directly against a live process (see §5) since it does not
  touch the database; running the test FILE itself is still blocked
  because `testDb.js`'s global `beforeAll`/`afterEach` hooks apply to
  every file matched by the project's real jest.config.js.
REASON: Test harness-level DB dependency, not a CORS logic dependency.

TEST: tests/iot/commands.test.js (5 tests, including the Stage 3
      cross-device IDOR regression test)
STATUS: BLOCKED
REASON: Requires MongoDB (command creation, farm/device/valve setup).
WHAT WAS ATTEMPTED: Could not execute. The underlying fix (assertDeviceOwnsCommand
  returning 404 for a non-owning device) was re-read and re-verified by
  code review in this pass — logic unchanged since Stage 3, still
  correct — but "verified by code review" is explicitly NOT the same as
  "tests executed," and is reported as such.
HOW TO RUN LOCALLY: same as above.

TEST: tests/iot/irrigation.test.js (5 tests — max duration, daily
      allowance, expired command, duplicate submission, emergency stop)
STATUS: BLOCKED — same reason as above.

TEST: tests/iot/telemetry.test.js (9 tests — valid ingest, idempotency,
      invalid payloads, duplicate detection)
STATUS: BLOCKED — same reason as above.

TEST: tests/security/idor.test.js (3 tests — cross-farm/cross-user
      resource access)
STATUS: BLOCKED — same reason as above.
```

**Total: 46 tests written across 12 suites. 13 executed and passed for
real in this session. 33 remain blocked by the sandbox's MongoDB/
container-registry network policy**, not by any known defect in the
application code they exercise.

---

## 5. Live Process Verification (no database required)

To get real signal on behaviors that don't strictly require a working
database connection, the server was spawned as an actual background
process (`node src/server.js`) against an intentionally unreachable
MongoDB URI, and exercised with real HTTP requests via `curl`. Every
result below is from an actual running process, not a unit test or a
simulation.

| Check | Result |
|---|---|
| `GET /health/live` while DB unreachable | **200**, `{"status":"live",...}` — confirms liveness is independent of DB state |
| `GET /health/ready` while DB unreachable | **503**, `{"status":"not_ready","dependencies":{"mongodb":{"state":"disconnected","readyState":0}}}` — correct, distinct from liveness |
| `GET /no-such-route` | **404**, well-formed JSON (`code: NOT_FOUND`, `requestId` present) — not an HTML error page |
| CORS, allowed origin | **200**, `Access-Control-Allow-Origin` header present and correct |
| CORS, disallowed origin | request completes normally (not a 500) — confirms the Stage 1 finding A2 fix (`callback(null, false)` instead of throwing) still holds under a real request |
| Env validation: missing `MONGODB_URI` | process refuses to start; clear error listing the exact missing field |
| Env validation: missing/short JWT secrets | process refuses to start; both `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` listed together when both are missing |
| Env validation: invalid `NODE_ENV` | rejected (`staging` is not one of `development`\|`test`\|`production`) |
| Env validation: non-numeric `PORT` | rejected (`Expected number, received nan`) — confirmed the numeric coercion does NOT silently pass through `NaN` |
| Malformed MongoDB URI (`not-a-valid-mongodb-uri`) passed to `connectDB()` | rejects immediately and cleanly: `"Invalid scheme, expected connection string to start with \"mongodb://\" or \"mongodb+srv://\""` — no hang |
| Auth rate limiter (`RATE_LIMIT_AUTH_MAX=5`), 8 rapid `POST /auth/login` | first 5 processed normally, requests 6–8 → **429** with `RATE_LIMITED`, correct `Retry-After`/`ratelimit-*` headers |
| Malformed JSON body | **400**, `MALFORMED_REQUEST_BODY` (see §7 bug #2 — this code did not exist before this pass) |
| Oversized payload (400KB body against 256KB limit) | **413**, `PAYLOAD_TOO_LARGE` (see §7 bug #2) |
| Wrong `Content-Type` (`text/plain` with a JSON-shaped body) | **400**, `VALIDATION_ERROR` — body-parser skips parsing for the wrong content-type, so Zod correctly reports both fields as missing rather than silently accepting the request |
| NoSQL-injection-style body (`{"email":{"$gt":""},"password":{"$gt":""}}`) | **400**, `VALIDATION_ERROR` — Zod's `z.string()` rejects the object shape before it can ever reach a query. The request never reaches Mongoose/MongoDB at all. |
| Path-traversal-style URL (`/api/v1/farms/..%2f..%2f..%2fetc%2fpasswd`) | **401**, `AUTH_INVALID_CREDENTIALS` — rejected by the auth middleware before routing even resolves the traversal-looking segment; no filesystem access is possible from a route param in this codebase regardless |
| Malformed JWT (`Bearer not-a-real-jwt`) | **401**, `AUTH_TOKEN_INVALID` |
| Missing/empty `Authorization` header | **401**, `AUTH_INVALID_CREDENTIALS` |
| Graceful shutdown (`SIGTERM`) while DB was never connected | Clean exit. Log shows `"Beginning graceful shutdown."` → `"HTTP server closed..."` → `"Graceful shutdown complete. Exiting."` — no hang, no forced-exit timer triggered |
| Production response bodies for every error case above | **No stack traces, no file paths, no internal error type names** in any response body — confirmed by direct inspection of every response quoted above |
| Server-side logs for the same requests | **Full diagnostic detail retained** (stack traces, Mongoose error types, request context) — confirms the Stage 1 B7 fix (log always gets the stack; only the HTTP response hides it in production) still holds |

---

## 6. Security Test Results

| Category | Result |
|---|---|
| IDOR — cross-device command access | **Verified by code review only** (test blocked by DB unavailability). The Stage 3 fix (`assertDeviceOwnsCommand` → 404) and its regression test (`tests/iot/commands.test.js`) were re-read; logic is unchanged and still correct on inspection, but this is explicitly reported as code-review verification, not test execution. |
| IDOR — cross-farm resource access | **Blocked** (`tests/security/idor.test.js` requires DB). Repository-level ownership filtering (`farms.repository.js`'s `findByIdForPrincipal`, which folds `ownerId` into the query itself) was re-confirmed by code review — the defense-in-depth design from Stage 2/3 is intact. |
| **New finding — cross-farm device provisioning** | See §11. A technician/admin account can provision a device onto *any* `farmId`, not just farms they're associated with, because there is no farm-staff-assignment concept in the current data model. This was already self-flagged as a known gap in Stage 3's code (`devices.routes.js` comment); this pass re-confirms it is real and still open. Not fixed in this stage — see §11 for why. |
| Malformed/expired/invalid JWT | **Verified live** (§5) — all rejected with 401 and correct error codes, no stack traces exposed. |
| Token reuse detection (refresh rotation) | **Blocked** (`tests/api/auth.test.js` requires DB). Logic re-confirmed by code review (`auth.service.js`'s `refresh()` — reused-token detection revokes the whole family) — unchanged since Stage 3. |
| Rate-limit bypass / brute-force login | **Verified live** (§5) — enforced correctly at the configured threshold. |
| NoSQL-injection-style input | **Verified live** (§5) — Zod's strict typing rejects object-shaped injection attempts before they can reach a query. |
| Path-traversal-style input | **Verified live** (§5) — no route in this codebase resolves a param against the filesystem, so this class of attack has no surface here regardless of the 401 observed. |
| Prototype-pollution-style payloads | **Not separately tested this pass** — no route accepts a deeply-nested free-form object into anything that gets merged/assigned (`Object.assign`, spread into an existing object) rather than validated field-by-field through a Zod schema. Flagged as a code-review conclusion, not a test result. |
| Header abuse / CORS abuse | **Verified live** (§5) — disallowed-origin requests do not crash or 500-classify. |
| Secret exposure in logs | **Verified across every real log produced in this entire session** (§9) — zero instances of a raw password, token, device secret, or Authorization header value found. |

---

## 7. Bugs Discovered

### Bug #1 — Duplicate Mongoose index declarations (Medium, fixed)

**Reproduction:** Booting the server (`node src/server.js`) with any
MongoDB URI logged, on every single boot:
```
(node:...) [MONGOOSE] Warning: Duplicate schema index on {"email":1} found...
(node:...) [MONGOOSE] Warning: Duplicate schema index on {"deviceId":1} found...
(node:...) [MONGOOSE] Warning: Duplicate schema index on {"farmId":1} found...
```

**Root cause:** `src/modules/users/user.model.js` and
`src/modules/devices/device.model.js` declared the same index twice —
once via the field-level schema option (`unique: true` / `index: true`)
and again via an explicit `schema.index(...)` call for the identical
field. Mongoose creates the index from the field-level option already;
the second declaration is pure duplication.

**Impact:** Cosmetic/noise-level on its own (Mongoose de-duplicates at
the driver level so no double index was ever actually created on disk),
but it violates this project's own "explicit index management" design
goal from Stage 2 (each index should be declared in exactly one place,
auditable via `ensureIndexes.js`), and duplicate-index warnings on every
boot make it harder to spot a *genuine* new index conflict introduced
later.

**Fix:** Removed the redundant explicit `schema.index()` calls in both
files, keeping the field-level declarations (which already carry the
`unique`/`index` intent) as the single source of truth. See
`src/modules/users/user.model.js` and
`src/modules/devices/device.model.js`.

**Regression test:** Re-booted the server 3 times after the fix and
grepped for "Duplicate schema index" in the log — zero matches (was: 3
matches every time, before the fix). No existing test covered this
(it's a boot-time warning, not a functional assertion); a proper
regression test would require a DB-connected integration test asserting
`Model.syncIndexes()` reports no changes on a second run, which is one
of the 33 blocked tests — noted for when the DB environment is
available.

### Bug #2 — Database timeouts, malformed JSON, and oversized payloads all misclassified as generic `INTERNAL_ERROR` (Medium, fixed)

**Reproduction:** With the server running against an unreachable
MongoDB, `POST /api/v1/auth/login` returned:
```
HTTP 500  {"code":"INTERNAL_ERROR","message":"Internal server error.",...}
```
and the server log showed the actual cause was
`MongooseError: Operation \`users.findOne()\` buffering timed out after 10000ms`
— a normal, expected, *recoverable* condition (the database is
temporarily down), not a code defect. Similarly, a malformed JSON body
and an oversized payload (both raised by `body-parser`, both carrying
their own correct HTTP status already) were also folded into
`code: "INTERNAL_ERROR"`, `isOperational: false`.

**Root cause:** `src/middleware/errorHandler.js`'s `errorHandler`
middleware only understood the app's own `ApiError` class. Any other
error shape (body-parser's `SyntaxError`/`PayloadTooLargeError`, or a
raw Mongoose/MongoDB driver error) fell through to the generic
`INTERNAL_ERROR` / `isOperational: false` branch — the same bucket used
for genuinely unexpected bugs. This directly conflicts with this
stage's requirement (§15 of the brief) that "database" and
"validation"-class errors be classified distinctly from unexpected
errors, and it would make production alerting unable to tell "our
database is having an outage" (expected, ops-actionable) apart from "we
shipped a crash" (a real incident) — both would show up identically as
`INTERNAL_ERROR` 500s.

**Fix:** Added `classifyKnownError()` to `errorHandler.js`, which
recognizes body-parser's JSON-parse and payload-too-large errors and
Mongoose/MongoDB connectivity errors (by error name and the
`buffering timed out` message pattern) and maps each to its own code:
`MALFORMED_REQUEST_BODY` (400), `PAYLOAD_TOO_LARGE` (413),
`DATABASE_UNAVAILABLE` (503) — all marked `isOperational: true` so they
don't pollute unexpected-error alerting. Critically, the **client-facing
message for these is a fixed, safe string** ("Service temporarily
unavailable. Please try again shortly." for the DB case), never the raw
driver message — the raw Mongoose message names the actual collection
and operation (`users.findOne()`), which must not reach a client even
though the general condition (DB down) is safe to disclose. The full
raw error, with stack trace, is still always logged server-side —
diagnostic detail was not reduced, only what reaches the HTTP response
changed.

**Regression test:** Re-ran the exact same three live requests after
the fix:
- DB-unavailable login → **503**, `DATABASE_UNAVAILABLE`, safe message,
  no collection/operation names in the response body (verified by
  direct inspection).
- Malformed JSON → **400**, `MALFORMED_REQUEST_BODY`.
- Oversized payload → **413**, `PAYLOAD_TOO_LARGE`.

No existing automated test covered this classification (it's an
error-handler-level concern the existing test files don't exercise
directly); a unit test asserting `classifyKnownError()`'s mapping for
each error shape would be straightforward to add and is recommended as
a follow-up — not added in this pass to stay within "fix what's broken,
don't build new feature work" scope, though arguably this specific test
would count as regression coverage for a bug just fixed; flagged for
the next stage.

---

## 8. Database Status

**Not connectable in this sandbox.** See §2, §4.4, and §6 for the full
diagnosis (direct binary download blocked, Docker daemon works but
every container registry is blocked identically, no system package, no
cached binary, no safe pure-JS alternative). No database-backed
behavior in this report is claimed to have been "tested" without that
claim being scoped to code review or the specific live-process checks
in §5 that don't require a live DB connection. The production Atlas
database was never touched, per the explicit instruction not to use it
for testing.

## 9. IoT Test Results

Device authentication, telemetry ingestion/idempotency, out-of-order
timestamp handling, heartbeat/offline detection, and the full command
state machine are all implemented and were reviewed by re-reading the
actual source (`devicesService.verifyDeviceCredential`,
`telemetry.service.js`'s `claimIdempotencyKey`/drift-check logic,
`commands.service.js`'s `transition()` state-machine guard) — all
matched their Stage 2/3 design and showed no new issues on this
re-read. **None of this could be exercised as running tests** in this
session; all 19 IoT-related tests (`tests/iot/*.test.js`) are in the
blocked list in §4.6. The one exception is telemetry's Zod-level input
validation, which is pure schema logic and does not touch the database;
re-reading `telemetry.validators.js` confirms it already rejects
missing `deviceId`/`messageId`, non-finite numbers (Zod's
`z.number().finite()` rejects `NaN`/`Infinity` by construction), and
out-of-range readings via `.min()`/`.max()` bounds — this was not
independently re-verified by execution in this pass and is a code-review
conclusion, not a test result.

Secret redaction: **verified across every log line generated by this
entire session** (server boots, error responses, rate-limit hits) — see
§6 and §9-below table in §5. Zero raw secrets found.

## 10. Irrigation Safety Results

All 8 irrigation safety sub-cases from this stage's brief (max
duration, daily allowance, expired command, duplicate submission,
emergency stop, offline device, device mismatch, ownership) are
implemented per Stage 3 (`irrigation.service.js`'s duration clamping,
pre-issuance daily-allowance check, `commandsService`'s device-ownership
assertion reused by irrigation commands). **All require the
database and could not be executed in this session** — they are among
the 33 blocked tests (`tests/iot/irrigation.test.js`). The physical-
safety invariant ("command sent" is never treated as "irrigation
executed") was re-confirmed by code review: `Valve.confirmedState` is
only ever written from `irrigationService.confirmValveState()`, which
is only ever called from `commands.controller.js`'s
`reportExecutionResult` handler — i.e. only in response to the device's
own report, never at command-issuance time. This logic is unchanged
since Stage 3 and was not modified in this pass.

## 11. Bugs/Gaps Found But NOT Fixed — Requires a Decision

**Cross-farm device provisioning is not scoped to a technician's own
farm(s).** `POST /api/v1/devices` (device provisioning) checks only
that the caller's role is `technician`/`admin`/`super_admin` — it does
not verify the caller has any relationship to the `farmId` supplied in
the request body. Any technician account can provision (and therefore
later command) a device onto any farm in the system, not just farms
they're meant to service.

This is not a newly-introduced bug — it was already flagged as a known
scope simplification in a code comment in `devices.routes.js` from
Stage 3 ("gate on role only, not per-farm ownership... flagged as a
known gap"). This pass re-confirms the gap is real and still open.

**Why it isn't fixed here:** closing it properly requires a data-model
decision this stage isn't authorized to make on its own — the current
`Farm`/`User` models have no concept of "technician assigned to farm
X" at all (a farm has a single `ownerId`; there is no staff-membership
collection or field). A real fix means designing that relationship
(is a technician global platform staff, trusted by design, and this is
actually correct behavior? Or should technicians be scoped per-farm,
requiring a new `FarmStaff`/`FarmAssignment` concept?) — that's a
product/domain decision, and this stage's explicit mandate was
"VERIFY → FIND BUGS → FIX → TEST AGAIN → REPORT," not "design and add
new domain concepts." Reported here as a confirmed, open finding for a
deliberate decision in the next stage, rather than patched with a
guess.

## 12. Performance Findings

- **DB-outage request stall:** with MongoDB unreachable, a request that
  touches the database (e.g. login) blocks for the full Mongoose
  command-buffering timeout (10 seconds, the driver default) before
  failing — confirmed live, `responseTime: 10025`/`10029ms` measured
  directly. Under real concurrent load during a DB outage, this could
  tie up available request-handling capacity for the full 10s per
  request rather than failing fast. Not changed in this pass (a
  `bufferCommands: false` / explicit fail-fast-on-disconnected-state
  change is a real behavior trade-off — briefer outages currently self-
  heal transparently via buffering — that deserves a deliberate decision
  and, ideally, verification against a real database, which isn't
  available here). Flagged as a recommendation for the next stage.
- `sweepExpiredCommands()`'s `setInterval`-based sweep remains correctly
  documented as single-instance-only safe (Stage 2/3 finding, unchanged,
  still accurate — cluster mode was already removed).
- No unbounded loops, no unclosed timers beyond the documented,
  `.unref()`'d sweep interval, no synchronous CPU-heavy blocking code
  found on re-read of the request path.
- Time Series telemetry query/index performance could not be evaluated
  — requires a live MongoDB instance.

## 13. Remaining Limitations

- 33 of 46 written tests (all database-backed: auth, IDOR/authorization
  matrix, device credential lifecycle, telemetry idempotency/ordering,
  command lifecycle, irrigation safety) have **not been executed** in
  this sandbox. Their logic was re-read and appears consistent with
  Stage 2/3's design, but code review is not test execution and is
  reported as such throughout this document.
- The cross-farm device-provisioning gap in §11 is open and needs a
  product decision.
- The DB-outage 10-second stall in §12 is a known trade-off, not yet
  revisited.
- A regression test for `classifyKnownError()` (Bug #2's fix) was not
  added — recommended for the next stage.
- Prototype-pollution-style payload testing was a code-review
  conclusion (no route merges untyped input into an existing object),
  not an executed adversarial test.

## 14. Production Readiness Assessment

**🟡 Requires fixes**

Reasoning: nothing found in this pass indicates the architecture is
broken — the parts that could be verified live (boot behavior, health
checks, CORS classification, rate limiting, malformed-input handling,
env fail-fast validation, graceful shutdown, secret redaction) all
behaved correctly, and two real bugs found during this pass were fixed
and re-verified live. But the majority of this system's actual
correctness claims — auth flows, the farm-ownership IDOR matrix, device
credential security, telemetry idempotency, command state-machine
enforcement, and every irrigation safety guarantee — are backed only by
tests that have never actually run in this environment, plus one
confirmed, open, unfixed cross-farm authorization gap. That combination
does not meet the bar for "verified for next development phase" or
especially for anything resembling production-ready, regardless of how
sound the code reads on inspection. The clear next step is running the
full suite on infrastructure that can actually reach either
`fastdl.mongodb.org` or a container registry, then resolving §11's
open decision.

---

## Summary (12-item)

1. **What was tested:** the full local pipeline (install/lint/audit),
   every test file that can run without a database (5 suites/13 tests),
   live-process behavior for boot/health/CORS/rate-limiting/malformed-
   input/env-validation/graceful-shutdown, and a full re-attempt at
   getting a real local MongoDB running (direct download, then Docker).
2. **Exact commands executed:** listed verbatim in §3.
3. **Exact results:** §4 (test results) and §5 (live verification
   table) — every status code and log line quoted is real.
4. **Bugs found:** (1) duplicate Mongoose index declarations on
   `email`/`deviceId`/`farmId`; (2) database timeouts, malformed JSON,
   and oversized payloads all misclassified as generic `INTERNAL_ERROR`;
   (3) confirmed-open cross-farm device-provisioning authorization gap
   (pre-existing, self-flagged in Stage 3, not fixed this pass — see
   §11).
5. **Bugs fixed:** #1 and #2 above, both re-verified live after the
   fix (§7).
6. **Tests still blocked:** 33 of 46 (auth, authorization/IDOR matrix,
   device lifecycle, telemetry, command lifecycle, irrigation safety) —
   all database-backed, blocked by this sandbox's network policy
   against both `fastdl.mongodb.org` and every container registry
   tried. Full reproduction and exact commands in §4.4/§4.6.
7. **Security status:** live-testable adversarial cases (malformed/
   invalid JWT, rate-limit bypass, NoSQL-injection-style input,
   path-traversal-style input, malformed JSON, oversized payload, CORS
   abuse) all handled correctly with no crashes, no info leaks, and
   correct status codes. Database-backed security cases (IDOR matrix,
   token-reuse detection, cross-device command access) were re-verified
   by code review only, not execution. One confirmed open authorization
   gap (§11).
8. **Database status:** genuinely unreachable in this sandbox for
   testing purposes — full diagnosis in §2/§4.4/§6. Production Atlas
   was never touched.
9. **IoT status:** device/telemetry/command logic reviewed and appears
   consistent with the Stage 2/3 design; not executed as tests this
   session (§9).
10. **Irrigation safety status:** all 8 required sub-cases implemented
    per Stage 3; the "command sent ≠ executed" invariant re-confirmed
    by code review; none executed as tests this session (§10).
11. **Remaining risks:** the open cross-farm device-provisioning gap
    (§11), the DB-outage 10-second request stall (§12), and — the
    largest risk — the fact that most of this system's correctness
    guarantees are currently untested in any environment that has run
    this session.
12. **Ready for next phase:** 🟡 **Requires fixes** — specifically,
    running the full test suite somewhere with real database access,
    and a decision on §11, before this can honestly be called verified.
