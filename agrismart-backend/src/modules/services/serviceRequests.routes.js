'use strict';

const express = require('express');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { transactionLimiter } = require('../../middleware/rateLimiter');

const controller = require('./serviceRequests.controller');
const {
  updateStatusSchema,
  reviewRequestSchema,
  requestIdParamsSchema,
  listMineQuerySchema,
} = require('./serviceRequests.validators');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(listMineQuerySchema, 'query'), controller.listMine);
router.patch(
  '/:requestId/status',
  transactionLimiter,
  validate(requestIdParamsSchema, 'params'),
  controller.loadParticipantRequest,
  validate(updateStatusSchema),
  controller.updateStatus
);
router.post(
  '/:requestId/review',
  transactionLimiter,
  validate(requestIdParamsSchema, 'params'),
  controller.loadParticipantRequest,
  validate(reviewRequestSchema),
  controller.review
);

module.exports = router;
