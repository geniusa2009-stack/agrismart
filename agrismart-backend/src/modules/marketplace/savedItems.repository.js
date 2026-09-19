'use strict';

const SavedItem = require('./savedItem.model');

async function findOne(userId, targetType, targetId) {
  return SavedItem.findOne({ userId, targetType, targetId });
}

async function create({ userId, targetType, targetId }) {
  return SavedItem.create({ userId, targetType, targetId });
}

async function remove(userId, targetType, targetId) {
  return SavedItem.findOneAndDelete({ userId, targetType, targetId });
}

async function listForUser(userId, { targetType, skip, limit }) {
  const query = { userId };
  if (targetType) query.targetType = targetType;
  const [items, total] = await Promise.all([
    SavedItem.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    SavedItem.countDocuments(query),
  ]);
  return { items, total };
}

module.exports = { findOne, create, remove, listForUser };
