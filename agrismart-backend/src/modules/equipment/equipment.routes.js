'use strict';

/**
 * modules/equipment/equipment.routes.js
 *
 * Mounted at /api/v1/equipment. Equipment CRUD/discovery lives at the
 * top level; rental-request creation is nested
 * (`POST /equipment/:equipmentId/rental-requests`, matching the task
 * brief's section 19 API sketch), while accept/reject/cancel/complete
 * and "my rentals" live under the separate /api/v1/rentals mount
 * (rentals.routes.js) since those operate on a rental id directly, not
 * an equipment id.
 */

const express = require('express');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const authorizeRole = require('../../middleware/authorizeRole');
const { authorizeResourceOwnership } = require('../../middleware/authorizeResourceOwnership');
const { ROLES } = require('../../security/rbac');
const { communityWriteLimiter, communityEngagementLimiter, transactionLimiter } = require('../../middleware/rateLimiter');
const marketplaceService = require('../marketplace/marketplace.service');

const equipmentController = require('./equipment.controller');
const equipmentRepository = require('./equipment.repository');
const {
  createEquipmentSchema,
  updateEquipmentSchema,
  moderateEquipmentSchema,
  equipmentIdParamsSchema,
  discoverQuerySchema,
} = require('./equipment.validators');

const rentalsController = require('./rentals.controller');
const { createRentalRequestSchema } = require('./rentals.validators');

const reviewsService = require('../trust/reviews.service');
const { asyncHandler } = require('../../middleware/errorHandler');
const { paginationQueryFields } = require('../../utils/pagination');
const { z } = require('zod');

const reviewsQuerySchema = z.object({ ...paginationQueryFields }).strict();
const mineQuerySchema = z.object({ ...paginationQueryFields }).strict();

const listReviews = asyncHandler(async (req, res) => {
  const result = await reviewsService.listForTarget('equipment', req.params.equipmentId, req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

const router = express.Router();

router.use(authenticate);

router.post('/', communityWriteLimiter, validate(createEquipmentSchema), equipmentController.create);
router.get('/', validate(discoverQuerySchema, 'query'), equipmentController.discover);
router.get('/mine', validate(mineQuerySchema, 'query'), equipmentController.listMine);
router.get('/:equipmentId', validate(equipmentIdParamsSchema, 'params'), equipmentController.getById);
router.get(
  '/:equipmentId/reviews',
  validate(equipmentIdParamsSchema, 'params'),
  validate(reviewsQuerySchema, 'query'),
  listReviews
);

router.patch(
  '/:equipmentId',
  communityWriteLimiter,
  validate(equipmentIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'equipmentId',
    fetchById: equipmentRepository.findByIdPlain,
    ownerField: 'ownerId',
    attachAs: 'equipment',
    notFoundMessage: 'Equipment listing not found.',
  }),
  validate(updateEquipmentSchema),
  equipmentController.update
);
router.delete(
  '/:equipmentId',
  communityWriteLimiter,
  validate(equipmentIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'equipmentId',
    fetchById: equipmentRepository.findByIdPlain,
    ownerField: 'ownerId',
    attachAs: 'equipment',
    notFoundMessage: 'Equipment listing not found.',
  }),
  equipmentController.remove
);
router.patch(
  '/:equipmentId/moderate',
  communityWriteLimiter,
  authorizeRole(ROLES.MODERATOR, ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(equipmentIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'equipmentId',
    fetchById: equipmentRepository.findByIdPlain,
    ownerField: 'ownerId',
    attachAs: 'equipment',
    allowStaff: true,
    notFoundMessage: 'Equipment listing not found.',
  }),
  validate(moderateEquipmentSchema),
  equipmentController.moderate
);

router.post(
  '/:equipmentId/save',
  communityEngagementLimiter,
  validate(equipmentIdParamsSchema, 'params'),
  equipmentController.loadDiscoverableEquipment,
  asyncHandler(async (req, res) => {
    const result = await marketplaceService.toggleSave(req.user.id, 'equipment', req.params.equipmentId);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/:equipmentId/rental-requests',
  transactionLimiter,
  validate(equipmentIdParamsSchema, 'params'),
  equipmentController.loadDiscoverableEquipment,
  validate(createRentalRequestSchema),
  rentalsController.create
);

module.exports = router;
