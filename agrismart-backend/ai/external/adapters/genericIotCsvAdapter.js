'use strict';

/**
 * ai/external/adapters/genericIotCsvAdapter.js
 *
 * Parses the common "flat IoT agriculture CSV" shape used by many
 * Kaggle/Mendeley smart-farming datasets: one row per reading, one
 * device/plot column, and a set of sensor columns. Column NAMES vary a
 * lot between real datasets of this kind, so this adapter takes an
 * explicit `columnMap` rather than hardcoding names — the caller
 * states which source column feeds which canonical field, so a
 * missing mapping produces a genuinely-missing canonical field
 * (documented in provenance) instead of a silent guess.
 *
 * Extended to also support NPK soil-nutrient columns and weather
 * columns (pressure, precipitation, solar radiation, wind speed) for
 * datasets like Mendeley's "Dataset on irrigation for Tomato" (DOI
 * 10.17632/33cngpcrmx.2), which reports temperature/humidity/pressure
 * (BME280), soil moisture (SEN0193), NPK (RS485 sensor), wind speed and
 * solar radiation per its own public description. As of this writing
 * that dataset's actual file has NOT been obtained — this adapter is
 * ready to consume it via a `meta` override once it is (see
 * ai/external/adapters/pending/README.md).
 *
 * *** Absent a `meta.datasetId` override, this defaults to the
 * original structural fixture identity
 * (fixtures/generic_iot_agri_structural_fixture.csv) — NOT a
 * downloaded real dataset. `ingested: false` reflects that default.
 */

const fs = require('fs');
const { parseCsv } = require('./csvUtil');
const { finalizeAdapterResult } = require('./baseAdapter');
const units = require('../normalization/units');
const { parseTimestamp } = require('../normalization/temporal');

const DEFAULT_DATASET_ID = 'generic-iot-agri-fixture';

const CANONICAL_FIELD_UNITS = {
  soilMoisturePercent: 'percent',
  soilTemperatureCelsius: 'degrees Celsius',
  soilEcDsPerM: 'dS/m',
  airTemperatureCelsius: 'degrees Celsius',
  relativeHumidityPercent: 'percent',
  irrigationOnFlag: '0/1 flag',
  soilNitrogenMgPerKg: 'mg/kg',
  soilPhosphorusMgPerKg: 'mg/kg',
  soilPotassiumMgPerKg: 'mg/kg',
  atmosphericPressureHPa: 'hPa',
  precipitationMm: 'millimeters',
  solarRadiationWPerM2: 'W/m^2',
  windSpeedMPerS: 'm/s',
};

const ALL_MAPPABLE_FIELDS = Object.keys(CANONICAL_FIELD_UNITS);

/**
 * @param {string} filePath
 * @param {object} columnMap - e.g. { timestamp: 'timestamp', device: 'device', soilMoisturePercent: 'soil_moisture_pct', soilNitrogenMgPerKg: 'n_mg_kg', ... }
 * @param {object} opts
 * @param {boolean} [opts.ingested=false]
 * @param {string} [opts.fixtureNote]
 * @param {object} [opts.meta] - { datasetId, datasetName, source, url, doi, license, country, region, sensorType, samplingFrequency }
 * @param {object} [opts.provenanceOverrides] - { crop, soilType }
 */
function load(filePath, columnMap, { ingested = false, fixtureNote = null, provenanceOverrides = {}, meta = {} } = {}) {
  const text = fs.readFileSync(filePath, 'utf8');
  const { header, records } = parseCsv(text);

  const datasetId = meta.datasetId || DEFAULT_DATASET_ID;

  const rawRecords = records.map((row) => {
    const ts = parseTimestamp(columnMap.timestamp ? row[columnMap.timestamp] : null);
    return {
      timestamp: ts.parsed,
      farmId: null,
      fieldId: columnMap.device ? row[columnMap.device] || null : null,
      zoneId: null,
      crop: provenanceOverrides.crop || null,
      soilType: provenanceOverrides.soilType || null,
      soilMoisture: columnMap.soilMoisturePercent ? units.percentToPercent(numOrNull(row[columnMap.soilMoisturePercent])) : null,
      soilTemperature: columnMap.soilTemperatureCelsius ? units.celsiusToCelsius(numOrNull(row[columnMap.soilTemperatureCelsius])) : null,
      soilEc: columnMap.soilEcDsPerM ? units.mSPerCmToDSPerM(numOrNull(row[columnMap.soilEcDsPerM])) : null,
      soilSalinity: null,
      airTemperature: columnMap.airTemperatureCelsius ? units.celsiusToCelsius(numOrNull(row[columnMap.airTemperatureCelsius])) : null,
      relativeHumidity: columnMap.relativeHumidityPercent ? units.percentToPercent(numOrNull(row[columnMap.relativeHumidityPercent])) : null,
      precipitation: columnMap.precipitationMm ? units.mmToMm(numOrNull(row[columnMap.precipitationMm])) : null,
      solarRadiation: columnMap.solarRadiationWPerM2 ? numOrNull(row[columnMap.solarRadiationWPerM2]) : null,
      windSpeed: columnMap.windSpeedMPerS ? numOrNull(row[columnMap.windSpeedMPerS]) : null,
      irrigationState: columnMap.irrigationOnFlag
        ? (numOrNull(row[columnMap.irrigationOnFlag]) === 1 ? 'open' : numOrNull(row[columnMap.irrigationOnFlag]) === 0 ? 'closed' : 'unknown')
        : null,
      irrigationDurationSeconds: null,
      waterVolumeLiters: null,
      soilNitrogen: columnMap.soilNitrogenMgPerKg ? numOrNull(row[columnMap.soilNitrogenMgPerKg]) : null,
      soilPhosphorus: columnMap.soilPhosphorusMgPerKg ? numOrNull(row[columnMap.soilPhosphorusMgPerKg]) : null,
      soilPotassium: columnMap.soilPotassiumMgPerKg ? numOrNull(row[columnMap.soilPotassiumMgPerKg]) : null,
      atmosphericPressure: columnMap.atmosphericPressureHPa ? numOrNull(row[columnMap.atmosphericPressureHPa]) : null,
      source: 'external',
      datasetId,
    };
  });

  const mappedCanonicalFields = Object.keys(columnMap).filter((k) => k !== 'timestamp' && k !== 'device');
  const missingVariables = ALL_MAPPABLE_FIELDS.filter((f) => !mappedCanonicalFields.includes(f))
    .concat(['soilSalinity', 'irrigationDurationSeconds', 'waterVolumeLiters', 'zoneId', 'farmId']);

  const provenance = {
    datasetId,
    datasetName: meta.datasetName || 'Generic flat IoT-agriculture CSV (Kaggle/Mendeley-style)',
    source: meta.source || 'Kaggle / Mendeley Data (representative shape — see DATASETS.md for specific catalog entries)',
    url: meta.url || null,
    doi: meta.doi || null,
    license: meta.license || 'Varies per specific dataset — see DATASETS.md; NOT determined for this generic adapter',
    country: meta.country || null,
    region: meta.region || null,
    crop: provenanceOverrides.crop || null,
    soilType: provenanceOverrides.soilType || null,
    sensorType: meta.sensorType || 'capacitive/resistive soil probes + ambient sensors (typical of this dataset family)',
    samplingFrequency: meta.samplingFrequency || '30-minute (this fixture) — real datasets of this shape vary from 1-minute to hourly',
    timeRange: rawRecords.length ? { from: rawRecords[0].timestamp, to: rawRecords[rawRecords.length - 1].timestamp } : null,
    originalUnits: Object.fromEntries(mappedCanonicalFields.map((f) => [columnMap[f], CANONICAL_FIELD_UNITS[f] || 'unspecified'])),
    originalColumnNames: header,
    targetVariables: ['soilMoisturePercent', 'irrigationOnFlag'].filter((f) => mappedCanonicalFields.includes(f)),
    missingVariables,
    preprocessingPerformed: [
      'Timestamps parsed via parseTimestamp (explicit offset used if present in source; otherwise recorded as such, never assumed).',
      'Column mapping applied per caller-supplied columnMap — unmapped canonical fields left null, not guessed.',
    ],
    ingested,
    fixtureNote,
    loadedAt: new Date(),
  };

  return finalizeAdapterResult(provenance, rawRecords);
}

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = { load, DATASET_ID: DEFAULT_DATASET_ID, ALL_MAPPABLE_FIELDS };
