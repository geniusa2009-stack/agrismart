'use strict';

const { z } = require('zod');
const { paginationQueryFields } = require('../../utils/pagination');
const { objectIdSchema } = require('../../utils/objectId');

const createCommentSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
const updateCommentSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
const moderateCommentSchema = z.object({ status: z.enum(['visible', 'hidden', 'removed']) }).strict();

const postIdParamsSchema = z.object({ postId: objectIdSchema('post id') }).strict();
const commentIdParamsSchema = z.object({ commentId: objectIdSchema('comment id') }).strict();

const listQuerySchema = z.object({ ...paginationQueryFields }).strict();

module.exports = {
  createCommentSchema,
  updateCommentSchema,
  moderateCommentSchema,
  postIdParamsSchema,
  commentIdParamsSchema,
  listQuerySchema,
};
