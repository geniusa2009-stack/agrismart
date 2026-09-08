'use strict';

const express = require('express');
const controller = require('./users.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { updateProfileSchema } = require('./users.validators');

const router = express.Router();

router.use(authenticate);

router.get('/me', controller.getMe);
router.patch('/me', validate(updateProfileSchema), controller.updateMe);

module.exports = router;
