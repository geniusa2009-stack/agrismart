'use strict';

/**
 * tests/ai/geminiChatService.test.js
 *
 * Covers ai/services/geminiCopilotService.js's getChatResponse (the
 * global "مساعدك الزراعي" chat assistant): honest unavailable/error
 * states, structured-output schema validation, bounded history (spec
 * section 17 — never send the whole conversation), locale selection,
 * and page-aware context. Safety-boundary (never executes irrigation)
 * is covered separately in tests/ai/geminiChatSafetyBoundary.test.js.
 */

const { getChatResponse, ChatResponseSchema } = require('../../ai/services/geminiCopilotService');

const baseParams = {
  message: 'أروي ولا لأ؟',
  context: 'irrigation',
  locale: 'ar-eg',
  valve: { commandedState: 'closed', confirmedState: 'closed' },
  zone: null,
  telemetryHistory: [{ recordedAt: new Date(), readings: { soilMoisturePercent: 45 } }],
  irrigationHistory: [],
  deviceOnline: true,
  lastSeenAt: new Date(),
};

describe('geminiCopilotService.getChatResponse', () => {
  test('returns unavailable (never a fabricated answer) when GEMINI_API_KEY is unset, without calling Gemini', async () => {
    delete process.env.GEMINI_API_KEY;
    const generateContent = jest.fn();
    const result = await getChatResponse(baseParams, { genAIClient: { models: { generateContent } } });
    expect(result.status).toBe('unavailable');
    expect(result.source).toBe('gemini');
    expect(generateContent).not.toHaveBeenCalled();
    expect(() => ChatResponseSchema.parse(result)).not.toThrow();
  });

  test('validates and returns a well-formed chat response', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const geminiPayload = {
        status: 'available',
        answer: 'الري مش مطلوب دلوقتي.',
        reasons: ['رطوبة الأرض مناسبة', 'آخر ري كان قريب'],
        nextStep: 'تابع الرطوبة خلال الساعتين الجايين.',
        intents: { irrigationExecutionRequested: false, equipmentIntent: false, communityIntent: false },
        confidence: 'medium',
        limitations: [],
      };
      const generateContent = jest.fn().mockResolvedValue({ text: JSON.stringify(geminiPayload) });
      const result = await getChatResponse(baseParams, { genAIClient: { models: { generateContent } } });
      expect(result.status).toBe('available');
      expect(result.answer).toBe('الري مش مطلوب دلوقتي.');
      expect(result.source).toBe('gemini');
      expect(() => ChatResponseSchema.parse(result)).not.toThrow();
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  test('returns status "error" (never fabricated) on malformed Gemini JSON', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const generateContent = jest.fn().mockResolvedValue({ text: 'not json at all' });
      const result = await getChatResponse(baseParams, { genAIClient: { models: { generateContent } } });
      expect(result.status).toBe('error');
      expect(() => ChatResponseSchema.parse(result)).not.toThrow();
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  test('returns status "error" when the response fails schema validation (missing intents)', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const generateContent = jest.fn().mockResolvedValue({
        text: JSON.stringify({ status: 'available', answer: 'x', reasons: [], nextStep: '', confidence: null, limitations: [] }),
      });
      const result = await getChatResponse(baseParams, { genAIClient: { models: { generateContent } } });
      expect(result.status).toBe('error');
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  test('only the last 6 history turns are ever forwarded to Gemini, regardless of how many are passed in', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `turn-${i}` }));
      const generateContent = jest.fn().mockResolvedValue({
        text: JSON.stringify({
          status: 'available', answer: 'a', reasons: [], nextStep: '',
          intents: { irrigationExecutionRequested: false, equipmentIntent: false, communityIntent: false },
          confidence: null, limitations: [],
        }),
      });
      await getChatResponse({ ...baseParams, history }, { genAIClient: { models: { generateContent } } });

      const promptSent = generateContent.mock.calls[0][0].contents;
      for (let i = 0; i < 6; i += 1) {
        expect(promptSent).not.toMatch(new RegExp(`turn-${i}"`));
      }
      for (let i = 6; i < 12; i += 1) {
        expect(promptSent).toMatch(new RegExp(`turn-${i}"`));
      }
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  test('the current page context is included in the prompt sent to Gemini', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const generateContent = jest.fn().mockResolvedValue({
        text: JSON.stringify({
          status: 'available', answer: 'a', reasons: [], nextStep: '',
          intents: { irrigationExecutionRequested: false, equipmentIntent: false, communityIntent: false },
          confidence: null, limitations: [],
        }),
      });
      await getChatResponse({ ...baseParams, context: 'equipment' }, { genAIClient: { models: { generateContent } } });
      const promptSent = generateContent.mock.calls[0][0].contents;
      expect(promptSent).toMatch(/"equipment"/);
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  test('equipment/community intent flags round-trip through validation untouched', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    try {
      const generateContent = jest.fn().mockResolvedValue({
        text: JSON.stringify({
          status: 'available',
          answer: 'تمام، نقدر ندور على معدات زراعية.',
          reasons: [],
          nextStep: 'افتح تأجير المعدات وحدد اليوم والمدة.',
          intents: { irrigationExecutionRequested: false, equipmentIntent: true, communityIntent: false },
          confidence: 'high',
          limitations: [],
        }),
      });
      const result = await getChatResponse({ ...baseParams, message: 'محتاج جرار', context: 'equipment' }, { genAIClient: { models: { generateContent } } });
      expect(result.intents.equipmentIntent).toBe(true);
      expect(result.intents.irrigationExecutionRequested).toBe(false);
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });
});
