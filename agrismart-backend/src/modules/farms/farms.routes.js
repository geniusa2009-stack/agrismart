'use strict';

const express = require('express');
const controller = require('./farms.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { authorizeFarmOwnership } = require('../../middleware/authorizeOwnership');
const { createFarmSchema, updateFarmSchema, farmIdParamsSchema } = require('./farms.validators');

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

module.exports = router;
