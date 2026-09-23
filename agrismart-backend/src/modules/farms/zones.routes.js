'use strict';

/**
 * modules/farms/zones.routes.js
 *
 * AgriSmart-native data collection contract (crop/zone context — see
 * zone.model.js's header comment and
 * ai/external/AGRISMART_DATA_COLLECTION_CONTRACT.md). Only handles
 * `/zones/:zoneId` (get/update/delete a zone by id) — mounted at apiV1
 * under a real `/zones` prefix (routes/index.js), the same way every
 * other module is mounted. Farm-scoped zone creation/listing
 * (`/farms/:farmId/zones`) lives in farms.routes.js instead, under the
 * already-mounted `/farms` prefix: mounting a second router with NO
 * path prefix at the apiV1 level would make its own
 * `router.use(authenticate)` intercept every request on every OTHER
 * module's routes too, since Express dispatches into a path-less
 * `app.use(router)` before any of that router's own route patterns are
 * even checked. (This bit an earlier version of this file — see git
 * history / the fix that moved farm-scoped zone routes out.)
 */

const express = require('express');
const controller = require('./zones.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { updateZoneSchema, zoneIdParamsSchema } = require('./zones.validators');

const router = express.Router();

router.use(authenticate);

router.get(
  '/:zoneId',
  validate(zoneIdParamsSchema, 'params'),
  controller.loadZone,
  controller.getById
);

router.patch(
  '/:zoneId',
  validate(zoneIdParamsSchema, 'params'),
  controller.loadZone,
  validate(updateZoneSchema),
  controller.update
);

router.delete(
  '/:zoneId',
  validate(zoneIdParamsSchema, 'params'),
  controller.loadZone,
  controller.remove
);

module.exports = router;
