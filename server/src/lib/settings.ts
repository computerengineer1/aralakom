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
  nameEn: 'AraLakom Construction & Contracting',
  nameAr: 'أراكم للمقاولات والتشطيبات',
  taglineEn: 'Excellence in Construction, Finishing & Contracting in Lebanon',
  taglineAr: 'نبني بحرفية وإتقان — خدمات البناء والتشطيب والمقاولات في لبنان',
  aboutEn: 'AraLakom is a premier Lebanese construction and contracting company founded and led by Owner & CEO Anwar Rahil and an experienced executive management team. We deliver turnkey construction, high-end finishing, renovation, plastering, gypsum decor, tiling, electrical, plumbing, painting, and structural works with uncompromising quality and Lebanese craftsmanship.',
  aboutAr: 'شركة أراكم للمقاولات والتشطيبات (AraLakom) شركة رائدة متخصصة في أعمال البناء والمقاولات العامة والتشطيبات الفاخرة في لبنان، بإشراف المالك والرئيس التنفيذي أنور رحيل (Owner & CEO) وفريق الإدارة التنفيذي. نقدم حلولاً متكاملة تشمل التشييد، الترميم، الديكورات الجبسية، أعمال الدهان والبلاط، التمديدات الكهربائية والصحية، وإدارة المشاريع بأعلى معايير الإتقان والموثوقية.',
  phone: '+961 70 078 473',
  whatsapp: '+961 70 078 473',
  email: 'aralakomm@gmail.com · aralakom@hotmail.com',
  addressEn: 'sour south Lebanon',
  addressAr: 'صور جنوب لبنان',
  workingHoursEn: 'Mon–Sat 8:00 AM – 6:00 PM',
  workingHoursAr: 'الإثنين–السبت ٨:٠٠ ص – ٦:٠٠ م',
  mapUrl: '',
  defaultLocale: 'ar',
  primaryCurrency: 'USD',
  logoFileId: 'a9a2843b-b8e0-48f4-aa0a-96da0ce89242',
  legalEntityEn: 'AraLakom S.A.L. / Contracting & Finishing',
  legalEntityAr: 'شركة أراكم للمقاولات والتشطيبات ش.م.ل.',
  taxId: 'LB-961-70078473',
  invoiceFooterEn: 'AraLakom Construction & Contracting — Thank you for your trust in our craftsmanship.',
  invoiceFooterAr: 'شركة أراكم للمقاولات والتشطيبات — شكراً لثقتكم بخبرتنا وجودة تنفيذنا.',
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
