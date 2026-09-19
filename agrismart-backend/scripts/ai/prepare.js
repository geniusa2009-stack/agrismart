'use strict';
require('dotenv').config();

/**
 * scripts/ai/prepare.js  ->  npm run ai:prepare
 *
 * Loads whatever data exists (real, best-effort; synthetic-dev
 * otherwise) and prints ONLY the data-readiness report — no training.
 * This is the command to run first, and the one whose output belongs
 * in the "current data availability / data quality" section of any
 * status report.
 */

const { loadRealDataset } = require('../../ai/data/telemetryLoader');
const { buildDataset } = require('../../ai/data/datasetBuilder');
const { generateSyntheticDevDataset } = require('../../ai/data/syntheticDevData');

async function main() {
  console.log('=== AgriSmart AI: data readiness report ===');
  const real = await loadRealDataset();

  if (!real.ok) {
    console.log(`Real data store unreachable: ${real.reason}`);
  } else {
    console.log('Real data store reachable. Raw counts:', real.counts);
  }

  if (real.ok && real.counts.telemetryReadings > 0) {
    const { readiness } = buildDataset({ valves: real.valves, telemetryByDevice: real.telemetryByDevice, irrigationByValve: real.irrigationByValve });
    console.log('Real-data readiness:', JSON.stringify(readiness, null, 2));
  } else {
    console.log('No real telemetry available. There is NOT enough real data for supervised learning right now.');
  }

  const synthetic = generateSyntheticDevDataset({ days: 45, intervalMinutes: 15 });
  const fakeValve = { deviceId: synthetic.meta.deviceId, _id: 'synthetic-dev-valve', farmId: 'synthetic-dev-farm', autoOpenBelowPercent: 30 };
  const { readiness: synthReadiness } = buildDataset({
    valves: [fakeValve],
    telemetryByDevice: new Map([[synthetic.meta.deviceId, synthetic.telemetry]]),
    irrigationByValve: new Map([[String(fakeValve._id), synthetic.irrigationEvents]]),
  });
  console.log('SYNTHETIC-DEV dataset available for pipeline testing:', JSON.stringify({ meta: synthetic.meta, readiness: synthReadiness }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ai:prepare failed:', err);
    process.exit(1);
  });
