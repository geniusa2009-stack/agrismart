'use strict';

/**
 * middleware/authorizeFarmAccess.js
 *
 * Stage 3.6 fix for the gap flagged in the Stage 3.5 report: device
 * provisioning (and the device lifecycle endpoints — rotate-secret,
 * suspend, activate, revoke) checked only the caller's ROLE
 * (technician/admin/super_admin), never whether the caller actually has
 * any relationship to the target farm. Any technician could therefore
 * provision or take over a device on ANY farm in the system.
 *
 * This is deliberately a *different* shape of check than
 * authorizeOwnership.js's `authorizeFarmOwnership`:
 *   - authorizeFarmOwnership folds the ownership filter into the query
 *     itself and returns 404 on a miss (anti-enumeration, for
 *     consumer-facing farm resource access).
 *   - authorizeFarmAccess here does a plain existence fetch first, then
 *     a separate authorization check, returning 404 only when the farm
 *     truly does not exist and 403 when it exists but the caller isn't
 *     authorized for it. This matches this stage's explicit
 *     requirement ("Unauthorized Farm -> 403 Forbidden") and is a
 *     reasonable divergence: these are staff-only, authenticated,
 *     accountable actions (provisioning/lifecycle-managing hardware),
 *     not a consumer browsing arbitrary IDs, and device/farm ids here
 *     are opaque ObjectIds, not enumerable by a public actor in the
 *     first place. Documented explicitly in
 *     STAGE3_6_FINAL_VERIFICATION.md.
 *
 * Two variants are exported:
 *   - authorizeFarmAccessFromBody: for routes where the target farmId
 *     is in the (already-validated) request body (device provisioning).
 *   - authorizeDeviceFarmAccess: for routes where only a deviceId is
 *     known (rotate-secret/suspend/activate/revoke) — loads the device
 *     first to discover its farm, then applies the same check.
 *
 * Both attach the resources they load (`req.farm`, and for the device
 * variant `req.targetDevice`) so downstream controllers/services don't
 * re-fetch them, and both are re-checked independently at the
 * service/repository layer (devices.service.js) per this stage's
 * explicit requirement that authorization not depend on the controller
 * alone.
 */

const farmsRepository = require('../modules/farms/farms.repository');
const devicesRepository = require('../modules/devices/devices.repository');
const { isPrincipalAuthorizedForFarm } = require('../security/rbac');
const { ApiError } = require('./errorHandler');

/**
 * @param {string} farmField - name of the (validated) req.body key holding the farm id
 */
function authorizeFarmAccessFromBody(farmField = 'farmId') {
  return async function authorizeFarmAccessFromBodyMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required.'));
    }

    try {
      const farmId = req.body[farmField];
      const farm = await farmsRepository.findByIdPlain(farmId);

      if (!farm) {
        return next(ApiError.notFound('Farm not found.'));
      }

      if (!isPrincipalAuthorizedForFarm(req.user, farm)) {
        return next(
          ApiError.forbidden('You are not authorized to manage devices on this farm.', {
            code: 'FARM_ACCESS_DENIED',
          })
        );
      }

      req.farm = farm;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * @param {string} deviceIdParam - name of the req.params key holding the device id
 */
function authorizeDeviceFarmAccess(deviceIdParam = 'deviceId') {
  return async function authorizeDeviceFarmAccessMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required.'));
    }

    try {
      const deviceId = req.params[deviceIdParam];
      const device = await devicesRepository.findByDeviceId(deviceId);

      if (!device) {
        return next(ApiError.notFound('Device not found.'));
      }

      const farm = await farmsRepository.findByIdPlain(device.farmId);

      if (!farm || !isPrincipalAuthorizedForFarm(req.user, farm)) {
        return next(
          ApiError.forbidden('You are not authorized to manage this device.', {
            code: 'FARM_ACCESS_DENIED',
          })
        );
      }

      req.targetDevice = device;
      req.farm = farm;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { authorizeFarmAccessFromBody, authorizeDeviceFarmAccess };
