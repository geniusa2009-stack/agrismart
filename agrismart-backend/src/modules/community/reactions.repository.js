'use strict';

const Reaction = require('./reaction.model');

async function findOne(userId, targetType, targetId) {
  return Reaction.findOne({ userId, targetType, targetId });
}

async function create({ userId, targetType, targetId, type }) {
  return Reaction.create({ userId, targetType, targetId, type });
}

async function remove(userId, targetType, targetId) {
  return Reaction.findOneAndDelete({ userId, targetType, targetId });
}

module.exports = { findOne, create, remove };
