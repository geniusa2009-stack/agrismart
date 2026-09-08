'use strict';

const dashboardService = require('./dashboard.service');
const { asyncHandler } = require('../../middleware/errorHandler');

// req.farm attached by authorizeFarmOwnership on every route below.

const getFarmSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getFarmSummary(req.farm._id);
  res.status(200).json({ success: true, data: summary });
});

const listDevices = asyncHandler(async (req, res) => {
  const devices = await dashboardService.getDevicesForFarm(req.farm._id);
  res.status(200).json({ success: true, data: devices });
});

const listValves = asyncHandler(async (req, res) => {
  const valves = await dashboardService.getValvesForFarm(req.farm._id);
  res.status(200).json({ success: true, data: valves });
});

const listAlerts = asyncHandler(async (req, res) => {
  const alerts = await dashboardService.getAlertsForFarm(req.farm._id);
  res.status(200).json({ success: true, data: alerts });
});

const listFarmCommands = asyncHandler(async (req, res) => {
  const commands = await dashboardService.getCommandsForFarm(req.farm._id);
  res.status(200).json({ success: true, data: commands });
});

// req.targetDevice attached by authorizeDeviceFarmAccess.

const getDevice = asyncHandler(async (req, res) => {
  const detail = await dashboardService.getDeviceDetail(req.targetDevice);
  res.status(200).json({ success: true, data: detail });
});

const getDeviceTelemetry = asyncHandler(async (req, res) => {
  const history = await dashboardService.getTelemetryHistoryForDevice(
    req.targetDevice.deviceId,
    req.query.range
  );
  res.status(200).json({ success: true, data: history });
});

const getDeviceCommands = asyncHandler(async (req, res) => {
  const commands = await dashboardService.getCommandsForDevice(req.targetDevice.deviceId);
  res.status(200).json({ success: true, data: commands });
});

const acknowledgeAlert = asyncHandler(async (req, res) => {
  await dashboardService.acknowledgeAlert(req.farm._id, req.params.alertId, req.user.id);
  res.status(200).json({ success: true, data: { alertId: req.params.alertId, acknowledged: true } });
});

const unacknowledgeAlert = asyncHandler(async (req, res) => {
  await dashboardService.unacknowledgeAlert(req.farm._id, req.params.alertId);
  res.status(200).json({ success: true, data: { alertId: req.params.alertId, acknowledged: false } });
});

module.exports = {
  getFarmSummary,
  listDevices,
  listValves,
  listAlerts,
  listFarmCommands,
  getDevice,
  getDeviceTelemetry,
  getDeviceCommands,
  acknowledgeAlert,
  unacknowledgeAlert,
};
