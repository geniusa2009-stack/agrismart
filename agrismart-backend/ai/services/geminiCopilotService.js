'use strict';

/**
 * ai/services/geminiCopilotService.js
 *
 * AgriSmart's Gemini-backed agricultural copilot ("مساعد AgriSmart
 * الذكي"). Gemini analyzes SERVER-BUILT, authorized context and
 * returns a structured, advisory recommendation only.
 *
 * HARD SAFETY RULE (mirrors ai/services/aiInsightService.js's own
 * rule): this module never imports src/modules/commands/commands.service
 * or src/modules/irrigation/irrigation.service, never calls
 * openValve/closeValve/issueCommand, and never mutates any Valve or
 * DeviceCommand document. tests/ai/geminiCopilotSafetyBoundary.test.js
 * asserts this by source-inspection and by mocking those modules.
 *
 * `suggestedDurationMinutes` is ADVISORY ONLY — it is never sent
 * directly to a valve. The existing irrigation safety layer
 * (max-duration cap, daily allowance, idempotency, emergency stop,
 * ownership checks) is the only path that can ever move a valve, and
 * it validates any request the same way whether a human or this
 * copilot suggested it.
 *
 * This module invents nothing: no EC->salinity conversion, no
 * duration->applied-water derivation, no fabricated sensor values. If
 * the data is insufficient, it says so (`status: 'insufficient_data'`)
 * instead of guessing.
 */

const { z } = require('zod');
const logger = require('../../src/observability/logger');

const DEFAULT_MODEL = 'gemini-3.8-flash';

const CopilotResponseSchema = z.object({
  status: z.enum(['available', 'insufficient_data', 'unavailable', 'error']),
  decision: z.enum(['irrigate_now', 'monitor', 'do_not_irrigate', 'inspect_sensor']).nullable(),
  title: z.string(),
  summary: z.string(),
  recommendation: z.string(),
  reasons: z.array(z.string()),
  confidence: z.enum(['low', 'medium', 'high']).nullable(),
  suggestedDurationMinutes: z.number().nullable(),
  limitations: z.array(z.string()),
  source: z.literal('gemini'),
});

// JSON-schema mirror of CopilotResponseSchema for the @google/genai
// SDK's responseSchema config (a JSON-schema-like object, not zod).
const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['available', 'insufficient_data', 'unavailable', 'error'] },
    decision: { type: 'string', enum: ['irrigate_now', 'monitor', 'do_not_irrigate', 'inspect_sensor'], nullable: true },
    title: { type: 'string' },
    summary: { type: 'string' },
    recommendation: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'], nullable: true },
    suggestedDurationMinutes: { type: 'number', nullable: true },
    limitations: { type: 'array', items: { type: 'string' } },
    source: { type: 'string', enum: ['gemini'] },
  },
  required: [
    'status', 'decision', 'title', 'summary', 'recommendation',
    'reasons', 'confidence', 'suggestedDurationMinutes', 'limitations', 'source',
  ],
};

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isoOrNull = (d) => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

/**
 * Builds the ONLY context Gemini ever sees. Every field must come from
 * server-loaded, ownership-checked documents (see ai.controller.js's
 * getCopilotRecommendation handler) — never a client-supplied
 * farmId/zoneId, never another farm's data, never a secret/credential.
 */
function buildFarmContext({ valve, zone, telemetryHistory = [], irrigationHistory = [], deviceOnline, lastSeenAt }) {
  const latest = telemetryHistory.length ? telemetryHistory[telemetryHistory.length - 1] : null;

  const recentReadings = telemetryHistory.slice(-20).map((r) => ({
    recordedAt: isoOrNull(r.recordedAt),
    soilMoisturePercent: numOrNull(r.readings && r.readings.soilMoisturePercent),
    temperatureCelsius: numOrNull(r.readings && r.readings.temperatureCelsius),
    soilSalinityPpt: numOrNull(r.readings && r.readings.soilSalinityPpt),
    soilEcMicrosiemensPerCm: numOrNull(r.readings && r.readings.soilEcMicrosiemensPerCm),
    airTemperatureCelsius: numOrNull(r.readings && r.readings.airTemperatureCelsius),
    relativeHumidityPercent: numOrNull(r.readings && r.readings.relativeHumidityPercent),
    precipitationMm: numOrNull(r.readings && r.readings.precipitationMm),
    flowMeter: r.readings && r.readings.flowMeter ? r.readings.flowMeter : null,
  }));

  const recentIrrigation = irrigationHistory.slice(-10).map((e) => ({
    startedAt: isoOrNull(e.startedAt),
    endedAt: isoOrNull(e.endedAt),
    actualDurationSeconds: numOrNull(e.actualDurationSeconds),
    plannedDurationSeconds: numOrNull(e.plannedDurationSeconds),
    appliedWaterVolumeLiters: numOrNull(e.appliedWaterVolumeLiters),
  }));

  return {
    zone: zone
      ? { cropType: zone.cropType || null, growthStage: zone.growthStage || null, soilType: zone.soilType || null }
      : null,
    valveState: { commandedState: valve.commandedState, confirmedState: valve.confirmedState },
    device: { online: Boolean(deviceOnline), lastSeenAt: isoOrNull(lastSeenAt) },
    telemetryFreshness: latest ? isoOrNull(latest.recordedAt) : null,
    recentReadings,
    recentIrrigation,
  };
}

function hasUsableData(context) {
  return context.recentReadings.some((r) => r.soilMoisturePercent !== null);
}

function baseResponse(status, title, summary, limitations) {
  return {
    status,
    decision: null,
    title,
    summary,
    recommendation: '',
    reasons: [],
    confidence: null,
    suggestedDurationMinutes: null,
    limitations,
    source: 'gemini',
  };
}

const insufficientDataResponse = () =>
  baseResponse(
    'insufficient_data',
    'لا توجد بيانات كافية',
    'لا توجد قراءات رطوبة كافية لإصدار توصية موثوقة الآن.',
    ['no recent soil moisture readings']
  );

const unavailableResponse = (reason) =>
  baseResponse('unavailable', 'مساعد AgriSmart الذكي غير متاح الآن', reason, [reason]);

const errorResponse = () =>
  baseResponse(
    'error',
    'حدث خطأ أثناء التحليل',
    'تعذر الحصول على توصية من المساعد الذكي الآن. حاول مرة أخرى لاحقًا.',
    ['gemini request failed']
  );

/** Lazily required so a env/tests without GEMINI_API_KEY never load/init the SDK. */
function loadGenAI() {
  // eslint-disable-next-line global-require
  const { GoogleGenAI } = require('@google/genai');
  return GoogleGenAI;
}

function buildPrompt(context) {
  return [
    'You are an agricultural irrigation decision-support assistant for AgriSmart, an Egyptian smallholder smart-farming platform.',
    'You are given REAL, server-authorized sensor and irrigation-event data for exactly one zone/valve. Never assume data you were not given.',
    'You do not control any hardware. You only produce an advisory recommendation; a separate safety system decides whether to act on it.',
    "If the data is ambiguous or insufficient to be confident, say so honestly in `limitations` and set a low confidence rather than guessing.",
    'Respond in Arabic (Egyptian-friendly, farmer-readable) for title/summary/recommendation/reasons; keep enum fields exactly as specified in English.',
    "Never invent a soil-EC-to-salinity conversion, an applied-water-volume figure, or any value that isn't present in the data.",
    '',
    `Context: ${JSON.stringify(context)}`,
  ].join('\n');
}

/**
 * @param {object} params - see buildFarmContext for shape
 * @param {object} [deps] - test injection point: { genAIClient }
 */
async function getCopilotRecommendation(params, deps = {}) {
  const context = buildFarmContext(params);

  if (!hasUsableData(context)) {
    return insufficientDataResponse();
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return unavailableResponse('GEMINI_API_KEY is not configured.');
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  try {
    let client = deps.genAIClient;
    if (!client) {
      const GoogleGenAI = loadGenAI();
      client = new GoogleGenAI({ apiKey });
    }

    const response = await client.models.generateContent({
      model,
      contents: buildPrompt(context),
      config: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text);
    return CopilotResponseSchema.parse({ ...parsed, source: 'gemini' });
  } catch (err) {
    logger.warn({ scope: 'ai', err: err.message }, 'Gemini copilot request failed.');
    return errorResponse();
  }
}


// ---------------------------------------------------------------------------
// Global chat assistant ("مساعدك الزراعي" — see ai.controller.js's
// postChatMessage / ai.routes.js's POST /chat). Reuses the SAME
// buildFarmContext, the SAME lazily-loaded GoogleGenAI client factory
// (loadGenAI), and the SAME hard safety rule as getCopilotRecommendation
// above: this module never imports commandsService/irrigationService
// and never executes anything. A user asking to open/close a valve or
// start/stop irrigation gets an honest "you need to confirm from the
// irrigation screen" answer with intents.irrigationExecutionRequested
// set to true, never a fabricated "done".
// ---------------------------------------------------------------------------

const ChatResponseSchema = z.object({
  status: z.enum(['available', 'insufficient_data', 'unavailable', 'error']),
  answer: z.string(),
  reasons: z.array(z.string()),
  nextStep: z.string(),
  intents: z.object({
    irrigationExecutionRequested: z.boolean(),
    equipmentIntent: z.boolean(),
    communityIntent: z.boolean(),
  }),
  confidence: z.enum(['low', 'medium', 'high']).nullable(),
  limitations: z.array(z.string()),
  source: z.literal('gemini'),
});

const GEMINI_CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['available', 'insufficient_data', 'unavailable', 'error'] },
    answer: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
    nextStep: { type: 'string' },
    intents: {
      type: 'object',
      properties: {
        irrigationExecutionRequested: { type: 'boolean' },
        equipmentIntent: { type: 'boolean' },
        communityIntent: { type: 'boolean' },
      },
      required: ['irrigationExecutionRequested', 'equipmentIntent', 'communityIntent'],
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'], nullable: true },
    limitations: { type: 'array', items: { type: 'string' } },
    source: { type: 'string', enum: ['gemini'] },
  },
  required: ['status', 'answer', 'reasons', 'nextStep', 'intents', 'confidence', 'limitations', 'source'],
};

// Only the last N turns are ever forwarded to Gemini, regardless of how
// much history the client sends (ai.validators.js already caps the
// request body at 12 messages) — spec section 17: "prevent context
// bloat", never send the entire historical conversation indefinitely.
// Nothing is persisted server-side; the client owns the conversation.
const MAX_HISTORY_TURNS_SENT_TO_GEMINI = 6;

const LOCALE_INSTRUCTION = {
  'ar-eg': 'Respond in Egyptian farmer-friendly colloquial Arabic (e.g. "الرطوبة عندك 41%، وآخر ري كان من ساعتين").',
  ar: 'Respond in General/Modern Standard Arabic (e.g. "رطوبة التربة 41%، وكان آخر ري منذ ساعتين").',
  en: 'Respond in English (e.g. "Current soil moisture is 41%, and the last irrigation event was two hours ago").',
};

function chatBaseResponse(status, answer, limitations) {
  return {
    status,
    answer,
    reasons: [],
    nextStep: '',
    intents: { irrigationExecutionRequested: false, equipmentIntent: false, communityIntent: false },
    confidence: null,
    limitations,
    source: 'gemini',
  };
}

const chatUnavailableResponse = (reason) => chatBaseResponse('unavailable', reason, [reason]);
const chatErrorResponse = () => chatBaseResponse('error', 'تعذر الحصول على رد من المساعد الذكي الآن. حاول مرة أخرى لاحقًا.', ['gemini chat request failed']);

function buildChatPrompt({ message, context, locale, farmContext, history }) {
  const boundedHistory = (history || []).slice(-MAX_HISTORY_TURNS_SENT_TO_GEMINI);
  return [
    'You are AgriSmart\'s built-in agricultural farm assistant ("مساعدك الزراعي"), reachable from every page of the app — never present yourself as a generic chatbot.',
    'You are given REAL, server-authorized farm/zone context for exactly the farm (and zone, if any) the authenticated user actually owns. Never assume data you were not given, and never mention or imply any other farm.',
    `The user is currently on the "${context || 'unknown'}" section of the app — prioritize what is most relevant there, but you may still answer general agricultural questions.`,
    'You do not control any hardware and cannot execute anything. If the user asks you to open/close a valve or start/stop irrigation, do NOT say you did it or will do it — explain that starting irrigation needs their confirmation from the Irrigation screen, and set intents.irrigationExecutionRequested to true.',
    'If the user is asking about renting/finding equipment (e.g. a tractor), set intents.equipmentIntent to true and suggest the equipment/rental section — never invent a specific provider, price, or availability.',
    'If the user wants to ask other farmers or post a question, set intents.communityIntent to true and suggest the community section.',
    'For general agricultural knowledge questions (e.g. yellowing tomato leaves, dry soil, best irrigation timing), you may give educational guidance, but state uncertainty honestly and suggest a field inspection when the available sensor data is insufficient to be sure — never present an uncertain recommendation as guaranteed.',
    'Keep answers short and readable: a direct answer, brief reasons if useful, and a suggested next step — never a long essay.',
    "Never invent a soil-EC-to-salinity conversion, an applied-water-volume figure, a specific price, or any value that isn't present in the given context.",
    LOCALE_INSTRUCTION[locale] || LOCALE_INSTRUCTION['ar-eg'],
    '',
    `Farm/zone context: ${JSON.stringify(farmContext)}`,
    `Recent conversation (oldest first, may be empty): ${JSON.stringify(boundedHistory)}`,
    `User message: ${message}`,
  ].join('\n');
}

/**
 * @param {object} params - { message, context, locale, valve, zone, telemetryHistory, irrigationHistory, deviceOnline, lastSeenAt, history }
 * @param {object} [deps] - test injection point: { genAIClient }
 */
async function getChatResponse(params, deps = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return chatUnavailableResponse('GEMINI_API_KEY is not configured.');
  }

  const farmContext = buildFarmContext(params);
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  try {
    let client = deps.genAIClient;
    if (!client) {
      const GoogleGenAI = loadGenAI();
      client = new GoogleGenAI({ apiKey });
    }

    const response = await client.models.generateContent({
      model,
      contents: buildChatPrompt({
        message: params.message,
        context: params.context,
        locale: params.locale,
        farmContext,
        history: params.history,
      }),
      config: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_CHAT_RESPONSE_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text);
    return ChatResponseSchema.parse({ ...parsed, source: 'gemini' });
  } catch (err) {
    logger.warn({ scope: 'ai', err: err.message }, 'Gemini chat request failed.');
    return chatErrorResponse();
  }
}

module.exports = {
  buildFarmContext,
  getCopilotRecommendation,
  CopilotResponseSchema,
  getChatResponse,
  ChatResponseSchema,
  DEFAULT_MODEL,
};
