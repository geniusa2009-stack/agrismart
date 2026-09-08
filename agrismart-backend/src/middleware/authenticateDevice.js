'use strict';

/**
 * middleware/authenticateDevice.js
 *
 * Verifies device credentials (X-Device-Id / X-Device-Key headers).
 * Devices are a wholly separate principal type from users (Stage 2
 * section 7) — this never touches JWTs or the user RBAC table.
 * Attaches `req.device` (the verified device document) on success.
 */

const devicesService = require('../modules/devices/devices.service');
const logger = require('../observability/logger');
const { ApiError, ErrorCodes } = require('./errorHandler');

async function authenticateDevice(req, res, next) {
  const deviceId = req.headers['x-device-id'];
  const deviceKey = req.headers['x-device-key'];

  if (!deviceId || !deviceKey) {
    return next(
      new ApiError(401, 'Device credentials are required.', { code: ErrorCodes.DEVICE_UNAUTHORIZED })
    );
  }

  try {
    const device = await devicesService.verifyDeviceCredential(String(deviceId), String(deviceKey));

    if (!device) {
      return next(
        new ApiError(401, 'Device credentials are invalid.', { code: ErrorCodes.DEVICE_UNAUTHORIZED })
      );
    }

    logger.info({ scope: 'auth', deviceId: device.deviceId }, 'Device authenticated.');
    req.device = device;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticateDevice;
