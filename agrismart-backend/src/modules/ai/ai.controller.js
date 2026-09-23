'use strict';

/**
 * modules/ai/ai.controller.js
 *
 * Thin HTTP wiring only — all real logic lives in ai/ (isolated from
 * core business logic per the AI workstream's mandate). This
 * controller never calls commandsService or irrigationService's
 * actuation methods; it only reads telemetry/irrigation history and
 * asks ai/services/aiInsightService.js for a recommendation.
 */

const irrigationRepository = require('../irrigation/irrigation.repository');
const devicesRepository = require('../devices/devices.repository');
const devicesService = require('../devices/devices.service');
const zonesRepository = require('../farms/zones.repository');
const farmsRepository = require('../farms/farms.repository');
const Telemetry = require('../telemetry/telemetry.model');
const { getInsightForValve } = require('../../../ai/services/aiInsightService');
const { getCopilotRecommendation, getChatResponse } = require('../../../ai/services/geminiCopilotService');
const { loadLatestModel, listModelVersions } = require('../../../ai/models/modelRegistry');
const { TARGET } = require('../../../ai/training/train');
const { asyncHandler, ApiError, ErrorCodes } = require('../../middleware/errorHandler');
const { predictSoilMoistureEstimate } = require('../../../ai/inference/predictTomatoSoilMoisture');
const { predictIrrigationEventLikelihood } = require('../../../ai/inference/predictIrrigationEventLikelihood');
const { predictArnesanoSoilMoisture24h } = require('../../../ai/inference/predictArnesanoSoilMoisture24h');

const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

const getStatus = asyncHandler(async (req, res) => {
  const record = loadLatestModel(TARGET);
  res.json({
    target: TARGET,
    modelAvailable: Boolean(record),
    modelVersion: record ? record.version : null,
    dataSource: record ? record.dataSource : null,
    status: record ? record.status : null,
    trainingTimestamp: record ? record.trainingTimestamp : null,
    trainingSampleCount: record ? record.trainingSampleCount : null,
  });
});

const getHealth = asyncHandler(async (req, res) => {
  const record = loadLatestModel(TARGET);
  res.json({ ok: true, modelLoaded: Boolean(record) });
});

const getModel = asyncHandler(async (req, res) => {
  const versions = listModelVersions(TARGET);
  const record = loadLatestModel(TARGET);
  res.json({ target: TARGET, latest: record, versions });
});

/**
 * GET /ai/recommendations/:valveId
 * `req.valve` is attached by the SAME ownership-checked loadValve
 * middleware the irrigation module already uses (authorizeFarmAccess +
 * ownership), so this endpoint carries identical access control to the
 * rest of the API — never a separate, weaker path.
 */
const getRecommendation = asyncHandler(async (req, res) => {
  const valve = req.valve;
  if (!valve) {
    throw new ApiError(404, 'Valve not found.', { code: ErrorCodes.NOT_FOUND });
  }

  const since = new Date(Date.now() - HISTORY_WINDOW_MS);
  const telemetryDocs = await Telemetry.find({ deviceId: valve.deviceId, recordedAt: { $gte: since } })
    .sort({ recordedAt: 1 })
    .lean();
  const telemetryHistory = telemetryDocs
    .filter((d) => d.readings && typeof d.readings.soilMoisturePercent === 'number')
    .map((d) => ({ recordedAt: new Date(d.recordedAt), readings: d.readings }));

  const irrigationEventDocs = await irrigationRepository.findRecentEventsForValve(valve._id, { limit: 200 });
  const irrigationHistory = irrigationEventDocs
    .filter((e) => e.startedAt && e.startedAt.getTime() >= since.getTime())
    .map((e) => ({
      startedAt: new Date(e.startedAt),
      endedAt: e.endedAt ? new Date(e.endedAt) : null,
      actualDurationSeconds: e.actualDurationSeconds,
      plannedDurationSeconds: e.plannedDurationSeconds,
    }))
    .sort((a, b) => a.startedAt - b.startedAt);

  const insight = await getInsightForValve(valve, telemetryHistory, irrigationHistory);
  res.json(insight);
});

/**
 * POST /ai/soil-moisture-estimate
 * Advisory-ONLY, research-grade endpoint for the tomato dataset's
 * soil-moisture regression model (ai/training/tomato/train.js). Unlike
 * getRecommendation above, this does NOT read from AgriSmart's own
 * telemetry/valve records and is not scoped to a farm/valve: the
 * model's inputs (soil NPK, pH, solar radiation, wind speed,
 * days-since-planting, crop growth stage) are NOT fields AgriSmart's
 * real IoT devices currently measure (see telemetry.model.js — only
 * soilMoisturePercent, soilSalinityPpt, temperatureCelsius exist).
 * The caller supplies a concurrent observation directly in the request
 * body. This keeps the endpoint honest about what it actually is: a
 * manual/what-if research tool, not an automatic per-device insight —
 * and, like every other AI endpoint, it never touches
 * commandsService/irrigationService actuation.
 */
const postSoilMoistureEstimate = asyncHandler(async (req, res) => {
  const result = predictSoilMoistureEstimate(req.body);
  res.json(result);
});

/**
 * GET /ai/irrigation-event-likelihood/:valveId
 * Advisory-ONLY endpoint for the 'irrigation_event_next_1h' model
 * trained on the real Evolving Tomato Cultivation Testbed dataset
 * (ai/training/evolvingTomato/train.js). Reuses the EXACT SAME
 * ownership-checked valve loading + telemetry/irrigation-history
 * query pattern as getRecommendation above (same middleware chain,
 * same HISTORY_WINDOW_MS), because this model's required features are
 * compatible with AgriSmart's real telemetry + irrigation-event log.
 * As documented in predictIrrigationEventLikelihood.js and
 * AI_MODEL_CARD.md, the current registered model did NOT pass this
 * project's validation criteria, so this endpoint will currently
 * report available:false with an explicit reason — it is wired now,
 * ready to serve automatically the moment (if ever) a future
 * retraining run produces a model that clears validation, without any
 * further controller/route changes.
 */
const getIrrigationEventLikelihood = asyncHandler(async (req, res) => {
  const valve = req.valve;
  if (!valve) {
    throw new ApiError(404, 'Valve not found.', { code: ErrorCodes.NOT_FOUND });
  }

  const since = new Date(Date.now() - HISTORY_WINDOW_MS);
  const telemetryDocs = await Telemetry.find({ deviceId: valve.deviceId, recordedAt: { $gte: since } })
    .sort({ recordedAt: 1 })
    .lean();
  const telemetryHistory = telemetryDocs
    .filter((d) => d.readings && typeof d.readings.soilMoisturePercent === 'number')
    .map((d) => ({ recordedAt: new Date(d.recordedAt), readings: d.readings }));

  const irrigationEventDocs = await irrigationRepository.findRecentEventsForValve(valve._id, { limit: 200 });
  const irrigationHistory = irrigationEventDocs
    .filter((e) => e.startedAt && e.startedAt.getTime() >= since.getTime())
    .map((e) => ({
      startedAt: new Date(e.startedAt),
      endedAt: e.endedAt ? new Date(e.endedAt) : null,
      actualDurationSeconds: e.actualDurationSeconds,
      plannedDurationSeconds: e.plannedDurationSeconds,
    }))
    .sort((a, b) => a.startedAt - b.startedAt);

  const result = predictIrrigationEventLikelihood({ telemetryHistory, irrigationHistory, asOf: new Date() });
  res.json(result);
});

/**
 * POST /ai/arnesano-soil-moisture-forecast
 * Advisory-ONLY, manual-input research endpoint for the
 * 'arnesano_soil_moisture_24h_forecast' model (real Arnesano
 * precision-irrigation dataset). Same "not AgriSmart's live telemetry
 * shape, caller supplies an observation" pattern as
 * postSoilMoistureEstimate above.
 */
const postArnesanoSoilMoistureForecast = asyncHandler(async (req, res) => {
  const result = predictArnesanoSoilMoisture24h(req.body);
  res.json(result);
});


/**
 * POST /ai/copilot/:valveId/analyze
 * Gemini-backed agricultural copilot ("مساعد AgriSmart الذكي" — see
 * ai/services/geminiCopilotService.js). Reuses the EXACT SAME
 * ownership-checked loadValve middleware as getRecommendation above,
 * so this carries identical access control to the rest of the AI
 * module — never a separate, weaker path. All context (zone, device
 * online/lastSeenAt, telemetry, irrigation history) is loaded
 * server-side from req.valve; the client never supplies farmId/zoneId.
 *
 * This handler never calls the commands module or the irrigation
 * module's actuation methods — it only reads, then hands read-only
 * context to geminiCopilotService, which itself carries the same hard
 * rule (see that module's doc-comment and
 * tests/ai/geminiCopilotSafetyBoundary.test.js).
 */
const postCopilotAnalyze = asyncHandler(async (req, res) => {
  const valve = req.valve;
  if (!valve) {
    throw new ApiError(404, 'Valve not found.', { code: ErrorCodes.NOT_FOUND });
  }

  const since = new Date(Date.now() - HISTORY_WINDOW_MS);
  const telemetryDocs = await Telemetry.find({ deviceId: valve.deviceId, recordedAt: { $gte: since } })
    .sort({ recordedAt: 1 })
    .lean();
  const telemetryHistory = telemetryDocs
    .filter((d) => d.readings && typeof d.readings.soilMoisturePercent === 'number')
    .map((d) => ({ recordedAt: new Date(d.recordedAt), readings: d.readings }));

  const irrigationEventDocs = await irrigationRepository.findRecentEventsForValve(valve._id, { limit: 200 });
  const irrigationHistory = irrigationEventDocs
    .filter((e) => e.startedAt && e.startedAt.getTime() >= since.getTime())
    .map((e) => ({
      startedAt: new Date(e.startedAt),
      endedAt: e.endedAt ? new Date(e.endedAt) : null,
      actualDurationSeconds: e.actualDurationSeconds,
      plannedDurationSeconds: e.plannedDurationSeconds,
      appliedWaterVolumeLiters: e.appliedWaterVolumeLiters,
    }))
    .sort((a, b) => a.startedAt - b.startedAt);

  const device = await devicesRepository.findByDeviceId(valve.deviceId);
  const deviceOnline = device ? devicesService.isOnline(device) : false;
  const zone = valve.zoneId ? await zonesRepository.findByIdPlain(valve.zoneId) : null;

  const result = await getCopilotRecommendation({
    valve,
    zone,
    telemetryHistory,
    irrigationHistory,
    deviceOnline,
    lastSeenAt: device ? device.lastSeenAt : null,
  });

  res.json(result);
});


/**
 * Shared by postChatMessage — loads bounded telemetry/irrigation
 * history for one device/valve. Same window/shape as
 * postCopilotAnalyze's own inline query (kept as a separate small
 * helper here rather than refactoring that already-tested handler, to
 * keep this pass's diff minimal and low-risk).
 */
async function loadHistoryForDevice(deviceId, valveId) {
  const since = new Date(Date.now() - HISTORY_WINDOW_MS);
  const telemetryDocs = await Telemetry.find({ deviceId, recordedAt: { $gte: since } })
    .sort({ recordedAt: 1 })
    .lean();
  const telemetryHistory = telemetryDocs
    .filter((d) => d.readings && typeof d.readings.soilMoisturePercent === 'number')
    .map((d) => ({ recordedAt: new Date(d.recordedAt), readings: d.readings }));

  let irrigationHistory = [];
  if (valveId) {
    const irrigationEventDocs = await irrigationRepository.findRecentEventsForValve(valveId, { limit: 200 });
    irrigationHistory = irrigationEventDocs
      .filter((e) => e.startedAt && e.startedAt.getTime() >= since.getTime())
      .map((e) => ({
        startedAt: new Date(e.startedAt),
        endedAt: e.endedAt ? new Date(e.endedAt) : null,
        actualDurationSeconds: e.actualDurationSeconds,
        plannedDurationSeconds: e.plannedDurationSeconds,
        appliedWaterVolumeLiters: e.appliedWaterVolumeLiters,
      }))
      .sort((a, b) => a.startedAt - b.startedAt);
  }
  return { telemetryHistory, irrigationHistory };
}

/**
 * POST /ai/chat
 * Global AI farm assistant ("مساعدك الزراعي" — see
 * ai/services/geminiCopilotService.js's getChatResponse). Never trusts
 * a client-supplied farmId/zoneId as authorization: farmId is resolved
 * against the authenticated user via the SAME anti-IDOR
 * farmsRepository.findByIdForPrincipal used by every other farm-scoped
 * route (404, not a leaked 403, on a miss); an optional zoneId is
 * resolved the same way via zonesRepository.findByIdForPrincipal AND
 * cross-checked against the resolved farm (mirrors
 * irrigation.service.assignValveZone's own cross-farm check) so a zone
 * the user owns on a DIFFERENT farm can never be attached to this
 * farm's context.
 *
 * This handler never calls the commands module or the irrigation
 * module's actuation methods — only reads, then hands read-only
 * context to geminiCopilotService, which carries the same hard rule
 * (see tests/ai/geminiCopilotSafetyBoundary.test.js).
 */
const postChatMessage = asyncHandler(async (req, res) => {
  const { message, farmId, zoneId, context, history } = req.body;

  const farm = await farmsRepository.findByIdForPrincipal(farmId, req.user);
  if (!farm) {
    throw new ApiError(404, 'Farm not found.', { code: ErrorCodes.NOT_FOUND });
  }

  let zone = null;
  if (zoneId) {
    zone = await zonesRepository.findByIdForPrincipal(zoneId, req.user);
    if (!zone || String(zone.farmId) !== String(farm._id)) {
      throw new ApiError(404, 'Zone not found.', { code: ErrorCodes.NOT_FOUND });
    }
  }

  // Pick a representative device/valve for context: prefer one in the
  // requested zone, otherwise the farm's first device/valve (same
  // "primary device" convention dashboard.service.js already uses).
  const devices = await devicesRepository.listByFarmId(farm._id);
  const device = (zoneId && devices.find((d) => d.zoneId && String(d.zoneId) === String(zoneId))) || devices[0] || null;

  const valves = await irrigationRepository.listValvesByFarmId(farm._id);
  const valve = device
    ? valves.find((v) => v.deviceId === device.deviceId) || valves[0] || null
    : valves[0] || null;

  const { telemetryHistory, irrigationHistory } = device ? await loadHistoryForDevice(device.deviceId, valve ? valve._id : null) : { telemetryHistory: [], irrigationHistory: [] };
  const deviceOnline = device ? devicesService.isOnline(device) : false;

  const result = await getChatResponse({
    message,
    context,
    locale: req.body.locale,
    history,
    valve: valve || { commandedState: 'unknown', confirmedState: 'unknown' },
    zone,
    telemetryHistory,
    irrigationHistory,
    deviceOnline,
    lastSeenAt: device ? device.lastSeenAt : null,
  });

  res.json(result);
});

module.exports = {
  getStatus,
  getHealth,
  getModel,
  getRecommendation,
  postSoilMoistureEstimate,
  getIrrigationEventLikelihood,
  postArnesanoSoilMoistureForecast,
  postCopilotAnalyze,
  postChatMessage,
};
