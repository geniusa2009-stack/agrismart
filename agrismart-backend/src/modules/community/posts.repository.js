'use strict';

const Post = require('./post.model');

async function create({ authorId, category, body, attachments, location }) {
  return Post.create({ authorId, category, body, attachments, location });
}

async function findVisibleById(postId) {
  return Post.findOne({ _id: postId, moderationStatus: 'visible' });
}

/** No moderationStatus filter — used by the ownership/moderation
 * middleware so an author can still see/edit their own hidden post and
 * a moderator can act on any post regardless of state. */
async function findByIdPlain(postId) {
  return Post.findById(postId);
}

async function listFeed({ category, governorate, authorId, skip, limit }) {
  const query = { moderationStatus: 'visible' };
  if (category) query.category = category;
  if (governorate) query['location.governorate'] = governorate;
  if (authorId) query.authorId = authorId;

  const [items, total] = await Promise.all([
    Post.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Post.countDocuments(query),
  ]);
  return { items, total };
}

async function updateById(postId, updates) {
  return Post.findByIdAndUpdate(postId, { $set: updates }, { new: true });
}

async function incrementCommentCount(postId, delta) {
  return Post.findByIdAndUpdate(postId, { $inc: { commentCount: delta } });
}

async function incrementReactionCount(postId, delta) {
  return Post.findByIdAndUpdate(postId, { $inc: { reactionCount: delta } });
}

module.exports = {
  create,
  findVisibleById,
  findByIdPlain,
  listFeed,
  updateById,
  incrementCommentCount,
  incrementReactionCount,
};
