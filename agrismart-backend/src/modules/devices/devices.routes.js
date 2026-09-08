'use strict';

/**
 * modules/devices/devices.routes.js
 *
 * MVP fix (previously flagged as a known gap in the Stage 3 completion
 * report, and a hard-blocking bug for the frontend): provisioning and
 * lifecycle endpoints used to gate on ROLE only
 * (technician/admin/super_admin), never on whether the caller actually
 * owns/is-authorized-for the target farm — which also meant a plain
 * FARMER account (the only role a real end-user of this app has) could
 * never provision or manage their own devices at all.
 *
 * Fixed by reusing the existing Stage 3.6 ownership middleware
 * (middleware/authorizeFarmAccess.js — already built, already tested,
 * previously just not wired into these routes): a farm owner (any
 * role) or platform staff (admin/super_admin bypass baked into
 * isPrincipalAuthorizedForFarm) can now provision/manage devices on
 * their own farm; nobody can act on a farm they don't own or aren't
 * assigned to. This is a strict tightening + correctness fix, not a
 * relaxation — a technician with no farm relationship can no longer
 * touch every farm's devices, and a farmer can finally manage their
 * own.
 */

const express = require('express');
const controller = require('./devices.controller');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const authenticateDevice = require('../../middleware/authenticateDevice');
const { authorizeFarmAccessFromBody, authorizeDeviceFarmAccess } = require('../../middleware/authorizeFarmAccess');
const { deviceIngestLimiter } = require('../../middleware/rateLimiter');
const {
  provisionDeviceSchema,
  deviceIdParamsSchema,
  heartbeatSchema,
  updateDeviceSchema,
} = require('./devices.validators');

const router = express.Router();

router.post(
  '/',
  authenticate,
  validate(provisionDeviceSchema),
  authorizeFarmAccessFromBody('farmId'),
  controller.provision
);

router.post(
  '/:deviceId/rotate-secret',
  authenticate,
  validate(deviceIdParamsSchema, 'params'),
  authorizeDeviceFarmAccess('deviceId'),
  controller.rotateSecret
);
router.post(
  '/:deviceId/suspend',
  authenticate,
  validate(deviceIdParamsSchema, 'params'),
  authorizeDeviceFarmAccess('deviceId'),
  controller.suspend
);
router.post(
  '/:deviceId/activate',
  authenticate,
  validate(deviceIdParamsSchema, 'params'),
  authorizeDeviceFarmAccess('deviceId'),
  controller.activate
);
router.post(
  '/:deviceId/revoke',
  authenticate,
  validate(deviceIdParamsSchema, 'params'),
  authorizeDeviceFarmAccess('deviceId'),
  controller.revoke
);
router.patch(
  '/:deviceId',
  authenticate,
  validate(deviceIdParamsSchema, 'params'),
  authorizeDeviceFarmAccess('deviceId'),
  validate(updateDeviceSchema),
  controller.rename
);

// --- Device-authenticated endpoint (the ESP32 itself calls this) ---
router.post(
  '/heartbeat',
  authenticateDevice,
  deviceIngestLimiter,
  validate(heartbeatSchema),
  controller.heartbeat
);

module.exports = router;
