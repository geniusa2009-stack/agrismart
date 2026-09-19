'use strict';

const { z } = require('zod');
const { paginationQueryFields } = require('../../utils/pagination');
const { objectIdSchema } = require('../../utils/objectId');
const { POST_CATEGORIES } = require('./post.model');

const attachmentSchema = z
  .object({
    type: z.enum(['image', 'video', 'document']),
    url: z.string().trim().url().max(1000),
    caption: z.string().trim().max(200).optional(),
  })
  .strict();

const createPostSchema = z
  .object({
    category: z.enum(POST_CATEGORIES).optional(),
    body: z.string().trim().min(1).max(5000),
    attachments: z.array(attachmentSchema).max(6).optional(),
    location: z.object({ governorate: z.string().trim().max(60).optional() }).strict().optional(),
  })
  .strict();

const updatePostSchema = z
  .object({
    category: z.enum(POST_CATEGORIES).optional(),
    body: z.string().trim().min(1).max(5000).optional(),
    attachments: z.array(attachmentSchema).max(6).optional(),
    location: z.object({ governorate: z.string().trim().max(60).optional() }).strict().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

const moderatePostSchema = z.object({ status: z.enum(['visible', 'hidden', 'removed']) }).strict();

const postIdParamsSchema = z.object({ postId: objectIdSchema('post id') }).strict();

const feedQuerySchema = z
  .object({
    category: z.enum(POST_CATEGORIES).optional(),
    governorate: z.string().trim().max(60).optional(),
    authorId: objectIdSchema('author id').optional(),
    ...paginationQueryFields,
  })
  .strict();

module.exports = {
  createPostSchema,
  updatePostSchema,
  moderatePostSchema,
  postIdParamsSchema,
  feedQuerySchema,
};
