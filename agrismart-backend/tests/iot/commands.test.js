'use strict';

const request = require('supertest');
const createApp = require('../../src/app');
const commandsService = require('../../src/modules/commands/commands.service');
const DeviceCommand = require('../../src/modules/commands/deviceCommand.model');

const app = createApp();

async function setupFarmDeviceValve() {
  const email = `tech-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const registerRes = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'CorrectHorseBattery1',
    fullName: 'Technician',
    role: 'technician',
  });
  const accessToken = registerRes.body.data.accessToken;

  const farmRes = await request(app)
    .post('/api/v1/farms')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Commands Test Farm' });
  const farmId = farmRes.body.data._id;

  const deviceRes = await request(app)
    .post('/api/v1/devices')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ farmId, name: 'Valve Controller' });

  const valveRes = await request(app)
    .post(`/api/v1/irrigation/farms/${farmId}/valves`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ deviceId: deviceRes.body.data.deviceId, name: 'Main Valve' });

  return {
    accessToken,
    farmId,
    deviceId: deviceRes.body.data.deviceId,
    deviceSecret: deviceRes.body.data.deviceSecret,
    valveId: valveRes.body.data._id,
  };
}

describe('Device command lifecycle', () => {
  test('a command starts QUEUED, never assumed completed just by being issued', async () => {
    const { accessToken, valveId } = await setupFarmDeviceValve();
    const openRes = await request(app)
      .post(`/api/v1/irrigation/valves/${valveId}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 60 });

    expect(openRes.body.data.command.status).toBe('queued');
  });

  test('device ACK proves transport delivery only, and the device can then report execution result', async () => {
    const { accessToken, deviceId, deviceSecret, valveId } = await setupFarmDeviceValve();
    const openRes = await request(app)
      .post(`/api/v1/irrigation/valves/${valveId}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 60 });
    const commandId = openRes.body.data.command._id;

    // Command must be SENT before it can be ACKed (state machine) —
    // move it there directly via the service the way a dispatch step
    // would in a full implementation.
    await commandsService.markSent(commandId);

    const ackRes = await request(app)
      .post(`/api/v1/commands/${commandId}/ack`)
      .set('X-Device-Id', deviceId)
      .set('X-Device-Key', deviceSecret)
      .send();
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.data.status).toBe('acknowledged');

    // ACK alone must NOT be treated as "executed" — status is
    // acknowledged, not completed.
    const midway = await DeviceCommand.findById(commandId);
    expect(midway.status).toBe('acknowledged');

    const resultRes = await request(app)
      .post(`/api/v1/commands/${commandId}/result`)
      .set('X-Device-Id', deviceId)
      .set('X-Device-Key', deviceSecret)
      .send({ success: true, details: { note: 'valve opened physically' }, valveId, confirmedValveState: 'open' });

    expect(resultRes.status).toBe(200);
    expect(resultRes.body.data.status).toBe('completed');

    const Valve = require('../../src/modules/irrigation/valve.model');
    const valve = await Valve.findById(valveId);
    expect(valve.confirmedState).toBe('open');
  });

  test('an invalid state transition (ACK before SENT) is rejected', async () => {
    const { accessToken, deviceId, deviceSecret, valveId } = await setupFarmDeviceValve();
    const openRes = await request(app)
      .post(`/api/v1/irrigation/valves/${valveId}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 60 });
    const commandId = openRes.body.data.command._id;

    // Command is QUEUED, not SENT — ACK should be rejected.
    const ackRes = await request(app)
      .post(`/api/v1/commands/${commandId}/ack`)
      .set('X-Device-Id', deviceId)
      .set('X-Device-Key', deviceSecret)
      .send();

    expect(ackRes.status).toBe(400);
  });

  test('a DIFFERENT device cannot acknowledge or report results for a command it does not own (Stage 3 self-review fix)', async () => {
    const owner = await setupFarmDeviceValve();
    const openRes = await request(app)
      .post(`/api/v1/irrigation/valves/${owner.valveId}/open`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ requestedDurationSeconds: 60 });
    const commandId = openRes.body.data.command._id;
    await commandsService.markSent(commandId);

    // A second, entirely unrelated device authenticates and tries to
    // acknowledge the first device's command by guessing its id.
    const intruder = await setupFarmDeviceValve();

    const ackRes = await request(app)
      .post(`/api/v1/commands/${commandId}/ack`)
      .set('X-Device-Id', intruder.deviceId)
      .set('X-Device-Key', intruder.deviceSecret)
      .send();
    expect(ackRes.status).toBe(404);

    const resultRes = await request(app)
      .post(`/api/v1/commands/${commandId}/result`)
      .set('X-Device-Id', intruder.deviceId)
      .set('X-Device-Key', intruder.deviceSecret)
      .send({ success: true });
    expect(resultRes.status).toBe(404);

    // The command must be untouched by the intruder's attempt.
    const command = await DeviceCommand.findById(commandId);
    expect(command.status).toBe('sent');
  });

  test('timeout sweep expires a stale non-terminal command', async () => {
    const { accessToken, valveId } = await setupFarmDeviceValve();
    const openRes = await request(app)
      .post(`/api/v1/irrigation/valves/${valveId}/open`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestedDurationSeconds: 60 });
    const commandId = openRes.body.data.command._id;

    // Force it into the past to simulate a real timeout.
    await DeviceCommand.findByIdAndUpdate(commandId, { expiresAt: new Date(Date.now() - 1000) });

    const expiredCount = await commandsService.sweepExpiredCommands();
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const command = await DeviceCommand.findById(commandId);
    expect(command.status).toBe('expired');
  });
});
