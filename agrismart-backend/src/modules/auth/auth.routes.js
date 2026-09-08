'use strict';

const express = require('express');
const controller = require('./auth.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { authLimiter } = require('../../middleware/rateLimiter');
const { registerSchema, loginSchema, refreshSchema } = require('./auth.validators');

const router = express.Router();

router.post('/register', authLimiter, validate(registerSchema), controller.register);
router.post('/login', authLimiter, validate(loginSchema), controller.login);
router.post('/refresh', authLimiter, validate(refreshSchema), controller.refresh);
router.post('/logout', authLimiter, validate(refreshSchema), controller.logout);
router.post('/logout-all', authenticate, controller.logoutAll);

module.exports = router;
