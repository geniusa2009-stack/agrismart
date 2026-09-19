'use strict';

/**
 * ai/training/splitChronological.js
 *
 * Time-aware split: NO shuffling. `examples` must already be sorted
 * ascending by `asOf` (datasetBuilder.js guarantees this). Older data
 * -> train, next period -> validation, latest period -> test.
 *
 * Documented limitation: with a single device this is a clean temporal
 * split. With multiple devices whose histories overlap in time, a
 * global cut can place one device's early data in train and another
 * device's early data (same wall-clock period) in test — acceptable
 * for this MVP-stage dataset size, but flagged here so it is not
 * mistaken for a solved problem: a future iteration with many devices
 * should consider a per-device or per-farm holdout in addition to time.
 */
function splitChronological(examples, { trainFraction = 0.7, valFraction = 0.15 } = {}) {
  const n = examples.length;
  const trainEnd = Math.floor(n * trainFraction);
  const valEnd = Math.floor(n * (trainFraction + valFraction));

  return {
    train: examples.slice(0, trainEnd),
    validation: examples.slice(trainEnd, valEnd),
    test: examples.slice(valEnd),
  };
}

module.exports = { splitChronological };
