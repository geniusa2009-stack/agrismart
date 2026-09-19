'use strict';

/**
 * ai/external/adapters/evolvingTomatoCsvAdapter.js
 *
 * Real-data adapter for the "IoT Dataset from an Evolving Tomato
 * Cultivation Testbed" (Milesight/Talkpool/Decentlab LoRaWAN sensors,
 * University of Parma IoT Lab / Azienda Sperimentale Stuard, Italy —
 * same research group and site as the "Smart agriculture dataset in a
 * tomato cultivation under different irrigation regimes" paper, Belli
 * et al., Data in Brief 60 (2025) 111521, DOI 10.1016/j.dib.2025.111521,
 * Mendeley dataset 35wh56287y — that published dataset's 2023 season
 * data structurally matches this dataset's own 2023/soil2023.csv and
 * environmental2023.csv exactly, same date range, same coordinates).
 * The exact separate Mendeley DOI for this specific multi-year
 * (2023/2024/2025) "Evolving Tomato Cultivation Testbed" bundle was
 * NOT confirmed by this project's web search — recorded honestly as
 * unconfirmed rather than guessed. See AI_DATASET_INVENTORY.md.
 *
 * UNLIKE the Mendeley "Dataset on irrigation for Tomato" adapter
 * (tomatoIrrigationCsvAdapter.js), this dataset has REAL timestamps,
 * a real per-line/zone identifier, and REAL valve open/close ground
 * truth — so it fits the EXISTING canonical time-series schema
 * (ai/external/schemas/canonicalRecord.schema.js) with NO schema
 * changes needed.
 *
 * Design: each source CSV row becomes its own canonical record at its
 * OWN native timestamp — a soil-sensor row populates soilMoisture/
 * soilTemperature/soilEc (irrigationState left null), a valve-sensor
 * row populates irrigationState only (soil fields left null). Both are
 * concatenated per zone and sorted by timestamp.
 * ai/external/benchmark/canonicalBridge.js already handles exactly
 * this shape: toTelemetryHistory() filters for rows with a non-null
 * soilMoisture, toIrrigationHistory() scans for irrigationState
 * transitions wherever they appear in the timestamp-sorted sequence —
 * no merged/resampled grid is needed or built.
 *
 * Verified against the real files (see AI_DATASET_INVENTORY.md):
 * valve_state=1 means OPEN — confirmed by cross-checking against
 * water-meter volume deltas (mean volume increase per 10-minute bucket
 * is ~20-45x higher when valve_state=1 than when valve_state=0, for
 * every line in the 2024 season). NOT assumed from the column name.
 */

const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./csvUtil');
const { ProvenanceSchema } = require('../schemas/provenance.schema');
const { CanonicalRecordSchema } = require('../schemas/canonicalRecord.schema');

function toNumber(raw) {
  if (raw === undefined || raw === null) return NaN;
  const trimmed = String(raw).trim();
  if (trimmed === '') return NaN;
  return Number(trimmed);
}

/**
 * @param {string} seasonDir - directory containing that season's soil*.csv and valve CSV
 * @param {object} opts
 * @param {number} opts.year
 * @param {string} opts.soilFileName
 * @param {string} opts.valveFileName
 * @param {boolean} [opts.ingested=true]
 */
function load(seasonDir, { year, soilFileName, valveFileName, ingested = true }) {
  const datasetId = `evolving-tomato-testbed-${year}`;
  const soilPath = path.join(seasonDir, soilFileName);
  const valvePath = path.join(seasonDir, valveFileName);

  const soilRaw = fs.readFileSync(soilPath, 'utf8');
  const valveRaw = fs.readFileSync(valvePath, 'utf8');
  const { header: soilHeader, records: soilRows } = parseCsv(soilRaw);
  const { header: valveHeader, records: valveRows } = parseCsv(valveRaw);

  // The soil sensors on some lines were left running continuously across
  // multiple seasons (e.g. a "2024" soil file can contain readings from
  // June 2023 onward), but the valve/irrigation ground truth for a given
  // season file only exists for the period that season's valve stream
  // was actually deployed. A soil reading from outside that window has
  // NO real irrigation-outcome signal available for it at all (not
  // "irrigation didn't happen", but "we have no idea, because the valve
  // wasn't being monitored yet") — including it would silently manufacture
  // a huge block of contextually meaningless negative examples. So soil
  // rows are restricted to the valve stream's OWN observed [min, max]
  // timestamp window for this season, auto-detected from the real valve
  // file rather than hand-picked.
  let valveMinTs = Infinity;
  let valveMaxTs = -Infinity;
  for (const row of valveRows) {
    const ts = toNumber(row.ts_generation);
    if (!Number.isFinite(ts)) continue;
    if (ts < valveMinTs) valveMinTs = ts;
    if (ts > valveMaxTs) valveMaxTs = ts;
  }

  // Soil moisture is reported as percent RH (0-100) per the dataset's own
  // README. A handful of readings carry a physically impossible value
  // (e.g. 655.35) — a sensor/transmission fault, not a real moisture
  // reading. These are REJECTED, not corrected/clamped/fabricated.
  const SOIL_MOISTURE_PLAUSIBLE_RANGE = [0, 100];

  const rejected = [];
  const accepted = [];
  const linesSeen = new Set();
  let outsideValveWindowCount = 0;
  let implausibleSoilMoistureCount = 0;

  for (const row of soilRows) {
    const line = toNumber(row.line);
    linesSeen.add(line);
    const ts = toNumber(row.ts_generation);

    if (ts < valveMinTs || ts > valveMaxTs) {
      outsideValveWindowCount += 1;
      continue; // genuinely out of scope for this season, not an ingestion failure — counted separately from `rejected`
    }

    const soilMoisture = toNumber(row.humidity);
    if (Number.isFinite(soilMoisture) && (soilMoisture < SOIL_MOISTURE_PLAUSIBLE_RANGE[0] || soilMoisture > SOIL_MOISTURE_PLAUSIBLE_RANGE[1])) {
      implausibleSoilMoistureCount += 1;
      rejected.push({ stream: 'soil', raw: row, issues: [{ code: 'implausible_value', path: ['soilMoisture'], message: `soilMoisture=${soilMoisture} outside plausible range [0, 100] percent RH` }] });
      continue;
    }

    const candidate = {
      timestamp: new Date(ts),
      farmId: null,
      fieldId: null,
      zoneId: `line-${line}`,
      crop: 'Tomato',
      soilType: null,
      soilMoisture, // soil sensor's own "humidity" field is %RH soil moisture, per the dataset's own README
      soilTemperature: toNumber(row.temperature),
      soilEc: toNumber(row.electrical_conductivity) / 1000, // source unit is uS/cm (README); canonical schema is dS/m -> divide by 1000
      soilSalinity: null, // not reported by this dataset (only EC) — left null, not derived/guessed
      airTemperature: null,
      relativeHumidity: null,
      precipitation: null,
      solarRadiation: null,
      windSpeed: null,
      irrigationState: null, // this row is soil-only; irrigation state comes from the separate valve stream below
      irrigationDurationSeconds: null,
      waterVolumeLiters: null,
      source: 'external',
      datasetId,
    };
    const parsed = CanonicalRecordSchema.safeParse(candidate);
    if (parsed.success) accepted.push(parsed.data);
    else rejected.push({ stream: 'soil', raw: row, issues: parsed.error.issues });
  }

  for (const row of valveRows) {
    const line = toNumber(row.line);
    linesSeen.add(line);
    const ts = toNumber(row.ts_generation);
    const stateRaw = toNumber(row.valve_state);
    let irrigationState = null;
    if (stateRaw === 1) irrigationState = 'open';
    else if (stateRaw === 0) irrigationState = 'closed';
    // else: missing/unparseable valve_state -> leave null (honest "unknown"), never guessed

    const candidate = {
      timestamp: new Date(ts),
      farmId: null,
      fieldId: null,
      zoneId: `line-${line}`,
      crop: 'Tomato',
      soilType: null,
      soilMoisture: null,
      soilTemperature: null,
      soilEc: null,
      soilSalinity: null,
      airTemperature: null,
      relativeHumidity: null,
      precipitation: null,
      solarRadiation: null,
      windSpeed: null,
      irrigationState,
      irrigationDurationSeconds: null,
      waterVolumeLiters: null,
      source: 'external',
      datasetId,
    };
    const parsed = CanonicalRecordSchema.safeParse(candidate);
    if (parsed.success) accepted.push(parsed.data);
    else rejected.push({ stream: 'valve', raw: row, issues: parsed.error.issues });
  }

  const provenanceInput = {
    datasetId,
    datasetName: 'IoT Dataset from an Evolving Tomato Cultivation Testbed',
    source: 'Mendeley Data (University of Parma IoT Laboratory / Azienda Sperimentale Stuard, Italy — same research group as the published "Smart agriculture dataset in a tomato cultivation under different irrigation regimes", Belli et al., Data in Brief 60 (2025) 111521, DOI 10.1016/j.dib.2025.111521, Mendeley dataset 35wh56287y)',
    url: null, // this specific multi-year bundle's own Mendeley URL was not confirmed by this project's web search — see AI_DATASET_INVENTORY.md
    doi: null, // ditto — recorded honestly as unconfirmed rather than guessed
    license: 'Not confirmed by this project for this specific multi-year bundle; the companion 2023-season publication (DOI 10.1016/j.dib.2025.111521) is CC BY 4.0 per Data in Brief\'s standard license, but that does not by itself confirm this bundle\'s own license — treat as unconfirmed until checked directly.',
    country: 'Italy',
    region: 'Parma (44.8 deg N, 10.27 deg E, per the dataset\'s own per-line coordinates)',
    crop: 'Tomato',
    soilType: null,
    sensorType: 'Milesight EM500 SMTC (soil EC/moisture/temperature) and Milesight UC512 solenoid valve controllers / MClimate T-valve (valve open-close state) — LoRaWAN, per the dataset\'s own README',
    samplingFrequency: 'every 10 minutes (per the dataset\'s own README; actual inter-reading gaps verified during ingestion, not assumed)',
    timeRange: null, // varies per season file; recorded per-load in the training report instead of a single static range here
    originalUnits: {
      ts_generation: 'epoch milliseconds',
      humidity: 'percent RH (soil moisture, per README)',
      temperature: 'degrees Celsius',
      electrical_conductivity: 'uS/cm (converted to dS/m for the canonical schema by dividing by 1000)',
      valve_state: '0 = closed, 1 = open (verified against water-meter volume deltas during ingestion, not assumed from the column name)',
      line: 'integer irrigation-line identifier',
    },
    originalColumnNames: [...new Set([...soilHeader, ...valveHeader])],
    targetVariables: [], // this dataset itself does not label any column as an ML target; irrigation_event_next_1h is derived downstream from real valve transitions
    missingVariables: ['farmId', 'fieldId', 'soilSalinity (ppt)', 'airTemperature', 'relativeHumidity', 'precipitation', 'solarRadiation', 'windSpeed', 'irrigationDurationSeconds (derived downstream from state transitions, not a source column)', 'waterVolumeLiters (a separate water-meter stream exists in the source but is not ingested by this adapter)'],
    preprocessingPerformed: [
      'Parsed epoch-millisecond timestamps',
      'Converted electrical_conductivity from uS/cm to dS/m (divide by 1000)',
      'Mapped valve_state 0/1 to irrigationState closed/open after verifying the encoding against water-meter volume deltas',
      'Concatenated the soil stream and valve stream as separate partial canonical records per zone/timestamp rather than resampling to a common grid',
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
    totalRowsInFile: soilRows.length + valveRows.length,
    linesSeen: [...linesSeen].sort((a, b) => a - b),
    outsideValveWindowCount,
    implausibleSoilMoistureCount,
    valveObservedWindow: { from: new Date(valveMinTs), to: new Date(valveMaxTs) },
  };
}

module.exports = { load };
