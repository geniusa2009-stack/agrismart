'use strict';

/**
 * utils/pagination.js
 *
 * Shared page/limit -> skip/limit helper for the Community layer's
 * list endpoints (feed, equipment discovery, marketplace, services).
 * Bounds are enforced here AND in each route's zod query schema
 * (defense in depth) so a caller can never force an unbounded scan —
 * Section 24/section 10 "pagination abuse" requirement.
 */

const { z } = require('zod');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Shared zod fragment for `?page=&limit=` query params. Every new
 * list-endpoint validator spreads this into its own `.object({...})`
 * rather than duplicating the coercion logic — coerces from the raw
 * string query params Express hands us, rejects anything non-numeric
 * or out of bounds instead of silently clamping (silent clamping would
 * hide a caller's bug; the max is still enforced defensively again in
 * resolvePagination() above in case a route ever forgets this schema).
 */
const paginationQueryFields = {
  page: z.coerce.number().int().min(1).max(100000).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
};

/**
 * @param {{ page?: number, limit?: number }} query - already
 *   zod-validated/coerced by the caller's route (see
 *   validators.paginationQuerySchema in each module).
 * @returns {{ page: number, limit: number, skip: number }}
 */
function resolvePagination(query = {}) {
  const page = Number.isInteger(query.page) && query.page > 0 ? query.page : 1;
  const rawLimit = Number.isInteger(query.limit) && query.limit > 0 ? query.limit : DEFAULT_LIMIT;
  const limit = Math.min(rawLimit, MAX_LIMIT);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Wraps a result set + total count into the standard paginated
 * response envelope used across every new list endpoint.
 */
function paginatedResponse(items, total, { page, limit }) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNextPage: page * limit < total,
    },
  };
}

module.exports = { resolvePagination, paginatedResponse, paginationQueryFields, DEFAULT_LIMIT, MAX_LIMIT };
