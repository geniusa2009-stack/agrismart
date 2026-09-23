'use strict';

const ingestionGateway = require('../../infrastructure/mqtt/ingestionGateway');
const { asyncHandler } = require('../../middleware/errorHandler');

// req.device is set by authenticateDevice() — telemetry is always
// attributed to an authenticated device, never a claimed body field.
const ingest = asyncHandler(async (req, res) => {
  // farmId/zoneId come from the authenticated device document
  // (req.device — set by authenticateDevice()), never from req.body:
  // see telemetry.validators.js for why the ingest schema itself has
  // no such keys.
  const result = await ingestionGateway.ingest(req.device.deviceId, req.body, {
    transport: 'https',
    farmId: req.device.farmId,
    zoneId: req.device.zoneId,
  });
  res.status(200).json({ success: true, data: result });
});

module.exports = { ingest };
