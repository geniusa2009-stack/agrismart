'use strict';

const { mae, rmse, r2Score, evaluateRegressor } = require('../../../ai/evaluation/regressionMetrics');

describe('regressionMetrics', () => {
  test('perfect predictions -> mae=0, rmse=0, r2=1', () => {
    const yTrue = [1, 2, 3, 4];
    const yPred = [1, 2, 3, 4];
    expect(mae(yTrue, yPred)).toBe(0);
    expect(rmse(yTrue, yPred)).toBe(0);
    expect(r2Score(yTrue, yPred)).toBe(1);
  });

  test('predicting the mean for every point -> r2 = 0', () => {
    const yTrue = [1, 2, 3, 4];
    const mean = 2.5;
    const yPred = yTrue.map(() => mean);
    expect(r2Score(yTrue, yPred)).toBeCloseTo(0, 10);
  });

  test('worse than the mean baseline -> negative r2 (honest failure signal)', () => {
    const yTrue = [1, 2, 3, 4];
    const yPred = [10, -10, 10, -10];
    expect(r2Score(yTrue, yPred)).toBeLessThan(0);
  });

  test('evaluateRegressor bundles all three metrics', () => {
    const result = evaluateRegressor([1, 2, 3], [1, 2, 3]);
    expect(result).toEqual({ mae: 0, rmse: 0, r2: 1, n: 3 });
  });
});
