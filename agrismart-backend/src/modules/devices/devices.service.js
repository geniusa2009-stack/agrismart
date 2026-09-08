'use strict';

/**
 * modules/devices/devices.service.js
 *
 * Device provisioning, credential rotation, suspension/revocation, and
 * derived health status. Business rules live here, not in the
 * repository or model (Stage 2 section 3).
 */

const crypto = require('crypto');
const devicesRepository = require('./devices.repository');
const { generateDeviceSecret, hashDeviceSecret, verifyDeviceSecret } = require('../../security/deviceAuth');
const { DEVICE_STATUS } = require('./device.model');
const config = require('../../config');
const { ApiError } = require('../../middleware/errorHandler');

/**
 * Provisions a new device. Returns the plaintext secret exactly once —
 * callers MUST surface it to the caller now; it can never be retrieved
 * again (Stage 2 section 7).
 */
async function provisionDevice({ farmId, name }) {
  const deviceId = `dev_${crypto.randomBytes(8).toString('hex')}`;
  const deviceSecret = generateDeviceSecret();
  const deviceSecretHash = await hashDeviceSecret(deviceSecret);

  const device = await devicesRepository.create({ deviceId, farmId, name, deviceSecretHash });

  return { device, deviceSecret };
}

/**
 * Verifies a device's presented credential. Used by
 * middleware/authenticateDevice.js. Suspended/revoked devices are
 * rejected regardless of a technically-correct secret (Stage 2 section
 * 7: "never assume backend sent command = device executed" applies
 * equally here — a suspended device must not be silently trusted).
 */
async function verifyDeviceCredential(deviceId, plainSecret) {
  const device = await devicesRepository.findByDeviceIdWithSecret(deviceId);
  if (!device) return null;

  const isValid = await verifyDeviceSecret(plainSecret, device.deviceSecretHash);
  if (!isValid) return null;

  if (device.status === DEVICE_STATUS.SUSPENDED || device.status === DEVICE_STATUS.REVOKED) {
    throw ApiError.forbidden(`Device is ${device.status}.`, { code: 'DEVICE_SUSPENDED' });
  }

  return device;
}

async function rotateSecret(deviceId) {
  const deviceSecret = generateDeviceSecret();
  const deviceSecretHash = await hashDeviceSecret(deviceSecret);
  const device = await devicesRepository.updateSecretHash(deviceId, deviceSecretHash);
  if (!device) throw ApiError.notFound('Device not found.');
  return { device, deviceSecret };
}

async function suspendDevice(deviceId) {
  const device = await devicesRepository.updateStatus(deviceId, DEVICE_STATUS.SUSPENDED);
  if (!device) throw ApiError.notFound('Device not found.');
  return device;
}

async function activateDevice(deviceId) {
  const device = await devicesRepository.updateStatus(deviceId, DEVICE_STATUS.ACTIVE);
  if (!device) throw ApiError.notFound('Device not found.');
  return device;
}

async function revokeDevice(deviceId) {
  const device = await devicesRepository.updateStatus(deviceId, DEVICE_STATUS.REVOKED);
  if (!device) throw ApiError.notFound('Device not found.');
  return device;
}

async function renameDevice(deviceId, name) {
  const device = await devicesRepository.updateName(deviceId, name);
  if (!device) throw ApiError.notFound('Device not found.');
  return device;
}

async function recordHeartbeat(deviceId, healthPayload) {
  return devicesRepository.recordHeartbeat(deviceId, healthPayload);
}

/**
 * Derives online/offline status from lastSeenAt vs. the configured
 * threshold — never trusted as a stored, potentially-stale field
 * (Stage 2 section 9).
 */
function isOnline(device) {
  if (!device.lastSeenAt) return false;
  const elapsedSeconds = (Date.now() - new Date(device.lastSeenAt).getTime()) / 1000;
  return elapsedSeconds <= config.device.offlineThresholdSeconds;
}

module.exports = {
  provisionDevice,
  verifyDeviceCredential,
  rotateSecret,
  suspendDevice,
  activateDevice,
  revokeDevice,
  renameDevice,
  recordHeartbeat,
  isOnline,
};
