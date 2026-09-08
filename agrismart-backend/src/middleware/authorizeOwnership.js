'use strict';

/**
 * middleware/authorizeOwnership.js
 *
 * The anti-IDOR layer (Stage 2 section 6): "a farmer must never access
 * another farmer's farm/device/telemetry by changing an ID in the
 * URL." Loads the farm via farms.repository.findByIdForPrincipal(),
 * which already folds the ownership check into the DB query itself. If
 * nothing comes back, we return 404 — not 403 — deliberately: telling
 * an attacker "that ID exists but isn't yours" (403) is a minor
 * information leak about ID existence that a 404 avoids.
 *
 * Attaches `req.farm` so downstream controllers/services don't have to
 * re-fetch it.
 */

const farmsRepository = require('../modules/farms/farms.repository');
const { ApiError } = require('./errorHandler');

/**
 * @param {string} farmIdParam - name of the req.params key holding the farm id
 */
function authorizeFarmOwnership(farmIdParam = 'farmId') {
  return async function authorizeFarmOwnershipMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required.'));
    }

    try {
      const farmId = req.params[farmIdParam];
      const farm = await farmsRepository.findByIdForPrincipal(farmId, req.user);

      if (!farm) {
        return next(ApiError.notFound('Farm not found.'));
      }

      req.farm = farm;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { authorizeFarmOwnership };
