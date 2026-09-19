'use strict';

const Follow = require('./follow.model');

async function findEdge(followerId, followingId) {
  return Follow.findOne({ followerId, followingId });
}

async function create(followerId, followingId) {
  return Follow.create({ followerId, followingId });
}

async function remove(followerId, followingId) {
  return Follow.findOneAndDelete({ followerId, followingId });
}

async function listFollowing(followerId, { skip, limit }) {
  const [items, total] = await Promise.all([
    Follow.find({ followerId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Follow.countDocuments({ followerId }),
  ]);
  return { items, total };
}

async function listFollowers(followingId, { skip, limit }) {
  const [items, total] = await Promise.all([
    Follow.find({ followingId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Follow.countDocuments({ followingId }),
  ]);
  return { items, total };
}

module.exports = { findEdge, create, remove, listFollowing, listFollowers };
