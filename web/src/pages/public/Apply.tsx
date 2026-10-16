import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../lib/api';
import { useLocale } from '../../lib/auth';
import { usePublicData } from '../../lib/publicData';
import { PageContainer } from '../../layouts/PublicLayout';
import { Button, Field, Select, TextArea, TextInput } from '../../components/ui';
import { IconCheck } from '../../components/Icons';

export const GOVERNORATES = ['Beirut', 'Mount Lebanon', 'North', 'Akkar', 'Baalbek-Hermel', 'Beqaa', 'South', 'Nabatieh'];

interface FormState {
  fullName: string; phone: string; email: string;
  personType: string; categoryId: string; skills: string; experienceYears: string;
  qualifications: string; languages: string;
  governorate: string; district: string; town: string; preferredLocations: string;
  availability: string; expectedRate: string; expectedRateCurrency: string;
  consentGiven: boolean; website: string;
}

const initial: FormState = {
  fullName: '', phone: '', email: '', personType: 'worker', categoryId: '', skills: '',
  experienceYears: '0', qualifications: '', languages: '', governorate: '', district: '', town: '',
  preferredLocations: '', availability: 'immediate', expectedRate: '', expectedRateCurrency: 'USD',
  consentGiven: false, website: '',
};

export function MultiStepShell({ steps, current, children }: { steps: string[]; current: number; children: ReactNode }) {
  return (
    <PageContainer>
      <div className="form-card card" style={{ marginTop: '1.4rem' }}>
        <div className="form-steps" aria-hidden>
          {steps.map((s, i) => (
            <div key={s} className={`form-step ${i === current ? 'active' : i < current ? 'done' : ''}`}>{i < current ? '✓ ' : ''}{s}</div>
          ))}
        </div>
        {children}
      </div>
    </PageContainer>
  );
}

export default function ApplyPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { tradeCategories, engineeringCategories } = usePublicData();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reference: string; accessToken: string } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [params] = useSearchParams();
  void params;

  const categories = form.personType === 'engineer'
    ? [...engineeringCategories, ...tradeCategories]
    : [...tradeCategories, ...engineeringCategories];

  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 0) {
      if (form.fullName.trim().length < 2) errs.fullName = t('common.required');
      if (!/^[+0-9 ()-]{7,30}$/.test(form.phone)) errs.phone = t('common.required');
      if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = '✗';
    }
    if (s === 1) {
      if (!form.categoryId) errs.categoryId = t('common.required');
      const exp = Number(form.experienceYears);
      if (!Number.isFinite(exp) || exp < 0 || exp > 70) errs.experienceYears = '0–70';
    }
    if (s === 2) {
      if (!form.governorate) errs.governorate = t('common.required');
    }
    if (s === 3 && !form.consentGiven) errs.consentGiven = t('common.required');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!validateStep(3)) return;
    setBusy(true);
    setGlobalError(null);
    try {
      const fd = new FormData();
      fd.append('data', JSON.stringify({
        ...form,
        experienceYears: Number(form.experienceYears),
        email: form.email || null,
        expectedRate: form.expectedRate || null,
        expectedRateCurrency: form.expectedRate ? form.expectedRateCurrency : null,
        categoryId: form.categoryId || null,
        locale,
      }));
      for (const f of files) fd.append('files', f);
      const res = await api<{ reference: string; accessToken: string }>('/api/public/applications', { method: 'POST', formData: fd });
      if (res.reference) setResult({ reference: res.reference, accessToken: res.accessToken });
      else setResult({ reference: '', accessToken: '' }); // honeypot response
    } catch (err) {
      const e2 = err as ApiError;
      setGlobalError(
        e2.code === 'RATE_LIMITED' ? t('errors.e429')
        : e2.code === 'FILE_REJECTED' ? e2.message
        : e2.message || t('common.errorGeneric')
      );
    } finally { setBusy(false); }
  };

  if (result) {
    return (
      <PageContainer>
        <div className="card form-card success-box" style={{ marginTop: '2rem' }}>
          <div className="check" aria-hidden><IconCheck size={32} /></div>
          <h1>{t('apply.successTitle')}</h1>
          <p className="muted" style={{ maxWidth: 520, margin: '0 auto' }}>{t('apply.successText')}</p>
          {result.reference && (
            <>
              <div style={{ margin: '1.2rem 0' }}>
                <div className="small muted">{t('apply.reference')}</div>
                <div className="ref-box">{result.reference}</div>
                <div className="small muted">{t('apply.token')}</div>
                <div className="ref-box" style={{ fontSize: '0.8rem', wordBreak: 'break-all', maxWidth: 480 }}>{result.accessToken}</div>
                <div className="alert alert-warn" style={{ maxWidth: 480, margin: '0.6rem auto' }}>{t('apply.saveTokenWarning')}</div>
              </div>
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link className="btn btn-primary" to={`/track?type=application&reference=${result.reference}&token=${result.accessToken}`}>{t('apply.trackNow')}</Link>
                <button type="button" className="btn btn-outline" onClick={() => { setForm(initial); setFiles([]); setStep(0); setResult(null); }}>{t('apply.anotherApp')}</button>
              </div>
            </>
          )}
        </div>
      </PageContainer>
    );
  }

  return (
    <MultiStepShell steps={[t('apply.step1'), t('apply.step2'), t('apply.step3'), t('apply.step4')]} current={step}>
      <h1 style={{ fontSize: '1.4rem' }}>{t('apply.title')}</h1>
      <p className="muted">{t('apply.subtitle')}</p>
      {globalError && <div className="alert alert-error" role="alert">{globalError}</div>}
      <form onSubmit={(e) => void submit(e)} noValidate>
        {/* hidden honeypot */}
        <div style={{ position: 'absolute', insetInlineStart: '-9999px' }} aria-hidden>
          <label>Website<input value={form.website} onChange={(e) => set('website', e.target.value)} tabIndex={-1} autoComplete="off" /></label>
        </div>

        {step === 0 && (
          <>
            <Field label={t('apply.fullName')} htmlFor="fullName" required error={errors.fullName}>
              <TextInput id="fullName" required value={form.fullName} invalid={!!errors.fullName}
                onChange={(e) => set('fullName', e.target.value)} autoComplete="name" />
            </Field>
            <div className="grid-2">
              <Field label={t('apply.phone')} htmlFor="phone" required error={errors.phone}>
                <TextInput id="phone" required dir="ltr" placeholder="+961 3 000 000" invalid={!!errors.phone}
                  value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" inputMode="tel" />
              </Field>
              <Field label={`${t('apply.email')} ${t('common.optionalField')}`} htmlFor="email" error={errors.email}>
                <TextInput id="email" type="email" dir="ltr" invalid={!!errors.email}
                  value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
              </Field>
            </div>
            <Field label={t('apply.personType')} htmlFor="personType" required>
              <Select id="personType" value={form.personType} onChange={(e) => set('personType', e.target.value)}>
                <option value="worker">{t('apply.worker')}</option>
                <option value="technician">{t('apply.technician')}</option>
                <option value="engineer">{t('apply.engineer')}</option>
                <option value="other">{t('apply.other')}</option>
              </Select>
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label={t('apply.category')} htmlFor="category" required error={errors.categoryId}>
              <Select id="category" required value={form.categoryId} invalid={!!errors.categoryId}
                onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{locale === 'ar' ? c.nameAr : c.nameEn}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('apply.skills')} htmlFor="skills" hint={t('apply.skillsHint')}>
              <TextInput id="skills" value={form.skills} onChange={(e) => set('skills', e.target.value)} />
            </Field>
            <div className="grid-2">
              <Field label={t('apply.experience')} htmlFor="exp" required error={errors.experienceYears}>
                <TextInput id="exp" type="number" min={0} max={70} value={form.experienceYears}
                  invalid={!!errors.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} />
              </Field>
              <Field label={t('apply.languages')} htmlFor="langs">
                <TextInput id="langs" value={form.languages} onChange={(e) => set('languages', e.target.value)} placeholder={locale === 'ar' ? 'العربية، English…' : 'Arabic, English…'} />
              </Field>
            </div>
            <Field label={t('apply.qualifications')} htmlFor="quals">
              <TextArea id="quals" value={form.qualifications} onChange={(e) => set('qualifications', e.target.value)} />
            </Field>
            <div className="grid-2">
              <Field label={`${t('apply.expectedRate')} ${t('common.optionalField')}`} htmlFor="rate">
                <TextInput id="rate" inputMode="decimal" dir="ltr" value={form.expectedRate}
                  onChange={(e) => set('expectedRate', e.target.value.replace(/[^\d.]/g, ''))} />
              </Field>
              <Field label={t('common.currency')} htmlFor="rateCur">
                <Select id="rateCur" value={form.expectedRateCurrency} onChange={(e) => set('expectedRateCurrency', e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="LBP">LBP</option>
                </Select>
              </Field>
            </div>
            <Field label={t('apply.uploads')} hint={t('apply.uploadsHint', { max: 10 })}>
              <label className="file-drop" htmlFor="apply-files">
                {locale === 'ar' ? 'اضغط لاختيار الملفات (سيرة ذاتية، شهادات…)' : 'Tap to choose files (CV, certificates…)'}
              </label>
              <input id="apply-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" style={{ display: 'none' }}
                onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
              <div className="file-list">
                {files.map((f) => <span key={f.name}>📎 {f.name} <span className="muted">({Math.round(f.size / 1024)} KB)</span></span>)}
              </div>
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid-2">
              <Field label={t('apply.governorate')} htmlFor="gov" required error={errors.governorate}>
                <Select id="gov" required value={form.governorate} invalid={!!errors.governorate}
                  onChange={(e) => set('governorate', e.target.value)}>
                  <option value="">—</option>
                  {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
                </Select>
              </Field>
              <Field label={t('apply.district')} htmlFor="dist">
                <TextInput id="dist" value={form.district} onChange={(e) => set('district', e.target.value)} />
              </Field>
            </div>
            <Field label={t('apply.town')} htmlFor="town">
              <TextInput id="town" value={form.town} onChange={(e) => set('town', e.target.value)} />
            </Field>
            <Field label={t('apply.preferredLocations')} htmlFor="pref">
              <TextInput id="pref" value={form.preferredLocations} onChange={(e) => set('preferredLocations', e.target.value)} />
            </Field>
            <Field label={t('apply.availability')} htmlFor="avail">
              <Select id="avail" value={form.availability} onChange={(e) => set('availability', e.target.value)}>
                <option value="immediate">{locale === 'ar' ? 'فوري' : 'Immediate'}</option>
                <option value="one_week">{locale === 'ar' ? 'خلال أسبوع' : 'Within a week'}</option>
                <option value="two_weeks">{locale === 'ar' ? 'خلال أسبوعين' : 'Within two weeks'}</option>
                <option value="one_month">{locale === 'ar' ? 'خلال شهر' : 'Within a month'}</option>
              </Select>
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <div className="card" style={{ background: 'var(--slate-50)', marginBottom: '1rem' }}>
              <div className="detail-grid">
                <div className="detail-item"><div className="k">{t('apply.fullName')}</div><div className="v">{form.fullName}</div></div>
                <div className="detail-item"><div className="k">{t('apply.phone')}</div><div className="v ltr-span" dir="ltr">{form.phone}</div></div>
                <div className="detail-item"><div className="k">{t('apply.personType')}</div><div className="v">{t(`apply.${form.personType}`)}</div></div>
                <div className="detail-item"><div className="k">{t('apply.category')}</div>
                  <div className="v">{(() => { const c = categories.find((x) => x.id === form.categoryId); return c ? (locale === 'ar' ? c.nameAr : c.nameEn) : '—'; })()}</div></div>
                <div className="detail-item"><div className="k">{t('apply.experience')}</div><div className="v">{form.experienceYears}</div></div>
                <div className="detail-item"><div className="k">{t('apply.governorate')}</div><div className="v">{form.governorate || '—'}</div></div>
              </div>
            </div>
            <div className="alert alert-info">{t('apply.dupWarning')}</div>
            <div className="checkbox-row">
              <input id="consent" type="checkbox" checked={form.consentGiven}
                onChange={(e) => set('consentGiven', e.target.checked)} required aria-invalid={!!errors.consentGiven} />
              <label htmlFor="consent" style={{ fontWeight: 400 }}>
                {t('apply.consent')} <Link to="/privacy" target="_blank">({t('apply.consentLink')})</Link>
              </label>
            </div>
            {errors.consentGiven && <div className="err" style={{ color: 'var(--red-700)', fontSize: '0.8rem' }}>{errors.consentGiven}</div>}
          </>
        )}

        <div className="row" style={{ marginTop: '1.4rem', justifyContent: 'space-between' }}>
          {step > 0
            ? <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>{t('common.previous')}</Button>
            : <span />}
          {step < 3
            ? <Button type="button" onClick={() => { if (validateStep(step)) setStep((s) => s + 1); }}>{t('common.next')}</Button>
            : <Button type="submit" variant="gold" busy={busy}>{busy ? t('apply.submitting') : t('common.submit')}</Button>}
        </div>
      </form>
    </MultiStepShell>
  );
}
