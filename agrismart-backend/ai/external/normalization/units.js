'use strict';

/**
 * ai/external/normalization/units.js
 *
 * Every unit conversion used by any adapter must go through one of
 * these named functions — never an inline `* 25.4` or `(x-32)*5/9`
 * buried in adapter code. Each function documents the exact
 * conversion so a reviewer can check it without archaeology, and each
 * is covered by tests/ai/external/units.test.js against known
 * reference values (freezing/boiling points, etc.) — "never silently
 * convert units" means the conversion itself is loud and testable,
 * not that conversion is forbidden.
 */

function fahrenheitToCelsius(f) {
  if (f === null || f === undefined || !Number.isFinite(f)) return null;
  return Math.round(((f - 32) * (5 / 9)) * 100) / 100;
}

function celsiusToCelsius(c) {
  return c === null || c === undefined || !Number.isFinite(c) ? null : c;
}

function inchesToMm(inches) {
  if (inches === null || inches === undefined || !Number.isFinite(inches)) return null;
  return Math.round(inches * 25.4 * 100) / 100;
}

function mmToMm(mm) {
  return mm === null || mm === undefined || !Number.isFinite(mm) ? null : mm;
}

/**
 * Volumetric water content is frequently reported as a 0-1 fraction
 * (m^3/m^3) rather than a 0-100 percentage. AgriSmart's own schema
 * (Telemetry.readings.soilMoisturePercent) and this canonical schema
 * both use 0-100 percent, so any 0-1 fraction MUST be multiplied by
 * 100, explicitly, here — never assumed silently correct just because
 * a value "looks like a percent already."
 */
function vwcFractionToPercent(fraction) {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return null;
  if (fraction < 0 || fraction > 1.2) return null; // out of plausible fraction range — do not guess
  return Math.round(fraction * 100 * 100) / 100;
}

function percentToPercent(pct) {
  return pct === null || pct === undefined || !Number.isFinite(pct) ? null : pct;
}

/** Gallons (US) to liters — for datasets reporting irrigation volume in gallons. */
function usGallonsToLiters(gal) {
  if (gal === null || gal === undefined || !Number.isFinite(gal)) return null;
  return Math.round(gal * 3.785411784 * 100) / 100;
}

function litersToLiters(l) {
  return l === null || l === undefined || !Number.isFinite(l) ? null : l;
}

/**
 * EC is reported in several incompatible units across datasets
 * (dS/m, mS/cm, uS/cm, ppm-as-NaCl). This library only ever converts
 * dS/m <-> mS/cm (they are numerically identical: 1 dS/m = 1 mS/cm) —
 * anything else (uS/cm, ppm-based "TDS" estimates) is NOT converted
 * automatically, because the ppm<->EC relationship depends on the
 * calibration solution used and guessing it would be a silent,
 * unjustified unit change. Adapters must leave such columns as
 * `soilEc: null` and record the original unit in provenance instead.
 */
function mSPerCmToDSPerM(msPerCm) {
  if (msPerCm === null || msPerCm === undefined || !Number.isFinite(msPerCm)) return null;
  return msPerCm; // numerically identical, kept as an explicit named function for auditability
}

const CONVERTERS = {
  fahrenheitToCelsius,
  celsiusToCelsius,
  inchesToMm,
  mmToMm,
  vwcFractionToPercent,
  percentToPercent,
  usGallonsToLiters,
  litersToLiters,
  mSPerCmToDSPerM,
};

module.exports = CONVERTERS;
