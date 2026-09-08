'use strict';

/**
 * security/rbac.js
 *
 * Role table and ownership-check helpers. Pure logic, no HTTP/DB
 * access — middleware/authorizeRole.js and authorizeOwnership.js wrap
 * these for use in the Express pipeline.
 *
 * Devices are deliberately NOT a role here (Stage 2 section 6/7):
 * they're a separate principal type authenticated via
 * middleware/authenticateDevice.js, never issued a user JWT, never
 * checked against this role table.
 */

const ROLES = Object.freeze({
  FARMER: 'farmer',
  AGRONOMIST: 'agronomist',
  TECHNICIAN: 'technician',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
});

const ROLE_HIERARCHY = Object.freeze({
  [ROLES.FARMER]: 0,
  [ROLES.AGRONOMIST]: 1,
  [ROLES.TECHNICIAN]: 1,
  [ROLES.ADMIN]: 2,
  [ROLES.SUPER_ADMIN]: 3,
});

/**
 * @param {string} role
 * @param {string[]} allowedRoles
 * @returns {boolean}
 */
function hasRole(role, allowedRoles) {
  return allowedRoles.includes(role);
}

/**
 * True if `role` is at least as privileged as `minimumRole` on the
 * staff hierarchy (admin > technician/agronomist > farmer). Used for
 * "technician or above may provision a device" style checks.
 */
function isAtLeast(role, minimumRole) {
  const roleRank = ROLE_HIERARCHY[role];
  const minimumRank = ROLE_HIERARCHY[minimumRole];
  if (roleRank === undefined || minimumRank === undefined) return false;
  return roleRank >= minimumRank;
}

/**
 * Anti-IDOR helper (Stage 2 section 6): given the authenticated
 * principal and a resource's ownerId/farmId, decide whether access is
 * allowed. This is intentionally ALSO applied inside repositories as a
 * mandatory query filter, not just here in middleware — see
 * modules/farms/farms.repository.js — so a missed middleware check
 * still can't leak cross-tenant data.
 *
 * @param {{ id: string, role: string, ownedFarmIds: string[] }} principal
 * @param {string} resourceFarmId
 * @returns {boolean}
 */
function ownsFarmResource(principal, resourceFarmId) {
  if (isAtLeast(principal.role, ROLES.ADMIN)) return true;
  return principal.ownedFarmIds.some((id) => String(id) === String(resourceFarmId));
}

/**
 * Stage 3.6 fix: the real authorization rule for staff (technician/
 * agronomist) access to a farm's devices — closes the gap flagged in
 * the Stage 3.5 report where any technician could provision/manage a
 * device on ANY farm regardless of assignment.
 *
 * Deliberately takes the already-fetched `farm` document (not just a
 * farmId) so this can be called from both:
 *   - middleware/authorizeFarmAccess.js (the HTTP-layer gate), and
 *   - devices.service.js (a second, independent check at the
 *     service/repository layer, per this stage's explicit requirement
 *     that authorization "must not depend exclusively on controllers")
 * without either one trusting the other's fetch.
 *
 * Rule:
 *   - admin/super_admin: always allowed (existing platform-staff
 *     override, unchanged from the rest of this codebase).
 *   - whoever owns the farm (`farm.ownerId`) is always allowed,
 *     REGARDLESS of that user's role. Farm creation
 *     (farms.controller.js's `create`) sets `ownerId` to whichever
 *     account created it and has never been restricted to the farmer
 *     role — a technician or agronomist account can and does create
 *     and own farms in this system's existing test fixtures. Ownership
 *     has to keep meaning "full control," independent of role, or
 *     accounts that legitimately own their own farm would be locked
 *     out of managing their own devices.
 *   - technician/agronomist accounts that do NOT own the farm are
 *     allowed only if explicitly listed in the farm's
 *     `authorizedTechnicianIds` (Option A from the Stage 3.6 decision
 *     record — no organization/team concept exists in this system, so
 *     this is the smallest correct relationship rather than inventing
 *     one).
 *   - anything else: denied.
 *
 * @param {{ id: string, role: string }} principal
 * @param {{ ownerId: unknown, authorizedTechnicianIds?: unknown[] }} farm
 * @returns {boolean}
 */
function isPrincipalAuthorizedForFarm(principal, farm) {
  if (!farm) return false;
  if (isAtLeast(principal.role, ROLES.ADMIN)) return true;
  if (String(farm.ownerId) === String(principal.id)) return true;
  if (principal.role === ROLES.TECHNICIAN || principal.role === ROLES.AGRONOMIST) {
    const authorizedIds = farm.authorizedTechnicianIds || [];
    return authorizedIds.some((id) => String(id) === String(principal.id));
  }
  return false;
}

module.exports = { ROLES, hasRole, isAtLeast, ownsFarmResource, isPrincipalAuthorizedForFarm };
