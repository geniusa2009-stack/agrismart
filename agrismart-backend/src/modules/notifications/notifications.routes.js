'use strict';

const express = require('express');
const controller = require('./notifications.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { communityEngagementLimiter } = require('../../middleware/rateLimiter');
const { listQuerySchema, notificationIdParamsSchema } = require('./notifications.validators');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(listQuerySchema, 'query'), controller.list);
router.patch('/read-all', communityEngagementLimiter, controller.markAllRead);
router.patch(
  '/:notificationId/read',
  communityEngagementLimiter,
  validate(notificationIdParamsSchema, 'params'),
  controller.markRead
);

module.exports = router;
