/**
 * Application settings stored in the `settings` table as JSON values.
 * Cached in-process with a short TTL; writes invalidate the cache.
 * All public/branding content is administrator-configurable here.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { settings as settingsTable } from '../db/schema.js';

export interface CompanyProfile {
  nameEn: string;
  nameAr: string;
  taglineEn: string;
  taglineAr: string;
  aboutEn: string;
  aboutAr: string;
  phone: string;
  whatsapp: string;
  email: string;
  addressEn: string;
  addressAr: string;
  workingHoursEn: string;
  workingHoursAr: string;
  mapUrl: string;
  defaultLocale: 'ar' | 'en';
  primaryCurrency: 'LBP' | 'USD';
  logoFileId: string | null;
  legalEntityEn: string;
  legalEntityAr: string;
  taxId: string;
  invoiceFooterEn: string;
  invoiceFooterAr: string;
}

export const DEFAULT_COMPANY: CompanyProfile = {
  nameEn: 'Lebanon Contracting Management Platform',
  nameAr: 'منصّة إدارة المقاولات اللبنانية',
  taglineEn: 'Construction, finishing and contracting services across Lebanon',
  taglineAr: 'خدمات البناء والتشطيب والمقاولات في جميع أنحاء لبنان',
  aboutEn: 'We are a construction and finishing company delivering building, painting, tiling, plastering, gypsum, electrical, plumbing, carpentry, aluminum, waterproofing, renovation and maintenance works across Lebanon.',
  aboutAr: 'شركة بناء وتشطيب تنفّذ أعمال البناء والدهان والبلاط والقصارة والجبس والأسقف المستعارة والكهرباء والسباكة والنجارة والألمنيوم والعزل والترميم والصيانة في جميع المناطق اللبنانية.',
  phone: '+961 1 000 000',
  whatsapp: '+961 3 000 000',
  email: 'info@example.com',
  addressEn: 'Beirut, Lebanon',
  addressAr: 'بيروت، لبنان',
  workingHoursEn: 'Mon–Sat 8:00–17:00',
  workingHoursAr: 'الإثنين–السبت ٨:٠٠–١٧:٠٠',
  mapUrl: '',
  defaultLocale: 'ar',
  primaryCurrency: 'USD',
  logoFileId: null,
  legalEntityEn: '',
  legalEntityAr: '',
  taxId: '',
  invoiceFooterEn: 'Thank you for your business. This document is system-generated; amounts are final only upon company confirmation.',
  invoiceFooterAr: 'شكراً لثقتكم. هذا المستند صادر عن النظام؛ تصبح المبالغ نهائية بعد تأكيد الشركة.',
};

const cache = new Map<string, { value: unknown; at: number }>();
const TTL_MS = 15_000;

export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  const value = (rows[0]?.value as T | undefined) ?? fallback;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting(db: Db, key: string, value: unknown, updatedBy?: string | null): Promise<void> {
  await db.insert(settingsTable)
    .values({ key, value: value as Record<string, unknown>, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: value as Record<string, unknown>, updatedBy: updatedBy ?? null, updatedAt: new Date() } });
  cache.delete(key);
}

export function invalidateSettingsCache(): void {
  cache.clear();
}

export async function getCompany(db: Db): Promise<CompanyProfile> {
  const stored = await getSetting<Partial<CompanyProfile>>(db, 'company', {});
  return { ...DEFAULT_COMPANY, ...stored };
}
