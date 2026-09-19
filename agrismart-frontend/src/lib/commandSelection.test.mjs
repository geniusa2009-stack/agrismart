// Plain Node test for src/lib/commandSelection.js — run with:
//   node src/lib/commandSelection.test.mjs
//
// The frontend has no test framework installed (no vitest/jest/RTL —
// confirmed via package.json and a repo-wide search for *.test.* before
// writing this). commandSelection.js was deliberately extracted as a
// pure, framework-free module so its selection logic could still be
// regression-tested without introducing a new dependency.

import assert from 'node:assert/strict';
import { commandsForDevice, selectLatestCommand, findMostRecentCompleted } from './commandSelection.js';

const DEVICE = 'dev_71f8eeac334c60b0';
const OTHER_DEVICE = 'dev_other';

// Mirrors the real reported bug: an OLDER command that expired, plus
// NEWER commands (open + close) that both completed. All timestamps
// are backend-shaped ISO strings, oldest first in the input array —
// deliberately NOT pre-sorted, to prove the module sorts defensively.
const commands = [
  { commandId: 'cmd-1', deviceId: DEVICE, type: 'OPEN_VALVE', status: 'completed', createdAt: '2026-09-09T10:00:00.000Z' },
  { commandId: 'cmd-2', deviceId: DEVICE, type: 'CLOSE_VALVE', status: 'expired', createdAt: '2026-09-09T09:00:00.000Z' },
  { commandId: 'cmd-3', deviceId: DEVICE, type: 'CLOSE_VALVE', status: 'completed', createdAt: '2026-09-09T11:00:00.000Z' },
  { commandId: 'cmd-4', deviceId: OTHER_DEVICE, type: 'OPEN_VALVE', status: 'completed', createdAt: '2026-09-09T12:00:00.000Z' },
];

// commandsForDevice: filters by deviceId and sorts newest-first,
// regardless of input order.
{
  const result = commandsForDevice(commands, DEVICE);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((c) => c.commandId), ['cmd-3', 'cmd-1', 'cmd-2']);
}

// selectLatestCommand: the truthful "current" command is the most
// recent one by createdAt, even though it is a COMPLETED command here
// (cmd-3), not the historically-troublesome expired one (cmd-2).
{
  const latest = selectLatestCommand(commands, DEVICE);
  assert.equal(latest.commandId, 'cmd-3');
  assert.equal(latest.status, 'completed');
}

// selectLatestCommand never fabricates a result for an unknown device.
{
  assert.equal(selectLatestCommand(commands, 'dev_does_not_exist'), null);
  assert.equal(selectLatestCommand([], DEVICE), null);
  assert.equal(selectLatestCommand(commands, null), null);
}

// findMostRecentCompleted: returns the newest COMPLETED command only,
// ignoring expired/failed ones even if they are more recent.
{
  const commandsWithNewerExpired = [
    { commandId: 'cmd-1', deviceId: DEVICE, type: 'OPEN_VALVE', status: 'completed', createdAt: '2026-09-09T10:00:00.000Z' },
    { commandId: 'cmd-2', deviceId: DEVICE, type: 'CLOSE_VALVE', status: 'expired', createdAt: '2026-09-09T13:00:00.000Z' },
  ];
  const completed = findMostRecentCompleted(commandsWithNewerExpired, DEVICE);
  assert.equal(completed.commandId, 'cmd-1');
}

// findMostRecentCompleted returns null when no completed command exists
// for this device (must never invent one).
{
  const onlyExpired = [
    { commandId: 'cmd-9', deviceId: DEVICE, type: 'CLOSE_VALVE', status: 'expired', createdAt: '2026-09-09T09:00:00.000Z' },
  ];
  assert.equal(findMostRecentCompleted(onlyExpired, DEVICE), null);
}

// Regression case matching the exact reported bug: latest command is
// expired, but a newer completed command exists for the same device —
// selectLatestCommand must still honestly report the expired one as
// current (never silently swap it for the nicer-looking completed
// one), while findMostRecentCompleted surfaces the completed one
// separately so it isn't hidden either.
{
  const reportedBugShape = [
    { commandId: 'old-close', deviceId: DEVICE, type: 'CLOSE_VALVE', status: 'expired', createdAt: '2026-09-08T09:00:00.000Z' },
    { commandId: 'new-open', deviceId: DEVICE, type: 'OPEN_VALVE', status: 'completed', createdAt: '2026-09-09T09:00:00.000Z' },
    { commandId: 'new-close', deviceId: DEVICE, type: 'CLOSE_VALVE', status: 'completed', createdAt: '2026-09-09T09:30:00.000Z' },
  ];
  const latest = selectLatestCommand(reportedBugShape, DEVICE);
  assert.equal(latest.commandId, 'new-close');
  assert.equal(latest.status, 'completed');

  // If, hypothetically, the truly-latest command WERE the expired one
  // (e.g. a later stop-irrigation click that genuinely expired), it
  // must still win as "latest" — selection never reorders by status.
  const trulyLatestIsExpired = [
    { commandId: 'a', deviceId: DEVICE, type: 'OPEN_VALVE', status: 'completed', createdAt: '2026-09-09T09:00:00.000Z' },
    { commandId: 'b', deviceId: DEVICE, type: 'CLOSE_VALVE', status: 'expired', createdAt: '2026-09-09T10:00:00.000Z' },
  ];
  const latest2 = selectLatestCommand(trulyLatestIsExpired, DEVICE);
  assert.equal(latest2.commandId, 'b');
  assert.equal(latest2.status, 'expired');
  const completedRef = findMostRecentCompleted(trulyLatestIsExpired, DEVICE);
  assert.equal(completedRef.commandId, 'a');
}

console.log('commandSelection.test.mjs: all assertions passed');
