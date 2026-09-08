'use strict';

const farmsRepository = require('./farms.repository');
const devicesRepository = require('../devices/devices.repository');
const { ApiError } = require('../../middleware/errorHandler');

async function createFarm({ ownerId, name, location }) {
  return farmsRepository.create({ ownerId, name, location });
}

async function listFarms(principal) {
  return farmsRepository.listForPrincipal(principal);
}

/**
 * `farm` is the already ownership-checked document attached by
 * authorizeFarmOwnership (req.farm) — this never re-derives access.
 */
async function updateFarm(farm, updates) {
  return farmsRepository.updateById(farm._id, updates);
}

/**
 * Conservative-by-default (same philosophy as irrigation.service.js's
 * safety rules): refuses to delete a farm that still has devices
 * provisioned on it, rather than silently cascading a delete across
 * devices/valves/telemetry/commands. The caller must revoke/remove
 * every device first.
 */
async function deleteFarm(farm) {
  const devices = await devicesRepository.listByFarmId(farm._id);
  if (devices.length > 0) {
    throw ApiError.conflict(
      `Cannot delete a farm with ${devices.length} device(s) still provisioned on it. Revoke every device first.`
    );
  }
  await farmsRepository.deleteById(farm._id);
}

module.exports = { createFarm, listFarms, updateFarm, deleteFarm };
