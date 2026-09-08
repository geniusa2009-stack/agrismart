'use strict';

/**
 * modules/health/health.routes.js
 *
 * /health/live vs /health/ready split, unchanged in spirit from Stage 1
 * (already correct), relocated under src/modules per Stage 2's target
 * tree. readyState now comes directly from
 * infrastructure/database/mongoose.js's getConnectionHealth(), which
 * reads mongoose.connection.readyState with no custom state machine
 * layered on top (Stage 1 finding A1 fix).
 */

const express = require('express');
const { getConnectionHealth } = require('../../infrastructure/database/mongoose');
const { asyncHandler } = require('../../middleware/errorHandler');

const router = express.Router();

router.get(
  '/live',
  asyncHandler(async (req, res) => {
    res.status(200).json({
      success: true,
      status: 'live',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  })
);

router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    const db = getConnectionHealth();
    const isReady = db.readyState === 1;

    res.status(isReady ? 200 : 503).json({
      success: isReady,
      status: isReady ? 'ready' : 'not_ready',
      dependencies: { mongodb: db },
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
