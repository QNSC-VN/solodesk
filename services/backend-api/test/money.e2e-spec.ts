import { describe, it, expect } from 'vitest';
import { multiplyMoney, addMoney, subtractMoney, sumMoney, compareMoney } from '../src/platform/money';

/**
 * No DB needed — pure function tests, just placed under `test/*.e2e-spec.ts`
 * to match this repo's only test-runner config (`vitest.e2e.config.ts`)
 * rather than introducing a second unit-test harness for one file.
 */
describe('money — exact fixed-point decimal arithmetic, no floating point', () => {
  it('multiplies a scale-2 price by a scale-3 quantity into a scale-2 line total', () => {
    expect(multiplyMoney('5000.00', '2.500')).toBe('12500.00');
    expect(multiplyMoney('150000.00', '30')).toBe('4500000.00');
  });

  it('multiplies a scale-2 subtotal by a scale-4 tax rate into a scale-2 tax amount', () => {
    expect(multiplyMoney('1000000.00', '0.1000')).toBe('100000.00');
  });

  it('rounds half-up on the boundary, not floating-point-nearest', () => {
    // 0.005 rounds to 0.01 under round-half-up, not 0.00 — this is exactly
    // the kind of boundary floating point gets inconsistently wrong.
    expect(multiplyMoney('0.01', '0.5')).toBe('0.01');
    expect(multiplyMoney('1.00', '0.005')).toBe('0.01');
  });

  it('adds and subtracts scale-2 amounts exactly', () => {
    expect(addMoney('100.00', '50.50')).toBe('150.50');
    expect(subtractMoney('100.00', '150.50')).toBe('-50.50');
  });

  it('sums a list of line totals into one total, including the empty list', () => {
    expect(sumMoney(['100.00', '200.50', '0.25'])).toBe('300.75');
    expect(sumMoney([])).toBe('0.00');
  });

  it('subtracts at scale 3 for quantity fields (on-hand minus reserved)', () => {
    expect(subtractMoney('10.500', '3.250', 3)).toBe('7.250');
  });

  it('compares exactly — no epsilon, no floating-point drift', () => {
    expect(compareMoney('100.00', '100.00')).toBe(0);
    expect(compareMoney('100.01', '100.00')).toBe(1);
    expect(compareMoney('99.99', '100.00')).toBe(-1);
  });

  it('throws rather than silently truncating a value with more decimal digits than the target scale', () => {
    expect(() => addMoney('1.005', '1.00')).toThrow();
  });
});
