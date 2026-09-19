'use strict';

/**
 * scripts/demoSimulator.js
 *
 * DEMO / SIMULATION MODE ONLY. Never run in production (guarded below).
 *
 * This is NOT a fake data layer bolted onto the frontend — it drives
 * the exact same backend service functions that a real HTTPS device
 * ingest / real irrigation decision / real command dispatch would use
 * (telemetry.service.ingest, irrigation.service.openValve/closeValve,
 * commands.service.acknowledge/reportExecutionResult). The ONLY thing
 * simulated is the sensor itself — everything downstream of "a reading
 * arrived" is the real, unmodified backend logic.
 *
 * Every log line below is prefixed "[DEMO]" specifically so it can
 * never be mistaken for real hardware telemetry in a terminal or log
 * aggregator. Simulated readings are also tagged in Mongo
 * (payload.simulated = true is NOT added to the real Telemetry schema
 * — instead the demo device's own deviceId, e.g. "sim-esp32-001",
 * makes simulated data trivially distinguishable from real fleet data
 * without touching the production schema).
 *
 * Usage: npm run demo   (see package.json — boots an ephemeral
 * in-memory MongoDB via mongodb-memory-server, then this script, so
 * the demo never touches a real database.)
 */

const config = require('../src/config');
const logger = require('../src/observability/logger');

const User = require('../src/modules/users/user.model');
const { hash } = require('../src/security/password');
const farmsService = require('../src/modules/farms/farms.service');
const devicesService = require('../src/modules/devices/devices.service');
const devicesRepository = require('../src/modules/devices/devices.repository');
const irrigationService = require('../src/modules/irrigation/irrigation.service');
const irrigationRepository = require('../src/modules/irrigation/irrigation.repository');
const telemetryService = require('../src/modules/telemetry/telemetry.service');
const commandsService = require('../src/modules/commands/commands.service');
const { ROLES } = require('../src/security/rbac');

const DEMO_DEVICE_ID = 'sim-esp32-001';
const DEMO_TICK_MS = 4000;
const MOISTURE_LOW_THRESHOLD = 30;
const MOISTURE_RECOVERED_THRESHOLD = 55;

// Presentation-friendly safety bounds: a normal demo run is now FINITE
// — it intentionally completes approximately ONE full irrigation cycle
// (measure -> low moisture -> decide -> open -> ack -> execute ->
// recovery -> close -> ack -> execute) and then stops on its own,
// rather than looping forever. Configurable via env vars so a
// presenter can widen them if needed; defaults are generous enough
// that a normal run completes in well under the max (moisture starts
// at 62%, drifts down ~1.75%/tick on average while not irrigating,
// crosses the 30% threshold, then recovers ~4%/tick on average while
// irrigating past the 55% threshold — a full cycle typically finishes
// in ~20-30 ticks / 80-120s at the default 4s tick interval).
function positiveIntFromEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

const DEMO_MAX_TICKS = positiveIntFromEnv('DEMO_MAX_TICKS', 60);
const DEMO_MAX_DURATION_SECONDS = positiveIntFromEnv('DEMO_MAX_DURATION_SECONDS', 240);

function demoLog(message, meta = {}) {
  // Deliberately a separate, unmistakable console line (in addition to
  // the structured pino logger below) so a terminal demo audience sees
  // it immediately without needing to parse JSON log lines.
  // eslint-disable-next-line no-console
  console.log(`[DEMO] ${message}`);
  logger.info({ scope: 'demo', simulated: true, ...meta }, message);
}

// Numbered presentation milestones (requirement: clear [DEMO] N. ...
// lines an audience can follow). Printed via demoLog so they get the
// same "[DEMO] " prefix and structured log line as everything else —
// this is a narration layer on top of the real service calls below,
// not a replacement for them.
function milestone(n, message, meta = {}) {
  demoLog(`${n}. ${message}`, { milestone: n, ...meta });
}

async function ensureDemoFarmDeviceValve() {
  const email = 'demo-farmer@agrismart.local';
  let user = await User.findOne({ email });
  if (!user) {
    const passwordHash = await hash('DemoPassword123!');
    user = await User.create({ email, passwordHash, fullName: 'Demo Farmer', role: ROLES.FARMER });
    demoLog(`Created demo account (${email} / DemoPassword123!) for the presentation login.`);
  }

  let farm = (await farmsService.listFarms(user))[0];
  if (!farm) {
    farm = await farmsService.createFarm({ ownerId: user.id, name: 'Green Valley Farm' });
    demoLog(`Created demo farm "${farm.name}" (${farm._id}).`);
  }

  let device = await devicesRepository.findByDeviceId(DEMO_DEVICE_ID);
  if (!device) {
    const { hashDeviceSecret } = require('../src/security/deviceAuth');
    device = await devicesRepository.create({
      deviceId: DEMO_DEVICE_ID,
      farmId: farm._id,
      name: 'ESP32-A001',
      deviceSecretHash: await hashDeviceSecret('demo-secret-not-for-real-devices'),
    });
    device = await devicesService.activateDevice(DEMO_DEVICE_ID);
    demoLog(`Provisioned demo device "${device.name}" (${device.deviceId}) on ${farm.name}.`);
  }

  let [valve] = await irrigationRepository.listValvesByFarmId(farm._id);
  if (!valve) {
    valve = await irrigationService.createValve({ farmId: farm._id, deviceId: device.deviceId, name: 'Zone A Valve' });
    demoLog(`Created demo valve "${valve.name}" (${valve._id}).`);
  }

  return { user, farm, device, valve };
}

function nextMoisture(current, irrigating) {
  const drift = irrigating ? Math.random() * 4 + 2 : -(Math.random() * 2.5 + 0.5);
  const next = current + drift;
  return Math.max(5, Math.min(95, Math.round(next * 10) / 10));
}

/**
 * Simulates the device acknowledging + executing a command — the exact
 * lifecycle a real ESP32 would drive by calling POST /commands/:id/ack
 * and POST /commands/:id/result. Here we call the same service
 * functions directly (this IS the demo device's "transport").
 */
async function simulateDeviceExecutesCommand(command, valveId, confirmedState, ackMilestone, valveMilestone) {
  // issueCommand() (irrigation.service.js -> commands.service.js) only
  // takes the command as far as QUEUED ("accepted into the outbound
  // queue"). In a full deployment, a separate dispatch step pushes it
  // over the transport (HTTP long-poll response / MQTT publish) and
  // marks it SENT — commandsService.markSent() is exactly that step
  // (see commands.service.js, already implemented/tested, unmodified
  // here). acknowledge() only accepts a command that is currently SENT,
  // so the simulated device must dispatch-then-acknowledge, the same as
  // the real state machine requires of any real device.
  await commandsService.markSent(String(command._id));
  demoLog(`Command ${command.type} (${command._id}) dispatched to ${DEMO_DEVICE_ID}.`, {
    commandId: String(command._id),
  });

  await commandsService.acknowledge(String(command._id), DEMO_DEVICE_ID);
  milestone(ackMilestone, `Command acknowledged (${command.type}, ${command._id}).`, {
    commandId: String(command._id),
  });

  await commandsService.markExecuting(String(command._id), DEMO_DEVICE_ID);

  await commandsService.reportExecutionResult(String(command._id), DEMO_DEVICE_ID, {
    success: true,
    details: { simulated: true },
  });
  await irrigationService.confirmValveState(valveId, confirmedState);
  milestone(valveMilestone, `Valve confirmed ${confirmedState.toUpperCase()} (command ${command._id} completed).`, {
    commandId: String(command._id),
    confirmedState,
  });
}

/**
 * Runs the bounded demo simulation and returns a result describing
 * whether ONE full irrigation cycle (open -> close) completed within
 * the configured tick/duration limits. Never loops forever: this
 * function always returns (never throws for a "didn't finish in time"
 * outcome — that is reported as a normal FAIL result, not an
 * exception), so the caller (scripts/startDemo.js) can always reach
 * its own cleanup step (close HTTP server, disconnect MongoDB, exit).
 *
 * @returns {Promise<{ passed: boolean, reason: string|null, ticks: number, elapsedSeconds: number }>}
 */
async function runDemoSimulation() {
  if (config.isProduction) {
    throw new Error('Refusing to run the demo simulator with NODE_ENV=production.');
  }

  const { user, farm, valve } = await ensureDemoFarmDeviceValve();
  demoLog('Demo simulation starting. Every reading below is SIMULATED — no physical hardware is connected.');
  demoLog(`Login with: ${user.email} / DemoPassword123!  (farmId: ${farm._id})`);
  demoLog(
    `Bounded run: will stop after ~1 full irrigation cycle, or after ${DEMO_MAX_TICKS} ticks / ${DEMO_MAX_DURATION_SECONDS}s, whichever comes first.`
  );

  let moisture = 62;
  let temperature = 27;
  let irrigating = false;
  let sequenceNumber = 0;
  let openedOnce = false;
  let closedOnce = false;
  let telemetryMilestoneShown = false;

  const startedAt = Date.now();
  const elapsedSeconds = () => (Date.now() - startedAt) / 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (sequenceNumber >= DEMO_MAX_TICKS) {
      const reason = `Reached DEMO_MAX_TICKS (${DEMO_MAX_TICKS}) before completing a full open->close irrigation cycle.`;
      demoLog(`DEMO FAILED: ${reason}`);
      return { passed: false, reason, ticks: sequenceNumber, elapsedSeconds: elapsedSeconds() };
    }
    if (elapsedSeconds() >= DEMO_MAX_DURATION_SECONDS) {
      const reason = `Reached DEMO_MAX_DURATION_SECONDS (${DEMO_MAX_DURATION_SECONDS}) before completing a full open->close irrigation cycle.`;
      demoLog(`DEMO FAILED: ${reason}`);
      return { passed: false, reason, ticks: sequenceNumber, elapsedSeconds: elapsedSeconds() };
    }

    sequenceNumber += 1;
    moisture = nextMoisture(moisture, irrigating);
    temperature = Math.round((temperature + (Math.random() - 0.5) * 0.6) * 10) / 10;
    const soilSalinityPpt = Math.round((1.1 + Math.random() * 0.3) * 100) / 100;

    await telemetryService.ingest(DEMO_DEVICE_ID, {
      messageId: `demo-${Date.now()}-${sequenceNumber}`,
      sequenceNumber,
      readings: { soilMoisturePercent: moisture, temperatureCelsius: temperature, soilSalinityPpt },
    });
    demoLog(
      `Telemetry received from ${DEMO_DEVICE_ID}: moisture=${moisture}% temp=${temperature}°C salinity=${soilSalinityPpt}dS/m`,
      { deviceId: DEMO_DEVICE_ID, moisture, temperature, soilSalinityPpt }
    );
    if (!telemetryMilestoneShown) {
      milestone(1, 'Telemetry received.', { deviceId: DEMO_DEVICE_ID });
      telemetryMilestoneShown = true;
    }

    if (!irrigating && !openedOnce && moisture < MOISTURE_LOW_THRESHOLD) {
      milestone(2, `Moisture below threshold (${moisture}% < ${MOISTURE_LOW_THRESHOLD}%).`);
      demoLog(`Irrigation decision: moisture ${moisture}% < ${MOISTURE_LOW_THRESHOLD}% threshold -> opening valve automatically.`);
      milestone(3, 'Irrigation decision created (open).');
      const { command } = await irrigationService.openValve({
        valve,
        requestedDurationSeconds: 300,
        userId: user.id,
        triggeredBy: 'automated',
      });
      milestone(4, `OPEN command created (${command._id}).`, { commandId: String(command._id) });
      await simulateDeviceExecutesCommand(command, valve._id, 'open', 5, 6);
      irrigating = true;
      openedOnce = true;
    } else if (irrigating && openedOnce && !closedOnce && moisture > MOISTURE_RECOVERED_THRESHOLD) {
      milestone(7, `Moisture recovered (${moisture}% > ${MOISTURE_RECOVERED_THRESHOLD}%).`);
      demoLog(`Irrigation decision: moisture recovered to ${moisture}% -> closing valve automatically.`);
      const { command } = await irrigationService.closeValve({ valve, userId: user.id });
      milestone(8, `CLOSE command created (${command._id}).`, { commandId: String(command._id) });
      await simulateDeviceExecutesCommand(command, valve._id, 'closed', 9, 10);
      irrigating = false;
      closedOnce = true;
    }

    if (openedOnce && closedOnce) {
      const summary = `${sequenceNumber} ticks, ${elapsedSeconds().toFixed(1)}s elapsed.`;
      demoLog(`DEMO PASS — one full irrigation cycle completed (${summary})`);
      return { passed: true, reason: null, ticks: sequenceNumber, elapsedSeconds: elapsedSeconds() };
    }

    await new Promise((resolve) => setTimeout(resolve, DEMO_TICK_MS));
  }
}

module.exports = { runDemoSimulation, DEMO_DEVICE_ID, DEMO_MAX_TICKS, DEMO_MAX_DURATION_SECONDS };
