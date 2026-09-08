'use strict';

/**
 * middleware/authorizeRole.js
 *
 * Role-gate only. NOT sufficient by itself for farm/device/telemetry
 * -scoped resources — see authorizeOwnership.js for the IDOR-safe check
 * (Stage 2 section 6).
 */

const { hasRole } = require('../security/rbac');
const { ApiError } = require('./errorHandler');

function authorizeRole(...allowedRoles) {
  return function authorizeRoleMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required.'));
    }
    if (!hasRole(req.user.role, allowedRoles)) {
      return next(ApiError.forbidden('You do not have permission to perform this action.'));
    }
    return next();
  };
}

module.exports = authorizeRole;
