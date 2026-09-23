'use strict';

const zonesRepository = require('./zones.repository');
const devicesRepository = require('../devices/devices.repository');
const irrigationRepository = require('../irrigation/irrigation.repository');
const { ApiError } = require('../../middleware/errorHandler');

async function createZone({ farmId, name, cropType, growthStage, soilType, plantingDate }) {
  return zonesRepository.create({ farmId, name, cropType, growthStage, soilType, plantingDate });
}

async function listZonesForFarm(farmId) {
  return zonesRepository.listByFarmId(farmId);
}

/**
 * `zone` is the already ownership-checked document attached by
 * loadZone middleware — never re-derives access (same convention as
 * farms.service.updateFarm).
 */
async function updateZone(zone, updates) {
  return zonesRepository.updateById(zone._id, updates);
}

/**
 * Conservative-by-default (same philosophy as farms.service.deleteFarm
 * and irrigation.service.js's safety rules): refuses to delete a zone
 * still referenced by a device or a valve, rather than silently
 * clearing those references. The caller must unassign every
 * device/valve from this zone first.
 */
async function deleteZone(zone) {
  const [deviceCount, valveCount] = await Promise.all([
    devicesRepository.countByZoneId(zone._id),
    irrigationRepository.countValvesByZoneId(zone._id),
  ]);
  if (deviceCount > 0 || valveCount > 0) {
    throw ApiError.conflict(
      `Cannot delete a zone still assigned to ${deviceCount} device(s) and ${valveCount} valve(s). Unassign them first.`
    );
  }
  await zonesRepository.deleteById(zone._id);
}

module.exports = { createZone, listZonesForFarm, updateZone, deleteZone };
