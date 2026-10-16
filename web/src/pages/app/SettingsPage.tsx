import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useLocale } from '../../lib/auth';
import {
  Button, DataTable, ErrorState, Field, Modal, Select, Spinner, Tabs, TextArea, TextInput,
  useApi, useToast, fmtDate, type Column,
} from '../../components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function SettingsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('company');
  return (
    <div>
      <h1>{t('adminM.settingsTitle')}</h1>
      <Tabs tabs={[
        { key: 'company', label: t('adminM.companyTab') },
        { key: 'categories', label: t('adminM.categoriesTab') },
        { key: 'services', label: t('adminM.servicesTab') },
        { key: 'portfolio', label: t('adminM.portfolioTab') },
        { key: 'rates', label: t('adminM.ratesTab') },
        { key: 'health', label: t('adminM.healthTab') },
      ]} active={tab} onChange={setTab} />
      {tab === 'company' && <CompanyTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'services' && <ServicesTab />}
      {tab === 'portfolio' && <PortfolioTab />}
      {tab === 'rates' && <RatesTab />}
      {tab === 'health' && <HealthTab />}
    </div>
  );
}

function CompanyTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ company: any }>('/api/settings/company');
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const value = form ?? data?.company;
  if (!value) return null;
  const set = (k: string, v: unknown): void => setForm({ ...(form ?? data?.company ?? {}), [k]: v });

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api('/api/settings/company', { method: 'PUT', body: value });
      toast(t('common.savedOk'), 'success');
      setForm(null);
    } catch (e2) {
      const ae = e2 as ApiError;
      setErr(ae.code === 'RECENT_AUTH_REQUIRED' ? t('adminM.settingsSensitive') : ae.message);
    } finally { setBusy(false); }
  };

  const textFields: Array<[string, string]> = [
    ['nameEn', 'adminM.nameEn'], ['nameAr', 'adminM.nameAr'],
    ['taglineEn', 'adminM.taglineEn'], ['taglineAr', 'adminM.taglineAr'],
    ['phone', 'adminM.phoneC'], ['whatsapp', 'adminM.whatsappC'], ['email', 'adminM.emailC'],
    ['addressEn', 'adminM.addressEn'], ['addressAr', 'adminM.addressAr'],
    ['workingHoursEn', 'adminM.hoursEn'], ['workingHoursAr', 'adminM.hoursAr'],
    ['mapUrl', 'adminM.mapUrl'], ['legalEntityEn', 'adminM.legalEntityEn'], ['legalEntityAr', 'adminM.legalEntityAr'],
    ['taxId', 'adminM.taxId'],
  ];

  return (
    <form onSubmit={(e) => void save(e)}>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="card">
        <div className="grid-2">
          {textFields.map(([key, label]) => (
            <Field key={key} label={t(label)} htmlFor={`cf-${key}`}>
              <TextInput id={`cf-${key}`} dir={['nameAr', 'taglineAr', 'addressAr', 'workingHoursAr', 'legalEntityAr'].includes(key) ? 'rtl' : (['phone', 'whatsapp', 'email', 'mapUrl', 'taxId'].includes(key) ? 'ltr' : undefined)}
                value={value[key] ?? ''} onChange={(e) => set(key, e.target.value)} />
            </Field>
          ))}
        </div>
        <Field label={t('adminM.aboutEn')} htmlFor="cf-aboutEn">
          <TextArea id="cf-aboutEn" rows={4} value={value.aboutEn ?? ''} onChange={(e) => set('aboutEn', e.target.value)} />
        </Field>
        <Field label={t('adminM.aboutAr')} htmlFor="cf-aboutAr">
          <TextArea id="cf-aboutAr" rows={4} dir="rtl" value={value.aboutAr ?? ''} onChange={(e) => set('aboutAr', e.target.value)} />
        </Field>
        <div className="grid-2">
          <Field label={t('adminM.defaultLocale')} htmlFor="cf-loc">
            <Select id="cf-loc" value={value.defaultLocale} onChange={(e) => set('defaultLocale', e.target.value)}>
              <option value="ar">العربية</option><option value="en">English</option>
            </Select>
          </Field>
          <Field label={t('adminM.primaryCurrency')} htmlFor="cf-cur">
            <Select id="cf-cur" value={value.primaryCurrency} onChange={(e) => set('primaryCurrency', e.target.value)}>
              <option value="USD">USD</option><option value="LBP">LBP</option>
            </Select>
          </Field>
        </div>
        <Field label={t('adminM.footerEn')} htmlFor="cf-fen">
          <TextArea id="cf-fen" value={value.invoiceFooterEn ?? ''} onChange={(e) => set('invoiceFooterEn', e.target.value)} />
        </Field>
        <Field label={t('adminM.footerAr')} htmlFor="cf-far">
          <TextArea id="cf-far" dir="rtl" value={value.invoiceFooterAr ?? ''} onChange={(e) => set('invoiceFooterAr', e.target.value)} />
        </Field>
        <Button type="submit" busy={busy}>{t('common.save')}</Button>
      </div>
    </form>
  );
}

function CategoriesTab() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const { data, loading, reload } = useApi<{ items: any[] }>('/api/settings/categories');
  const [kind, setKind] = useState('trade');
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleActive = async (row: any): Promise<void> => {
    try {
      await api(`/api/settings/categories/${row.id}`, { method: 'PATCH', body: { active: !row.active } });
      reload();
    } catch (e) { toast((e as ApiError).message, 'error'); }
  };

  const columns: Array<Column<any>> = [
    { key: 'code', header: t('adminM.catCode'), render: (r) => <code className="ltr-span">{r.code}</code> },
    { key: 'nameEn', header: t('adminM.nameEn'), render: (r) => r.nameEn },
    { key: 'nameAr', header: t('adminM.nameAr'), render: (r) => <span dir="rtl">{r.nameAr}</span> },
    { key: 'kind', header: t('applicationsM.applicant'), render: (r) => t(`adminM.catKind.${r.kind}`) },
    { key: 'active', header: t('adminM.active'), render: (r) => <Button size="sm" variant={r.active ? 'outline' : 'primary'} onClick={() => void toggleActive(r)}>{r.active ? '✓' : '—'}</Button> },
  ];
  void locale;

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-title">{t('adminM.addCategory')}</div>
        <div className="grid-2">
          <Field label={t('adminM.catKind')} htmlFor="nck">
            <Select id="nck" value={kind} onChange={(e) => setKind(e.target.value)}>
              {['trade', 'engineering', 'request', 'other'].map((k) => <option key={k} value={k}>{t(`adminM.catKind.${k}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('adminM.catCode')} htmlFor="ncc">
            <TextInput id="ncc" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} />
          </Field>
          <Field label={t('adminM.nameEn')} htmlFor="nce">
            <TextInput id="nce" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </Field>
          <Field label={t('adminM.nameAr')} htmlFor="nca">
            <TextInput id="nca" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          </Field>
        </div>
        <Button busy={busy} disabled={!code || !nameEn || !nameAr} onClick={async () => {
          setBusy(true);
          try {
            await api('/api/settings/categories', { method: 'POST', body: { kind, code, nameEn, nameAr } });
            toast(t('common.savedOk'), 'success');
            setCode(''); setNameEn(''); setNameAr('');
            reload();
          } catch (e) { toast((e as ApiError).message, 'error'); } finally { setBusy(false); }
        }}>{t('common.create')}</Button>
      </div>
      {loading && !data ? <Spinner /> : (
        <DataTable columns={columns} rows={data?.items ?? []} page={1} pageSize={200}
          total={data?.items.length ?? 0} onPage={() => undefined} emptyText={t('common.noResults')} />
      )}
    </div>
  );
}

function ServicesTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, loading, reload } = useApi<{ items: any[] }>('/api/settings/services');
  const [editing, setEditing] = useState<any | null>(null);

  if (loading && !data) return <Spinner />;
  return (
    <div>
      <Button size="sm" style={{ marginBottom: '0.8rem' }} onClick={() => setEditing({ slug: '', titleEn: '', titleAr: '', summaryEn: '', summaryAr: '', bodyEn: '', bodyAr: '', iconKey: 'tools', published: true, sortOrder: 0 })}>
        + {t('adminM.addService')}
      </Button>
      {(data?.items ?? []).map((s: any) => (
        <div className="card" key={s.id} style={{ marginBottom: '0.7rem' }}>
          <div className="row-between">
            <div>
              <b>{s.titleEn}</b> / <span dir="rtl">{s.titleAr}</span>
              <div className="small muted"><code>{s.slug}</code> · {s.published ? t('adminM.published') : '—'} · #{s.sortOrder}</div>
            </div>
            <div className="row">
              <Button size="sm" variant="outline" onClick={() => setEditing(s)}>{t('common.edit')}</Button>
              <Button size="sm" variant="ghost" onClick={async () => {
                await api(`/api/settings/services/${s.id}`, { method: 'PATCH', body: { published: !s.published } });
                reload();
              }}>{s.published ? '⛔' : '✓'}</Button>
            </div>
          </div>
        </div>
      ))}
      {editing && <ServiceModal svc={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); toast(t('common.savedOk'), 'success'); }} />}
    </div>
  );
}

function ServiceModal({ svc, onClose, onDone }: { svc: any; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ ...svc });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: unknown): void => setForm((f: any) => ({ ...f, [k]: v }));
  const isNew = !svc.id;
  return (
    <Modal title={isNew ? t('adminM.addService') : t('common.edit')} onClose={onClose} wide>
      <div className="grid-2">
        <Field label={t('adminM.slug')} htmlFor="ss" required>
          <TextInput id="ss" dir="ltr" disabled={!isNew} value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
        </Field>
        <Field label="Icon" htmlFor="si">
          <Select id="si" value={form.iconKey} onChange={(e) => set('iconKey', e.target.value)}>
            {['building', 'brush', 'grid', 'layers', 'bolt', 'droplet', 'hammer', 'shield', 'refresh', 'tools'].map((i) => <option key={i} value={i}>{i}</option>)}
          </Select>
        </Field>
        <Field label={t('adminM.svcTitleEn')} htmlFor="ste"><TextInput id="ste" value={form.titleEn} onChange={(e) => set('titleEn', e.target.value)} /></Field>
        <Field label={t('adminM.svcTitleAr')} htmlFor="sta"><TextInput id="sta" dir="rtl" value={form.titleAr} onChange={(e) => set('titleAr', e.target.value)} /></Field>
      </div>
      <Field label={t('adminM.summaryEn')} htmlFor="sse"><TextArea id="sse" value={form.summaryEn ?? ''} onChange={(e) => set('summaryEn', e.target.value)} /></Field>
      <Field label={t('adminM.summaryAr')} htmlFor="ssa"><TextArea id="ssa" dir="rtl" value={form.summaryAr ?? ''} onChange={(e) => set('summaryAr', e.target.value)} /></Field>
      <Field label={t('adminM.bodyEn')} htmlFor="sbe"><TextArea id="sbe" rows={4} value={form.bodyEn ?? ''} onChange={(e) => set('bodyEn', e.target.value)} /></Field>
      <Field label={t('adminM.bodyAr')} htmlFor="sba"><TextArea id="sba" dir="rtl" rows={4} value={form.bodyAr ?? ''} onChange={(e) => set('bodyAr', e.target.value)} /></Field>
      <div className="grid-2">
        <Field label={t('adminM.sortOrder')} htmlFor="so"><TextInput id="so" type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} /></Field>
        <Field label={t('adminM.published')} htmlFor="sp">
          <Select id="sp" value={form.published ? '1' : '0'} onChange={(e) => set('published', e.target.value === '1')}>
            <option value="1">{t('common.yes')}</option><option value="0">{t('common.no')}</option>
          </Select>
        </Field>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            if (isNew) await api('/api/settings/services', { method: 'POST', body: form });
            else await api(`/api/settings/services/${form.id}`, { method: 'PATCH', body: form });
            onDone();
          } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
        }}>{t('common.save')}</Button>
      </div>
    </Modal>
  );
}

function PortfolioTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, loading, reload } = useApi<{ items: any[] }>('/api/settings/portfolio/manage');
  const [editing, setEditing] = useState<any | null>(null);
  if (loading && !data) return <Spinner />;
  return (
    <div>
      <Button size="sm" style={{ marginBottom: '0.8rem' }} onClick={() => setEditing({ titleEn: '', titleAr: '', descriptionEn: '', descriptionAr: '', category: '', location: '', completedYear: null, published: false, sortOrder: 0 })}>
        + {t('adminM.addPortfolio')}
      </Button>
      {(data?.items ?? []).map((p: any) => (
        <div className="card" key={p.id} style={{ marginBottom: '0.7rem' }}>
          <div className="row-between">
            <div>
              <b>{p.titleEn}</b> / <span dir="rtl">{p.titleAr}</span>
              <div className="small muted">{p.category} · {p.location} · {p.completedYear} · {p.published ? <span className="badge badge-green">{t('adminM.published')}</span> : <span className="badge badge-grey">—</span>}</div>
            </div>
            <div className="row">
              <Button size="sm" variant="outline" onClick={() => setEditing(p)}>{t('common.edit')}</Button>
              <Button size="sm" variant="ghost" onClick={async () => {
                await api(`/api/settings/portfolio/${p.id}`, { method: 'PATCH', body: { published: !p.published } });
                reload();
              }}>{p.published ? '⛔' : '✓'}</Button>
            </div>
          </div>
        </div>
      ))}
      {editing && (
        <Modal title={editing.id ? t('common.edit') : t('adminM.addPortfolio')} onClose={() => setEditing(null)} wide>
          <PortfolioForm p={editing} onDone={async () => { setEditing(null); reload(); toast(t('common.savedOk'), 'success'); }} />
        </Modal>
      )}
    </div>
  );
}

function PortfolioForm({ p, onDone }: { p: any; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState({ ...p });
  const [busy, setBusy] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const set = (k: string, v: unknown): void => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <div>
      <div className="grid-2">
        <Field label={t('adminM.titleEn')} htmlFor="pte"><TextInput id="pte" value={form.titleEn} onChange={(e) => set('titleEn', e.target.value)} /></Field>
        <Field label={t('adminM.titleAr')} htmlFor="pta"><TextInput id="pta" dir="rtl" value={form.titleAr} onChange={(e) => set('titleAr', e.target.value)} /></Field>
      </div>
      <Field label={t('adminM.descEn')} htmlFor="pde"><TextArea id="pde" value={form.descriptionEn ?? ''} onChange={(e) => set('descriptionEn', e.target.value)} /></Field>
      <Field label={t('adminM.descAr')} htmlFor="pda"><TextArea id="pda" dir="rtl" value={form.descriptionAr ?? ''} onChange={(e) => set('descriptionAr', e.target.value)} /></Field>
      <div className="grid-3">
        <Field label={t('personnelM.category')} htmlFor="pcat"><TextInput id="pcat" value={form.category ?? ''} onChange={(e) => set('category', e.target.value)} /></Field>
        <Field label={t('adminM.locationLbl')} htmlFor="ploc"><TextInput id="ploc" value={form.location ?? ''} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label={t('adminM.year')} htmlFor="pyr"><TextInput id="pyr" type="number" value={form.completedYear ?? ''} onChange={(e) => set('completedYear', e.target.value ? Number(e.target.value) : null)} /></Field>
      </div>
      <Field label={t('adminM.coverImage')} htmlFor="pfile">
        <input id="pfile" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
      </Field>
      <label className="checkbox-row"><input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} /> {t('adminM.published')}</label>
      <div className="modal-actions">
        <Button busy={busy} disabled={!form.titleEn || !form.titleAr} onClick={async () => {
          setBusy(true);
          try {
            let coverFileId = form.coverFileId ?? null;
            if (coverFile) {
              const fd = new FormData();
              fd.append('file', coverFile);
              const up = await api<{ id: string }>('/api/settings/portfolio-upload', { method: 'POST', formData: fd }).catch(() => null);
              if (up) coverFileId = up.id;
            }
            const payload = { ...form, coverFileId };
            if (form.id) await api(`/api/settings/portfolio/${form.id}`, { method: 'PATCH', body: payload });
            else await api('/api/settings/portfolio', { method: 'POST', body: payload });
            onDone();
          } catch (e) { toast((e as ApiError).message, 'error'); } finally { setBusy(false); }
        }}>{t('common.save')}</Button>
      </div>
    </div>
  );
}

function RatesTab() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const { data, loading, reload } = useApi<{ items: any[]; policy: any }>('/api/settings/rates');
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('LBP');
  const [rate, setRate] = useState('');
  const [rateDate, setRateDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState('');
  if (loading && !data) return <Spinner />;
  return (
    <div>
      <div className="alert alert-info">{t('adminM.ratesNote')}</div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="grid-2">
          <Field label={t('adminM.fromCurrency')} htmlFor="rf">
            <Select id="rf" value={from} onChange={(e) => setFrom(e.target.value)}><option value="USD">USD</option><option value="LBP">LBP</option></Select>
          </Field>
          <Field label={t('adminM.toCurrency')} htmlFor="rt">
            <Select id="rt" value={to} onChange={(e) => setTo(e.target.value)}><option value="LBP">LBP</option><option value="USD">USD</option></Select>
          </Field>
          <Field label={t('adminM.rate')} htmlFor="rr" required>
            <TextInput id="rr" dir="ltr" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} required />
          </Field>
          <Field label={t('adminM.rateDate')} htmlFor="rd" required>
            <TextInput id="rd" type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} required />
          </Field>
        </div>
        <Field label={t('adminM.rateSource')} htmlFor="rs" required>
          <TextInput id="rs" value={source} onChange={(e) => setSource(e.target.value)} placeholder={locale === 'ar' ? 'مثل: مصرف لبنان، منصة صيرفة…' : 'e.g. Banque du Liban, verified manual entry…'} />
        </Field>
        <Button disabled={!rate || !source} onClick={async () => {
          try {
            await api('/api/settings/rates', { method: 'POST', body: { fromCurrency: from, toCurrency: to, rate, rateDate, source } });
            toast(t('common.savedOk'), 'success');
            setRate(''); setSource('');
            reload();
          } catch (e) { toast((e as ApiError).message, 'error'); }
        }}>{t('adminM.addRate')}</Button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('adminM.fromCurrency')}→{t('adminM.toCurrency')}</th><th className="num">{t('adminM.rate')}</th><th>{t('adminM.rateDate')}</th><th>{t('adminM.rateSource')}</th></tr></thead>
          <tbody>
            {(data?.items ?? []).map((r: any) => (
              <tr key={r.id}>
                <td className="ltr-span">{r.fromCurrency} → {r.toCurrency}</td>
                <td className="num mono-num ltr-span">{Number(r.rate).toLocaleString('en-US', { maximumFractionDigits: 8 })}</td>
                <td>{fmtDate(r.rateDate, locale)}</td>
                <td className="small">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HealthTab() {
  const { t } = useTranslation();
  const { data, loading } = useApi<any>('/api/settings/health-info');
  if (loading || !data) return <Spinner />;
  const rows: Array<[string, string]> = [
    ['Database', data.db],
    ['Environment', data.env],
    [t('adminM.smtp'), data.smtpConfigured ? t('adminM.smtpOn') : t('adminM.smtpOff')],
    [t('adminM.defaultLocale'), data.defaultLocale],
    [t('adminM.primaryCurrency'), data.primaryCurrency],
  ];
  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="card-title">{t('adminM.healthInfo')}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="row-between" style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--slate-100)' }}>
          <span className="muted">{k}</span><b>{v}</b>
        </div>
      ))}
    </div>
  );
}
