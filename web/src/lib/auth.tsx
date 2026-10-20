import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, refreshCsrf } from './api';
import { applyDir, setLocale, type Loc } from '../i18n';

export interface Me {
  id: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin' | 'hr' | 'pm' | 'accountant' | 'engineer' | 'worker' | 'customer';
  locale: Loc;
  mfaEnabled: boolean;
  mfaVerified: boolean;
}

interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string, totp?: string) => Promise<{ mfaRequired?: boolean }>;
  register: (fullName: string, email: string, password: string, phone?: string) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (perm: string) => boolean;
}

const ROLE_PERMS: Record<string, string[]> = {
  owner: ['*'],
  admin: ['*'],
  hr: ['personnel.read', 'personnel.write', 'personnel.sensitive', 'personnel.export', 'personnel.merge', 'applications.read', 'applications.review', 'customers.read', 'requests.read', 'schedule.read'],
  pm: ['personnel.read', 'requests.read', 'projects.read_all', 'projects.write', 'schedule.read', 'schedule.write', 'attendance.approve', 'quotes.read', 'expenses.read', 'expenses.write', 'customers.read'],
  accountant: ['customers.read', 'customers.write', 'requests.read', 'projects.read_all', 'quotes.read', 'quotes.write', 'quotes.approve', 'contracts.read', 'contracts.write', 'invoices.read', 'invoices.write', 'expenses.read', 'expenses.write', 'finance.reports', 'rates.manage', 'personnel.read', 'personnel.sensitive', 'payments.workers'],
  engineer: [],
  worker: [],
  customer: [],
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: Me | null }>('/api/auth/me');
      setUser(res.user);
      if (res.user) {
        // Align UI language with account preference when the user hasn't picked locally.
        if (!localStorage.getItem('lcmp_lang')) setLocale(res.user.locale);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (email: string, password: string, totp?: string) => {
    const res = await api<{ user?: Me; mfaRequired?: boolean; mustChangePassword?: boolean }>(
      '/api/auth/login', { method: 'POST', body: { email, password, totp } });
    await refreshCsrf();
    if (res.mfaRequired) return { mfaRequired: true };
    if (res.user) {
      setUser(res.user as Me);
      if (res.user.locale && !localStorage.getItem('lcmp_lang')) setLocale(res.user.locale as Loc);
    }
    return {};
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string, phone?: string) => {
    const res = await api<{ user: Me }>('/api/auth/register', {
      method: 'POST',
      body: { fullName, email, password, phone, locale: localStorage.getItem('lcmp_lang') || 'ar' },
    });
    await refreshCsrf();
    if (res.user) {
      setUser(res.user);
      if (res.user.locale && !localStorage.getItem('lcmp_lang')) setLocale(res.user.locale as Loc);
    }
  }, []);
  const verifyMfa = useCallback(async (code: string) => {
    await api('/api/auth/mfa/verify', { method: 'POST', body: { code } });
    await refreshCsrf();
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setUser(null);
  }, []);

  const can = useCallback((perm: string) => {
    if (!user) return false;
    const perms = ROLE_PERMS[user.role] ?? [];
    return perms.includes('*') || perms.includes(perm);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verifyMfa, logout, refresh, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}

/** Hook exposing locale + switching with document dir kept in sync. */
export function useLocale(): [Loc, (l: Loc) => void] {
  const { i18n } = useTranslation();
  const locale = (i18n.language?.startsWith('ar') ? 'ar' : 'en') as Loc;
  const change = (l: Loc): void => {
    setLocale(l);
    applyDir(l);
  };
  return [locale, change];
}

export { applyDir };
