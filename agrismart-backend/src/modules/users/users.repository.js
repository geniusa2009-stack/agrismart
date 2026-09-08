'use strict';

/**
 * modules/users/users.repository.js
 *
 * The only file allowed to call User model methods directly
 * (Stage 2 section 3: repositories are the sole Mongoose access point).
 */

const User = require('./user.model');

async function create({ email, passwordHash, fullName, role }) {
  return User.create({ email, passwordHash, fullName, role });
}

async function findByEmail(email) {
  return User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
}

async function findById(id) {
  return User.findById(id);
}

async function updateById(id, updates) {
  return User.findByIdAndUpdate(id, updates, { new: true });
}

module.exports = { create, findByEmail, findById, updateById };
