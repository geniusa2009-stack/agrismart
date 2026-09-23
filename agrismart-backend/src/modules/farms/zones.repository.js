'use strict';

/**
 * modules/farms/zones.repository.js
 *
 * Same anti-IDOR shape as farms.repository.js: `findByIdForPrincipal`
 * folds the farm-ownership check into the query itself via a populated
 * `farmId.ownerId` match, so a missing/forgotten authorization
 * middleware check still can't leak another farmer's zone data.
 */

const Zone = require('./zone.model');
const Farm = require('./farm.model');
const { isAtLeast, ROLES } = require('../../security/rbac');

async function create({ farmId, name, cropType, growthStage, soilType, plantingDate }) {
  return Zone.create({ farmId, name, cropType, growthStage, soilType, plantingDate });
}

async function listByFarmId(farmId) {
  return Zone.find({ farmId }).sort({ createdAt: 1 });
}

/**
 * Plain existence fetch, no ownership filter — used by
 * irrigation.service.assignValveZone() / devices.service.assignZone(),
 * which each separately verify the zone's farmId matches the target
 * device/valve's own farmId (same "existence fetch + separate check"
 * shape as farms.repository.findByIdPlain / authorizeFarmAccess.js).
 */
async function findByIdPlain(zoneId) {
  return Zone.findById(zoneId);
}

async function findByIdForPrincipal(zoneId, principal) {
  const zone = await Zone.findById(zoneId);
  if (!zone) return null;
  if (isAtLeast(principal.role, ROLES.ADMIN)) return zone;
  const farm = await Farm.findById(zone.farmId);
  if (!farm) return null;
  if (String(farm.ownerId) === String(principal.id)) return zone;
  return null;
}

async function updateById(zoneId, updates) {
  return Zone.findByIdAndUpdate(zoneId, updates, { new: true });
}

async function deleteById(zoneId) {
  return Zone.findByIdAndDelete(zoneId);
}

module.exports = { create, listByFarmId, findByIdPlain, findByIdForPrincipal, updateById, deleteById };
