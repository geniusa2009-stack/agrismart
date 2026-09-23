'use strict';

/**
 * modules/ai/ai.routes.js
 *
 * Mounted at /api/v1/ai (routes/index.js). Follows the exact
 * authenticate + ownership-checked-valve-load pattern already used by
 * irrigation.routes.js — reuses irrigation's own loadValve middleware
 * and param validator rather than re-implementing ownership checks.
 */

const express = require('express');
const controller = require('./ai.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const irrigationController = require('../irrigation/irrigation.controller');
const { valveIdParamsSchema } = require('../irrigation/irrigation.validators');
const { chatRequestSchema } = require('./ai.validators');
const { InputSchema: tomatoSoilMoistureInputSchema } = require('../../../ai/inference/predictTomatoSoilMoisture');
const { InputSchema: arnesanoSoilMoistureInputSchema } = require('../../../ai/inference/predictArnesanoSoilMoisture24h');

const router = express.Router();

// /status, /model, /health are informational (no PII/business data) —
// still requires authentication, no farm-scoped data returned.
router.use(authenticate);

router.get('/status', controller.getStatus);
router.get('/model', controller.getModel);
router.get('/health', controller.getHealth);

router.get(
  '/recommendations/:valveId',
  validate(valveIdParamsSchema, 'params'),
  irrigationController.loadValve,
  controller.getRecommendation
);

// Advisory-only, manual-input research endpoint — see
// ai.controller.js's postSoilMoistureEstimate doc comment for why this
// does not follow the valve-ownership-loading pattern used above.
router.post('/soil-moisture-estimate', validate(tomatoSoilMoistureInputSchema, 'body'), controller.postSoilMoistureEstimate);

// Advisory-only. Reuses the same ownership-checked loadValve middleware
// as /recommendations/:valveId — see ai.controller.js's
// getIrrigationEventLikelihood doc comment.
router.get(
  '/irrigation-event-likelihood/:valveId',
  validate(valveIdParamsSchema, 'params'),
  irrigationController.loadValve,
  controller.getIrrigationEventLikelihood
);

router.post('/arnesano-soil-moisture-forecast', validate(arnesanoSoilMoistureInputSchema, 'body'), controller.postArnesanoSoilMoistureForecast);

// Gemini-backed agricultural copilot — advisory only, see
// ai/services/geminiCopilotService.js. Reuses the exact same
// ownership-checked loadValve middleware as /recommendations/:valveId.
router.post(
  '/copilot/:valveId/analyze',
  validate(valveIdParamsSchema, 'params'),
  irrigationController.loadValve,
  controller.postCopilotAnalyze
);

// Global AI farm assistant — reachable from any authenticated page.
// farmId/zoneId ownership is resolved server-side inside the
// controller (farmsRepository/zonesRepository findByIdForPrincipal),
// never trusted from the request body directly.
router.post('/chat', validate(chatRequestSchema, 'body'), controller.postChatMessage);

module.exports = router;
