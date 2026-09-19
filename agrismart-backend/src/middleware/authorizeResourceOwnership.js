'use strict';

/**
 * middleware/authorizeResourceOwnership.js
 *
 * Generic version of middleware/authorizeOwnership.js's anti-IDOR
 * pattern (Overnight Community task, section 10), parameterized so
 * every Community-layer resource (post, comment, equipment listing,
 * rental request, service, marketplace listing, ...) gets the exact
 * same ownership-check shape without re-implementing it per module:
 *
 *   - fetches the resource via the caller-supplied `fetchById`
 *   - 404s (never 403) when the resource doesn't exist OR belongs to
 *     someone else — same anti-enumeration reasoning as the original
 *     IoT-layer authorizeOwnership.js: a 403 would confirm to an
 *     attacker that the id exists but isn't theirs.
 *   - optionally allows community staff (moderator/admin) through even
 *     when they're not the owner, for moderation actions — opt-in via
 *     `allowStaff: true`, never the default.
 *   - attaches the loaded document to `req[attachAs]` so downstream
 *     controllers/services never re-fetch or re-derive ownership.
 */

const { ApiError } = require('./errorHandler');
const { isCommunityStaff } = require('../security/rbac');

/**
 * @param {object} opts
 * @param {string} opts.paramName - req.params key holding the resource id
 * @param {(id: string) => Promise<any>} opts.fetchById
 * @param {string} [opts.ownerField] - field on the fetched doc holding the owning user's id
 * @param {string} [opts.attachAs] - key to attach the loaded doc to on req
 * @param {boolean} [opts.allowStaff] - allow community moderator/admin through
 * @param {string} [opts.notFoundMessage]
 */
function authorizeResourceOwnership({
  paramName,
  fetchById,
  ownerField = 'authorId',
  attachAs = 'resource',
  allowStaff = false,
  notFoundMessage = 'Resource not found.',
}) {
  return async function authorizeResourceOwnershipMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required.'));
    }

    try {
      const id = req.params[paramName];
      const doc = await fetchById(id);

      if (!doc) {
        return next(ApiError.notFound(notFoundMessage));
      }

      const isOwner = String(doc[ownerField]) === String(req.user.id);
      const isStaff = allowStaff && isCommunityStaff(req.user.role);

      if (!isOwner && !isStaff) {
        return next(ApiError.notFound(notFoundMessage));
      }

      req[attachAs] = doc;
      req.isCommunityStaffAction = isStaff && !isOwner;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { authorizeResourceOwnership };
