'use strict';

const { z } = require('zod');
const { ROLES } = require('../../security/rbac');

const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    fullName: z.string().min(1).max(120),
    role: z.enum([ROLES.FARMER, ROLES.AGRONOMIST, ROLES.TECHNICIAN]).optional(),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

const refreshSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

module.exports = { registerSchema, loginSchema, refreshSchema };
