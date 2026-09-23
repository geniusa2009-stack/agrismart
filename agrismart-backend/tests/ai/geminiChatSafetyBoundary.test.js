'use strict';

/**
 * tests/ai/geminiChatSafetyBoundary.test.js
 *
 * Mirrors tests/ai/geminiCopilotSafetyBoundary.test.js for the global
 * chat assistant: proves getChatResponse never calls commandsService
 * or irrigationService's actuation methods, even when the user
 * explicitly asks to open a valve / start irrigation and Gemini's
 * (mocked) reply sets intents.irrigationExecutionRequested = true.
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

describe('Gemini chat assistant safety boundary', () => {
  test('getChatResponse never calls any actuation function when the user asks to open the valve directly', async () => {
    const { getChatResponse } = require('../../ai/services/geminiCopilotService');
    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const generateContent = jest.fn().mockResolvedValue({
        text: JSON.stringify({
          status: 'available',
          answer: 'أقدر أساعدك تبدأ إجراء الري، لكن لازم تأكيد وتنفيذ الأمر من شاشة الري.',
          reasons: [],
          nextStep: 'افتح صفحة الري وأكّد فتح المحبس.',
          intents: { irrigationExecutionRequested: true, equipmentIntent: false, communityIntent: false },
          confidence: 'medium',
          limitations: [],
        }),
      });

      await getChatResponse(
        {
          message: 'افتح المحبس',
          context: 'irrigation',
          locale: 'ar-eg',
          valve: { commandedState: 'closed', confirmedState: 'closed' },
          zone: null,
          telemetryHistory: [{ recordedAt: new Date(), readings: { soilMoisturePercent: 10 } }],
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

  test('ai.controller.js\'s postChatMessage handler body never requires the commands module or the irrigation module\'s actuation service', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/modules/ai/ai.controller.js'), 'utf8');
    const startIdx = source.indexOf('const postChatMessage = asyncHandler(');
    const endIdx = source.indexOf('module.exports');
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    const fnBody = source.slice(startIdx, endIdx);
    expect(fnBody).not.toMatch(/commands\.service/);
    expect(fnBody).not.toMatch(/irrigation\.service/);
    expect(fnBody).not.toMatch(/openValve\(/);
    expect(fnBody).not.toMatch(/closeValve\(/);
  });
});
