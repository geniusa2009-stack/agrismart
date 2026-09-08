'use strict';

const { z } = require('zod');

const updateProfileSchema = z
  .object({
    fullName: z.string().min(1).max(120).optional(),
  })
  .strict();

module.exports = { updateProfileSchema };
