'use strict';

/**
 * middleware/authenticate.js
 *
 * Verifies a user access JWT and attaches `req.user = { id, role }`.
 * Does not touch the database — access tokens are stateless by design
 * (Stage 2 section 6); the RBAC role check and ownership checks that
 * follow are separate, composable middleware (authorizeRole.js,
 * authorizeOwnership.js).
 */

const jwt = require('jsonwebtoken');
const { verifyAccessToken } = require('../security/jwt');
const { ApiError, ErrorCodes } = require('./errorHandler');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header.'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(
        new ApiError(401, 'Access token has expired.', { code: ErrorCodes.AUTH_TOKEN_EXPIRED })
      );
    }
    return next(
      new ApiError(401, 'Access token is invalid.', { code: ErrorCodes.AUTH_TOKEN_INVALID })
    );
  }
}

module.exports = authenticate;
