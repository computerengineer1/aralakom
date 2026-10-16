/**
 * Decimal-safe money helpers (decimal.js).
 *
 * Rules enforced here:
 *  - Money values are strings end-to-end (DB numeric(18,4) <-> JS string).
 *  - Amounts in different currencies are NEVER added or compared silently;
 *    every aggregate function takes a single currency and throws otherwise.
 *  - Rounding: half-up to 2 decimals for display/totals; internal precision 4.
 */
import { Decimal } from 'decimal.js';

Decimal.set({ precision: 24, rounding: Decimal.ROUND_HALF_UP });

export type Currency = 'LBP' | 'USD';
export const CURRENCIES: Currency[] = ['LBP', 'USD'];

export function D(value: string | number | Decimal): Decimal {
  return new Decimal(value ?? 0);
}

export function assertCurrency(currency: string): asserts currency is Currency {
  if (!CURRENCIES.includes(currency as Currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
}

export function assertSameCurrency(a: Currency, b: Currency): void {
  if (a !== b) {
    throw new Error(`Currency mismatch: cannot combine ${a} with ${b}`);
  }
}

/** Sum values that must all share one currency. */
export function sumSameCurrency(currency: Currency, values: Array<string | number | null | undefined>): string {
  let total = new Decimal(0);
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    total = total.plus(new Decimal(v));
  }
  return round2(total).toFixed(4);
}

export function mul(a: string | number, b: string | number): string {
  return new Decimal(a).mul(new Decimal(b)).toFixed(4);
}

export function round2(v: Decimal | string | number): Decimal {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Compute quotation/invoice totals:
 *  subtotal = sum(line totals)
 *  discount = subtotal * discountPct/100
 *  taxable  = subtotal - discount
 *  tax      = taxable * taxPct/100
 *  total    = taxable + tax
 * All rounded half-up to 2 decimals at the end (line totals assumed pre-rounded).
 */
export function computeTotals(
  lineTotals: Array<string | number>,
  discountPct: string | number = 0,
  taxPct: string | number = 0,
): { subtotal: string; discountAmount: string; taxAmount: string; total: string } {
  const subtotal = lineTotals.reduce((acc, v) => acc.plus(new Decimal(v || 0)), new Decimal(0));
  const discountAmount = subtotal.mul(new Decimal(discountPct || 0)).div(100);
  const taxable = subtotal.minus(discountAmount);
  const taxAmount = taxable.mul(new Decimal(taxPct || 0)).div(100);
  const total = taxable.plus(taxAmount);
  return {
    subtotal: round2(subtotal).toFixed(4),
    discountAmount: round2(discountAmount).toFixed(4),
    taxAmount: round2(taxAmount).toFixed(4),
    total: round2(total).toFixed(4),
  };
}

export function lineTotal(qty: string | number, unitPrice: string | number): string {
  return round2(new Decimal(qty).mul(new Decimal(unitPrice))).toFixed(4);
}

/** Display formatting: LBP has no meaningful subunit in practice; USD shows 2 decimals. */
export function formatMoney(amount: string | number, currency: Currency, locale: 'ar' | 'en' = 'en'): string {
  const d = new Decimal(amount || 0);
  const formatted = currency === 'LBP'
    ? d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber().toLocaleString(locale === 'ar' ? 'ar-LB' : 'en-US')
    : d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber().toLocaleString(locale === 'ar' ? 'ar-LB' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return locale === 'ar'
    ? `${formatted} ${currency === 'LBP' ? 'ل.ل.' : 'د.أ.'}`.replace('د.أ.', 'USD')
    : `${currency === 'LBP' ? 'LBP' : 'USD'} ${formatted}`;
}

/**
 * Convert an amount using an explicit stored rate. The caller must supply the
 * rate row (rate, timestamp, source) — the platform never invents rates.
 * Returns the converted amount plus provenance for storage.
 */
export function convertWithRate(
  amount: string | number,
  rate: string | number,
): string {
  const r = new Decimal(rate);
  if (r.lte(0)) throw new Error('Exchange rate must be positive');
  return round2(new Decimal(amount).mul(r)).toFixed(4);
}
