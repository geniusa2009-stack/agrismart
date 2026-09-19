'use strict';

const { z } = require('zod');
const { objectIdSchema } = require('../../utils/objectId');
const { REACTION_TYPES } = require('./reaction.model');

const toggleReactionSchema = z.object({ type: z.enum(REACTION_TYPES).default('like') }).strict();
const postIdParamsSchema = z.object({ postId: objectIdSchema('post id') }).strict();

module.exports = { toggleReactionSchema, postIdParamsSchema };
