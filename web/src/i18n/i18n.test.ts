import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ar } from './ar';

type Tree = Record<string, unknown>;

function collectKeys(obj: Tree, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...collectKeys(v as Tree, path));
    else out.push(path);
  }
  return out;
}

describe('i18n dictionaries', () => {
  it('Arabic dictionary covers every English key (full translation parity)', () => {
    const enKeys = collectKeys(en as unknown as Tree).sort();
    const arKeys = collectKeys(ar as unknown as Tree).sort();
    const missingInAr = enKeys.filter((k) => !arKeys.includes(k));
    const extraInAr = arKeys.filter((k) => !enKeys.includes(k));
    expect(missingInAr, `keys missing in Arabic: ${missingInAr.join(', ')}`).toEqual([]);
    expect(extraInAr, `extra keys in Arabic: ${extraInAr.join(', ')}`).toEqual([]);
    expect(enKeys.length).toBeGreaterThan(300);
  });

  it('no empty translation values', () => {
    const check = (obj: Tree, prefix = ''): void => {
      for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object') check(v as Tree, path);
        else if (typeof v === 'string' && v.trim() === '') throw new Error(`empty translation at ${path}`);
      }
    };
    expect(() => check(en as unknown as Tree)).not.toThrow();
    expect(() => check(ar as unknown as Tree)).not.toThrow();
  });

  it('Arabic values actually contain Arabic script for user-facing labels', () => {
    const arabicRe = /[\u0600-\u06FF]/;
    expect(arabicRe.test(ar.common.save)).toBe(true);
    expect(arabicRe.test(ar.nav.home)).toBe(true);
    expect(arabicRe.test(ar.auth.signIn)).toBe(true);
    expect(arabicRe.test(ar.personnelM.title)).toBe(true);
    expect(arabicRe.test(ar.financeM.quotesTitle)).toBe(true);
  });

  it('interpolation placeholders match between locales', () => {
    const ph = (s: string): string[] => (s.match(/{{\w+}}/g) ?? []).sort();
    expect(ph(en.common.showing)).toEqual(ph(ar.common.showing));
    expect(ph(en.app.welcome)).toEqual(ph(ar.app.welcome));
    expect(ph(en.personnelM.years)).toEqual(ph(ar.personnelM.years));
  });
});
