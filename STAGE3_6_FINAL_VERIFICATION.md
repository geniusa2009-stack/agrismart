# AgriSmart Backend — Stage 3.6 Final Verification

**Close Remaining Security Gap + Complete Database Verification**

Date: 2026-08-29
Codebase version: agrismart-backend@2.0.0

---

## 1. Technician Authorization Decision

**Data model inspected before deciding (Part 1 requirement):**

- `Farm` (`src/modules/farms/farm.model.js`, prior to this stage) had exactly one relationship: `ownerId` (a single `User`). No farm-staff membership, no organization/team collection, nothing else.
- `User` (`src/modules/users/user.model.js`) has a flat `role` field (`farmer`/`agronomist`/`technician`/`admin`/`super_admin`) with no farm association anywhere on the user document.
- `security/rbac.js`'s `ROLE_HIERARCHY` ranks technician and agronomist equally (both above farmer, below admin) — role alone, with no per-resource scoping mechanism.
- No organization, team, tenant, or "staff membership" concept exists anywhere in the codebase — confirmed by inspecting every model file in `src/modules/*/*.model.js`.

**Conclusion: the system does not have enough information to authorize technician-to-farm access today** — that's exactly why the gap existed. This stage adds the smallest concept that closes it.

## 2. Authorization Model — Option A Chosen

Of the three options offered:

- **Option B (organization/team)** was rejected: it requires inventing a whole new domain concept (organizations, membership, invitations) that doesn't exist anywhere in this codebase, which is precisely the "unnecessary complexity" this stage's brief warned against introducing.
- **Option C (technicians as global administrators)** was rejected outright: it violates least privilege by design — a technician hired to service one farm would be able to touch every farm on the platform.
- **Option A (explicit technician-to-farm assignment) was chosen.** It is the smallest addition that matches an already-existing pattern in this codebase: `Farm.ownerId` is already a direct farm-to-user relationship; adding `Farm.authorizedTechnicianIds` (an array of user ids) is the same shape of relationship, not a new subsystem. It also maps directly onto the real workflow this platform is being built for: a farmer hires a technician and grants that technician access to their own farm specifically — nothing more.

**The rule implemented** (`src/security/rbac.js`'s `isPrincipalAuthorizedForFarm`):

1. `admin`/`super_admin` — always authorized (unchanged platform-staff override, consistent with the rest of the codebase).
2. Whoever owns the farm (`farm.ownerId`) — always authorized, **regardless of that user's role**. This detail mattered: this codebase's own existing test fixtures have technician accounts create and own farms (farm creation was never role-restricted), so "farmer role only" would have locked those legitimate owners out of their own farms. Ownership, not role, is what grants full control.
3. `technician`/`agronomist` accounts that do **not** own the farm — authorized only if explicitly listed in `farm.authorizedTechnicianIds`.
4. Everyone else — denied.

This directly satisfies the required diagram:
```
Technician -> Authorized Farm   -> Can provision device   (200/201)
Technician -> Unauthorized Farm -> 403 Forbidden
```

**Deliberate divergence from this codebase's usual 404 anti-enumeration pattern**, documented explicitly: `authorizeOwnership.js`'s existing farm-ownership check folds the ownership filter into the query and returns 404 on a miss, to avoid confirming a farm id's existence to a consumer-facing farmer. This stage's brief explicitly specifies **403 Forbidden** for an unauthorized farm, so `middleware/authorizeFarmAccess.js` does a plain existence fetch first (404 only if the farm truly doesn't exist), then a separate authorization check (403 if it exists but the caller isn't authorized). This is a reasoned, not accidental, difference: these are staff-only, authenticated, accountable actions on internal-only ObjectIds (not enumerable by an outside actor), where a clear "access denied" signal is more useful for support/audit purposes than defeating enumeration — and it's what was explicitly asked for.

## 3. Files Changed

| File | Change |
|---|---|
| `src/modules/farms/farm.model.js` | Added `authorizedTechnicianIds: [ObjectId]` field. |
| `src/security/rbac.js` | Added `isPrincipalAuthorizedForFarm(principal, farm)` — the pure-logic authorization rule, unit-testable without a database. |
| `src/modules/farms/farms.repository.js` | Added `findByIdPlain` (existence-only fetch, no ownership filter — used deliberately to support the 404-vs-403 split), `addAuthorizedTechnician`, `removeAuthorizedTechnician`. |
| `src/modules/farms/farms.service.js` | Added `assignTechnician`/`revokeTechnician` (validates the target user is actually a technician/agronomist account before granting access). |
| `src/modules/farms/farms.controller.js`, `farms.routes.js`, `farms.validators.js` | New endpoints: `POST /api/v1/farms/:farmId/technicians` and `DELETE /api/v1/farms/:farmId/technicians/:technicianUserId`, both gated by the existing `authorizeFarmOwnership` (owner or admin only) — the minimum mechanism needed to actually populate the new boundary. |
| `src/middleware/authorizeFarmAccess.js` (new) | `authorizeFarmAccessFromBody` (device provisioning) and `authorizeDeviceFarmAccess` (device lifecycle endpoints) — the HTTP-layer enforcement. |
| `src/modules/devices/devices.routes.js` | Wired the new middleware into `POST /devices`, `:deviceId/rotate-secret`, `:deviceId/suspend`, `:deviceId/activate`, `:deviceId/revoke`. Added `FARMER` to the allowed roles (previously excluded entirely — see §1 reasoning: a farm owner needs to be able to provision their own devices). |
| `src/modules/devices/devices.service.js` | Every provisioning/lifecycle function now takes `principal` as a **required** argument and independently re-verifies farm access via a fresh repository fetch (`assertFarmAccess`/`assertDeviceFarmAccess`) — the service layer does not trust the controller/middleware. |
| `src/modules/devices/devices.controller.js` | Passes `req.user` through to the service layer on every provisioning/lifecycle call. |
| `src/modules/commands/commands.repository.js` | `updateStatus`/`setExecutionResult` now accept an optional `allowedFromStatuses` array folded directly into the MongoDB query filter — see §10/§8 for why. |
| `src/modules/commands/commands.service.js` | `transition()`, `markSent()`, and `reportExecutionResult()` now use the atomic conditional update instead of a read-check-write; `reportExecutionResult()` additionally gained a status-transition guard it never had before. |
| `tests/unit/rbac.test.js` | 8 new unit tests for `isPrincipalAuthorizedForFarm` — executed for real, no database needed. |
| `tests/security/deviceProvisioningAuthorization.test.js` (new) | 10 regression tests for the authorization fix (database-backed — could not be executed in this sandbox; see §6). |
| `tests/iot/commands.test.js` | 3 new tests for the command-lifecycle concurrency fix (database-backed — could not be executed; see §6). |

## 4. Security Fixes

1. **Device provisioning/lifecycle authorization gap (the primary target of this stage).** Previously, `POST /devices`, `:deviceId/rotate-secret`, `:deviceId/suspend`, `:deviceId/activate`, and `:deviceId/revoke` checked only the caller's role — any technician or admin could provision or take over a device on **any** farm. Now enforced at both the HTTP layer (`authorizeFarmAccessFromBody`/`authorizeDeviceFarmAccess`) and independently at the service layer (`devices.service.js`'s `assertFarmAccess`/`assertDeviceFarmAccess`), per this stage's explicit requirement that authorization "must not depend exclusively on controllers."
2. **Command state-machine bypass — `reportExecutionResult()` had no transition guard at all.** Found during this stage's independent security review (§10). A device could report a COMPLETED/FAILED execution result for a command still in PENDING/QUEUED/SENT, skipping the required ACKNOWLEDGED/EXECUTING steps the documented state machine requires. Fixed by adding the same atomic transition guard used elsewhere.
3. **Command transition race condition — read-check-write instead of an atomic update.** `commands.service.js`'s `transition()` (used by `acknowledge()`/`markExecuting()`) and `markSent()` read a command's status, checked it in JavaScript, and only then wrote — a classic TOCTOU race under concurrent requests. Fixed by folding the status precondition into the database query itself (`commandsRepository.updateStatus`'s new `allowedFromStatuses` filter), so the database — not application code — is the sole arbiter of whether a transition is still legal at write time.

## 5. Regression Tests

All required scenarios from Part 4 are covered in `tests/security/deviceProvisioningAuthorization.test.js` (database-backed) and `tests/unit/rbac.test.js` (pure logic, executed for real):

- Farmer: a farmer CAN provision on their own farm; **Farmer A cannot provision onto Farmer B's farm** (403, `FARM_ACCESS_DENIED`); IDOR variant (farmer has a legitimate farm of their own, but supplies another farmer's farmId).
- Technician: **Technician A can provision onto an authorized farm** (after the farm owner explicitly assigns them); **Technician A cannot provision onto an unauthorized farm** (403); revoking access removes the ability to provision.
- Administrator: an admin can provision on any farm (the intended platform-staff override, unchanged).
- Device lifecycle: a technician cannot suspend a device on a farm they aren't authorized for (403); the farm owner can suspend/activate/rotate their own device.
- Data integrity: a rejected provisioning attempt never creates a `Device` document (`Device.countDocuments` unchanged before/after the 403).
- IDOR: changing `farmId` in the request body from an owned farm to another farmer's/technician's unauthorized farm is rejected — proven directly, not assumed.
- Concurrency (`tests/iot/commands.test.js`): reporting an execution result before acknowledgement is rejected; an illegal reverse transition (COMPLETED → re-ACK) is rejected and the command stays COMPLETED; two concurrent ACKs for the same command produce exactly one 200 and one 400, with exactly one `acknowledged` entry in `statusHistory` — not zero, not two.

**The `isPrincipalAuthorizedForFarm` unit tests (12 tests, `tests/unit/rbac.test.js`) were executed for real in this session and all passed** — this is pure logic with no database dependency, and it is the actual decision function both the middleware and the service-layer check call, so this is genuine, not simulated, coverage of the fix's core logic. The database-backed test files above could not be executed for the same reason as Stage 3.5 (see §6) — they are ready to run and are reported honestly as not-yet-executed, not as passing.

## 6. Database Test Environment

Re-attempted in the exact order requested:

1. **Existing mongodb-memory-server strategy**: re-ran `npm test` — identical failure to Stage 3.5: `DownloadError: ... Status Code is 403` from `https://fastdl.mongodb.org`.
2. **Local MongoDB**: `which mongod mongosh mongo` — none present. No apt package exists (MongoDB Community Server is not in Debian/Ubuntu's main archive).
3. **Docker MongoDB**: Docker daemon was not running by default in this fresh session; started it manually (`dockerd &`), confirmed it came up (`docker info` succeeded). Critically, this run's `docker info` output additionally revealed the daemon's own outbound proxy configuration directly: `HTTPS Proxy: http://127.0.0.1:39807` with an explicit `No Proxy` allowlist of `registry.npmjs.org, jsr.io, npm.jsr.io, pypi.org, files.pythonhosted.org, index.crates.io, proxy.golang.org` plus Anthropic's own API hosts. Docker/container registries and `fastdl.mongodb.org` are simply not on that list — this is not an inferred block, it's the literal proxy configuration. Confirmed directly anyway: `docker pull mongo:7` → `Forbidden`.
4. **Any other already-available MongoDB-compatible environment**: none found. Checked `/root/.cache/mongodb-binaries` (empty — no binary cached from a prior attempt) and every `/tmp/mongo-mem-*` leftover directory from earlier runs (all empty). As an additional, more thorough check this stage (beyond Stage 3.5's diligence), inspected the deprecated `mongodb-prebuilt`/`mongodb-download` npm packages to see whether any npm-registry-hosted package bundles the actual `mongod` binary directly in its tarball (which would work, since `registry.npmjs.org` is reachable) rather than fetching it from an external URL at install/run time — confirmed by reading its source (`mongodb-download.js`) that it also targets `https://fastdl.mongodb.org`, the same blocked host. No pure-JS package provides real MongoDB wire-protocol compatibility suitable for testing a real Mongoose/Time-Series application either.

**Conclusion: identical to Stage 3.5 — this is a sandbox-wide egress-allowlist limitation, now confirmed via the proxy's own explicit allowlist rather than only inferred from repeated 403s.** Per this stage's explicit instructions, the production Atlas database was never used, no test was deleted or weakened, and no database behavior was mocked to manufacture a passing result.

```
TEST: Full database-backed test suite (npm test)
STATUS: BLOCKED
REASON: Sandbox egress policy allows only registry.npmjs.org, jsr.io, pypi.org,
        files.pythonhosted.org, index.crates.io, proxy.golang.org, and
        Anthropic's own API hosts. MongoDB's binary CDN (fastdl.mongodb.org)
        and every container registry tried (Docker Hub, GCR, Quay, GHCR,
        ECR Public, MCR) are not on that list and are rejected identically
        at the proxy (403).
WHAT WAS ATTEMPTED: direct binary download (blocked), Docker daemon start +
  image pull (daemon works, pull blocked identically), local binary/apt
  package search (none exist), npm-registry-bundled binary search (the one
  candidate package still fetches from the same blocked host), pure-JS
  alternative (none provide real wire-protocol compatibility).
HOW TO RUN LOCALLY: on a machine with normal internet access, or with an
  internal MongoDB binary/registry mirror, `npm test` will work unmodified.
```

## 7. Exact Commands Executed

```
npm install
npm run lint
npx cross-env NODE_ENV=test jest --runInBand        # full suite — blocked at globalSetup, identical to Stage 3.5
npm audit
docker info / docker pull mongo:7                    # blocked, 403
npm view mongodb-prebuilt ... / npm install mongodb-prebuilt --no-save   # confirmed same blocked host
npx jest --config /tmp/jest.nodb.config.js --runInBand tests/unit tests/security/redaction.test.js tests/failure
node src/server.js   (spawned as a real process, boot/health verification after the fixes)
curl http://127.0.0.1:.../health/live
```

## 8. Exact Test Results

```
Test Suites: 13 total
  Passed:  5
  Failed:  0
  Blocked: 8   (all database-backed)
  Skipped: 0

Tests: 67 total
  Passed:  21
  Failed:  0
  Blocked: 46  (all database-backed)
  Skipped: 0
```

Suites executed and passed for real: `tests/unit/env.test.js`, `tests/unit/rateLimiter.test.js`, `tests/unit/rbac.test.js` (now 12 tests — 8 new this stage, directly covering the authorization fix), `tests/security/redaction.test.js`, `tests/failure/mongoUnavailable.test.js`.

Suites blocked (identical reason, §6): `tests/api/auth.test.js`, `tests/api/cors.test.js`, `tests/api/health.test.js`, `tests/iot/commands.test.js` (now 8 tests — 3 new this stage), `tests/iot/irrigation.test.js`, `tests/iot/telemetry.test.js`, `tests/security/deviceProvisioningAuthorization.test.js` (new, 10 tests), `tests/security/idor.test.js`.

`npm run lint`: clean (0 errors/warnings) after every change in this stage. `npm audit`: 0 vulnerabilities.

## 9. Database Index Verification

**Could not query live indexes — no database connection available (§6).** What follows is a code-level re-inspection of every index declaration relevant to this stage's checklist, cross-referenced against `src/infrastructure/database/indexes/ensureIndexes.js` (unchanged this stage, already includes `Farm` in its `MODELS` list — the new `authorizedTechnicianIds` field needs no new index, since it is only ever queried via `_id` lookups, not searched by array membership at scale):

| Requirement | Declaration found | Verified live? |
|---|---|---|
| User email uniqueness | `user.model.js`: `email: { unique: true }` | No — code review only |
| Device ID uniqueness | `device.model.js`: `deviceId: { unique: true }` | No — code review only |
| Farm ownership/query indexes | `farm.model.js`: `ownerId: { index: true }` | No — code review only |
| Telemetry idempotency uniqueness | `telemetryIdempotency.model.js`: compound unique index on `(deviceId, messageId)` | No — code review only |
| Command lookup indexes | `deviceCommand.model.js`: `idempotencyKey` unique, `deviceId`/`farmId`/`expiresAt` indexed | No — code review only |
| TTL/retention behavior | `telemetryIdempotency.model.js`'s `createdAt` TTL index (7 days); `refreshToken.model.js`'s `expiresAt` TTL index (0s — expire exactly at the stored time) | No — code review only |

This is reported honestly as unverified-in-practice. The Stage 3.5 fix (removing duplicate `schema.index()` declarations) was verified live via boot-log inspection (no more duplicate-index warnings), which is the only index-related behavior this sandbox has been able to observe directly.

## 10. Concurrency Results

**Could not run actual concurrent requests against a live database (§6).** What was done instead:

- **Duplicate telemetry**: `telemetry.repository.js`'s `claimIdempotencyKey` inserts into a dedicated collection with a real unique compound index and catches the `E11000` duplicate-key error — this is the database's own atomic guarantee, not an application-level check-then-act, so it is correct under real concurrency by construction. Verified by code review; not exercised with actual concurrent requests.
- **Duplicate command submission**: `commands.repository.js`'s `create()` relies on the same pattern — a unique index on `idempotencyKey`, with the `E11000` catch returning the existing document. Same conclusion.
- **Command acknowledgement race — found and fixed this stage (§4 item 3)**: this was a **real, previously-unverified concurrency bug**, not a pattern that was already safe. Fixed by moving the status-transition guard into the database query itself. A concurrency-specific regression test was added (`tests/iot/commands.test.js`, "concurrent duplicate ACKs...") asserting exactly one 200/one 400 and exactly one `acknowledged` history entry — this test is ready and correct but, like the rest of the database-backed suite, could not be executed in this sandbox.

## 11. Security Review (Part 10)

Every endpoint accepting `farmId`, `deviceId`, `commandId`, or an equivalent identifier was re-inspected for "can a user change this id and access someone else's resource":

| Endpoint | ID(s) accepted | Finding |
|---|---|---|
| `POST /devices`, lifecycle endpoints | `farmId` (body), `deviceId` (param) | **Fixed this stage** — see §4. |
| `POST /commands/:commandId/ack`, `/result` | `commandId` (param) | Already protected (Stage 3 fix): `assertDeviceOwnsCommand` returns 404 for a non-owning device. Re-confirmed unchanged and correct. Additionally hardened this stage against the state-machine bypass (§4 item 2). |
| `GET /farms/:farmId` | `farmId` (param) | Already protected: `authorizeFarmOwnership` folds ownership into the query (404 on a miss). Unchanged, not touched this stage. |
| `POST/DELETE /farms/:farmId/technicians[...]` (new) | `farmId` (param), `technicianUserId` (body/param) | Protected by the same `authorizeFarmOwnership` (owner/admin only). A caller cannot use `technicianUserId` to affect any farm but the one they already own — the mutation is scoped by `farmId`, and an invalid/unrelated `technicianUserId` is a harmless no-op (`$addToSet`/`$pull` on an array), not an information leak. |
| `POST /irrigation/farms/:farmId/valves`, `/emergency-stop` | `farmId` (param) | Already protected: `authorizeFarmOwnership`. Unchanged. |
| `POST /irrigation/valves/:valveId/open`, `/close` | `valveId` (param) | Already protected: `loadValve` middleware's `findValveByIdForPrincipal` (owner or admin only, fetch-then-check). **Noted, not a bug**: this does not yet extend to technicians authorized via the new `authorizedTechnicianIds` list — technician authorization from this stage applies only to device provisioning/lifecycle, not irrigation control, which was outside this stage's explicit scope. Flagged for a future stage's decision rather than silently expanded. |
| `POST /telemetry` | none — `deviceId` comes exclusively from `req.device.deviceId` (the authenticated device identity via `authenticateDevice`), and the ingest schema uses `.strict()`, so a client-supplied `deviceId` field in the body would be rejected outright, not silently accepted. No IDOR surface exists here. |
| irrigation events | not directly exposed by any route — only referenced internally by the service/repository layer with server-derived context. No client-facing id, no surface. |

No additional IDOR-class gaps were found beyond the one this stage was scoped to fix and the state-machine bypass found as a byproduct of the same review.

## 12. Remaining Limitations

- The entire database-backed test suite (46 of 67 tests) remains unexecuted in this sandbox — identical, confirmed-authoritative network restriction (§6). This is the single largest remaining gap before a 🟢 rating is honest.
- Technician authorization from this stage covers device provisioning/lifecycle only, not irrigation valve control (§11) — a deliberate scope boundary, not an oversight, but worth a decision in a future stage if technicians are meant to operate irrigation too.
- Concurrency and index behavior are verified by code review and, for the command race condition, a ready-but-unexecuted regression test — not by running actual concurrent requests or querying a live database.
- The DB-outage 10-second request stall documented in the Stage 3.5 report is unchanged; still a recommendation, not fixed.
- `devices.repository.js`'s `findByDeviceIdForPrincipal` remains unused dead code (predates this stage) — harmless, noted for a future cleanup pass, not touched here to keep this stage's diff focused.

## 13. Production-Readiness Assessment

| Dimension | Status |
|---|---|
| Security | 🟡 — the device-provisioning gap that was this stage's primary target is now closed and unit-tested (though not yet integration-tested against a real database); the state-machine bypass found during review is fixed the same way. |
| Database | 🔴 — genuinely untestable in this sandbox; index/uniqueness/TTL behavior is verified by code inspection only, not live. |
| IoT | 🟡 — device/telemetry/command logic reviewed and consistent with the documented design; not executed as tests this session. |
| Irrigation Safety | 🟡 — unchanged from Stage 3.5; implemented per design, not executed as tests. |
| Testing | 🔴 — 46 of 67 tests (69%) have never actually run in any environment this session has access to. |
| Observability | 🟢 — re-confirmed clean (no secrets in any log generated this session; error classification from Stage 3.5 unchanged and correct). |
| Scalability | 🟡 — no new findings this stage; Stage 3.5's DB-outage stall and single-instance sweep limitations stand. |

**Overall: 🟡 REMAINING BLOCKERS.**

Reasoning: this stage did exactly what it set out to do — the authorization gap is closed with a defensible, documented design, enforced at two independent layers, and backed by real executed unit tests for its core logic; an additional real concurrency bug was found and fixed as a byproduct of the required adversarial review. But "remaining blockers" is the honest label as long as the majority of this system's correctness claims — including the very fixes made in this stage — have never run against a real database anywhere this session has touched. That is not a new problem introduced here; it is the same blocker Stage 3.5 reported, now narrowed to a smaller and better-understood set of gaps.

## 14. Recommendation for the Next Phase

Do not proceed to ESP32 → Telemetry → Backend → MongoDB → Mobile App yet. The one concrete, actionable next step is running this exact test suite (`npm test`) on any machine or CI runner with normal internet access, or with an internal MongoDB binary/container-registry mirror configured — nothing in the codebase needs to change for that to work. Once that suite runs and the 46 currently-blocked tests are confirmed passing (or any failures they surface are fixed), a 🟢 rating is achievable without further architectural changes. Separately, and not blocking that: decide whether technician farm-authorization should extend to irrigation control (§11), and revisit the DB-outage request-stall behavior (Stage 3.5 §12) before production traffic.
