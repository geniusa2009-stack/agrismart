'use strict';

/**
 * ai/services/aiInsightService.js
 *
 * The ONLY surface the existing backend should call. Combines the AI
 * prediction with the SAME real, unmodified safety/business data the
 * rule engine already uses (irrigation.repository.getTodayUsageSeconds,
 * device online status, valve thresholds) to produce one explainable
 * recommendation object.
 *
 * HARD RULE: this module never calls commandsService, never calls
 * irrigationService.openValve/closeValve, and never mutates any Valve
 * or DeviceCommand document. It is read-only with respect to
 * actuation. tests/ai/safetyBoundary.test.js asserts this by mocking
 * those services and proving they are never invoked.
 */

const { predict } = require('../inference/predict');
const devicesRepository = require('../../src/modules/devices/devices.repository');
const devicesService = require('../../src/modules/devices/devices.service');
const irrigationRepository = require('../../src/modules/irrigation/irrigation.repository');
const config = require('../../src/config');

/**
 * @param {object} valve - a Valve document/lean object
 * @param {Array} telemetryHistory - ascending by recordedAt
 * @param {Array} irrigationHistory - ascending by startedAt
 */
async function getInsightForValve(valve, telemetryHistory, irrigationHistory) {
  const prediction = predict({ telemetryHistory, irrigationHistory });

  if (!prediction.available) {
    return {
      ...prediction,
      recommendation: 'insufficient_data',
      safety: null,
      explanation: ['AI insight unavailable — collecting more data.'],
    };
  }

  // Cross-check against the SAME safety facts the real rule engine
  // uses, so a recommendation is never presented without the context
  // that would actually gate an action.
  const device = await devicesRepository.findByDeviceId(valve.deviceId);
  const deviceOnline = device ? devicesService.isOnline(device) : false;
  const usedTodaySeconds = await irrigationRepository.getTodayUsageSeconds(valve._id);
  const dailyAllowanceRemaining = Math.max(0, config.irrigation.dailyAllowanceSeconds - usedTodaySeconds);

  const safety = {
    deviceOnline,
    dailyAllowanceRemainingSeconds: dailyAllowanceRemaining,
    dailyAllowanceExhausted: dailyAllowanceRemaining <= 0,
  };

  let recommendation = prediction.recommendation;
  const explanation = [...prediction.explanation];
  if (recommendation === 'recommend_irrigation') {
    if (!deviceOnline) {
      explanation.push('Device has not reported recently — a command could not be confirmed if issued right now.');
    }
    if (safety.dailyAllowanceExhausted) {
      explanation.push("Today's irrigation allowance for this valve is already used — the rule engine would reject an open command.");
    }
  }

  return { ...prediction, recommendation, safety, explanation };
}

module.exports = { getInsightForValve };
