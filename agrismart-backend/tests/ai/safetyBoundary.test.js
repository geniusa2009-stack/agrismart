'use strict';

/**
 * tests/ai/safetyBoundary.test.js
 *
 * Asserts the hard rule from ai/services/aiInsightService.js's own
 * doc-comment: it NEVER calls commandsService or
 * irrigationService.openValve/closeValve, and never mutates a Valve or
 * DeviceCommand. We prove this by mocking the actuation modules and
 * asserting they are never invoked, regardless of what the AI predicts.
 */

jest.mock('../../src/modules/commands/commands.service', () => ({
  issueCommand: jest.fn(),
  markSent: jest.fn(),
  acknowledge: jest.fn(),
  markExecuting: jest.fn(),
  reportExecutionResult: jest.fn(),
}));

const mockOpenValve = jest.fn();
const mockCloseValve = jest.fn();
jest.mock('../../src/modules/irrigation/irrigation.service', () => ({
  openValve: mockOpenValve,
  closeValve: mockCloseValve,
  emergencyStopFarm: jest.fn(),
  confirmValveState: jest.fn(),
  updateAutomationSettings: jest.fn(),
  evaluateAutomation: jest.fn(),
}));

jest.mock('../../src/modules/devices/devices.repository', () => ({ findByDeviceId: jest.fn().mockResolvedValue(null) }));
jest.mock('../../src/modules/devices/devices.service', () => ({ isOnline: jest.fn().mockReturnValue(false) }));
jest.mock('../../src/modules/irrigation/irrigation.repository', () => ({ getTodayUsageSeconds: jest.fn().mockResolvedValue(0) }));

const commandsService = require('../../src/modules/commands/commands.service');
const irrigationService = require('../../src/modules/irrigation/irrigation.service');

describe('AI safety boundary', () => {
  test('getInsightForValve never calls any actuation function, even for a high-probability recommendation', async () => {
    const { getInsightForValve } = require('../../ai/services/aiInsightService');

    // A telemetry history engineered to strongly imply "irrigation
    // needed soon" (steep decline). Whether or not a model artifact
    // exists in this test environment, the service must still never
    // touch actuation.
    const now = Date.now();
    const telemetryHistory = Array.from({ length: 30 }, (_, i) => ({
      recordedAt: new Date(now - (30 - i) * 15 * 60 * 1000),
      readings: { soilMoisturePercent: 60 - i * 1.5, temperatureCelsius: 35, soilSalinityPpt: 1.2 },
    }));

    const valve = { _id: 'valve-1', deviceId: 'device-1', autoOpenBelowPercent: 30 };
    await getInsightForValve(valve, telemetryHistory, []);

    expect(commandsService.issueCommand).not.toHaveBeenCalled();
    expect(irrigationService.openValve).not.toHaveBeenCalled();
    expect(irrigationService.closeValve).not.toHaveBeenCalled();
    expect(mockOpenValve).not.toHaveBeenCalled();
    expect(mockCloseValve).not.toHaveBeenCalled();
  });

  test('the aiInsightService module itself never imports commandsService or irrigationService', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../../ai/services/aiInsightService.js'), 'utf8');
    expect(source).not.toMatch(/require\(.*commands\.service/);
    expect(source).not.toMatch(/require\(.*irrigation\.service/);
  });
});
