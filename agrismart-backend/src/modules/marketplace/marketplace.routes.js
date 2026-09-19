'use strict';

/**
 * modules/marketplace/marketplace.routes.js
 *
 * Mounted at /api/v1/marketplace. Also owns the generic /saved
 * endpoints (equipment/services/marketplace all reuse the same
 * SavedItem model — see savedItem.model.js's header comment) since
 * "Saved" is presented as part of the marketplace nav section (section
 * 16), but the toggle-save action itself is exposed per-module too
 * (equipment/:id/save, services/:id/save) for a consistent UX — all
 * of them call the SAME marketplace.service.toggleSave function.
 */

const express = require('express');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const authorizeRole = require('../../middleware/authorizeRole');
const { authorizeResourceOwnership } = require('../../middleware/authorizeResourceOwnership');
const { ROLES } = require('../../security/rbac');
const { communityWriteLimiter, communityEngagementLimiter } = require('../../middleware/rateLimiter');

const controller = require('./marketplace.controller');
const marketplaceRepository = require('./marketplace.repository');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const {
  createListingSchema,
  updateListingSchema,
  moderateListingSchema,
  contactSellerSchema,
  listingIdParamsSchema,
  discoverQuerySchema,
  savedQuerySchema,
  mineQuerySchema,
} = require('./marketplace.validators');

/**
 * Contact is allowed for ANY authenticated buyer, not just the seller
 * — authorizeResourceOwnership (an owner-only gate) doesn't fit here,
 * so this loads the listing plainly; marketplace.service.contactSeller
 * itself still rejects a seller "contacting" their own listing.
 */
const loadDiscoverableListing = asyncHandler(async (req, res, next) => {
  const listing = await marketplaceRepository.findDiscoverableById(req.params.listingId);
  if (!listing) {
    throw ApiError.notFound('Marketplace listing not found.');
  }
  req.listing = listing;
  next();
});

const router = express.Router();

router.use(authenticate);

router.post('/', communityWriteLimiter, validate(createListingSchema), controller.create);
router.get('/', validate(discoverQuerySchema, 'query'), controller.discover);
router.get('/mine', validate(mineQuerySchema, 'query'), controller.listMine);
router.get('/saved', validate(savedQuerySchema, 'query'), controller.listSaved);
router.get('/:listingId', validate(listingIdParamsSchema, 'params'), controller.getById);

router.patch(
  '/:listingId',
  communityWriteLimiter,
  validate(listingIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'listingId',
    fetchById: marketplaceRepository.findByIdPlain,
    ownerField: 'sellerId',
    attachAs: 'listing',
    notFoundMessage: 'Marketplace listing not found.',
  }),
  validate(updateListingSchema),
  controller.update
);
router.delete(
  '/:listingId',
  communityWriteLimiter,
  validate(listingIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'listingId',
    fetchById: marketplaceRepository.findByIdPlain,
    ownerField: 'sellerId',
    attachAs: 'listing',
    notFoundMessage: 'Marketplace listing not found.',
  }),
  controller.remove
);
router.patch(
  '/:listingId/moderate',
  communityWriteLimiter,
  authorizeRole(ROLES.MODERATOR, ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(listingIdParamsSchema, 'params'),
  authorizeResourceOwnership({
    paramName: 'listingId',
    fetchById: marketplaceRepository.findByIdPlain,
    ownerField: 'sellerId',
    attachAs: 'listing',
    allowStaff: true,
    notFoundMessage: 'Marketplace listing not found.',
  }),
  validate(moderateListingSchema),
  controller.moderate
);

router.post(
  '/:listingId/contact',
  communityEngagementLimiter,
  validate(listingIdParamsSchema, 'params'),
  loadDiscoverableListing,
  validate(contactSellerSchema),
  controller.contact
);

router.post(
  '/:listingId/save',
  communityEngagementLimiter,
  validate(listingIdParamsSchema, 'params'),
  loadDiscoverableListing,
  controller.toggleSave
);

module.exports = router;
