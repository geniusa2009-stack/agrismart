'use strict';

/**
 * infrastructure/mqtt/ingestionGateway.js
 *
 * Transport-agnostic telemetry entry point (Stage 2 section 8). The
 * HTTP controller calls this today; a future MQTT subscriber (added
 * only once Stage C's device count justifies it — see
 * ARCHITECTURE_PLAN_STAGE2.md section 14) calls the exact same
 * function. Nothing downstream of `ingest()` knows or cares whether the
 * bytes arrived over HTTPS or MQTT — this file is the ONLY seam where
 * that would ever matter, and today it's a one-line passthrough.
 */

const telemetryService = require('../../modules/telemetry/telemetry.service');

/**
 * @param {string} deviceId
 * @param {object} payload
 * @param {{ transport: 'https'|'mqtt', farmId?: string, zoneId?: string|null }} [meta] -
 *   farmId/zoneId are passed straight through to telemetryService.ingest()
 *   unchanged — this file stays a one-line passthrough regardless of
 *   what meta carries (see telemetry.service.js for how they're used).
 */
async function ingest(deviceId, payload, meta = { transport: 'https' }) {
  return telemetryService.ingest(deviceId, payload, meta);
}

module.exports = { ingest };
