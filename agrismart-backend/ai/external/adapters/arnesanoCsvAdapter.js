'use strict';

/**
 * ai/external/adapters/arnesanoCsvAdapter.js
 *
 * Real-data adapter for the "Soil Moisture, Irrigation Actuator and
 * Weather Dataset from a Multi-Sector Precision-Irrigation Field
 * Trial" (Arnesano, Apulia, Italy, 2025 growing season; CC BY 4.0;
 * DOI not yet assigned per the dataset's own README, which is itself
 * marked "[assigned by Mendeley Data on publication]" — recorded here
 * as unconfirmed, not guessed).
 *
 * Reads the dataset's own PROCESSED "merged" layer
 * (`02_processed_data/merged/dataset_zone_{1..5}.csv`), NOT the
 * preprocessed layer, deliberately: this project's own forensic audit
 * (see AI_DATA_QUALITY_REPORT.md) found that the dataset's published
 * "24-hour-ahead" target column drops rows with missing readings,
 * which means the row-index-based "144 steps ahead" it uses no longer
 * corresponds to a true 24 real hours ahead in most rows (0-60%
 * exact-24h depending on zone, as low as 0% in zone 3). The merged
 * layer, by contrast, is a perfectly regular 10-minute grid (verified:
 * zero duplicate timestamps, constant 10-minute steps, 33,259 rows per
 * zone) with gaps preserved as nulls rather than dropped — so a
 * caller can compute a TRUE wall-clock 24-hour-ahead target directly
 * by indexing exactly 144 rows ahead (see
 * ai/training/arnesano/buildExamples.js), which this file makes
 * possible by returning one canonical record PER SOURCE ROW, in
 * original order, with rejected/missing values as null rather than
 * dropped.
 *
 * Cleaning rules applied here are the dataset's OWN documented
 * plausibility bands (DATA_DICTIONARY.md), not invented thresholds:
 *   - soil_moisture: reject outside [-Infinity, -0.001] union
 *     (115, Infinity]; i.e. keep only readings in [0, 115], clipping
 *     [100, 115] to 100 (matches the dataset's own preprocessing
 *     rule, reapplied here rather than trusted from the preprocessed
 *     file, since we are working from the merged layer instead).
 *   - ec: reject outside [0, 1000] uS/cm (dataset's own suggested
 *     "minimal load" cleaning in DATA_DICTIONARY.md section 3).
 *   - ph: reject outside [3, 9] (same section).
 * Rejected values are counted, never silently substituted.
 *
 * Unit conversions to the canonical schema:
 *   - soilEc: source is uS/cm -> canonical dS/m (divide by 1000, same
 *     conversion as evolvingTomatoCsvAdapter.js).
 *   - windSpeed: source (weather_wind_speed) is km/h -> canonical m/s
 *     (divide by 3.6).
 *
 * soilTemperature is deliberately left null: this dataset's only
 * soil-temperature-like columns (`soil_temperature_0-7cm`,
 * `soil_temperature_7-18cm`) are Open-Meteo ERA5 REANALYSIS estimates
 * for the site's coordinates, not a per-probe in-situ reading — mixing
 * a regional weather-model estimate into the same canonical field a
 * real soil probe populates elsewhere in this project (e.g.
 * evolvingTomatoCsvAdapter.js's `soilTemperature`) would misrepresent
 * two different kinds of measurement as equivalent (rule: never treat
 * correlated-but-different variables as interchangeable evidence).
 * These ERA5 soil-temperature columns are instead exposed only in the
 * adapter's raw per-row output for arnesano-specific feature building,
 * not written into the shared canonical field.
 *
 * `irrigationState` here means "the valve was open for at least part
 * of this 10-minute bin" (derived from `irrigation_duration_minutes`
 * > 0), NOT an instantaneous point-in-time reading like
 * evolvingTomatoCsvAdapter.js's valve-stream rows — documented here so
 * a future reader does not assume the two datasets' irrigationState
 * fields mean exactly the same thing.
 */

const fs = require('fs');
const { parseCsv } = require('./csvUtil');
const { ProvenanceSchema } = require('../schemas/provenance.schema');
const { CanonicalRecordSchema } = require('../schemas/canonicalRecord.schema');

const CROP_BY_ZONE = {
  1: 'Tomato (open field)',
  2: 'Tomato (open field)',
  3: 'Tomato (pot)',
  4: 'Zucchini',
  5: 'Blueberry',
};

function toNumber(raw) {
  if (raw === undefined || raw === null) return NaN;
  const trimmed = String(raw).trim();
  if (trimmed === '') return NaN;
  return Number(trimmed);
}

/**
 * @param {string} csvPath - path to merged/dataset_zone_N.csv
 * @param {object} opts
 * @param {number} opts.zone - 1..5
 * @param {boolean} [opts.ingested=true]
 */
function load(csvPath, { zone, ingested = true }) {
  const datasetId = `arnesano-precision-irrigation-zone-${zone}`;
  const raw = fs.readFileSync(csvPath, 'utf8');
  const { records: rows } = parseCsv(raw);

  const rejected = [];
  const records = []; // one entry per source row, SAME ORDER, for index-based lookups
  let implausibleSoilMoistureCount = 0;
  let implausibleEcCount = 0;
  let implausiblePhCount = 0;

  for (const row of rows) {
    const ts = new Date(row.ts);

    let soilMoisture = null;
    const smRaw = toNumber(row.soil_moisture);
    if (Number.isFinite(smRaw)) {
      if (smRaw < 0 || smRaw > 115) {
        implausibleSoilMoistureCount += 1;
        rejected.push({ ts: row.ts, field: 'soil_moisture', value: smRaw, issue: 'outside_plausible_range_0_115' });
      } else {
        soilMoisture = smRaw > 100 ? 100 : smRaw;
      }
    }

    let soilEc = null;
    const ecRaw = toNumber(row.ec);
    if (Number.isFinite(ecRaw)) {
      if (ecRaw < 0 || ecRaw > 1000) {
        implausibleEcCount += 1;
        rejected.push({ ts: row.ts, field: 'ec', value: ecRaw, issue: 'outside_plausible_range_0_1000_uS_cm' });
      } else {
        soilEc = ecRaw / 1000; // uS/cm -> dS/m
      }
    }

    let soilPh = null;
    const phRaw = toNumber(row.ph);
    if (Number.isFinite(phRaw)) {
      if (phRaw < 3 || phRaw > 9) {
        implausiblePhCount += 1;
        rejected.push({ ts: row.ts, field: 'ph', value: phRaw, issue: 'outside_plausible_range_3_9' });
      } else {
        soilPh = phRaw;
      }
    }

    const windKmh = toNumber(row.weather_wind_speed);
    const irrigationMinutes = toNumber(row.irrigation_duration_minutes);
    const litersTotal = toNumber(row.liters_total);
    const soilTemp0to7 = toNumber(row['soil_temperature_0-7cm']);
    const soilTemp7to18 = toNumber(row['soil_temperature_7-18cm']);

    const candidate = {
      timestamp: ts,
      farmId: null,
      fieldId: null,
      zoneId: `arnesano-zone-${zone}`,
      crop: CROP_BY_ZONE[zone] || null,
      soilType: null,
      soilMoisture,
      soilTemperature: null, // see file header: ERA5 regional estimate, not a per-probe reading
      soilEc,
      soilSalinity: null, // not measured by this dataset
      soilPh,
      airTemperature: Number.isFinite(toNumber(row.weather_temp)) ? toNumber(row.weather_temp) : null,
      relativeHumidity: Number.isFinite(toNumber(row.weather_humidity)) ? toNumber(row.weather_humidity) : null,
      precipitation: Number.isFinite(toNumber(row.weather_rain)) ? toNumber(row.weather_rain) : null,
      solarRadiation: Number.isFinite(toNumber(row.weather_radiation)) ? toNumber(row.weather_radiation) : null,
      windSpeed: Number.isFinite(windKmh) ? windKmh / 3.6 : null, // km/h -> m/s
      irrigationState: Number.isFinite(irrigationMinutes) ? (irrigationMinutes > 0 ? 'open' : 'closed') : null,
      irrigationDurationSeconds: Number.isFinite(irrigationMinutes) ? irrigationMinutes * 60 : null,
      waterVolumeLiters: Number.isFinite(litersTotal) ? litersTotal : null,
      source: 'external',
      datasetId,
    };
    const parsed = CanonicalRecordSchema.safeParse(candidate);
    if (parsed.success) {
      // Attach the two ERA5 soil-temperature bands and the raw
      // irrigation-minutes value as non-schema extra fields for
      // arnesano-specific feature building only (buildExamples.js) —
      // never read by any shared/canonical consumer.
      records.push({
        ...parsed.data,
        _soilTemperature0to7cm: Number.isFinite(soilTemp0to7) ? soilTemp0to7 : null,
        _soilTemperature7to18cm: Number.isFinite(soilTemp7to18) ? soilTemp7to18 : null,
        _irrigationDurationMinutes: Number.isFinite(irrigationMinutes) ? irrigationMinutes : null,
      });
    } else {
      rejected.push({ ts: row.ts, field: '_schema', issues: parsed.error.issues });
      records.push(null); // preserve row-index alignment even on schema rejection
    }
  }

  const provenance = ProvenanceSchema.parse({
    datasetId,
    datasetName: 'Soil Moisture, Irrigation Actuator and Weather Dataset from a Multi-Sector Precision-Irrigation Field Trial (Arnesano, Apulia, Italy, 2025)',
    source: 'Mendeley Data (manuscript under review at time of this project; DOI not yet assigned per the dataset\'s own README)',
    url: null,
    doi: null,
    license: 'CC BY 4.0 (per the dataset\'s own README; LICENSE.txt itself was not present in the attached archive — see AI_DATASET_INVENTORY.md)',
    country: 'Italy',
    region: 'Arnesano, Province of Lecce, Apulia (40.349306 N, 18.081556 E)',
    crop: CROP_BY_ZONE[zone] || null,
    soilType: null,
    sensorType: 'Soil moisture/EC/pH probes per sector, on-site weather station (mostly incomplete coverage, not ingested here), Open-Meteo ERA5 reanalysis weather (ingested), solenoid irrigation/fertigation valves',
    samplingFrequency: '10-minute regular grid (merged layer; native raw acquisition is event-driven/minute-level per the dataset\'s own README)',
    timeRange: null,
    originalUnits: {
      ts: 'local time (Europe/Rome), naive, 10-minute bin left edge',
      soil_moisture: 'percent, relative probe output (0-115 plausible; >100 clipped to 100 per the dataset\'s own documented rule)',
      ec: 'uS/cm (converted to dS/m for the canonical schema by dividing by 1000)',
      ph: 'pH units',
      weather_wind_speed: 'km/h (converted to m/s for the canonical schema by dividing by 3.6)',
      irrigation_duration_minutes: 'minutes of valve-open time within the 10-minute bin (0-10)',
      liters_total: 'liters applied in the bin (duration x sector nominal flow rate)',
    },
    originalColumnNames: Object.keys(rows[0] || {}),
    targetVariables: [],
    missingVariables: ['farmId', 'fieldId', 'soilSalinity', 'per-probe soilTemperature (only ERA5 regional estimates exist)'],
    preprocessingPerformed: [
      'Applied the dataset\'s own documented soil-moisture plausibility filter (0-115, clip 100-115 to 100) directly to the merged (gap-preserving) layer rather than trusting the published preprocessed layer\'s target construction',
      'Applied the dataset\'s own suggested EC (0-1000 uS/cm) and pH (3-9) plausibility filters',
      'Converted EC uS/cm -> dS/m, wind speed km/h -> m/s',
      'Preserved one record per source row (nulls for gaps/rejections) to allow a caller to compute a true wall-clock-24h-ahead target by exact row-index offset',
    ],
    ingested,
    fixtureNote: null,
    loadedAt: new Date(),
  });

  return {
    provenance,
    records, // same length as source rows; entries may be null only on schema-validation failure (should not occur in practice)
    rejected,
    totalRowsInFile: rows.length,
    implausibleSoilMoistureCount,
    implausibleEcCount,
    implausiblePhCount,
  };
}

module.exports = { load, CROP_BY_ZONE };
