'use strict';

const usersRepository = require('./users.repository');
const { ApiError } = require('../../middleware/errorHandler');

function serializeUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

async function getProfile(userId) {
  const user = await usersRepository.findById(userId);
  if (!user) throw ApiError.notFound('User not found.');
  return serializeUser(user);
}

async function updateProfile(userId, updates) {
  const user = await usersRepository.updateById(userId, updates);
  if (!user) throw ApiError.notFound('User not found.');
  return serializeUser(user);
}

module.exports = { getProfile, updateProfile, serializeUser };
