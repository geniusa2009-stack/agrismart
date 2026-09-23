'use strict';

const devicesService = require('./devices.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const provision = asyncHandler(async (req, res) => {
  const { device, deviceSecret } = await devicesService.provisionDevice(req.body);
  // deviceSecret is returned here EXACTLY ONCE (Stage 2 section 7) —
  // no other endpoint can ever retrieve it again.
  res.status(201).json({
    success: true,
    data: {
      deviceId: device.deviceId,
      farmId: device.farmId,
      status: device.status,
      deviceSecret,
    },
  });
});

const rotateSecret = asyncHandler(async (req, res) => {
  const { device, deviceSecret } = await devicesService.rotateSecret(req.params.deviceId);
  res.status(200).json({
    success: true,
    data: { deviceId: device.deviceId, deviceSecret },
  });
});

const suspend = asyncHandler(async (req, res) => {
  const device = await devicesService.suspendDevice(req.params.deviceId);
  res.status(200).json({ success: true, data: { deviceId: device.deviceId, status: device.status } });
});

const activate = asyncHandler(async (req, res) => {
  const device = await devicesService.activateDevice(req.params.deviceId);
  res.status(200).json({ success: true, data: { deviceId: device.deviceId, status: device.status } });
});

const revoke = asyncHandler(async (req, res) => {
  const device = await devicesService.revokeDevice(req.params.deviceId);
  res.status(200).json({ success: true, data: { deviceId: device.deviceId, status: device.status } });
});

const rename = asyncHandler(async (req, res) => {
  const device = await devicesService.renameDevice(req.params.deviceId, req.body.name);
  res.status(200).json({ success: true, data: { deviceId: device.deviceId, name: device.name } });
});

const assignZone = asyncHandler(async (req, res) => {
  const device = await devicesService.assignZone(req.params.deviceId, req.body.zoneId);
  res.status(200).json({ success: true, data: { deviceId: device.deviceId, zoneId: device.zoneId } });
});

// Called by the device itself, post authenticateDevice() — req.device
// is already the verified device.
const heartbeat = asyncHandler(async (req, res) => {
  await devicesService.recordHeartbeat(req.device.deviceId, req.body);
  res.status(200).json({ success: true, data: { received: true } });
});

module.exports = { provision, rotateSecret, suspend, activate, revoke, rename, assignZone, heartbeat };
