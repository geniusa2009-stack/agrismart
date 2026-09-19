'use strict';

/**
 * ai/external/adapters/tomatoIrrigationCsvAdapter.js
 *
 * Real-data adapter for the Mendeley "Dataset on irrigation for
 * Tomato" (DOI 10.17632/33cngpcrmx.2), attached to this project by the
 * user (not downloaded programmatically — this environment could not
 * reach data.mendeley.com; see ai/external/README.md and
 * AI_TRAINING_REPORT.md for the network-constraint writeup).
 *
 * File columns, as delivered (header text from the real CSV):
 *   "Temperature [_ C] ", "Humidity [%]", "Soil moisture",
 *   "Reference evapotranspiration", "Evapotranspiration",
 *   "Crop Coefficient", "Crop Coefficient stage", "Nitrogen [mg/kg]",
 *   "Phosphorus [mg/kg]", "Potassium", "Solar Radiation ghi",
 *   "Wind Speed", "Days of planted", "pH"
 *
 * Deliberately NOT reusing genericIotCsvAdapter.js/CanonicalRecordSchema:
 * this file has no timestamp, no device/farm identifier, and no
 * irrigation state column, which that schema requires as real
 * (non-fabricated) fields. See tomatoObservation.schema.js for why a
 * dedicated schema exists instead.
 */

const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./csvUtil');
const { ProvenanceSchema } = require('../schemas/provenance.schema');
const { TomatoObservationSchema } = require('../schemas/tomatoObservation.schema');

const DATASET_ID = 'mendeley-tomato-irrigation-33cngpcrmx-v2';

function toNumber(raw) {
  if (raw === undefined || raw === null) return NaN;
  const trimmed = String(raw).trim();
  if (trimmed === '') return NaN;
  return Number(trimmed);
}

/**
 * @param {string} filePath - absolute path to the real CSV file
 * @param {object} opts
 * @param {boolean} [opts.ingested=true] - defaults true here because, unlike the
 *   structural fixtures, this adapter has no fixture mode: it only exists to
 *   read the real attached file. Still an explicit parameter (never hardcoded
 *   true deep inside validation) so a caller could force it false for a test.
 */
function load(filePath, { ingested = true } = {}) {
  const absPath = path.resolve(filePath);
  const raw = fs.readFileSync(absPath, 'utf8');
  const { header, records: rawRecords } = parseCsv(raw);

  const cleanHeader = header.map((h) => h.trim());

  const rejected = [];
  const accepted = [];
  const seenRowSignatures = new Map(); // exact-duplicate-row detection
  let duplicateRowCount = 0;
  let prevDays = -Infinity;
  let outOfOrderCount = 0;

  rawRecords.forEach((row, idx) => {
    const signature = cleanHeader.map((h) => row[h]).join('|');
    if (seenRowSignatures.has(signature)) {
      duplicateRowCount += 1;
    }
    seenRowSignatures.set(signature, (seenRowSignatures.get(signature) || 0) + 1);

    const daysSincePlanting = Math.trunc(toNumber(row['Days of planted']));
    if (daysSincePlanting < prevDays) outOfOrderCount += 1;
    prevDays = Math.max(prevDays, daysSincePlanting);

    const candidate = {
      rowIndex: idx,
      daysSincePlanting,
      cropStage: (row['Crop Coefficient stage'] || '').trim(),
      trialId: 'mendeley-tomato-irrigation-trial',
      airTemperatureCelsius: toNumber(row['Temperature [_ C]'] ?? row['Temperature [_ C] ']),
      relativeHumidityPercent: toNumber(row['Humidity [%]']),
      soilMoistureRaw: toNumber(row['Soil moisture']),
      referenceEvapotranspiration: toNumber(row['Reference evapotranspiration']),
      evapotranspiration: toNumber(row['Evapotranspiration']),
      cropCoefficient: toNumber(row['Crop Coefficient']),
      soilNitrogenMgPerKg: toNumber(row['Nitrogen [mg/kg]']),
      soilPhosphorusMgPerKg: toNumber(row['Phosphorus [mg/kg]']),
      soilPotassiumMgPerKg: toNumber(row['Potassium']),
      solarRadiationWPerM2: toNumber(row['Solar Radiation ghi']),
      windSpeedMPerS: toNumber(row['Wind Speed']),
      soilPh: toNumber(row['pH']),
      source: 'external',
      datasetId: DATASET_ID,
    };

    const parsed = TomatoObservationSchema.safeParse(candidate);
    if (parsed.success) {
      accepted.push({ ...parsed.data, _duplicateOfEarlierRow: (seenRowSignatures.get(signature) || 1) > 1 });
    } else {
      rejected.push({ rowIndex: idx, raw: row, issues: parsed.error.issues });
    }
  });

  const provenanceInput = {
    datasetId: DATASET_ID,
    datasetName: 'Dataset on irrigation for Tomato',
    source: 'Mendeley Data',
    url: 'https://data.mendeley.com/datasets/33cngpcrmx/2',
    doi: '10.17632/33cngpcrmx.2',
    // The dataset's Mendeley page (fetched during research, see
    // AI_TRAINING_REPORT.md) did not present a specific license string
    // in the content retrievable by this session. Recorded honestly as
    // unknown rather than assumed (e.g. NOT assumed to be CC-BY).
    license: 'Not specified in the retrievable Mendeley dataset page content as of ingestion; see AI_TRAINING_REPORT.md. Treat as all-rights-reserved / unknown until confirmed by re-checking the Mendeley page or contacting the depositor.',
    country: null, // location unspecified on the dataset page
    region: null,
    crop: 'Tomato',
    soilType: null, // not reported by the source
    sensorType: 'BME280 (temperature/humidity/pressure), SEN0193 capacitive soil moisture, RS485 NPK sensor, plus a weather API for wind speed/solar radiation (per the dataset description)',
    samplingFrequency: 'Not a fixed clock-time frequency — records are indexed by "Days of planted" (whole days since transplanting), with multiple readings recorded per day and no time-of-day field. See AI_TRAINING_REPORT.md.',
    timeRange: null, // no real calendar dates in the source file
    originalUnits: {
      'Temperature [_ C]': 'degrees Celsius',
      'Humidity [%]': 'percent',
      'Soil moisture': 'unspecified (raw sensor units, not confirmed to be % or any standard unit)',
      'Reference evapotranspiration': 'unspecified (values observed up to ~1100; not consistent with standard mm/day ET0 magnitudes — see AI_TRAINING_REPORT.md limitations)',
      'Evapotranspiration': 'unspecified (same caveat as Reference evapotranspiration)',
      'Crop Coefficient': 'dimensionless (Kc, FAO-56 style)',
      'Crop Coefficient stage': 'categorical growth-stage label',
      'Nitrogen [mg/kg]': 'mg/kg',
      'Phosphorus [mg/kg]': 'mg/kg',
      Potassium: 'mg/kg (unit inferred from column-naming convention of the other two nutrients; not explicitly labeled in the header)',
      'Solar Radiation ghi': 'W/m^2 (global horizontal irradiance, inferred from "ghi" abbreviation)',
      'Wind Speed': 'm/s (inferred; not explicitly labeled in the header)',
      'Days of planted': 'whole days since planting/transplanting',
      pH: 'dimensionless (0-14 scale)',
    },
    originalColumnNames: cleanHeader,
    targetVariables: [], // the dataset itself does not label any column as a prediction target
    missingVariables: ['timestamp', 'farmId', 'fieldId', 'zoneId', 'irrigationState', 'irrigationDurationSeconds', 'waterVolumeLiters'],
    preprocessingPerformed: [
      'Trimmed header whitespace',
      'Coerced numeric columns from string to Number',
      'Flagged (not removed) exact-duplicate rows',
      'Flagged (not removed) any row whose "Days of planted" value is smaller than a preceding row (out-of-order check)',
    ],
    ingested,
    fixtureNote: null,
    loadedAt: new Date(),
  };

  const provenance = ProvenanceSchema.parse(provenanceInput);

  return {
    provenance,
    records: accepted,
    rejected,
    duplicateRowCount,
    outOfOrderCount,
    totalRowsInFile: rawRecords.length,
  };
}

module.exports = { load, DATASET_ID };
