'use strict';

/**
 * security/deviceAuth.js
 *
 * Device credential generation and verification. Devices are NOT users
 * (Stage 2 section 7) — they authenticate via a high-entropy secret
 * generated at provisioning time and returned exactly once, hashed with
 * the same bcrypt primitive as user passwords (no reason to invent a
 * second hashing scheme). Transport protection is TLS; this module
 * documents (in ARCHITECTURE_PLAN_STAGE2.md section 7) that HMAC
 * request-signing is the future hardening step once the device fleet's
 * size justifies the added complexity — not built now, for zero live
 * devices, per the "don't over-engineer" instruction.
 */

const crypto = require('crypto');
const password = require('./password');

/**
 * Generates a new high-entropy device secret. Returned to the caller
 * exactly once at provisioning/rotation time; only its hash is ever
 * persisted.
 * @returns {string}
 */
function generateDeviceSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * @param {string} plainSecret
 * @returns {Promise<string>}
 */
async function hashDeviceSecret(plainSecret) {
  return password.hash(plainSecret);
}

/**
 * @param {string} plainSecret
 * @param {string} hashedSecret
 * @returns {Promise<boolean>}
 */
async function verifyDeviceSecret(plainSecret, hashedSecret) {
  return password.verify(plainSecret, hashedSecret);
}

module.exports = { generateDeviceSecret, hashDeviceSecret, verifyDeviceSecret };
