'use strict';

/**
 * tests/ai/geminiCopilotService.test.js
 *
 * Covers ai/services/geminiCopilotService.js: honest insufficient_data
 * / unavailable / error paths, context building (no fabricated
 * values), structured-output schema validation, and — separately, in
 * geminiCopilotSafetyBoundary.test.js — the hard safety rule that this
 * module never touches actuation.
 */

const { buildFarmContext, getCopilotRecommendation, CopilotResponseSchema, DEFAULT_MODEL } = require('../../ai/services/geminiCopilotService');

describe('geminiCopilotService.buildFarmContext', () => {
  test('never fabricates a value: absent optional readings stay null, not guessed', () => {
    const recordedAt = new Date('2026-01-01T00:00:00.000Z');
    const context = buildFarmContext({
      valve: { commandedState: 'closed', confirmedState: 'closed' },
      zone: null,
      telemetryHistory: [{ recordedAt, readings: { soilMoisturePercent: 40 } }],
      irrigationHistory: [],
      deviceOnline: false,
      lastSeenAt: null,
    });

    expect(context.recentReadings).toHaveLength(1);
    expect(context.recentReadings[0].soilMoisturePercent).toBe(40);
    expect(context.recentReadings[0].soilSalinityPpt).toBeNull();
    expect(context.recentReadings[0].soilEcMicrosiemensPerCm).toBeNull();
    expect(context.zone).toBeNull();
    expect(context.device.online).toBe(false);
  });

  test('passes through zone crop/growth-stage/soil context when present', () => {
    const context = buildFarmContext({
      valve: { commandedState: 'open', confirmedState: 'open' },
      zone: { cropType: 'tomato', growthStage: 'flowering', soilType: 'clay' },
      telemetryHistory: [],
      irrigationHistory: [],
      deviceOnline: true,
      lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(context.zone).toEqual({ cropType: 'tomato', growthStage: 'flowering', soilType: 'clay' });
  });

  test('caps recent readings/events to the last 20/10 (bounded context, not the whole history)', () => {
    const now = Date.now();
    const telemetryHistory = Array.from({ length: 30 }, (_, i) => ({
      recordedAt: new Date(now - (30 - i) * 60 * 1000),
      readings: { soilMoisturePercent: 40 },
    }));
    const irrigationHistory = Array.from({ length: 15 }, (_, i) => ({
      startedAt: new Date(now - (15 - i) * 3600 * 1000),
      plannedDurationSeconds: 300,
    }));
    const context = buildFarmContext({
      valve: { commandedState: 'closed', confirmedState: 'closed' },
      telemetryHistory,
      irrigationHistory,
    });
    expect(context.recentReadings).toHaveLength(20);
    expect(context.recentIrrigation).toHaveLength(10);
  });
});

describe('geminiCopilotService.getCopilotRecommendation — honest non-fabricated states', () => {
  const baseParams = {
    valve: { commandedState: 'closed', confirmedState: 'closed' },
    zone: null,
    irrigationHistory: [],
    deviceOnline: true,
    lastSeenAt: new Date(),
  };

  test('returns insufficient_data when there is no usable soil-moisture reading, without calling Gemini at all', async () => {
    const genAIClient = { models: { generateContent: jest.fn() } };
    const result = await getCopilotRecommendation({ ...baseParams, telemetryHistory: [] }, { genAIClient });
    expect(result.status).toBe('insufficient_data');
    expect(result.source).toBe('gemini');
    expect(genAIClient.models.generateContent).not.toHaveBeenCalled();
    expect(() => CopilotResponseSchema.parse(result)).not.toThrow();
  });

  test('returns unavailable (not error, not a fabricated recommendation) when GEMINI_API_KEY is unset', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const genAIClient = { models: { generateContent: jest.fn() } };
      const result = await getCopilotRecommendation(
        { ...baseParams, telemetryHistory: [{ recordedAt: new Date(), readings: { soilMoisturePercent: 30 } }] },
        { genAIClient }
      );
      expect(result.status).toBe('unavailable');
      expect(genAIClient.models.generateContent).not.toHaveBeenCalled();
    } finally {
      if (original !== undefined) process.env.GEMINI_API_KEY = original;
    }
  });

  test('validates and returns a well-formed Gemini structured response, calling the configured model', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-test-model';
    try {
      const geminiPayload = {
        status: 'available',
        decision: 'monitor',
        title: 'الري غير مطلوب الآن',
        summary: 'الرطوبة مناسبة حاليًا.',
        recommendation: 'تابع الرطوبة خلال الساعتين الجايين.',
        reasons: ['رطوبة الأرض مناسبة', 'آخر ري كان قريب'],
        confidence: 'medium',
        suggestedDurationMinutes: null,
        limitations: [],
      };
      const generateContent = jest.fn().mockResolvedValue({ text: JSON.stringify(geminiPayload) });
      const genAIClient = { models: { generateContent } };

      const result = await getCopilotRecommendation(
        { ...baseParams, telemetryHistory: [{ recordedAt: new Date(), readings: { soilMoisturePercent: 45 } }] },
        { genAIClient }
      );

      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-test-model' })
      );
      expect(result.status).toBe('available');
      expect(result.decision).toBe('monitor');
      expect(result.source).toBe('gemini');
      expect(() => CopilotResponseSchema.parse(result)).not.toThrow();
    } finally {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_MODEL;
    }
  });

  test('returns status "error" (never a fabricated recommendation) when Gemini returns malformed JSON', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const generateContent = jest.fn().mockResolvedValue({ text: 'not json' });
      const result = await getCopilotRecommendation(
        { ...baseParams, telemetryHistory: [{ recordedAt: new Date(), readings: { soilMoisturePercent: 45 } }] },
        { genAIClient: { models: { generateContent } } }
      );
      expect(result.status).toBe('error');
      expect(() => CopilotResponseSchema.parse(result)).not.toThrow();
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  test('returns status "error" when Gemini returns a response failing schema validation (e.g. invalid decision enum)', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const generateContent = jest.fn().mockResolvedValue({
        text: JSON.stringify({
          status: 'available',
          decision: 'open_the_valve_now', // not a valid enum value
          title: 't', summary: 's', recommendation: 'r', reasons: [], confidence: 'high',
          suggestedDurationMinutes: null, limitations: [],
        }),
      });
      const result = await getCopilotRecommendation(
        { ...baseParams, telemetryHistory: [{ recordedAt: new Date(), readings: { soilMoisturePercent: 45 } }] },
        { genAIClient: { models: { generateContent } } }
      );
      expect(result.status).toBe('error');
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  test('DEFAULT_MODEL is used when GEMINI_MODEL is not set', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_MODEL;
    try {
      const geminiPayload = {
        status: 'available', decision: 'monitor', title: 't', summary: 's', recommendation: 'r',
        reasons: [], confidence: 'low', suggestedDurationMinutes: null, limitations: [],
      };
      const generateContent = jest.fn().mockResolvedValue({ text: JSON.stringify(geminiPayload) });
      await getCopilotRecommendation(
        { ...baseParams, telemetryHistory: [{ recordedAt: new Date(), readings: { soilMoisturePercent: 45 } }] },
        { genAIClient: { models: { generateContent } } }
      );
      expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({ model: DEFAULT_MODEL }));
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  test('suggestedDurationMinutes, when present, is only advisory data — never itself an executable command', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const geminiPayload = {
        status: 'available', decision: 'irrigate_now', title: 't', summary: 's', recommendation: 'r',
        reasons: ['low moisture'], confidence: 'high', suggestedDurationMinutes: 15, limitations: [],
      };
      const generateContent = jest.fn().mockResolvedValue({ text: JSON.stringify(geminiPayload) });
      const result = await getCopilotRecommendation(
        { ...baseParams, telemetryHistory: [{ recordedAt: new Date(), readings: { soilMoisturePercent: 12 } }] },
        { genAIClient: { models: { generateContent } } }
      );
      expect(result.suggestedDurationMinutes).toBe(15);
      expect(typeof result.suggestedDurationMinutes).toBe('number');
      // This module has no reference anywhere to a valve/command execution API —
      // enforced structurally in geminiCopilotSafetyBoundary.test.js.
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });
});
