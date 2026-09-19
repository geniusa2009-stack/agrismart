'use strict';

/**
 * ai/inference/explain.js
 *
 * Generates human-readable explanation strings STRICTLY from the
 * feature values the model actually consumed for this prediction — no
 * invented text, no explanation the features don't support (spec
 * section 13/19).
 */

function explainFeatures(features) {
  const lines = [];

  if (features.moistureTrendPerHour !== null) {
    if (features.moistureTrendPerHour < -0.3) {
      lines.push(`Moisture has been declining at roughly ${Math.abs(features.moistureTrendPerHour).toFixed(1)}%/hour over the last 6 hours.`);
    } else if (features.moistureTrendPerHour > 0.3) {
      lines.push(`Moisture has been rising at roughly ${features.moistureTrendPerHour.toFixed(1)}%/hour over the last 6 hours.`);
    } else {
      lines.push('Moisture has been roughly stable over the last 6 hours.');
    }
  }

  if (features.hoursSinceLastIrrigation !== null) {
    lines.push(`Last irrigation was ${features.hoursSinceLastIrrigation.toFixed(1)} hours ago.`);
  } else {
    lines.push('No prior irrigation event is on record for this valve.');
  }

  if (features.moistureChange1h !== null && features.moistureChange1h < -0.5) {
    lines.push(`Moisture dropped ${Math.abs(features.moistureChange1h).toFixed(1)} points in the last hour.`);
  }

  if (features.moistureRollingMin6h !== null && features.soilMoisturePercent !== null) {
    if (features.moistureRollingMin6h < features.soilMoisturePercent - 5) {
      lines.push('Moisture dipped notably lower earlier in the last 6 hours before partially recovering.');
    }
  }

  if (features.temperatureCelsius !== null && features.temperatureCelsius > 32 && features.moistureTrendPerHour !== null && features.moistureTrendPerHour < 0) {
    lines.push(`Temperature is elevated (${features.temperatureCelsius}°C) while moisture is declining, which tends to accelerate further loss.`);
  }

  if (lines.length === 0) {
    lines.push('Not enough recent history to characterize a trend yet.');
  }

  return lines;
}

module.exports = { explainFeatures };
