'use strict';

/**
 * ai/external/benchmark/datasetRegistry.js
 *
 * Catalog of every dataset the benchmark CLI can run against —
 * AgriSmart's own (real/synthetic-dev, via the first AI workstream's
 * ai/data/ loaders) AND external adapters (this workstream). Each
 * entry's `kind` and `ingested` flag are what every downstream report
 * checks before describing a result as real external validation.
 */

const path = require('path');
const scanAdapter = require('../adapters/scanNetworkAdapter');
const genericIotAdapter = require('../adapters/genericIotCsvAdapter');
const { generateSyntheticDevDataset } = require('../../data/syntheticDevData');

const FIXTURES_DIR = path.join(__dirname, '../adapters/fixtures');

function loadScanFixture() {
  return scanAdapter.load(path.join(FIXTURES_DIR, 'scan_network_structural_fixture.csv'), {
    ingested: false,
    fixtureNote: 'Structural fixture matching SCAN report format — NOT downloaded real SCAN data (network egress blocked in this environment; see ai/external/README.md).',
  });
}

function loadGenericIotFixture() {
  const columnMap = {
    timestamp: 'timestamp',
    device: 'device',
    soilMoisturePercent: 'soil_moisture_pct',
    soilTemperatureCelsius: 'soil_temp_c',
    airTemperatureCelsius: 'air_temp_c',
    relativeHumidityPercent: 'humidity_pct',
    soilEcDsPerM: 'ec_dS_m',
    irrigationOnFlag: 'irrigation_on',
  };
  return genericIotAdapter.load(path.join(FIXTURES_DIR, 'generic_iot_agri_structural_fixture.csv'), columnMap, {
    ingested: false,
    fixtureNote: 'Structural fixture matching a common Kaggle/Mendeley IoT-agriculture CSV shape — NOT a downloaded real dataset.',
  });
}

/** Wraps AgriSmart's OWN synthetic-dev generator behind the same {provenance, records} shape, so it can sit in the same registry/benchmark path as external datasets without being confused for one. */
function loadAgriSmartSyntheticDev() {
  const synthetic = generateSyntheticDevDataset({ days: 45, intervalMinutes: 15, seed: 42 });
  const records = synthetic.telemetry.map((t) => ({
    timestamp: t.recordedAt,
    farmId: null,
    fieldId: synthetic.meta.deviceId,
    zoneId: null,
    crop: null,
    soilType: null,
    soilMoisture: t.readings.soilMoisturePercent,
    soilTemperature: null,
    soilEc: null,
    soilSalinity: t.readings.soilSalinityPpt,
    airTemperature: t.readings.temperatureCelsius,
    relativeHumidity: null,
    precipitation: null,
    solarRadiation: null,
    windSpeed: null,
    irrigationState: null, // derived from irrigationEvents separately, not from a per-row flag here
    irrigationDurationSeconds: null,
    waterVolumeLiters: null,
    source: 'synthetic_dev',
    datasetId: 'agrismart-synthetic-dev',
  }));
  // Attach irrigation events directly (bypass irrigationState-transition derivation, since we already have them).
  records.__irrigationEvents = synthetic.irrigationEvents;

  const provenance = {
    datasetId: 'agrismart-synthetic-dev',
    datasetName: 'AgriSmart synthetic development dataset',
    source: 'AgriSmart (ai/data/syntheticDevData.js) — fabricated for pipeline testing',
    url: null,
    doi: null,
    license: 'N/A (internally generated, not a redistributed dataset)',
    country: null,
    region: null,
    crop: null,
    soilType: null,
    sensorType: 'simulated',
    samplingFrequency: '15-minute (simulated)',
    timeRange: { from: synthetic.telemetry[0].recordedAt, to: synthetic.telemetry[synthetic.telemetry.length - 1].recordedAt },
    originalUnits: { soilMoisturePercent: 'percent', temperatureCelsius: 'degrees Celsius', soilSalinityPpt: 'ppt' },
    originalColumnNames: ['recordedAt', 'soilMoisturePercent', 'temperatureCelsius', 'soilSalinityPpt'],
    targetVariables: ['soilMoisturePercent'],
    missingVariables: ['soilEc', 'relativeHumidity', 'precipitation', 'solarRadiation', 'windSpeed', 'crop', 'soilType', 'farmId', 'zoneId'],
    preprocessingPerformed: ['None — generated directly in canonical shape.'],
    ingested: false, // synthetic, never "ingested" in the real-dataset sense
    fixtureNote: 'Synthetic development data, not an external dataset at all — included in the registry so the benchmark CLI can compare against it explicitly, never blur it with external results.',
    loadedAt: new Date(),
  };

  return { provenance, records, rejected: [] };
}

const REGISTRY = {
  'scan-network-fixture': { kind: 'external', loader: loadScanFixture, description: 'USDA SCAN-format structural fixture (soil moisture/temp, air temp, precip; no irrigation or EC data).' },
  'generic-iot-agri-fixture': { kind: 'external', loader: loadGenericIotFixture, description: 'Generic Kaggle/Mendeley-style IoT agriculture structural fixture (moisture, temp, humidity, EC, irrigation on/off).' },
  'agrismart-synthetic-dev': { kind: 'synthetic_dev', loader: loadAgriSmartSyntheticDev, description: "AgriSmart's own synthetic development dataset (45 simulated days, single device)." },
};

function listDatasets() {
  return Object.entries(REGISTRY).map(([id, entry]) => ({ id, kind: entry.kind, description: entry.description }));
}

function loadDataset(id) {
  const entry = REGISTRY[id];
  if (!entry) throw new Error(`Unknown dataset id "${id}". Known ids: ${Object.keys(REGISTRY).join(', ')}`);
  return { id, kind: entry.kind, ...entry.loader() };
}

module.exports = { listDatasets, loadDataset, REGISTRY };
