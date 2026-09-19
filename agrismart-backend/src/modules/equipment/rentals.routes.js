'use strict';

/**
 * modules/equipment/rentals.routes.js
 *
 * Mounted at /api/v1/rentals. Rental-request CREATION lives under
 * /api/v1/equipment/:equipmentId/rental-requests (equipment.routes.js)
 * since it's naturally scoped to a listing; everything that operates on
 * an existing rental request by its OWN id (list mine, accept, reject,
 * cancel, complete) lives here instead.
 */

const express = require('express');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { transactionLimiter } = require('../../middleware/rateLimiter');

const rentalsController = require('./rentals.controller');
const {
  updateStatusSchema,
  reviewRentalSchema,
  rentalIdParamsSchema,
  listMineQuerySchema,
} = require('./rentals.validators');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(listMineQuerySchema, 'query'), rentalsController.listMine);
router.patch(
  '/:rentalId/status',
  transactionLimiter,
  validate(rentalIdParamsSchema, 'params'),
  rentalsController.loadParticipantRental,
  validate(updateStatusSchema),
  rentalsController.updateStatus
);

router.post(
  '/:rentalId/review',
  transactionLimiter,
  validate(rentalIdParamsSchema, 'params'),
  rentalsController.loadParticipantRental,
  validate(reviewRentalSchema),
  rentalsController.review
);

module.exports = router;
