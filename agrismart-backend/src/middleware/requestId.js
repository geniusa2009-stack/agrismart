'use strict';

/**
 * middleware/requestId.js
 *
 * Assigns a per-hop request ID and an end-to-end correlation ID to
 * every request (Stage 2 section 5G). `requestId` is always freshly
 * generated for this hop (echoed back via X-Request-Id). `correlationId`
 * is honored from an inbound `X-Correlation-Id` header when present
 * (letting a future mobile app / IoT gateway trace a call across
 * multiple internal hops) and generated if absent.
 */

const crypto = require('crypto');

function requestId(req, res, next) {
  const incomingRequestId = req.headers['x-request-id'];
  req.id = (typeof incomingRequestId === 'string' && incomingRequestId.trim()) || crypto.randomUUID();

  const incomingCorrelationId = req.headers['x-correlation-id'];
  req.correlationId =
    (typeof incomingCorrelationId === 'string' && incomingCorrelationId.trim()) || req.id;

  res.setHeader('X-Request-Id', req.id);
  res.setHeader('X-Correlation-Id', req.correlationId);
  next();
}

module.exports = requestId;
