'use strict';

const express = require('express');
const controller = require('./farms.controller');
const zonesController = require('./zones.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { authorizeFarmOwnership } = require('../../middleware/authorizeOwnership');
const { createFarmSchema, updateFarmSchema, farmIdParamsSchema } = require('./farms.validators');
const { createZoneSchema } = require('./zones.validators');

const router = express.Router();

router.use(authenticate);

router.post('/', validate(createFarmSchema), controller.create);
router.get('/', controller.list);
router.get(
  '/:farmId',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  controller.getById
);
router.patch(
  '/:farmId',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  validate(updateFarmSchema),
  controller.update
);
router.delete(
  '/:farmId',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  controller.remove
);

// AgriSmart-native data collection contract (crop/zone context — see
// zone.model.js's header comment). Farm-scoped zone creation/listing
// lives here (under the already-mounted /farms prefix) rather than in
// zones.routes.js, which only handles /zones/:zoneId — mounting a
// second router with NO path prefix at the apiV1 level would make its
// own router.use(authenticate) intercept every request on every OTHER
// module's routes too (Express matches an unprefixed router at '/',
// so it runs before route matching even happens for sibling routers).
router.post(
  '/:farmId/zones',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  validate(createZoneSchema),
  zonesController.create
);

router.get(
  '/:farmId/zones',
  validate(farmIdParamsSchema, 'params'),
  authorizeFarmOwnership('farmId'),
  zonesController.listForFarm
);

module.exports = router;
