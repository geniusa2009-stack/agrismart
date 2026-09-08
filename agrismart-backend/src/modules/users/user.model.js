'use strict';

/**
 * modules/users/user.model.js
 *
 * Schema + indexes only — no business logic (Stage 2 section 3: models
 * must not orchestrate workflows). Password is always stored as a
 * bcrypt hash (see security/password.js); `passwordHash` is excluded
 * from default query projections (`select: false`) so a forgotten
 * `.lean()`/serialization step can't accidentally leak it.
 */

const mongoose = require('mongoose');
const { ROLES } = require('../../security/rbac');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.FARMER,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);


module.exports = mongoose.model('User', userSchema);
