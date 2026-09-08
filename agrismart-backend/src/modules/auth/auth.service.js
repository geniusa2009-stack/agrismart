'use strict';

/**
 * modules/auth/auth.service.js
 *
 * All auth business logic. Controllers only call these functions and
 * translate results/errors to HTTP (Stage 2 section 3).
 *
 * Refresh token design (Stage 2 section 6):
 *   - Opaque random value, high-entropy (256 bits) — unlike a
 *     human-chosen password, it doesn't need bcrypt's slow, salted
 *     hash; a plain SHA-256 digest is the standard, correct approach
 *     for hashing an already-high-entropy secret for exact-match
 *     lookup, and is what lets findByTokenHash() work at all (bcrypt's
 *     per-call random salt makes exact-match lookup impossible).
 *   - Every refresh call ROTATES the token: the presented token is
 *     marked rotated, a new one is issued in the same `familyId`.
 *   - If a token that's already been rotated is presented again, that's
 *     reuse-detection evidence of token theft — the entire family is
 *     revoked immediately, forcing re-login on every device using it.
 */

const crypto = require('crypto');
const usersRepository = require('../users/users.repository');
const authRepository = require('./auth.repository');
const passwordSecurity = require('../../security/password');
const { signAccessToken } = require('../../security/jwt');
const config = require('../../config');
const { ApiError, ErrorCodes } = require('../../middleware/errorHandler');
const { ROLES } = require('../../security/rbac');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function refreshExpiryDate() {
  return new Date(Date.now() + config.jwt.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

async function issueTokenPair(user, { userAgent, familyId } = {}) {
  const accessToken = signAccessToken({ sub: String(user._id), role: user.role });

  const refreshTokenPlain = generateOpaqueToken();
  const resolvedFamilyId = familyId || crypto.randomUUID();

  await authRepository.createRefreshToken({
    userId: user._id,
    tokenHash: hashToken(refreshTokenPlain),
    familyId: resolvedFamilyId,
    userAgent,
    expiresAt: refreshExpiryDate(),
  });

  return { accessToken, refreshToken: refreshTokenPlain };
}

async function register({ email, password, fullName, role }) {
  const existing = await usersRepository.findByEmail(email);
  if (existing) {
    throw ApiError.conflict('An account with this email already exists.');
  }

  // Only farmer/agronomist/technician are self-registerable; admin/
  // super_admin accounts must be created out-of-band by an existing
  // admin (not implemented as a public route in this pass — see
  // Stage 3 completion report's scope note).
  const selfServiceRoles = [ROLES.FARMER, ROLES.AGRONOMIST, ROLES.TECHNICIAN];
  const resolvedRole = selfServiceRoles.includes(role) ? role : ROLES.FARMER;

  const passwordHash = await passwordSecurity.hash(password);

  // The findByEmail() check above is a pre-check, not a lock: it closes
  // the obvious case (a genuinely duplicate registration) with a clean
  // 409, but between that read and this write another request for the
  // SAME email can still land first — the database's unique index on
  // `email` is the actual source of truth, and Mongo reports that
  // violation as a raw driver error (code 11000), not an ApiError. Left
  // unhandled, that raw error falls through asyncHandler -> errorHandler
  // as a bare 500 ("Internal server error.", no `data`, no `code` a
  // client can branch on) instead of the 409 CONFLICT_DUPLICATE the rest
  // of this API's contract promises for "email already exists". Catch it
  // here and translate it, so a race on this constraint degrades to the
  // same clean, documented response as the pre-check case rather than an
  // opaque failure.
  let user;
  try {
    user = await usersRepository.create({ email, passwordHash, fullName, role: resolvedRole });
  } catch (err) {
    if (err && err.code === 11000) {
      throw ApiError.conflict('An account with this email already exists.');
    }
    throw err;
  }

  const tokens = await issueTokenPair(user);
  return { user: sanitizeUser(user), ...tokens };
}

async function login({ email, password, userAgent }) {
  const user = await usersRepository.findByEmail(email);

  // Deliberately identical error for "no such user" and "wrong
  // password" — do not leak which one it was (user enumeration).
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  const isValid = await passwordSecurity.verify(password, user.passwordHash);
  if (!isValid) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  const tokens = await issueTokenPair(user, { userAgent });
  return { user: sanitizeUser(user), ...tokens };
}

async function refresh({ refreshToken, userAgent }) {
  const tokenHash = hashToken(refreshToken);
  const record = await authRepository.findByTokenHash(tokenHash);

  if (!record) {
    throw new ApiError(401, 'Refresh token is invalid.', { code: ErrorCodes.AUTH_TOKEN_INVALID });
  }

  if (record.revokedAt || record.expiresAt < new Date()) {
    throw new ApiError(401, 'Refresh token has expired or been revoked.', {
      code: ErrorCodes.AUTH_TOKEN_EXPIRED,
    });
  }

  if (record.rotatedAt) {
    // Reuse of an already-rotated token: assume theft, kill the whole
    // family so every device on this session chain is forced to
    // re-authenticate.
    await authRepository.revokeFamily(record.familyId);
    throw new ApiError(401, 'Refresh token reuse detected. All sessions revoked.', {
      code: ErrorCodes.AUTH_REFRESH_REUSE_DETECTED,
    });
  }

  const user = await usersRepository.findById(record.userId);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Account is no longer active.');
  }

  await authRepository.markRotated(record._id);
  const tokens = await issueTokenPair(user, { userAgent, familyId: record.familyId });
  return { user: sanitizeUser(user), ...tokens };
}

async function logout({ refreshToken }) {
  const tokenHash = hashToken(refreshToken);
  const record = await authRepository.findByTokenHash(tokenHash);
  if (record && !record.revokedAt) {
    await authRepository.revokeFamily(record.familyId);
  }
}

async function logoutAll({ userId }) {
  await authRepository.revokeAllForUser(userId);
}

function sanitizeUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

module.exports = { register, login, refresh, logout, logoutAll };
