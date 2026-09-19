'use strict';

/**
 * ai/external/adapters/scanNetworkAdapter.js
 *
 * Parses USDA NRCS Soil Climate Analysis Network (SCAN) "report
 * generator" export format: one row per hour, soil moisture/soil
 * temperature at multiple depths as separate columns (percent VWC,
 * degrees C already — SCAN reports metric soil values natively),
 * precipitation in inches, air temp in Fahrenheit.
 *
 * Real dataset reference: USDA NRCS Soil Climate Analysis Network
 * (see DATASETS.md for URL/license). *** THIS ADAPTER HAS ONLY BEEN
 * RUN AGAINST fixtures/scan_network_structural_fixture.csv, a small
 * hand-built file matching SCAN's documented column layout — it is
 * NOT downloaded real SCAN data (see ai/external/README.md for why).
 * `ingested: false` in the returned provenance reflects this.
 */

const fs = require('fs');
const { parseCsv } = require('./csvUtil');
const { finalizeAdapterResult } = require('./baseAdapter');
const units = require('../normalization/units');
const { parseTimestamp } = require('../normalization/temporal');

const DATASET_ID = 'scan-network-fixture';

function load(filePath, { ingested = false, fixtureNote = null } = {}) {
  const text = fs.readFileSync(filePath, 'utf8');
  const { header, records } = parseCsv(text);

  const rawRecords = records.map((row) => {
    const ts = parseTimestamp(`${row.Date} ${row.Time}`);
    return {
      timestamp: ts.parsed,
      farmId: null,
      fieldId: row['Site Id'] || null,
      zoneId: null,
      crop: null, // SCAN stations are climate/soil monitoring sites, not tied to a crop — genuinely missing, not fabricated
      soilType: null, // not present in this report format
      soilMoisture: units.percentToPercent(numOrNull(row['SMS -2in (pct)'])),
      soilTemperature: units.celsiusToCelsius(numOrNull(row['STO -2in (degC)'])),
      soilEc: null, // SCAN report format used here does not include EC
      soilSalinity: null,
      airTemperature: units.fahrenheitToCelsius(numOrNull(row['TAVG (degF)'])),
      relativeHumidity: null,
      precipitation: units.inchesToMm(numOrNull(row['PRCP (in)'])),
      solarRadiation: null,
      windSpeed: null,
      irrigationState: null, // SCAN is a climate network, not an irrigation controller — genuinely absent
      irrigationDurationSeconds: null,
      waterVolumeLiters: null,
      source: 'external',
      datasetId: DATASET_ID,
    };
  });

  const provenance = {
    datasetId: DATASET_ID,
    datasetName: 'USDA NRCS Soil Climate Analysis Network (SCAN) — report export format',
    source: 'USDA NRCS',
    url: 'https://www.nrcs.usda.gov/resources/data-and-reports/soil-climate-analysis-network',
    doi: null,
    license: 'U.S. Government work — generally public domain in the US (verify per-station terms before redistribution)',
    country: 'USA',
    region: 'varies by station',
    crop: null,
    soilType: null,
    sensorType: 'buried capacitance soil moisture/temperature probes (per SCAN station instrumentation)',
    samplingFrequency: 'hourly (report export); native network sampling is sub-hourly at some stations',
    timeRange: rawRecords.length
      ? { from: rawRecords[0].timestamp, to: rawRecords[rawRecords.length - 1].timestamp }
      : null,
    originalUnits: {
      'SMS -2in (pct)': 'percent volumetric water content',
      'STO -2in (degC)': 'degrees Celsius',
      'PRCP (in)': 'inches',
      'TAVG (degF)': 'degrees Fahrenheit',
    },
    originalColumnNames: header,
    targetVariables: ['SMS -2in (pct)'],
    missingVariables: ['soilEc', 'soilSalinity', 'relativeHumidity', 'solarRadiation', 'windSpeed', 'irrigationState', 'irrigationDurationSeconds', 'waterVolumeLiters', 'crop', 'soilType'],
    preprocessingPerformed: [
      'Combined Date + Time columns into a single UTC-naive timestamp (parseTimestamp, no timezone declared in the source format — recorded as such, not assumed).',
      'Fahrenheit -> Celsius (units.fahrenheitToCelsius).',
      'Inches -> millimeters (units.inchesToMm).',
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

module.exports = { load, DATASET_ID };
