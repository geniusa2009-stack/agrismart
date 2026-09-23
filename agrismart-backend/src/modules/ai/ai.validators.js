'use strict';

/**
 * modules/ai/ai.validators.js
 *
 * .strict() schemas for the AI module's body-validated endpoints —
 * same convention as telemetry.validators.js / irrigation.validators.js.
 * Any undeclared key is rejected outright, which is exactly what
 * guarantees a client can never smuggle extra fields (there is no
 * "userId"/"ownerId" field here for the same reason telemetry ingestion
 * never accepts a client-supplied farmId: ownership is always resolved
 * server-side from farmId/zoneId AFTER these pass, in ai.controller.js).
 */

const { z } = require('zod');

const objectIdRegex = /^[a-f0-9]{24}$/i;

const CHAT_CONTEXTS = [
  'dashboard',
  'farm',
  'irrigation',
  'analytics',
  'alerts',
  'community',
  'equipment',
  'services',
  'marketplace',
  'settings',
];

// Bounded history: prevents unbounded context growth (spec section 17,
// "prevent context bloat") — the server also re-caps this further
// before it ever reaches the Gemini prompt (see geminiCopilotService.js
// buildChatPrompt's own trim), this is just the outermost request-size
// guard.
const chatMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(2000),
  })
  .strict();

const chatRequestSchema = z
  .object({
    message: z.string().min(1).max(2000),
    farmId: z.string().regex(objectIdRegex, 'Invalid farm id.'),
    zoneId: z.string().regex(objectIdRegex, 'Invalid zone id.').optional(),
    context: z.enum(CHAT_CONTEXTS).optional(),
    locale: z.enum(['ar-eg', 'ar', 'en']).optional(),
    history: z.array(chatMessageSchema).max(12).optional(),
  })
  .strict();

module.exports = { chatRequestSchema, CHAT_CONTEXTS };
