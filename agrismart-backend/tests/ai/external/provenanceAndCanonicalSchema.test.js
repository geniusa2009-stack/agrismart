'use strict';

const { ProvenanceSchema } = require('../../../ai/external/schemas/provenance.schema');
const { CanonicalRecordSchema } = require('../../../ai/external/schemas/canonicalRecord.schema');

function validProvenance(overrides = {}) {
  return {
    datasetId: 'test-ds',
    datasetName: 'Test Dataset',
    source: 'Test Source',
    url: null,
    doi: null,
    license: 'CC BY 4.0',
    country: null,
    region: null,
    crop: null,
    soilType: null,
    sensorType: null,
    samplingFrequency: null,
    timeRange: null,
    originalUnits: {},
    originalColumnNames: [],
    targetVariables: [],
    missingVariables: [],
    preprocessingPerformed: [],
    ingested: false,
    loadedAt: new Date(),
    ...overrides,
  };
}

describe('ai/external/schemas/provenance.schema', () => {
  test('requires the ingested boolean flag', () => {
    const { ingested: _ingested, ...withoutIngested } = validProvenance();
    expect(() => ProvenanceSchema.parse(withoutIngested)).toThrow();
  });

  test('accepts a complete, honest provenance record', () => {
    expect(() => ProvenanceSchema.parse(validProvenance())).not.toThrow();
  });

  test('rejects a non-boolean ingested value (cannot be fudged to a truthy string)', () => {
    expect(() => ProvenanceSchema.parse(validProvenance({ ingested: 'yes' }))).toThrow();
  });
});

describe('ai/external/schemas/canonicalRecord.schema (dataSource separation)', () => {
  function validRecord(overrides = {}) {
    return {
      timestamp: new Date(),
      farmId: null,
      fieldId: null,
      zoneId: null,
      crop: null,
      soilType: null,
      soilMoisture: 40,
      soilTemperature: null,
      soilEc: null,
      soilSalinity: null,
      airTemperature: null,
      relativeHumidity: null,
      precipitation: null,
      solarRadiation: null,
      windSpeed: null,
      irrigationState: null,
      irrigationDurationSeconds: null,
      waterVolumeLiters: null,
      source: 'external',
      datasetId: 'test-ds',
      ...overrides,
    };
  }

  test('only accepts the three defined dataSource values', () => {
    expect(() => CanonicalRecordSchema.parse(validRecord({ source: 'external' }))).not.toThrow();
    expect(() => CanonicalRecordSchema.parse(validRecord({ source: 'agrismart_real' }))).not.toThrow();
    expect(() => CanonicalRecordSchema.parse(validRecord({ source: 'synthetic_dev' }))).not.toThrow();
    expect(() => CanonicalRecordSchema.parse(validRecord({ source: 'made_up_source' }))).toThrow();
  });

  test('missing agricultural fields stay null rather than being rejected or defaulted to a fabricated number', () => {
    const parsed = CanonicalRecordSchema.parse(validRecord({ soilEc: null, precipitation: null }));
    expect(parsed.soilEc).toBeNull();
    expect(parsed.precipitation).toBeNull();
  });
});
