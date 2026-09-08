'use strict';

/**
 * modules/commands/commands.service.js
 *
 * Command state machine (Stage 2 section 9):
 *   PENDING -> QUEUED -> SENT -> ACKNOWLEDGED -> EXECUTING -> COMPLETED
 *                                                          -> FAILED
 *   (any non-terminal state) -> EXPIRED  (via the timeout sweep)
 *
 * Critically: ACKNOWLEDGED means the device's transport layer received
 * the message — it does NOT mean the physical actuator moved. Only
 * `reportExecutionResult()`, called when the device itself reports back
 * what actually happened, can mark a command COMPLETED or FAILED.
 * "Backend sent command" is never treated as "device executed command."
 */

const crypto = require('crypto');
const commandsRepository = require('./commands.repository');
const { COMMAND_STATUS } = require('./deviceCommand.model');
const config = require('../../config');
const metrics = require('../../observability/metrics');
const logger = require('../../observability/logger');
const { ApiError } = require('../../middleware/errorHandler');

/**
 * @param {{ deviceId, farmId, issuedByUserId, type, payload, idempotencyKey? }} params
 */
async function issueCommand({ deviceId, farmId, issuedByUserId, type, payload, idempotencyKey }) {
  const expiresAt = new Date(Date.now() + config.commands.expirySeconds * 1000);

  const command = await commandsRepository.create({
    idempotencyKey: idempotencyKey || crypto.randomUUID(),
    deviceId,
    farmId,
    issuedByUserId,
    type,
    payload,
    status: COMMAND_STATUS.PENDING,
    expiresAt,
    statusHistory: [{ status: COMMAND_STATUS.PENDING, at: new Date() }],
  });

  logger.info(
    { scope: 'commands', commandId: String(command._id), deviceId, type },
    'Command created.'
  );

  // In a real deployment this is where the command would actually be
  // dispatched to the device (HTTP long-poll response, or an MQTT
  // publish once that transport exists). Marking QUEUED here reflects
  // "accepted into the outbound queue," not delivery.
  return commandsRepository.updateStatus(command._id, COMMAND_STATUS.QUEUED);
}

/**
 * Internal dispatch step (no HTTP route — called by backend logic that
 * actually pushes the command out over a transport). No device-identity
 * check needed here since it's never invoked directly by a device.
 */
async function markSent(commandId) {
  const command = await commandsRepository.findById(commandId);
  if (!command) throw ApiError.notFound('Command not found.');
  if (command.status !== COMMAND_STATUS.QUEUED) {
    throw ApiError.badRequest(`Cannot transition command from '${command.status}' to 'sent'.`);
  }
  return commandsRepository.updateStatus(commandId, COMMAND_STATUS.SENT);
}

/**
 * Called when the device's transport layer confirms receipt (e.g. an
 * MQTT QoS ack, or an HTTP 200 to a poll). This proves ONLY that the
 * message arrived — never that the valve moved.
 *
 * `requestingDeviceId` is mandatory and checked against the command's
 * OWN deviceId (Stage 3 self-review finding, fixed before completion):
 * without this check, any authenticated device could acknowledge or
 * report results for ANY other device's command by guessing/enumerating
 * a commandId — a cross-device IDOR that, for a command controlling a
 * physical valve, could let one device falsely confirm another farm's
 * irrigation command as completed.
 */
async function acknowledge(commandId, requestingDeviceId) {
  return transition(commandId, [COMMAND_STATUS.SENT], COMMAND_STATUS.ACKNOWLEDGED, requestingDeviceId);
}

async function markExecuting(commandId, requestingDeviceId) {
  return transition(
    commandId,
    [COMMAND_STATUS.ACKNOWLEDGED],
    COMMAND_STATUS.EXECUTING,
    requestingDeviceId
  );
}

/**
 * The ONLY way a command reaches a terminal success/failure state —
 * driven by the device itself reporting what actually happened, not by
 * anything the backend assumes. `requestingDeviceId` is checked against
 * the command's owning device for the same reason as acknowledge().
 */
async function reportExecutionResult(commandId, requestingDeviceId, { success, details }) {
  const command = await commandsRepository.findById(commandId);
  if (!command) throw ApiError.notFound('Command not found.');
  assertDeviceOwnsCommand(command, requestingDeviceId);

  const finalStatus = success ? COMMAND_STATUS.COMPLETED : COMMAND_STATUS.FAILED;
  const updated = await commandsRepository.setExecutionResult(commandId, {
    status: finalStatus,
    executionResult: details,
  });

  metrics.increment(success ? 'command_success_total' : 'command_failure_total');
  return updated;
}

function assertDeviceOwnsCommand(command, requestingDeviceId) {
  if (command.deviceId !== requestingDeviceId) {
    // 404, not 403 — same anti-enumeration reasoning as the farm
    // ownership check (middleware/authorizeOwnership.js): don't confirm
    // to an unrelated device that a given commandId exists.
    throw ApiError.notFound('Command not found.');
  }
}

async function transition(commandId, allowedFromStatuses, toStatus, requestingDeviceId) {
  const command = await commandsRepository.findById(commandId);
  if (!command) throw ApiError.notFound('Command not found.');
  assertDeviceOwnsCommand(command, requestingDeviceId);

  if (!allowedFromStatuses.includes(command.status)) {
    throw ApiError.badRequest(
      `Cannot transition command from '${command.status}' to '${toStatus}'.`
    );
  }

  return commandsRepository.updateStatus(commandId, toStatus);
}

/**
 * Timeout sweep: transitions any command past its expiresAt into
 * EXPIRED. Documented risk (Stage 2 section 21): this is safe as a
 * plain in-process interval on exactly ONE running instance. The
 * moment there are 2+ instances, this MUST move behind a single-owner
 * mechanism (a DB lock or a job queue) — running it independently on N
 * instances would race to expire/re-process the same commands. Not
 * built here since this deployment is single-instance at this stage
 * (cluster mode was removed per Stage 2 section 5C).
 */
async function sweepExpiredCommands() {
  const expired = await commandsRepository.findExpiredPending();
  for (const command of expired) {
    await commandsRepository.updateStatus(command._id, COMMAND_STATUS.EXPIRED, 'Expired by timeout sweep.');
    logger.warn(
      { scope: 'commands', commandId: String(command._id), deviceId: command.deviceId },
      'Command expired without execution confirmation.'
    );
  }
  return expired.length;
}

module.exports = {
  issueCommand,
  markSent,
  acknowledge,
  markExecuting,
  reportExecutionResult,
  sweepExpiredCommands,
};
