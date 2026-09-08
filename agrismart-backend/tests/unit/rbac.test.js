'use strict';

const { ROLES, isAtLeast, ownsFarmResource, isPrincipalAuthorizedForFarm } = require('../../src/security/rbac');

describe('security/rbac', () => {
  test('isAtLeast respects the staff hierarchy', () => {
    expect(isAtLeast(ROLES.ADMIN, ROLES.TECHNICIAN)).toBe(true);
    expect(isAtLeast(ROLES.FARMER, ROLES.TECHNICIAN)).toBe(false);
    expect(isAtLeast(ROLES.SUPER_ADMIN, ROLES.ADMIN)).toBe(true);
  });

  test('ownsFarmResource allows the owning farmer', () => {
    const principal = { id: 'user1', role: ROLES.FARMER, ownedFarmIds: ['farmA'] };
    expect(ownsFarmResource(principal, 'farmA')).toBe(true);
  });

  test('ownsFarmResource denies a non-owning farmer (anti-IDOR)', () => {
    const principal = { id: 'user1', role: ROLES.FARMER, ownedFarmIds: ['farmA'] };
    expect(ownsFarmResource(principal, 'farmB')).toBe(false);
  });

  test('ownsFarmResource always allows admin/super_admin', () => {
    const principal = { id: 'admin1', role: ROLES.ADMIN, ownedFarmIds: [] };
    expect(ownsFarmResource(principal, 'anyFarm')).toBe(true);
  });

  // Stage 3.6: real unit coverage (executable without a database — pure
  // logic, no Mongoose) for the device-provisioning authorization fix.
  describe('isPrincipalAuthorizedForFarm (Stage 3.6 device-provisioning fix)', () => {
    const farm = { ownerId: 'farmer1', authorizedTechnicianIds: ['tech1'] };

    test('the farm owner is authorized, regardless of their role', () => {
      expect(isPrincipalAuthorizedForFarm({ id: 'farmer1', role: ROLES.FARMER }, farm)).toBe(true);
      expect(isPrincipalAuthorizedForFarm({ id: 'farmer1', role: ROLES.TECHNICIAN }, farm)).toBe(true);
    });

    test('a different farmer is denied', () => {
      expect(isPrincipalAuthorizedForFarm({ id: 'farmer2', role: ROLES.FARMER }, farm)).toBe(false);
    });

    test('a technician explicitly listed in authorizedTechnicianIds is authorized', () => {
      expect(isPrincipalAuthorizedForFarm({ id: 'tech1', role: ROLES.TECHNICIAN }, farm)).toBe(true);
    });

    test('a technician NOT listed is denied (the Stage 3.5 gap this closes)', () => {
      expect(isPrincipalAuthorizedForFarm({ id: 'tech2', role: ROLES.TECHNICIAN }, farm)).toBe(false);
    });

    test('an agronomist explicitly listed is authorized, same as technician', () => {
      expect(isPrincipalAuthorizedForFarm({ id: 'tech1', role: ROLES.AGRONOMIST }, farm)).toBe(true);
    });

    test('admin and super_admin always bypass, even with no farm relationship', () => {
      expect(isPrincipalAuthorizedForFarm({ id: 'admin1', role: ROLES.ADMIN }, farm)).toBe(true);
      expect(isPrincipalAuthorizedForFarm({ id: 'root1', role: ROLES.SUPER_ADMIN }, farm)).toBe(true);
    });

    test('changing the checked farmId (IDOR-style) does not fool the check — a farm with a different ownerId is denied', () => {
      const otherFarm = { ownerId: 'farmer2', authorizedTechnicianIds: [] };
      expect(isPrincipalAuthorizedForFarm({ id: 'farmer1', role: ROLES.FARMER }, otherFarm)).toBe(false);
      expect(isPrincipalAuthorizedForFarm({ id: 'tech1', role: ROLES.TECHNICIAN }, otherFarm)).toBe(false);
    });

    test('returns false for a null/missing farm rather than throwing', () => {
      expect(isPrincipalAuthorizedForFarm({ id: 'farmer1', role: ROLES.FARMER }, null)).toBe(false);
    });
  });
});
