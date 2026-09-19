'use strict';

/**
 * ai/external/quality/tabularQualityEngine.js
 *
 * Data-quality checks for CROSS-SECTIONAL tabular datasets that have
 * no real timestamp (e.g. the Mendeley tomato irrigation dataset) —
 * a sibling to ai/external/quality/qualityEngine.js, which assumes a
 * time-series shape with a `timestamp` field this dataset does not
 * have. Only observes and reports; never silently "fixes" anything.
 */

function severity(level, code, message, context = {}) {
  return { level, code, message, context };
}

// Plausible ranges for sanity-checking, not hard truths — real sensor
// data can genuinely be noisy/miscalibrated. Values outside these are
// flagged, not discarded.
const PLAUSIBLE_RANGES = {
  airTemperatureCelsius: [-10, 55],
  relativeHumidityPercent: [0, 100],
  soilNitrogenMgPerKg: [0, 500],
  soilPhosphorusMgPerKg: [0, 500],
  soilPotassiumMgPerKg: [0, 500],
  windSpeedMPerS: [0, 40],
  soilPh: [3.5, 9.5], // agronomically plausible soil pH; wider than the chemical 0-14 scale on purpose, flags implausible-for-soil values
};

function runTabularQualityChecks(records, { duplicateRowCount = 0 } = {}) {
  const findings = [];
  if (records.length === 0) {
    return { findings: [severity('CRITICAL', 'EMPTY_DATASET', 'No records to evaluate.')], summary: { recordCount: 0 } };
  }

  const numericFields = [
    'airTemperatureCelsius',
    'relativeHumidityPercent',
    'soilMoistureRaw',
    'referenceEvapotranspiration',
    'evapotranspiration',
    'cropCoefficient',
    'soilNitrogenMgPerKg',
    'soilPhosphorusMgPerKg',
    'soilPotassiumMgPerKg',
    'solarRadiationWPerM2',
    'windSpeedMPerS',
    'soilPh',
  ];

  // Missing values.
  for (const field of numericFields) {
    const total = records.length;
    const missing = records.filter((r) => r[field] === null || r[field] === undefined || Number.isNaN(r[field])).length;
    const missingFraction = missing / total;
    if (missing === total) {
      findings.push(severity('INFO', 'FIELD_ENTIRELY_ABSENT', `Field "${field}" is absent from every record.`, { field }));
    } else if (missingFraction > 0.3) {
      findings.push(severity('WARNING', 'HIGH_MISSING_RATE', `Field "${field}" is missing/NaN in ${(missingFraction * 100).toFixed(1)}% of records.`, { field, missingFraction }));
    }
  }

  // Impossible/implausible values.
  for (const [field, [min, max]] of Object.entries(PLAUSIBLE_RANGES)) {
    const outOfRange = records.filter((r) => Number.isFinite(r[field]) && (r[field] < min || r[field] > max));
    if (outOfRange.length > 0) {
      findings.push(
        severity(
          'WARNING',
          'IMPLAUSIBLE_VALUE',
          `${outOfRange.length} record(s) have ${field} outside the agronomically plausible range [${min}, ${max}] (e.g. row ${outOfRange[0].rowIndex}: ${outOfRange[0][field]}).`,
          { field, count: outOfRange.length, min, max, exampleRowIndex: outOfRange[0].rowIndex, exampleValue: outOfRange[0][field] }
        )
      );
    }
  }

  // Constant columns (zero information content).
  for (const field of numericFields) {
    const values = records.map((r) => r[field]).filter((v) => Number.isFinite(v));
    const unique = new Set(values);
    if (unique.size === 1 && values.length > 1) {
      findings.push(severity('WARNING', 'CONSTANT_COLUMN', `Field "${field}" has a single constant value across all records — no predictive information.`, { field, value: [...unique][0] }));
    }
  }

  // Exact-duplicate rows.
  if (duplicateRowCount > 0) {
    findings.push(severity('WARNING', 'DUPLICATE_ROWS', `${duplicateRowCount} exact-duplicate row(s) found in the source file.`, { count: duplicateRowCount }));
  }

  // Cross-field consistency: the textbook FAO-56 relationship is
  // ETc = Kc x ET0. Report how often it actually holds in this file —
  // informational either way (if it always holds, ET is a near-
  // deterministic function of two other features and must not be used
  // as a naive "easy win" target; if it rarely holds, that's itself a
  // data-quality note about the ET/ET0 columns).
  const withEt = records.filter((r) => Number.isFinite(r.cropCoefficient) && Number.isFinite(r.referenceEvapotranspiration) && Number.isFinite(r.evapotranspiration));
  if (withEt.length > 0) {
    const matching = withEt.filter((r) => Math.abs(r.cropCoefficient * r.referenceEvapotranspiration - r.evapotranspiration) < 1e-2).length;
    const matchFraction = matching / withEt.length;
    findings.push(
      severity(
        'INFO',
        'ET_FORMULA_CONSISTENCY',
        `Evapotranspiration == CropCoefficient x ReferenceEvapotranspiration holds exactly for ${(matchFraction * 100).toFixed(1)}% of records (${matching}/${withEt.length}). ` +
          (matchFraction > 0.95
            ? 'Near-total match: Evapotranspiration is effectively a deterministic function of two other columns and must not be treated as an independently learned prediction.'
            : matchFraction < 0.05
            ? 'Rarely matches: Evapotranspiration/ReferenceEvapotranspiration/CropCoefficient do not follow the standard FAO-56 formula in this file; treat their units/derivation as unverified.'
            : 'Partially matches: the standard formula holds for a minority/majority of rows but not consistently, suggesting independently measured or noisy values rather than a pure derived field.'),
        { matchFraction, matching, total: withEt.length }
      )
    );
  }

  // Crop-stage vs days-since-planting sanity: stages should not be
  // wildly out of order relative to the day count.
  const byStage = {};
  for (const r of records) {
    if (!byStage[r.cropStage]) byStage[r.cropStage] = { min: Infinity, max: -Infinity };
    byStage[r.cropStage].min = Math.min(byStage[r.cropStage].min, r.daysSincePlanting);
    byStage[r.cropStage].max = Math.max(byStage[r.cropStage].max, r.daysSincePlanting);
  }
  findings.push(severity('INFO', 'CROP_STAGE_DAY_RANGES', 'Observed day-since-planting range per crop stage (informational, for documenting overlap between stage and day).', { byStage }));

  const summary = {
    recordCount: records.length,
    uniqueDaysSincePlanting: new Set(records.map((r) => r.daysSincePlanting)).size,
    errorCount: findings.filter((f) => f.level === 'ERROR' || f.level === 'CRITICAL').length,
    warningCount: findings.filter((f) => f.level === 'WARNING').length,
  };

  return { findings, summary };
}

module.exports = { runTabularQualityChecks };
