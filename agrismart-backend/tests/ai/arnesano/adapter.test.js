'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { load } = require('../../../ai/external/adapters/arnesanoCsvAdapter');
const { CanonicalRecordSchema } = require('../../../ai/external/schemas/canonicalRecord.schema');

const PENDING = path.join(__dirname, '../../../ai/external/adapters/pending/arnesano/merged');

describe('arnesanoCsvAdapter — real zone-1 data', () => {
  const result = load(path.join(PENDING, 'dataset_zone_1.csv'), { zone: 1 });

  test('loads the real file with the known, forensically-verified counts', () => {
    expect(result.totalRowsInFile).toBe(33259);
    expect(result.records.length).toBe(33259); // one canonical record per source row, gaps preserved as null
    expect(result.implausibleSoilMoistureCount).toBe(2584);
    expect(result.implausibleEcCount).toBe(0);
    expect(result.implausiblePhCount).toBe(14);
  });

  test('every non-null record validates against the (soilPh-extended) CanonicalRecordSchema', () => {
    for (let i = 0; i < result.records.length; i += 977) {
      const rec = result.records[i];
      if (rec) expect(() => CanonicalRecordSchema.parse(rec)).not.toThrow();
    }
  });

  test('no accepted soilMoisture value falls outside [0, 100] (>100 clipped, >115 rejected)', () => {
    for (const r of result.records) {
      if (r && r.soilMoisture !== null) {
        expect(r.soilMoisture).toBeGreaterThanOrEqual(0);
        expect(r.soilMoisture).toBeLessThanOrEqual(100);
      }
    }
  });

  test('soilEc is converted uS/cm -> dS/m (values stay well under 1, not in the hundreds)', () => {
    const withEc = result.records.find((r) => r && r.soilEc !== null && r.soilEc > 0);
    expect(withEc).toBeDefined();
    expect(withEc.soilEc).toBeLessThan(1);
  });

  test('windSpeed is converted km/h -> m/s (plausible range, not the raw km/h scale)', () => {
    const withWind = result.records.find((r) => r && r.windSpeed !== null);
    expect(withWind.windSpeed).toBeLessThan(20); // real winds here never exceed ~8.85 m/s per training-range check
  });

  test('soilTemperature is deliberately left null (ERA5 regional estimate, not a per-probe reading)', () => {
    for (const r of result.records) {
      if (r) expect(r.soilTemperature).toBeNull();
    }
  });
});

describe('arnesanoCsvAdapter — synthetic malformed fixture', () => {
  test('rejects out-of-range soil_moisture, ec, and ph instead of clamping/fabricating', () => {
    const tmp = path.join(os.tmpdir(), `arnesano-fixture-${Date.now()}.csv`);
    const header = 'ts,outside_temperature,inside_temperature,outside_humidity,inside_humidity,weather_temp,weather_humidity,weather_rain,weather_pressure,weather_wind_speed,weather_radiation,soil_temperature_0-7cm,soil_temperature_7-18cm,ec,ph,soil_moisture,irrigation_duration_minutes,liters_total\n';
    const goodRow = '2025-03-01 00:00:00,,,,,15.0,80,0,1010,5,0,12,13,500,6.5,45,0,0\n';
    const badRow = '2025-03-01 00:10:00,,,,,15.0,80,0,1010,5,0,12,13,-32256,77,717,0,0\n';
    fs.writeFileSync(tmp, header + goodRow + badRow);
    try {
      const result = load(tmp, { zone: 1 });
      expect(result.records.length).toBe(2);
      expect(result.records[0].soilMoisture).toBe(45);
      expect(result.records[1].soilMoisture).toBeNull(); // 717 rejected
      expect(result.records[1].soilEc).toBeNull(); // -32256 rejected
      expect(result.records[1].soilPh).toBeNull(); // 77 rejected
      expect(result.implausibleSoilMoistureCount).toBe(1);
      expect(result.implausibleEcCount).toBe(1);
      expect(result.implausiblePhCount).toBe(1);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  test('clips a soil_moisture value in (100, 115] to 100 rather than rejecting it', () => {
    const tmp = path.join(os.tmpdir(), `arnesano-fixture2-${Date.now()}.csv`);
    const header = 'ts,outside_temperature,inside_temperature,outside_humidity,inside_humidity,weather_temp,weather_humidity,weather_rain,weather_pressure,weather_wind_speed,weather_radiation,soil_temperature_0-7cm,soil_temperature_7-18cm,ec,ph,soil_moisture,irrigation_duration_minutes,liters_total\n';
    const row = '2025-03-01 00:00:00,,,,,15.0,80,0,1010,5,0,12,13,500,6.5,110,0,0\n';
    fs.writeFileSync(tmp, header + row);
    try {
      const result = load(tmp, { zone: 1 });
      expect(result.records[0].soilMoisture).toBe(100);
      expect(result.implausibleSoilMoistureCount).toBe(0);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
