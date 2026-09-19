'use strict';
require('dotenv').config();

/**
 * scripts/ai/predict.js  ->  npm run ai:predict
 *
 * Runs one demonstration inference against a small synthetic example
 * so the inference path can be exercised without needing a live
 * database or a running server. This is a pipeline smoke test, not a
 * real prediction about any actual farm.
 */

const { predict } = require('../../ai/inference/predict');
const { generateSyntheticDevDataset } = require('../../ai/data/syntheticDevData');

function main() {
  const synthetic = generateSyntheticDevDataset({ days: 3, intervalMinutes: 15, seed: 7 });
  const result = predict({ telemetryHistory: synthetic.telemetry, irrigationHistory: synthetic.irrigationEvents });
  console.log('=== AgriSmart AI: sample prediction (synthetic input, pipeline smoke test) ===');
  console.log(JSON.stringify(result, null, 2));
}

main();
