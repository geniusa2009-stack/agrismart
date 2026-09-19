'use strict';

const path = require('path');
const scanAdapter = require('../../../ai/external/adapters/scanNetworkAdapter');
const genericIotAdapter = require('../../../ai/external/adapters/genericIotCsvAdapter');

const SCAN_FIXTURE = path.join(__dirname, '../../../ai/external/adapters/fixtures/scan_network_structural_fixture.csv');
const IOT_FIXTURE = path.join(__dirname, '../../../ai/external/adapters/fixtures/generic_iot_agri_structural_fixture.csv');

describe('ai/external/adapters (parsing + provenance + units)', () => {
  test('scanNetworkAdapter parses every fixture row and converts units explicitly', () => {
    const { provenance, records, rejected } = scanAdapter.load(SCAN_FIXTURE, { ingested: false, fixtureNote: 'test' });
    expect(rejected.length).toBe(0);
    expect(records.length).toBe(8);
    // Fahrenheit 74.1 -> Celsius conversion applied, not left as-is.
    expect(records[0].airTemperature).toBeCloseTo((74.1 - 32) * (5 / 9), 1);
    // Inches -> mm conversion applied.
    expect(records[3].precipitation).toBeCloseTo(0.01 * 25.4, 1);
    expect(provenance.source).toBe('USDA NRCS');
    expect(provenance.ingested).toBe(false);
  });

  test('scanNetworkAdapter documents every field this dataset genuinely cannot populate', () => {
    const { provenance, records } = scanAdapter.load(SCAN_FIXTURE, { ingested: false });
    expect(provenance.missingVariables).toEqual(expect.arrayContaining(['soilEc', 'irrigationState']));
    for (const r of records) {
      expect(r.soilEc).toBeNull();
      expect(r.irrigationState).toBeNull();
    }
  });

  test('genericIotCsvAdapter respects an explicit column map and leaves unmapped fields null (never guesses)', () => {
    const columnMap = { timestamp: 'timestamp', device: 'device', soilMoisturePercent: 'soil_moisture_pct' };
    const { records, provenance } = genericIotAdapter.load(IOT_FIXTURE, columnMap, { ingested: false });
    expect(records.length).toBe(8);
    expect(records[0].soilMoisture).toBe(55.2);
    expect(records[0].soilTemperature).toBeNull(); // not in columnMap -> genuinely null
    expect(provenance.missingVariables).toContain('soilTemperatureCelsius');
  });

  test('genericIotCsvAdapter derives irrigationState from an explicit 0/1 flag', () => {
    const columnMap = { timestamp: 'timestamp', device: 'device', irrigationOnFlag: 'irrigation_on' };
    const { records } = genericIotAdapter.load(IOT_FIXTURE, columnMap, { ingested: false });
    expect(records[4].irrigationState).toBe('open');
    expect(records[0].irrigationState).toBe('closed');
  });

  test('every adapter marks fixtures ingested:false — never claims fixture data is real', () => {
    const scan = scanAdapter.load(SCAN_FIXTURE, { ingested: false });
    const iot = genericIotAdapter.load(IOT_FIXTURE, { timestamp: 'timestamp' }, { ingested: false });
    expect(scan.provenance.ingested).toBe(false);
    expect(iot.provenance.ingested).toBe(false);
  });
});
