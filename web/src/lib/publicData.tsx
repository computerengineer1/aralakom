import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';

export interface Company {
  nameEn: string; nameAr: string; taglineEn: string; taglineAr: string;
  aboutEn: string; aboutAr: string; phone: string; whatsapp: string; email: string;
  addressEn: string; addressAr: string; workingHoursEn: string; workingHoursAr: string;
  mapUrl: string; defaultLocale: 'ar' | 'en'; primaryCurrency: 'LBP' | 'USD'; logoFileId: string | null;
}
export interface Category { id: string; code: string; nameEn: string; nameAr: string; kind: string }
export interface Service {
  id: string; slug: string; titleEn: string; titleAr: string;
  summaryEn?: string; summaryAr?: string; bodyEn?: string; bodyAr?: string; iconKey: string;
}
export interface PortfolioItem {
  id: string; titleEn: string; titleAr: string; descriptionEn?: string; descriptionAr?: string;
  category?: string; location?: string; completedYear?: number; coverFileId?: string | null;
}

interface PublicData {
  company: Company | null;
  tradeCategories: Category[];
  engineeringCategories: Category[];
  requestCategories: Category[];
  services: Service[];
}

const Ctx = createContext<PublicData>({
  company: null, tradeCategories: [], engineeringCategories: [], requestCategories: [], services: [],
});

export function PublicDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PublicData>({
    company: null, tradeCategories: [], engineeringCategories: [], requestCategories: [], services: [],
  });
  useEffect(() => {
    api<{ company: Company; tradeCategories: Category[]; engineeringCategories: Category[]; requestCategories: Category[]; services: Service[] }>('/api/settings/public')
      .then((d) => setData({
        company: d.company, tradeCategories: d.tradeCategories, engineeringCategories: d.engineeringCategories,
        requestCategories: d.requestCategories, services: d.services,
      }))
      .catch(() => undefined);
  }, []);
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function usePublicData(): PublicData {
  return useContext(Ctx);
}

export function usePortfolio(): PortfolioItem[] {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  useEffect(() => {
    api<{ items: PortfolioItem[] }>('/api/settings/portfolio').then((d) => setItems(d.items)).catch(() => undefined);
  }, []);
  return items;
}
