'use strict';

const express = require('express');
const controller = require('./moderation.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const authorizeRole = require('../../middleware/authorizeRole');
const { communityReportLimiter, communityWriteLimiter } = require('../../middleware/rateLimiter');
const { ROLES } = require('../../security/rbac');
const {
  fileReportSchema,
  listQueueQuerySchema,
  resolveReportSchema,
  reportIdParamsSchema,
} = require('./moderation.validators');

const router = express.Router();

router.use(authenticate);

// Any authenticated farmer may file a report.
router.post('/reports', communityReportLimiter, validate(fileReportSchema), controller.fileReport);

// Everything below is staff-only (moderator/admin/super_admin) — never
// reachable by a plain farmer/agronomist/technician account, and the
// role is always read from the verified JWT (req.user.role), never
// anything client-supplied.
router.use(authorizeRole(ROLES.MODERATOR, ROLES.ADMIN, ROLES.SUPER_ADMIN));

router.get('/reports', validate(listQueueQuerySchema, 'query'), controller.listQueue);
router.patch(
  '/reports/:reportId',
  communityWriteLimiter,
  validate(reportIdParamsSchema, 'params'),
  validate(resolveReportSchema),
  controller.resolveReport
);

module.exports = router;
