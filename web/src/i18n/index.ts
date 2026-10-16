import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { en } from './en';
import { ar } from './ar';

export const LOCALES = ['ar', 'en'] as const;
export type Loc = (typeof LOCALES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    fallbackLng: 'en',
    supportedLngs: ['ar', 'en'],
    load: 'languageOnly',
    interpolation: { escapeValue: false }, // React escapes by default
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'lcmp_lang',
    },
  });

export function applyDir(locale: string): void {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = locale;
  document.documentElement.dir = dir;
}

export function setLocale(locale: Loc): void {
  void i18n.changeLanguage(locale);
  localStorage.setItem('lcmp_lang', locale);
  applyDir(locale);
}

export default i18n;
