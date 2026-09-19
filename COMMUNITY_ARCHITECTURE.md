# AgriSmart Community + Marketplace — Architecture

This document covers the new "Agricultural Community + Marketplace" layer built on top of the
existing, unmodified Smart Farm IoT backend/frontend. See the root `README.md` for the IoT layer.

## Layering

```
Smart Farm IoT (unchanged)
        │
        ├── Agricultural Community  (posts, comments, reactions, follows, profiles)
        ├── Equipment Rental        (equipment listings + rental request lifecycle)
        ├── Agricultural Services   (service listings + service request lifecycle)
        ├── Marketplace             (listings, contact-seller, saved items)
        ├── Moderation              (shared report queue, staff-only resolution)
        ├── Notifications           (polling-based, one shared `notify()` call site)
        └── Trust / Reviews         (post-transaction reviews, feeds equipment/service ratings)
```

Every new module lives under `agrismart-backend/src/modules/<name>/` and follows the exact
model → repository → service → controller → validators → routes layering already established by
the IoT modules (`farms`, `irrigation`, `devices`). No existing IoT file was rewritten; the only
touched shared files were additive:

- `src/security/rbac.js` — added a `MODERATOR` role (community-scope only, never granted IoT/farm
  authority — see `isCommunityStaff()`) and `isCommunityStaff()`.
- `src/middleware/rateLimiter.js` — added four new userId-keyed limiters
  (`communityWriteLimiter`, `communityEngagementLimiter`, `communityReportLimiter`,
  `transactionLimiter`).
- `src/middleware/authorizeResourceOwnership.js` — new, generic version of the IoT layer's
  `authorizeOwnership.js` pattern, parameterized so every new module reuses one ownership-check
  implementation.
- `src/config/env.js` / `src/config/index.js` — new rate-limit env vars, all with safe defaults
  (no existing `.env` needs to change).
- `src/routes/index.js` — 8 new router mounts under `/api/v1`.
- `src/infrastructure/database/indexes/ensureIndexes.js` — 14 new models added to the index-sync
  list.

## Domain models

| Model | Module | Purpose |
|---|---|---|
| `UserProfile` | community | Public agricultural profile, separate from the private `User` account record |
| `Post` | community | Community post (10 categories, moderation status, soft delete) |
| `Comment` | community | Flat (non-threaded) comments on a post |
| `Reaction` | community | One reaction per (user, target), toggle semantics |
| `Follow` | community | Directed follow edge between two users |
| `CommunityReport` | moderation | Shared report model for every reportable content type |
| `Notification` | notifications | Polling-based notification record |
| `Equipment` | equipment | A rentable listing (owner-controlled status + staff-controlled moderationStatus, split) |
| `RentalRequest` | equipment | The full rental lifecycle, price/ownership snapshotted at request time |
| `AgriculturalService` | services | A service listing (consultant, operator, technician, etc.) |
| `ServiceRequest` | services | requested → accepted → in_progress → completed/rejected/cancelled |
| `MarketplaceListing` | marketplace | Seeds/fertilizers/supplies/tools/products listing (no checkout) |
| `SavedItem` | marketplace | Generic bookmark, reused by equipment/services/marketplace |
| `Review` | trust | Anchored to one completed transaction (rental or service_request), never free-floating |

Every model has `timestamps: true`, explicit ownership fields, compound indexes matching the
actual query patterns used by its repository, and (where applicable) a `moderationStatus` field
kept separate from any owner-controlled `status` field.

## Deliberate scope decisions (documented, not accidental)

- **No `ServiceProvider` model.** A provider is just a `User` + the existing community
  `UserProfile`; a separate provider-profile shape would have duplicated that model for no
  benefit ("do not over-engineer").
- **No `Category` collection for the marketplace.** A fixed, well-chosen enum is used instead —
  there's no admin UI to manage a dynamic taxonomy yet.
- **No nested comment threading.** Comments are a flat list per post.
- **No real messaging/inbox.** "Contact seller" is a single bounded notification to the seller,
  not a `Conversation`/`Message` thread — those are explicitly listed as future-ready, not
  required this pass.
- **No payment/checkout anywhere** — equipment rental, services, and marketplace all stop at
  request/discovery/contact. This was an explicit hard boundary in the task brief.
- **No AI features implemented.** Sections asking for "AI integration — foundation only" were
  read literally: nothing was added, since the existing `src/modules/ai/ai.routes.js` pattern
  (thin controller → isolated `ai/` package) is already the correct shape to extend later, and
  inventing new AI endpoints without a real capability behind them would violate the "no fake AI
  capabilities" rule.

## Concurrency / double-booking safety

`agrismart-backend/src/modules/equipment/rentals.service.js` documents this in detail in its own
header comment. Summary: this backend does not assume MongoDB multi-document transactions are
available (local/demo use runs a standalone, non-replica-set Mongo). The double-booking guard
therefore uses the strongest safe mechanism without transactions: an optimistic pre-check, an
atomic single-document compare-and-swap on the request being accepted, and a post-write re-check
that rolls back on conflict. The remaining (very narrow) race window is called out explicitly in
that file rather than presented as airtight.

## Frontend

`agrismart-frontend/src/pages/community/Feed.jsx` and `agrismart-frontend/src/pages/equipment/Equipment.jsx`
are a **separate, `dir="rtl"` subtree** from the existing English/LTR IoT screens — the existing
Dashboard/Devices/Irrigation/Analytics/Alerts/Settings pages were not touched. A minimal
localization layer (`agrismart-frontend/src/i18n/`) provides `t()`, RTL helpers, and
number/date/currency formatting, structured so a second locale (English) can be added by adding
one dictionary file — no page rewrite required.

**Not built this pass (documented, not silently skipped):** dedicated frontend UI for
Services/Marketplace/Notifications/Moderation — the backend for all four is complete and tested at
the API level, but no page exists yet.
