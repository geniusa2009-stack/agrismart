'use strict';

const { trainLogisticRegression, predictProbaLogisticRegression } = require('../../ai/training/logisticRegression');

describe('ai/training/logisticRegression', () => {
  test('learns a clearly separable synthetic pattern better than chance', () => {
    const X = [];
    const y = [];
    for (let i = 0; i < 200; i += 1) {
      const x = Math.random() * 10 - 5;
      X.push([x, Math.random()]);
      y.push(x > 0 ? 1 : 0);
    }
    const model = trainLogisticRegression(X, y, { epochs: 200, learningRate: 0.3, l2: 0.001 });
    const probs = predictProbaLogisticRegression(model, X);
    const preds = probs.map((p) => (p >= 0.5 ? 1 : 0));
    const correct = preds.filter((p, i) => p === y[i]).length;
    expect(correct / y.length).toBeGreaterThan(0.85);
  });

  test('handles null (missing) feature values via imputation without throwing', () => {
    const X = [[1, null], [2, 5], [null, 3], [4, null]];
    const y = [0, 1, 0, 1];
    const model = trainLogisticRegression(X, y, { epochs: 20 });
    const probs = predictProbaLogisticRegression(model, [[null, null]]);
    expect(probs.length).toBe(1);
    expect(probs[0]).toBeGreaterThanOrEqual(0);
    expect(probs[0]).toBeLessThanOrEqual(1);
  });
});
