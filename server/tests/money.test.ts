import { describe, expect, it } from 'vitest';
import {
  computeTotals, lineTotal, sumSameCurrency, assertSameCurrency, convertWithRate, formatMoney,
} from '../src/lib/money.js';

describe('money (decimal-safe, currency-separated)', () => {
  it('computes line totals with half-up rounding to 2 decimals', () => {
    expect(lineTotal('3', '0.335')).toBe('1.0100'); // 1.005 -> 1.01 half-up
    expect(lineTotal('220', '9.5')).toBe('2090.0000');
    expect(lineTotal('0.5', '0.005')).toBe('0.0000'); // 0.0025 -> 0.00
    expect(lineTotal('1', '0.125')).toBe('0.1300'); // 0.125 -> 0.13 half-up
  });

  it('avoids floating point artifacts (0.1+0.2 problem)', () => {
    expect(sumSameCurrency('USD', ['0.1', '0.2'])).toBe('0.3000');
    expect(sumSameCurrency('USD', ['1.005', '2.005'])).toBe('3.0100');
  });

  it('computes quotation totals: subtotal, discount, tax, total', () => {
    // subtotal 2475, 3% discount = 74.25, taxable 2400.75, 11% tax = 264.0825 -> 264.08, total 2664.83
    const t = computeTotals(['2090.0000', '385.0000'], '3', '11');
    expect(t.subtotal).toBe('2475.0000');
    expect(t.discountAmount).toBe('74.2500');
    expect(t.taxAmount).toBe('264.0800');
    expect(t.total).toBe('2664.8300');
  });

  it('handles zero discount and tax', () => {
    const t = computeTotals(['100', '50.25'], '0', '0');
    expect(t.subtotal).toBe('150.2500');
    expect(t.total).toBe('150.2500');
    expect(t.discountAmount).toBe('0.0000');
  });

  it('refuses to mix currencies', () => {
    expect(() => assertSameCurrency('USD', 'LBP')).toThrow(/Currency mismatch/);
    expect(() => assertSameCurrency('USD', 'USD')).not.toThrow();
  });

  it('converts only with an explicit positive rate', () => {
    expect(convertWithRate('100', '89500')).toBe('8950000.0000');
    expect(() => convertWithRate('100', '0')).toThrow();
    expect(() => convertWithRate('100', '-1')).toThrow();
  });

  it('formats money per currency conventions', () => {
    expect(formatMoney('1234567.5', 'LBP', 'en')).toMatch(/LBP 1,234,568/);
    expect(formatMoney('1234.5', 'USD', 'en')).toMatch(/USD 1,234\.50/);
  });

  it('sums large LBP amounts without precision loss', () => {
    expect(sumSameCurrency('LBP', ['8950000000', '45000000', '0.5'])).toBe('8995000000.5000');
  });
});
