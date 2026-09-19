'use strict';

const Comment = require('./comment.model');

async function create({ postId, authorId, body }) {
  return Comment.create({ postId, authorId, body });
}

async function findByIdPlain(commentId) {
  return Comment.findById(commentId);
}

async function listForPost(postId, { skip, limit }) {
  const query = { postId, moderationStatus: 'visible' };
  const [items, total] = await Promise.all([
    Comment.find(query).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
    Comment.countDocuments(query),
  ]);
  return { items, total };
}

async function updateById(commentId, updates) {
  return Comment.findByIdAndUpdate(commentId, { $set: updates }, { new: true });
}

module.exports = { create, findByIdPlain, listForPost, updateById };
