'use strict';

const units = require('../../../ai/external/normalization/units');

describe('ai/external/normalization/units (explicit, tested conversions)', () => {
  test('fahrenheitToCelsius against known reference points', () => {
    expect(units.fahrenheitToCelsius(32)).toBe(0); // freezing
    expect(units.fahrenheitToCelsius(212)).toBe(100); // boiling
    expect(units.fahrenheitToCelsius(98.6)).toBeCloseTo(37, 0); // body temp
  });

  test('inchesToMm against known reference', () => {
    expect(units.inchesToMm(1)).toBeCloseTo(25.4, 1);
  });

  test('vwcFractionToPercent converts a 0-1 fraction and rejects out-of-range input rather than guessing', () => {
    expect(units.vwcFractionToPercent(0.35)).toBe(35);
    expect(units.vwcFractionToPercent(1.5)).toBeNull();
    expect(units.vwcFractionToPercent(-0.2)).toBeNull();
  });

  test('usGallonsToLiters against known reference', () => {
    expect(units.usGallonsToLiters(1)).toBeCloseTo(3.785, 2);
  });

  test('every converter returns null for null/undefined input rather than throwing', () => {
    expect(units.fahrenheitToCelsius(null)).toBeNull();
    expect(units.inchesToMm(undefined)).toBeNull();
    expect(units.usGallonsToLiters(null)).toBeNull();
  });

  test('mSPerCmToDSPerM is a documented identity conversion, not silently different', () => {
    expect(units.mSPerCmToDSPerM(1.2)).toBe(1.2);
  });
});
