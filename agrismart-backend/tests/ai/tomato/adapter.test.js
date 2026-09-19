'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { load } = require('../../../ai/external/adapters/tomatoIrrigationCsvAdapter');
const { TomatoObservationSchema } = require('../../../ai/external/schemas/tomatoObservation.schema');

const REAL_FILE = path.join(__dirname, '../../../ai/external/adapters/pending/tomato_irrigation_dataset.csv');

describe('tomatoIrrigationCsvAdapter', () => {
  test('loads the real attached dataset with correct row/column counts', () => {
    const result = load(REAL_FILE);
    expect(result.totalRowsInFile).toBe(3000);
    expect(result.records.length).toBe(3000);
    expect(result.rejected.length).toBe(0);
    expect(result.provenance.ingested).toBe(true);
    expect(result.provenance.datasetId).toBe('mendeley-tomato-irrigation-33cngpcrmx-v2');
    expect(result.provenance.doi).toBe('10.17632/33cngpcrmx.2');
  });

  test('detects the real, known exact-duplicate-row count (28)', () => {
    const result = load(REAL_FILE);
    expect(result.duplicateRowCount).toBe(28);
  });

  test('every accepted record validates against TomatoObservationSchema', () => {
    const result = load(REAL_FILE);
    for (const record of result.records) {
      expect(() => TomatoObservationSchema.parse(record)).not.toThrow();
    }
  });

  test('records are already ordered non-decreasing by daysSincePlanting (no fabricated ordering)', () => {
    const result = load(REAL_FILE);
    expect(result.outOfOrderCount).toBe(0);
    let prev = -Infinity;
    for (const r of result.records) {
      expect(r.daysSincePlanting).toBeGreaterThanOrEqual(prev);
      prev = r.daysSincePlanting;
    }
  });

  test('rejects malformed rows instead of fabricating values, on a synthetic malformed fixture', () => {
    const tmp = path.join(os.tmpdir(), `malformed-tomato-${Date.now()}.csv`);
    const header = 'Temperature [_ C] ,Humidity [%],Soil moisture,Reference evapotranspiration,Evapotranspiration,Crop Coefficient,Crop Coefficient stage,Nitrogen [mg/kg],Phosphorus [mg/kg],Potassium,Solar Radiation ghi,Wind Speed,Days of planted,pH\n';
    const goodRow = '25,80,400,500,300,1.0,Mid stage,90,70,85,400,2,60,6.5\n';
    const badRow = '25,80,400,500,300,1.0,NOT_A_REAL_STAGE,90,70,85,400,2,60,6.5\n'; // invalid enum -> must be rejected, not coerced
    fs.writeFileSync(tmp, header + goodRow + badRow);
    try {
      const result = load(tmp);
      expect(result.records.length).toBe(1);
      expect(result.rejected.length).toBe(1);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
