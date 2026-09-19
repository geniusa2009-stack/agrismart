'use strict';

/**
 * ai/training/tomato/splitByPlantingDay.js
 *
 * Group-aware chronological split for the tomato dataset. Records are
 * already sorted ascending by daysSincePlanting (verified during
 * ingestion — see tomatoIrrigationCsvAdapter.js's outOfOrderCount).
 *
 * Why NOT ai/training/splitChronological.js's plain row-fraction slice:
 * many rows share the same daysSincePlanting value (e.g. day 100 alone
 * has 659 of the 3000 rows). A naive index-fraction cut can fall in
 * the MIDDLE of a day's block, putting near-identical same-day
 * readings on both sides of the train/test boundary — a real leakage
 * risk (same-day rows are highly correlated), not merely a cosmetic
 * concern. This function instead finds split points at day BOUNDARIES
 * closest to the requested fractions, so every row for a given day
 * lands entirely in one split.
 */
function splitByPlantingDay(records, { trainFraction = 0.7, valFraction = 0.15 } = {}) {
  const n = records.length;
  const uniqueDays = [...new Set(records.map((r) => r.daysSincePlanting))].sort((a, b) => a - b);

  const countsByDay = new Map();
  for (const r of records) countsByDay.set(r.daysSincePlanting, (countsByDay.get(r.daysSincePlanting) || 0) + 1);

  let cumulative = 0;
  let trainEndDay = uniqueDays[uniqueDays.length - 1];
  let valEndDay = uniqueDays[uniqueDays.length - 1];
  let trainSet = false;
  let valSet = false;

  for (const day of uniqueDays) {
    cumulative += countsByDay.get(day);
    const fraction = cumulative / n;
    if (!trainSet && fraction >= trainFraction) {
      trainEndDay = day;
      trainSet = true;
    }
    if (!valSet && fraction >= trainFraction + valFraction) {
      valEndDay = day;
      valSet = true;
      break;
    }
  }

  const train = records.filter((r) => r.daysSincePlanting <= trainEndDay);
  const validation = records.filter((r) => r.daysSincePlanting > trainEndDay && r.daysSincePlanting <= valEndDay);
  const test = records.filter((r) => r.daysSincePlanting > valEndDay);

  return { train, validation, test, trainEndDay, valEndDay };
}

module.exports = { splitByPlantingDay };
