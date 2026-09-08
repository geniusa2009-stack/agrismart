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

function demoLog(message, meta = {}) {
  // Deliberately a separate, unmistakable console line (in addition to
  // the structured pino logger below) so a terminal demo audience sees
  // it immediately without needing to parse JSON log lines.
  // eslint-disable-next-line no-console
  console.log(`[DEMO] ${message}`);
  logger.info({ scope: 'demo', simulated: true, ...meta }, message);
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
async function simulateDeviceExecutesCommand(command, valveId, confirmedState) {
  await commandsService.acknowledge(String(command._id), DEMO_DEVICE_ID);
  demoLog(`Device ${DEMO_DEVICE_ID} acknowledged command ${command.type} (${command._id}).`, {
    commandId: String(command._id),
  });

  await commandsService.markExecuting(String(command._id), DEMO_DEVICE_ID);

  await commandsService.reportExecutionResult(String(command._id), DEMO_DEVICE_ID, {
    success: true,
    details: { simulated: true },
  });
  await irrigationService.confirmValveState(valveId, confirmedState);
  demoLog(`Valve confirmed ${confirmedState.toUpperCase()} (command ${command._id} completed).`, {
    commandId: String(command._id),
    confirmedState,
  });
}

async function runDemoSimulation() {
  if (config.isProduction) {
    throw new Error('Refusing to run the demo simulator with NODE_ENV=production.');
  }

  const { user, farm, valve } = await ensureDemoFarmDeviceValve();
  demoLog('Demo simulation starting. Every reading below is SIMULATED — no physical hardware is connected.');
  demoLog(`Login with: ${user.email} / DemoPassword123!  (farmId: ${farm._id})`);

  let moisture = 62;
  let temperature = 27;
  let irrigating = false;
  let sequenceNumber = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
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

    if (!irrigating && moisture < MOISTURE_LOW_THRESHOLD) {
      demoLog(`Irrigation decision: moisture ${moisture}% < ${MOISTURE_LOW_THRESHOLD}% threshold -> opening valve automatically.`);
      const { command } = await irrigationService.openValve({
        valve,
        requestedDurationSeconds: 300,
        userId: user.id,
        triggeredBy: 'automated',
      });
      demoLog(`Command created: ${command.type} (${command._id}) for ${DEMO_DEVICE_ID}.`, { commandId: String(command._id) });
      await simulateDeviceExecutesCommand(command, valve._id, 'open');
      irrigating = true;
    } else if (irrigating && moisture > MOISTURE_RECOVERED_THRESHOLD) {
      demoLog(`Irrigation decision: moisture recovered to ${moisture}% -> closing valve automatically.`);
      const { command } = await irrigationService.closeValve({ valve, userId: user.id });
      demoLog(`Command created: ${command.type} (${command._id}) for ${DEMO_DEVICE_ID}.`, { commandId: String(command._id) });
      await simulateDeviceExecutesCommand(command, valve._id, 'closed');
      irrigating = false;
    }

    await new Promise((resolve) => setTimeout(resolve, DEMO_TICK_MS));
  }
}

module.exports = { runDemoSimulation, DEMO_DEVICE_ID };
