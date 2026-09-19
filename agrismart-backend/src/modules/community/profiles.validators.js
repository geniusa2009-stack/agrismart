'use strict';

const { z } = require('zod');
const { objectIdSchema } = require('../../utils/objectId');

// Deliberately excludes verificationStatus, followerCount,
// followingCount, postCount — a farmer can never self-verify or
// manufacture engagement numbers via this endpoint (section 26/section
// 10 mass-assignment protection). `.strict()` rejects any other
// unlisted field outright.
const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    bio: z.string().trim().max(500).optional(),
    avatarUrl: z.string().trim().url().max(500).optional(),
    governorate: z.string().trim().max(60).optional(),
    city: z.string().trim().max(60).optional(),
    crops: z.array(z.string().trim().max(40)).max(30).optional(),
    interests: z.array(z.string().trim().max(40)).max(30).optional(),
    experienceYears: z.number().int().min(0).max(100).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

const userIdParamsSchema = z.object({ userId: objectIdSchema('user id') }).strict();

module.exports = { updateProfileSchema, userIdParamsSchema };
