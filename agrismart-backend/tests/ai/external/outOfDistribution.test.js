'use strict';

const { computeFeatureRanges, checkOutOfDistribution } = require('../../../ai/inference/outOfDistribution');
const { FEATURE_NAMES } = require('../../../ai/features/featureVersion');

describe('ai/inference/outOfDistribution', () => {
  test('a value within the training range is not flagged', () => {
    const ranges = { [FEATURE_NAMES[0]]: { min: 10, max: 30 } };
    const { oodFeatures } = checkOutOfDistribution({ [FEATURE_NAMES[0]]: 20 }, ranges);
    expect(oodFeatures.length).toBe(0);
  });

  test('a value far outside the training range is flagged', () => {
    const ranges = { [FEATURE_NAMES[0]]: { min: 10, max: 30 } };
    const { oodFeatures } = checkOutOfDistribution({ [FEATURE_NAMES[0]]: 1000 }, ranges);
    expect(oodFeatures).toContain(FEATURE_NAMES[0]);
  });

  test('null training ranges (no artifact recorded them yet) never flags anything, never throws', () => {
    const { oodFeatures } = checkOutOfDistribution({ [FEATURE_NAMES[0]]: 1000 }, null);
    expect(oodFeatures.length).toBe(0);
  });

  test('computeFeatureRanges ignores nulls rather than treating them as zero', () => {
    const matrix = [[10, null], [20, 5], [null, 15]];
    // Build a 2-feature range using the first two FEATURE_NAMES for the shape (values don't need semantic meaning here).
    const ranges = computeFeatureRanges(matrix);
    // Only checking it does not throw and produces a numeric range for the first column.
    expect(ranges[FEATURE_NAMES[0]]).toEqual({ min: 10, max: 20 });
  });
});
