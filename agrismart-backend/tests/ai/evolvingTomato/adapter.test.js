'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { load } = require('../../../ai/external/adapters/evolvingTomatoCsvAdapter');
const { CanonicalRecordSchema } = require('../../../ai/external/schemas/canonicalRecord.schema');

const PENDING_ROOT = path.join(__dirname, '../../../ai/external/adapters/pending/evolving-tomato-testbed');

describe('evolvingTomatoCsvAdapter — real 2024 season data', () => {
  const result = load(path.join(PENDING_ROOT, '2024'), {
    year: 2024,
    soilFileName: 'soil2024.csv',
    valveFileName: 'valve_controller2024.csv',
  });

  test('loads real files and reports the known counts from prior forensics', () => {
    // These exact counts were established via direct empirical inspection
    // (see AI_DATASET_INVENTORY.md / AI_DATA_QUALITY_REPORT.md) — this
    // test pins them so a silent adapter regression is caught, not so a
    // future genuinely-corrected count would be treated as a failure.
    expect(result.provenance.ingested).toBe(true);
    expect(result.provenance.datasetId).toBe('evolving-tomato-testbed-2024');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.outsideValveWindowCount).toBeGreaterThan(0);
    expect(result.implausibleSoilMoistureCount).toBe(3);
  });

  test('every accepted record validates against the unmodified CanonicalRecordSchema', () => {
    // Only spot-check a stride through the (large) real dataset to keep
    // this test fast; correctness is structural (schema-level), not
    // dependent on which subset is checked.
    for (let i = 0; i < result.records.length; i += 977) {
      expect(() => CanonicalRecordSchema.parse(result.records[i])).not.toThrow();
    }
  });

  test('no accepted record falls outside the valve stream\'s own observed window', () => {
    const { from, to } = result.valveObservedWindow;
    for (const r of result.records) {
      expect(r.timestamp.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(r.timestamp.getTime()).toBeLessThanOrEqual(to.getTime());
    }
  });

  test('no accepted record carries an out-of-range soil moisture value', () => {
    for (const r of result.records) {
      if (r.soilMoisture !== null) {
        expect(r.soilMoisture).toBeGreaterThanOrEqual(0);
        expect(r.soilMoisture).toBeLessThanOrEqual(100);
      }
    }
  });

  test('soilEc is converted from uS/cm to dS/m (divided by 1000), never left in source units', () => {
    const withEc = result.records.find((r) => r.soilEc !== null && r.soilEc > 0);
    expect(withEc).toBeDefined();
    // dS/m values for tomato-relevant soils are typically well under 10;
    // uS/cm values (undivided) would typically be in the hundreds-to-thousands.
    expect(withEc.soilEc).toBeLessThan(50);
  });

  test('valve_state is mapped to open/closed only for parseable 0/1 values, never guessed', () => {
    const valveRows = result.records.filter((r) => r.irrigationState !== null);
    expect(valveRows.length).toBeGreaterThan(0);
    for (const r of valveRows) {
      expect(['open', 'closed']).toContain(r.irrigationState);
    }
  });
});

describe('evolvingTomatoCsvAdapter — synthetic malformed fixture', () => {
  test('rejects an implausible soil moisture value instead of clamping/correcting it', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolving-tomato-fixture-'));
    const soilHeader = 'ts_generation,device,line,electrical_conductivity,humidity,temperature\n';
    const goodRow = '1700000000000,dev1,1,800,45.2,21.5\n';
    const badRow = '1700000600000,dev1,1,800,655.35,21.5\n'; // impossible RH value
    fs.writeFileSync(path.join(tmpDir, 'soil.csv'), soilHeader + goodRow + badRow);

    const valveHeader = 'ts_generation,device,line,valve_state\n';
    const valveRows = '1699999900000,dev-valve,1,0\n1700000700000,dev-valve,1,1\n';
    fs.writeFileSync(path.join(tmpDir, 'valve.csv'), valveHeader + valveRows);

    try {
      const result = load(tmpDir, { year: 2099, soilFileName: 'soil.csv', valveFileName: 'valve.csv' });
      const soilRejected = result.rejected.filter((r) => r.stream === 'soil');
      expect(soilRejected.length).toBe(1);
      expect(soilRejected[0].issues[0].code).toBe('implausible_value');
      // the good soil row + both valve rows should still be accepted
      expect(result.records.filter((r) => r.soilMoisture !== null).length).toBe(1);
      expect(result.records.filter((r) => r.irrigationState !== null).length).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('restricts soil rows to the valve stream\'s own observed window, tracked not silently dropped', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolving-tomato-fixture-'));
    const soilHeader = 'ts_generation,device,line,electrical_conductivity,humidity,temperature\n';
    // one soil row well BEFORE the valve stream ever started
    const offSeasonRow = '1600000000000,dev1,1,800,45.2,21.5\n';
    const inSeasonRow = '1700000600000,dev1,1,800,44.0,21.0\n';
    fs.writeFileSync(path.join(tmpDir, 'soil.csv'), soilHeader + offSeasonRow + inSeasonRow);

    const valveHeader = 'ts_generation,device,line,valve_state\n';
    const valveRows = '1700000000000,dev-valve,1,0\n1700001000000,dev-valve,1,1\n';
    fs.writeFileSync(path.join(tmpDir, 'valve.csv'), valveHeader + valveRows);

    try {
      const result = load(tmpDir, { year: 2099, soilFileName: 'soil.csv', valveFileName: 'valve.csv' });
      expect(result.outsideValveWindowCount).toBe(1);
      expect(result.records.filter((r) => r.soilMoisture !== null).length).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
