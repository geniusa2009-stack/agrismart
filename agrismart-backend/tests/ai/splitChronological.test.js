'use strict';

const { splitChronological } = require('../../ai/training/splitChronological');

describe('ai/training/splitChronological', () => {
  test('splits without shuffling and preserves temporal order across the boundary', () => {
    const examples = Array.from({ length: 100 }, (_, i) => ({ asOf: new Date(2026, 0, 1 + i), label: i % 2 }));
    const { train, validation, test } = splitChronological(examples);

    expect(train.length + validation.length + test.length).toBe(100);
    expect(train[train.length - 1].asOf.getTime()).toBeLessThanOrEqual(validation[0].asOf.getTime());
    expect(validation[validation.length - 1].asOf.getTime()).toBeLessThanOrEqual(test[0].asOf.getTime());
  });

  test('handles small datasets without throwing', () => {
    const examples = [{ asOf: new Date(), label: 1 }];
    expect(() => splitChronological(examples)).not.toThrow();
  });
});
