'use strict';

/**
 * tests/ai/geminiCopilotSafetyBoundary.test.js
 *
 * Mirrors tests/ai/safetyBoundary.test.js for the Gemini copilot: proves
 * ai/services/geminiCopilotService.js never imports or calls
 * commandsService or irrigationService's actuation methods, by source
 * inspection AND by mocking those modules and asserting they are never
 * invoked, regardless of what Gemini "recommends" (including
 * irrigate_now with a suggestedDurationMinutes).
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

const commandsService = require('../../src/modules/commands/commands.service');
const irrigationService = require('../../src/modules/irrigation/irrigation.service');

describe('Gemini copilot safety boundary', () => {
  test('ai/services/geminiCopilotService.js source never requires commandsService or irrigationService', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../../ai/services/geminiCopilotService.js'), 'utf8');
    expect(source).not.toMatch(/require\(.*commands\.service/);
    expect(source).not.toMatch(/require\(.*irrigation\.service/);
  });

  test('getCopilotRecommendation never calls any actuation function, even for a high-urgency "irrigate_now" recommendation', async () => {
    const { getCopilotRecommendation } = require('../../ai/services/geminiCopilotService');

    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const generateContent = jest.fn().mockResolvedValue({
        text: JSON.stringify({
          status: 'available',
          decision: 'irrigate_now',
          title: 'الري مطلوب الآن',
          summary: 'الرطوبة منخفضة جدًا.',
          recommendation: 'ابدأ الري.',
          reasons: ['رطوبة منخفضة جدًا'],
          confidence: 'high',
          suggestedDurationMinutes: 20,
          limitations: [],
        }),
      });

      const valve = { commandedState: 'closed', confirmedState: 'closed' };
      await getCopilotRecommendation(
        {
          valve,
          zone: null,
          telemetryHistory: [{ recordedAt: new Date(), readings: { soilMoisturePercent: 8 } }],
          irrigationHistory: [],
          deviceOnline: true,
          lastSeenAt: new Date(),
        },
        { genAIClient: { models: { generateContent } } }
      );

      expect(commandsService.issueCommand).not.toHaveBeenCalled();
      expect(irrigationService.openValve).not.toHaveBeenCalled();
      expect(irrigationService.closeValve).not.toHaveBeenCalled();
      expect(mockOpenValve).not.toHaveBeenCalled();
      expect(mockCloseValve).not.toHaveBeenCalled();
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  test('ai.controller.js\'s postCopilotAnalyze handler never calls commandsService/irrigationService actuation either', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/modules/ai/ai.controller.js'), 'utf8');
    // The controller may legitimately import irrigation.repository (read-only
    // queries, same as getRecommendation already does) but never the
    // actuation-capable irrigation.service or commands.service.
    expect(source).not.toMatch(/require\(.*commands\.service/);
    expect(source).not.toMatch(/require\(['"]\.\.\/irrigation\/irrigation\.service['"]\)/);
  });
});
