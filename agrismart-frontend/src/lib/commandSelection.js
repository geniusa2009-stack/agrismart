/**
 * lib/commandSelection.js
 *
 * Pure, framework-free selection logic for "which command should the
 * Irrigation page's Command Lifecycle card show for this valve."
 *
 * Extracted out of Irrigation.jsx so it can be unit-tested without a
 * React/JSX test harness (the frontend has no test framework installed).
 *
 * Design intent (per the command-lifecycle cleanup task):
 *   - Never fakes or reorders command status. The backend's
 *     GET /dashboard/farms/:farmId/commands already returns commands
 *     sorted by createdAt descending (commands.repository.js
 *     findRecentForFarm/findRecentForDevice), so this module does not
 *     change that ordering semantics — it defensively re-sorts by the
 *     same field (createdAt) as a client-side safety net only, in case
 *     the array is ever concatenated/filtered out of order upstream.
 *   - "Latest command" always means the truly most-recent-by-createdAt
 *     command for this valve's device — that is the honest signal,
 *     even when it is expired or failed. It is never swapped out for
 *     an older completed command.
 *   - A *secondary*, clearly-distinct signal — "most recent completed
 *     command" — is exposed separately so the UI can show it alongside
 *     (never instead of) an expired/failed primary command, without an
 *     extra API call (it's derived from the same already-fetched list).
 */

/**
 * Returns all commands belonging to the given deviceId, defensively
 * sorted by createdAt descending (newest first). Does not mutate the
 * input array.
 */
export function commandsForDevice(commands, deviceId) {
  if (!Array.isArray(commands) || !deviceId) return [];
  return commands
    .filter((c) => c && c.deviceId === deviceId)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * The truthful "current" command for this valve's device: the single
 * most-recently-created command, whatever its status. Returns null if
 * there are none. This must never be replaced by an older command just
 * because that older command looks "nicer" (e.g. completed).
 */
export function selectLatestCommand(commands, deviceId) {
  const sorted = commandsForDevice(commands, deviceId);
  return sorted[0] || null;
}

/**
 * The most recent COMPLETED command for this valve's device, or null if
 * none exists. Used only as a secondary, explicitly-labeled reference
 * point when the primary (latest) command is expired/failed — never to
 * replace or hide the primary command's real status.
 */
export function findMostRecentCompleted(commands, deviceId) {
  const sorted = commandsForDevice(commands, deviceId);
  return sorted.find((c) => c.status === 'completed') || null;
}
