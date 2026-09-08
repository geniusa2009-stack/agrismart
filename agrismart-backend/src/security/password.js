'use strict';

/**
 * security/password.js
 *
 * Pure password/secret hashing helpers. No database or HTTP access —
 * keeps this unit-testable with zero mocking (Stage 2 section 3 rule:
 * security/ is stateless).
 */

const bcrypt = require('bcrypt');
const config = require('../config');

/**
 * @param {string} plainText
 * @returns {Promise<string>}
 */
async function hash(plainText) {
  return bcrypt.hash(plainText, config.security.bcryptSaltRounds);
}

/**
 * @param {string} plainText
 * @param {string} hashedValue
 * @returns {Promise<boolean>}
 */
async function verify(plainText, hashedValue) {
  if (!hashedValue) return false;
  return bcrypt.compare(plainText, hashedValue);
}

module.exports = { hash, verify };
