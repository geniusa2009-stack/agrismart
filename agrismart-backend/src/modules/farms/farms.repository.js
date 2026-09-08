'use strict';

/**
 * modules/farms/farms.repository.js
 *
 * Anti-IDOR design (Stage 2 section 6): `findByIdForPrincipal` takes
 * the requesting principal and folds the ownership check INTO the
 * database query itself (`ownerId: principal.id` unless staff), rather
 * than fetching-then-checking in application code. This means even a
 * missed authorization middleware check still can't leak another
 * farmer's data — the query simply returns nothing for a farm you
 * don't own.
 */

const Farm = require('./farm.model');
const { isAtLeast, ROLES } = require('../../security/rbac');

async function create({ name, ownerId, location }) {
  return Farm.create({ name, ownerId, location });
}

/**
 * @param {string} farmId
 * @param {{ id: string, role: string }} principal
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function findByIdForPrincipal(farmId, principal) {
  const query = { _id: farmId };
  if (!isAtLeast(principal.role, ROLES.ADMIN)) {
    query.ownerId = principal.id;
  }
  return Farm.findOne(query);
}

/**
 * Plain existence fetch, NO ownership filter — used exclusively by
 * middleware/authorizeFarmAccess.js, which does its own separate
 * authorization check (isPrincipalAuthorizedForFarm) after loading the
 * farm, rather than folding ownership into the query itself (see that
 * file's header comment for why this shape differs from
 * findByIdForPrincipal above).
 */
async function findByIdPlain(farmId) {
  return Farm.findById(farmId);
}

async function listForPrincipal(principal) {
  const query = isAtLeast(principal.role, ROLES.ADMIN) ? {} : { ownerId: principal.id };
  return Farm.find(query).sort({ createdAt: -1 });
}

/**
 * MVP CRUD: updates a farm already resolved+ownership-checked by the
 * caller (authorizeFarmOwnership attaches req.farm) — this trusts a
 * farmId that already went through that check, same convention as the
 * rest of this module's write paths.
 */
async function updateById(farmId, updates) {
  return Farm.findByIdAndUpdate(farmId, updates, { new: true });
}

async function deleteById(farmId) {
  return Farm.findByIdAndDelete(farmId);
}

module.exports = { create, findByIdForPrincipal, findByIdPlain, listForPrincipal, updateById, deleteById };
