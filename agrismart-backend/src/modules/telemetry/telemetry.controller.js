'use strict';

const ingestionGateway = require('../../infrastructure/mqtt/ingestionGateway');
const { asyncHandler } = require('../../middleware/errorHandler');

// req.device is set by authenticateDevice() — telemetry is always
// attributed to an authenticated device, never a claimed body field.
const ingest = asyncHandler(async (req, res) => {
  const result = await ingestionGateway.ingest(req.device.deviceId, req.body, { transport: 'https' });
  res.status(200).json({ success: true, data: result });
});

module.exports = { ingest };
