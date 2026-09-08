'use strict';

/**
 * modules/telemetry/telemetry.service.js
 *
 * Idempotency -> normalization -> processing (Stage 2 section 8/9).
 * Called by telemetry.controller.js via infrastructure/mqtt/
 * ingestionGateway.js — never directly by a route, so a future MQTT
 * subscriber can call the exact same function.
 */

const telemetryRepository = require('./telemetry.repository');
const devicesRepository = require('../devices/devices.repository');
const irrigationService = require('../irrigation/irrigation.service');
const metrics = require('../../observability/metrics');
const logger = require('../../observability/logger');

const MAX_CLOCK_DRIFT_MS = 24 * 60 * 60 * 1000; // 24h — beyond this we flag, never trust

/**
 * @param {string} deviceId - already authenticated by authenticateDevice()
 * @param {{ messageId: string, sequenceNumber?: number, deviceReportedAt?: string, readings: object }} payload
 * @returns {Promise<{ stored: boolean, duplicate: boolean }>}
 */
async function ingest(deviceId, payload) {
  metrics.increment('telemetry_messages_received');

  const claimed = await telemetryRepository.claimIdempotencyKey(deviceId, payload.messageId);

  if (!claimed) {
    // Duplicate: per Stage 2 section 9, this is a successful no-op, not
    // an error — the device gets a normal success response so it
    // doesn't retry-loop, but nothing is written twice.
    metrics.increment('telemetry_duplicates');
    logger.info({ scope: 'telemetry', deviceId, messageId: payload.messageId }, 'Duplicate telemetry ignored.');
    return { stored: false, duplicate: true };
  }

  const recordedAt = new Date(); // server-authoritative

  let deviceReportedAt;
  if (payload.deviceReportedAt) {
    deviceReportedAt = new Date(payload.deviceReportedAt);
    const driftMs = Math.abs(recordedAt.getTime() - deviceReportedAt.getTime());
    if (driftMs > MAX_CLOCK_DRIFT_MS) {
      // Never trust the device clock for anything security-sensitive or
      // for ordering — just log it as a device-health signal.
      logger.warn(
        { scope: 'telemetry', deviceId, driftMs },
        'Device-reported timestamp differs from server receipt time beyond threshold.'
      );
    }
  }

  await telemetryRepository.insertReading({
    deviceId,
    messageId: payload.messageId,
    sequenceNumber: payload.sequenceNumber,
    recordedAt,
    deviceReportedAt,
    readings: payload.readings,
  });

  logger.info(
    { scope: 'telemetry', deviceId, readings: payload.readings },
    'Telemetry received.'
  );

  // lastSeen / device-health update — heartbeat-equivalent side effect
  // of any successful telemetry ingestion, not just the dedicated
  // heartbeat endpoint.
  await devicesRepository.recordHeartbeat(deviceId, {});

  // MVP "Automation Settings" feature: if this device drives a valve
  // with automation enabled, check the new reading against its
  // thresholds. Deliberately isolated in its own try/catch — a bug or
  // edge case in automation logic must NEVER cause telemetry ingestion
  // itself to fail and make the device retry-loop.
  try {
    await irrigationService.evaluateAutomation(deviceId, payload.readings);
  } catch (err) {
    logger.error({ scope: 'irrigation', deviceId, err }, 'Automation evaluation failed after telemetry ingestion.');
  }

  return { stored: true, duplicate: false };
}

module.exports = { ingest };
