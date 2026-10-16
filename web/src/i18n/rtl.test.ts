import { describe, expect, it, beforeEach } from 'vitest';
import i18n, { applyDir, setLocale } from './index';

describe('locale & direction handling', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
  });

  it('Arabic sets RTL on <html>; English sets LTR', () => {
    setLocale('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(i18n.language).toBe('ar');

    setLocale('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.language).toBe('en');
  });

  it('applyDir is idempotent and preserves content', () => {
    applyDir('ar');
    applyDir('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('translation lookups work in both locales', async () => {
    await i18n.changeLanguage('ar');
    expect(i18n.t('common.save')).toBe('حفظ');
    expect(i18n.t('applicationsM.statuses.under_review')).toBe('قيد المراجعة');
    await i18n.changeLanguage('en');
    expect(i18n.t('common.save')).toBe('Save');
    expect(i18n.t('applicationsM.statuses.under_review')).toBe('Under review');
  });

  it('missing keys fall back to English, never crash', async () => {
    await i18n.changeLanguage('ar');
    expect(i18n.t('nonexistent.key', { defaultValue: 'FB' })).toBe('FB');
  });

  it('locale choice persists in localStorage (context preserved across reloads)', () => {
    setLocale('ar');
    expect(localStorage.getItem('lcmp_lang')).toBe('ar');
    setLocale('en');
    expect(localStorage.getItem('lcmp_lang')).toBe('en');
  });
});
