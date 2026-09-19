'use strict';

/**
 * modules/services/services.routes.js
 *
 * Mounted at /api/v1/services — same structural split as
 * equipment.routes.js/rentals.routes.js: listing CRUD/discovery here,
 * request-creation nested under a listing, everything else that
 * operates on a request by its own id under /api/v1/service-requests
 * (serviceRequests.routes.js).
 */

const express = require('express');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const authorizeRole = require('../../middleware/authorizeRole');
const { authorizeResourceOwnership } = require('../../middleware/authorizeResourceOwnership');
const { ROLES } = require('../../security/rbac');
const { communityWriteLimiter, communityEngagementLimiter, transactionLimiter } = require('../../middleware/rateLimiter');
const marketplaceService = require('../marketplace/marketplace.service');

const servicesController = require('./services.controller');
const servicesRepository = require('./services.repository');
const {
  createServiceSchema,
  updateServiceSchema,
  moderateServiceSchema,
  serviceIdParamsSchema,
  discoverQuerySchema,
} = require('./services.validators');

const serviceRequestsController = require('./serviceRequests.controller');
const { createServiceRequestSchema } = require('./serviceRequests.validators');

const reviewsService = require('../trust/reviews.service');
const { asyncHandler } = require('../../middleware/errorHandler');
const { paginationQueryFields } = require('../../utils/pagination');
const { z } = require('zod');

const reviewsQuerySchema = z.object({ ...paginationQueryFields }).strict();
const mineQuerySchema = z.object({ ...paginationQueryFields }).strict();
const listReviews = asyncHandler(async (req, res) => {
  const result = await reviewsService.listForTarget('service', req.params.serviceId, req.query);
  res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
});

const router = express.Router();

router.use(authenticate);

router.post('/', communityWriteLimiter, validate(createServiceSchema), servicesController.create);
router.get('/', validate(discoverQuerySchema, 'query'), servicesController.discover);
router.get('/mine', validate(mineQuerySchema, 'query'), servicesController.listMine);
router.get('/:serviceId', validate(serviceIdParamsSchema, 'params'), servicesController.getById);
router.get(
  '/:serviceId/reviews',
  validate(serviceIdParamsSchema, 'params'),
  validate(reviewsQuerySchema, 'query'),
  listReviews
);

router.patch(
  '/:serviceId',
  communityWriteLimiter,
  validate(serviceIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'serviceId',
    fetchById: servicesRepository.findByIdPlain,
    ownerField: 'providerId',
    attachAs: 'service',
    notFoundMessage: 'Service listing not found.',
  }),
  validate(updateServiceSchema),
  servicesController.update
);
router.delete(
  '/:serviceId',
  communityWriteLimiter,
  validate(serviceIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'serviceId',
    fetchById: servicesRepository.findByIdPlain,
    ownerField: 'providerId',
    attachAs: 'service',
    notFoundMessage: 'Service listing not found.',
  }),
  servicesController.remove
);
router.patch(
  '/:serviceId/moderate',
  communityWriteLimiter,
  authorizeRole(ROLES.MODERATOR, ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(serviceIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'serviceId',
    fetchById: servicesRepository.findByIdPlain,
    ownerField: 'providerId',
    attachAs: 'service',
    allowStaff: true,
    notFoundMessage: 'Service listing not found.',
  }),
  validate(moderateServiceSchema),
  servicesController.moderate
);

router.post(
  '/:serviceId/save',
  communityEngagementLimiter,
  validate(serviceIdParamsSchema, 'params'),
  servicesController.loadDiscoverableService,
  asyncHandler(async (req, res) => {
    const result = await marketplaceService.toggleSave(req.user.id, 'service', req.params.serviceId);
    res.status(200).json({ success: true, data: result });
  })
);

router.post(
  '/:serviceId/requests',
  transactionLimiter,
  validate(serviceIdParamsSchema, 'params'),
  servicesController.loadDiscoverableService,
  validate(createServiceRequestSchema),
  serviceRequestsController.create
);

module.exports = router;
