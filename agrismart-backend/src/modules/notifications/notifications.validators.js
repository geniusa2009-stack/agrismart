'use strict';

const { z } = require('zod');
const { paginationQueryFields } = require('../../utils/pagination');
const { objectIdSchema } = require('../../utils/objectId');

const listQuerySchema = z.object({ ...paginationQueryFields }).strict();

const notificationIdParamsSchema = z
  .object({ notificationId: objectIdSchema('notification id') })
  .strict();

module.exports = { listQuerySchema, notificationIdParamsSchema };
