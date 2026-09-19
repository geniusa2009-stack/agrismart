'use strict';

/**
 * middleware/rateLimiter.js
 *
 * Corrected rate-limiting architecture (Stage 1 findings B2/B5/B6 fix).
 *
 * Four limiter classes, each keyed by the MOST SPECIFIC VERIFIED
 * IDENTITY available — never blanket IP where a better identity exists
 * — so shared-NAT farmers and IPv6-delegated devices aren't unfairly
 * throttled together (ARCHITECTURE_PLAN_STAGE2.md section 5D):
 *
 *   - publicApiLimiter: normalized IP (no identity exists pre-auth)
 *   - authLimiter:       normalized IP + claimed account identifier
 *   - deviceIngestLimiter: authenticated deviceId (never IP)
 *   - commandLimiter:    (userId, deviceId) pair
 *
 * All four are built through one `createLimiter()` factory using the
 * library's default in-memory store — correct for a single instance
 * today; swapping to `rate-limit-redis` later (Stage C) is a one-line
 * change in this factory, not a rewrite of every call site.
 */

const rateLimit = require('express-rate-limit');
const net = require('net');
const config = require('../config');
const { ApiError, ErrorCodes } = require('./errorHandler');

/**
 * Normalizes an IP for rate-limit keying. IPv4 addresses are used
 * as-is. IPv6 addresses are masked to their first 4 hextets (/64, the
 * standard "one customer" delegation size) so a device rotating through
 * its own delegated range still shares one bucket instead of evading
 * the limiter by requesting a fresh address per request (Stage 1
 * finding B2 fix).
 * @param {string} ip
 * @returns {string}
 */
function normalizeIp(ip) {
  if (!ip) return 'unknown';
  if (net.isIPv4(ip)) return ip;

  if (net.isIPv6(ip)) {
    // Strip a possible IPv4-mapped prefix and take the first 4 groups.
    const expanded = ip.replace('::ffff:', '');
    const groups = expanded.split(':').filter(Boolean);
    return `${groups.slice(0, 4).join(':')}::/64`;
  }

  return ip;
}

function ipKey(req) {
  return normalizeIp(req.ip);
}

function authKey(req) {
  const identifier =
    (req.body && (req.body.email || req.body.phone)) || 'unknown-identifier';
  return `${ipKey(req)}:${String(identifier).toLowerCase()}`;
}

function deviceKey(req) {
  // Only ever called on routes that run AFTER authenticateDevice(), so
  // req.device is trusted, verified identity — never raw IP.
  return req.device ? `device:${req.device.deviceId}` : `ip:${ipKey(req)}`;
}

function commandKey(req) {
  const userId = req.user ? req.user.id : 'anonymous';
  const targetDeviceId = (req.body && req.body.deviceId) || (req.params && req.params.deviceId) || 'unknown';
  return `${userId}:${targetDeviceId}`;
}

/**
 * Community layer: keyed by the AUTHENTICATED user id only (never IP,
 * never anything from req.body) — every route these limiters guard
 * runs after `authenticate`, so req.user is always trusted, verified
 * identity by the time this key generator runs.
 */
function userKey(req) {
  return req.user ? `user:${req.user.id}` : `ip:${ipKey(req)}`;
}

function rateLimitExceededHandler(req, res, next) {
  next(
    new ApiError(429, 'Too many requests. Please slow down and try again shortly.', {
      code: ErrorCodes.RATE_LIMITED,
      details: {
        retryAfterSeconds: Math.ceil(
          (req.rateLimit && req.rateLimit.resetTime
            ? (req.rateLimit.resetTime.getTime() - Date.now()) / 1000
            : 60)
        ),
      },
    })
  );
}

/**
 * Factory so every limiter shares handler/header behavior and so the
 * backing store can be swapped in one place later.
 */
function createLimiter({ windowMs, max, keyGenerator }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitExceededHandler,
    // express-rate-limit v7 validates req.ip shape only inside its OWN
    // default key generator; supplying a custom one (as we do here)
    // bypasses that check, which is exactly why we run every custom key
    // generator through normalizeIp()/req.device/req.user rather than
    // trusting req.ip verbatim (Stage 1 finding B2).
  });
}

const publicApiLimiter = createLimiter({ ...config.rateLimit.api, keyGenerator: ipKey });
const authLimiter = createLimiter({ ...config.rateLimit.auth, keyGenerator: authKey });
const deviceIngestLimiter = createLimiter({ ...config.rateLimit.device, keyGenerator: deviceKey });
const commandLimiter = createLimiter({ ...config.rateLimit.command, keyGenerator: commandKey });

// Community layer additions (Overnight Community task, section 11):
// three tiers by abuse sensitivity, all userId-keyed.
//   - communityWriteLimiter: creating posts/equipment/services/listings
//     (content that persists and is visible to others).
//   - communityEngagementLimiter: comments/reactions/follows (higher
//     natural frequency, lower individual impact).
//   - communityReportLimiter: abuse reports — tight window, since a
//     report-spam campaign against a legitimate user/listing is itself
//     a form of abuse.
//   - transactionLimiter: rental/service requests and status-changing
//     actions on them — moderate, these are deliberate real-world
//     actions, not idle browsing.
const communityWriteLimiter = createLimiter({ ...config.rateLimit.communityWrite, keyGenerator: userKey });
const communityEngagementLimiter = createLimiter({ ...config.rateLimit.communityEngagement, keyGenerator: userKey });
const communityReportLimiter = createLimiter({ ...config.rateLimit.communityReport, keyGenerator: userKey });
const transactionLimiter = createLimiter({ ...config.rateLimit.transaction, keyGenerator: userKey });

module.exports = {
  publicApiLimiter,
  authLimiter,
  deviceIngestLimiter,
  commandLimiter,
  communityWriteLimiter,
  communityEngagementLimiter,
  communityReportLimiter,
  transactionLimiter,
  normalizeIp, // exported for unit testing
};
