# AgriSmart Community + Marketplace — Security Model

## Authentication & roles

Every new route requires a valid access JWT (`authenticate` middleware — unchanged from the IoT
layer). One new role was added to `src/security/rbac.js`: `MODERATOR`. It is deliberately **not**
part of the IoT role hierarchy (`ROLE_HIERARCHY`) — `isAtLeast(MODERATOR, ...)` always returns
`false`, so a moderator account gets zero elevated rights over farms/devices/irrigation. Its only
authority is `isCommunityStaff(role)`, which is `true` for `moderator`, `admin`, and
`super_admin`, and is checked exclusively by the community-layer's own moderation routes.
Roles are never accepted from the client — always read from `req.user.role`, itself derived from
the verified JWT payload.

## Ownership — never trusted from the client

Every write derives its ownership field from the authenticated principal, never from the request
body:

- Posts/comments: `authorId = req.user.id`
- Equipment/services: `ownerId`/`providerId = req.user.id`
- Marketplace listings: `sellerId = req.user.id`
- Reports/reviews: `reporterId`/`reviewerId = req.user.id`
- Rental/service requests: `requesterId = req.user.id`; `ownerId`/`providerId` is copied from the
  already-loaded, already-verified listing document, never from the client

Every zod validator is `.strict()`, so a client attempting to smuggle `ownerId`, `authorId`,
`status`, `moderationStatus`, `verificationStatus`, `ratingAverage`, etc. into a create/update body
gets a `400 VALIDATION_ERROR` — not a silently-ignored extra field.

## Anti-IDOR

`src/middleware/authorizeResourceOwnership.js` is the generic version of the IoT layer's
`authorizeOwnership.js` pattern: it loads a resource by id, and 404s (never 403) unless the
requester owns it or (for the small set of staff-gated actions) is community staff. A 403 would
leak "this id exists but isn't yours" to an attacker; a 404 does not. The one deliberate exception
is a pure role gate (e.g. `POST /moderation/reports` staff-only listing endpoints) — those
correctly return 403, since no specific resource id is being probed.

Rental/service requests use a slightly different shape (participant loader, not a strict owner
field) because either party — the equipment owner or the renter — is legitimately allowed to view
and, for some actions, act on a request. `loadParticipantRental` / `loadParticipantRequest` 404
for anyone who is neither party; the finer-grained "only the owner may accept/reject/complete"
rule is enforced a second time inside the service layer itself, so a route-level mistake alone
could not grant that.

## Pagination & unbounded-query protection

Every list/discovery repository uses `.skip().limit()` with `Promise.all([find, countDocuments])`.
`src/utils/pagination.js`'s `resolvePagination()` clamps `limit` to `MAX_LIMIT = 50` **independent
of the zod schema** — defense in depth, so even a route that forgot its query validator still
cannot force an unbounded scan.

## Rate limiting

Four new identity-scoped limiters (never IP-keyed for an authenticated route — `middleware/rateLimiter.js`'s
`userKey()` reads `req.user.id`):

| Limiter | Default | Applied to |
|---|---|---|
| `communityWriteLimiter` | 20/min | post/equipment/service/marketplace-listing creation |
| `communityEngagementLimiter` | 60/min | comments, reactions, follows, contact-seller, save |
| `communityReportLimiter` | 15/hour | filing a moderation report |
| `transactionLimiter` | 15/min | rental/service request creation and status changes |

## State-transition safety

Every lifecycle (rental requests, service requests, moderation reports) uses an explicit
`fromStatus[] -> toStatus` allow-list enforced via an atomic `findOneAndUpdate` compare-and-swap
(`rentals.repository.transition`, `serviceRequests.repository.transition`,
`moderation.service.VALID_TRANSITIONS`) — never a blind `$set` on `status`. See
`COMMUNITY_ARCHITECTURE.md`'s concurrency section for the rental double-booking-specific
reasoning.

## Reviews / trust

`trust/reviews.service.js` never trusts a client-supplied `revieweeId`. `rentals.service.reviewRental`
and `services/serviceRequests.service.reviewRequest` each independently verify: the reviewer is the
correct participant (the requester, not the owner/provider), and the transaction is actually in
`completed` status, before calling into the shared review-submission function. The schema-level
unique index on `(transactionType, transactionId, reviewerId)` is a second, independent guard
against a duplicate review even if a service-layer check were ever missed.

## Logging / secrets

`logger.info`/`logger.warn` calls added by this layer only ever carry ids, statuses, and counts —
never message bodies, review text, or anything from a request body wholesale. No new secret or
credential is introduced anywhere in this layer.

## Audit results

A dedicated read-only security-audit pass (see `OVERNIGHT_COMMUNITY_REPORT.md` section F) searched
every new file for `req.body.ownerId`/`authorId`/`sellerId`/`providerId`/`role`, unbounded queries,
missing pagination, and missing rate limits. Three minor (non-exploitable) issues were found and
fixed before this report was written: two `/mine` list routes were missing explicit pagination
query validation (functionally harmless — `resolvePagination()` already defaults safely — but
inconsistent with the rest of the codebase), one service-cancellation notification used a
mismatched type, and equipment/service "save" endpoints didn't verify the target existed before
bookmarking it. No auth, IDOR, or mass-assignment issue was found.
