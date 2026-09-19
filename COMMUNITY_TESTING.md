# AgriSmart Community + Marketplace — Testing

## What exists

Four new supertest suites, mirroring the exact style/helpers of the pre-existing
`tests/security/idor.test.js`:

- `agrismart-backend/tests/community/idor.test.js` — post/comment ownership (edit, delete,
  moderate), mass-assignment rejection, follow self-guard, follow idempotency.
- `agrismart-backend/tests/equipment/rentals.test.js` — equipment ownership, invalid-enum
  rejection, "cannot rent own equipment", accept/reject authorization (owner-only, with an
  unrelated-attacker 404 case and a requester-attempting-accept 403 case), **double-booking
  prevention** (two overlapping accepted bookings cannot both succeed; a new request cannot be
  created once dates are already booked), invalid state transition (accepting an already-rejected
  request), and the full happy path through review (including "owner cannot review" and "cannot
  review twice").
- `agrismart-backend/tests/services/serviceRequests.test.js` — provider ownership, "cannot
  request own service", accept authorization, and the full `accept → start → complete` lifecycle
  with an invalid re-transition check.
- `agrismart-backend/tests/marketplace/marketplace.test.js` — seller ownership, "cannot contact
  self", successful contact, save-toggle idempotency, and moderation report duplicate-spam
  prevention + staff-only queue access.

## How to run

```bash
cd agrismart-backend
npm test              # full suite, needs a real/reachable MongoDB
npm run test:offline   # diagnostic — see below
```

## What could be verified in this environment, and what could not

This sandbox has no reachable MongoDB (same pre-existing, documented limitation as the IoT layer —
see the root `README.md`'s "Known limitations"). What WAS verified here, without a database:

1. **The entire app — all 8 new route mounts, 22 new/updated Mongoose models — requires cleanly
   with zero syntax or wiring errors.** Verified via `node -e "require('./src/app')()"` after
   every module and again after the final security-fix pass.
2. **Every new test file parses and executes correctly under Jest.** Run via
   `npx jest --config jest.offline.config.js --testPathPattern <new test files>`. Every test
   failed with the exact same class of error as the pre-existing IoT tests under this harness —
   a `register()` call timing out against the offline diagnostic Mongo (see
   `jest.offline.config.js`'s own header comment) — never a `ReferenceError`, `TypeError` from
   broken route wiring, or an assertion against a real response. This confirms the new tests are
   correctly written and will exercise the real assertions once a database is available; it does
   NOT confirm the assertions themselves pass.
3. **The pre-existing offline suite (28 DB-independent tests: redaction, rate-limiter config,
   RBAC logic, env validation, Mongo-unavailable handling) still passes unchanged** after every
   change in this session — confirming nothing in the new layer broke the existing, already-
   verified IoT test suite.

What could NOT be verified here: the new tests' actual assertions (needs a real MongoDB), a live
browser click-through of the new frontend pages, and `npm run build`/`npm run lint` for the
frontend (blocked by this sandbox's missing native `rolldown`/`oxlint` bindings — the exact same
pre-existing limitation documented in the IoT layer's own final report).

## Exact commands to finish verification on a machine with normal network access

```bash
# Backend — run the new tests for real
cd agrismart-backend
npm run demo &   # or point MONGODB_URI at a real/local Mongo
npm test

# Frontend — build/lint
cd agrismart-frontend
npm run lint
npm run build

# Manual click-through
npm run dev   # frontend, http://localhost:5173
# Log in with the demo account, visit /community and /equipment from the sidebar,
# create a post, comment, react, create an equipment listing, request a rental
# from a second account, accept it, complete it, leave a review.
```
