import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../lib/api';
import { useLocale } from '../../lib/auth';
import { usePublicData } from '../../lib/publicData';
import { PageContainer } from '../../layouts/PublicLayout';
import { Button, Field, Select, TextArea, TextInput } from '../../components/ui';
import { MultiStepShell, GOVERNORATES } from './Apply';
import { IconCheck } from '../../components/Icons';

interface FormState {
  contactName: string; phone: string; email: string; company: string; language: 'ar' | 'en';
  categoryId: string; description: string;
  governorate: string; district: string; town: string;
  propertyType: string; areaValue: string; areaUnit: 'm2' | 'm';
  desiredStart: string; deadline: string;
  budget: string; budgetCurrency: string;
  preferredContact: 'phone' | 'email' | 'whatsapp';
  consentGiven: boolean; website: string;
}

export default function RequestQuotePage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { requestCategories } = usePublicData();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    contactName: '', phone: '', email: '', company: '', language: locale,
    categoryId: '', description: '', governorate: '', district: '', town: '',
    propertyType: 'apartment', areaValue: '', areaUnit: 'm2',
    desiredStart: '', deadline: '', budget: '', budgetCurrency: 'USD',
    preferredContact: 'phone', consentGiven: false, website: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reference: string; accessToken: string } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 0) {
      if (form.contactName.trim().length < 2) errs.contactName = t('common.required');
      if (!/^[+0-9 ()-]{7,30}$/.test(form.phone)) errs.phone = t('common.required');
      if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = '✗';
    }
    if (s === 1) {
      if (!form.categoryId) errs.categoryId = t('common.required');
      if (form.description.trim().length < 10) errs.description = t('common.required');
      if (!form.governorate) errs.governorate = t('common.required');
      if (form.areaValue && (Number(form.areaValue) <= 0 || Number(form.areaValue) > 1000000)) errs.areaValue = '✗';
    }
    if (s === 2 && !form.consentGiven) errs.consentGiven = t('common.required');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!validateStep(2)) return;
    setBusy(true);
    setGlobalError(null);
    try {
      const fd = new FormData();
      fd.append('data', JSON.stringify({
        ...form,
        email: form.email || null, company: form.company || null,
        district: form.district || null, town: form.town || null,
        areaValue: form.areaValue ? Number(form.areaValue) : null,
        desiredStart: form.desiredStart || null, deadline: form.deadline || null,
        budget: form.budget || null, budgetCurrency: form.budget ? form.budgetCurrency : null,
        categoryId: form.categoryId,
      }));
      for (const f of files) fd.append('files', f);
      const res = await api<{ reference: string; accessToken: string }>('/api/public/requests', { method: 'POST', formData: fd });
      setResult({ reference: res.reference ?? '', accessToken: res.accessToken ?? '' });
    } catch (err) {
      const e2 = err as ApiError;
      setGlobalError(
        e2.code === 'RATE_LIMITED' ? t('errors.e429')
        : e2.code === 'FILE_REJECTED' ? e2.message
        : e2.code === 'INVALID_CATEGORY' ? e2.message
        : e2.message || t('common.errorGeneric')
      );
    } finally { setBusy(false); }
  };

  if (result) {
    return (
      <PageContainer>
        <div className="card form-card success-box" style={{ marginTop: '2rem' }}>
          <div className="check" aria-hidden><IconCheck size={32} /></div>
          <h1>{t('request.successTitle')}</h1>
          <p className="muted" style={{ maxWidth: 520, margin: '0 auto' }}>{t('request.successText')}</p>
          {result.reference && (
            <>
              <div style={{ margin: '1.2rem 0' }}>
                <div className="small muted">{t('track.reference')}</div>
                <div className="ref-box">{result.reference}</div>
                <div className="small muted">{t('track.token')}</div>
                <div className="ref-box" style={{ fontSize: '0.8rem', wordBreak: 'break-all', maxWidth: 480 }}>{result.accessToken}</div>
                <div className="alert alert-warn" style={{ maxWidth: 480, margin: '0.6rem auto' }}>{t('apply.saveTokenWarning')}</div>
              </div>
              <Link className="btn btn-primary" to={`/track?type=request&reference=${result.reference}&token=${result.accessToken}`}>{t('apply.trackNow')}</Link>
            </>
          )}
        </div>
      </PageContainer>
    );
  }

  return (
    <MultiStepShell steps={[t('request.step1'), t('request.step2'), t('request.step3')]} current={step}>
      <h1 style={{ fontSize: '1.4rem' }}>{t('request.title')}</h1>
      <p className="muted">{t('request.subtitle')}</p>
      {globalError && <div className="alert alert-error" role="alert">{globalError}</div>}
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div style={{ position: 'absolute', insetInlineStart: '-9999px' }} aria-hidden>
          <label>Website<input value={form.website} onChange={(e) => set('website', e.target.value)} tabIndex={-1} autoComplete="off" /></label>
        </div>

        {step === 0 && (
          <>
            <div className="grid-2">
              <Field label={t('request.contactName')} htmlFor="cname" required error={errors.contactName}>
                <TextInput id="cname" required value={form.contactName} invalid={!!errors.contactName}
                  onChange={(e) => set('contactName', e.target.value)} autoComplete="name" />
              </Field>
              <Field label={t('request.company')} htmlFor="company">
                <TextInput id="company" value={form.company} onChange={(e) => set('company', e.target.value)} autoComplete="organization" />
              </Field>
            </div>
            <div className="grid-2">
              <Field label={t('request.phone')} htmlFor="rphone" required error={errors.phone}>
                <TextInput id="rphone" required dir="ltr" placeholder="+961 3 000 000" value={form.phone}
                  invalid={!!errors.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" inputMode="tel" />
              </Field>
              <Field label={`${t('request.email')} ${t('common.optionalField')}`} htmlFor="remail" error={errors.email}>
                <TextInput id="remail" type="email" dir="ltr" value={form.email} invalid={!!errors.email}
                  onChange={(e) => set('email', e.target.value)} autoComplete="email" />
              </Field>
            </div>
            <div className="grid-2">
              <Field label={t('request.language')} htmlFor="rlang">
                <Select id="rlang" value={form.language} onChange={(e) => set('language', e.target.value as 'ar' | 'en')}>
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </Select>
              </Field>
              <Field label={t('request.preferredContact')} htmlFor="rcontact">
                <Select id="rcontact" value={form.preferredContact} onChange={(e) => set('preferredContact', e.target.value as FormState['preferredContact'])}>
                  <option value="phone">{t('request.phoneC')}</option>
                  <option value="email">{t('request.emailC')}</option>
                  <option value="whatsapp">{t('request.whatsappC')}</option>
                </Select>
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Field label={t('request.category')} htmlFor="rcat" required error={errors.categoryId}>
              <Select id="rcat" required value={form.categoryId} invalid={!!errors.categoryId}
                onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">—</option>
                {requestCategories.map((c) => (
                  <option key={c.id} value={c.id}>{locale === 'ar' ? c.nameAr : c.nameEn}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('request.description')} htmlFor="rdesc" required error={errors.description} hint={t('request.descriptionHint')}>
              <TextArea id="rdesc" required minLength={10} value={form.description} invalid={!!errors.description}
                onChange={(e) => set('description', e.target.value)} />
            </Field>
            <div className="grid-3">
              <Field label={t('request.governorate')} htmlFor="rgov" required error={errors.governorate}>
                <Select id="rgov" required value={form.governorate} invalid={!!errors.governorate}
                  onChange={(e) => set('governorate', e.target.value)}>
                  <option value="">—</option>
                  {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
                </Select>
              </Field>
              <Field label={t('request.district')} htmlFor="rdist">
                <TextInput id="rdist" value={form.district} onChange={(e) => set('district', e.target.value)} />
              </Field>
              <Field label={t('request.town')} htmlFor="rtown">
                <TextInput id="rtown" value={form.town} onChange={(e) => set('town', e.target.value)} />
              </Field>
            </div>
            <div className="grid-3">
              <Field label={t('request.propertyType')} htmlFor="rprop">
                <Select id="rprop" value={form.propertyType} onChange={(e) => set('propertyType', e.target.value)}>
                  {(['apartment', 'villa', 'house', 'building', 'commercial', 'industrial', 'land', 'other'] as const).map((p) => (
                    <option key={p} value={p}>{t(`request.${p === 'other' ? 'otherProp' : p}`)}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t('request.area')} htmlFor="rarea" error={errors.areaValue}>
                <TextInput id="rarea" inputMode="decimal" dir="ltr" value={form.areaValue}
                  invalid={!!errors.areaValue} onChange={(e) => set('areaValue', e.target.value.replace(/[^\d.]/g, ''))} />
              </Field>
              <Field label={t('request.areaUnit')} htmlFor="runit">
                <Select id="runit" value={form.areaUnit} onChange={(e) => set('areaUnit', e.target.value as 'm2' | 'm')}>
                  <option value="m2">m²</option>
                  <option value="m">m</option>
                </Select>
              </Field>
            </div>
            <div className="grid-2">
              <Field label={t('request.desiredStart')} htmlFor="rstart">
                <TextInput id="rstart" type="date" value={form.desiredStart} onChange={(e) => set('desiredStart', e.target.value)} />
              </Field>
              <Field label={t('request.deadline')} htmlFor="rdeadline">
                <TextInput id="rdeadline" type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
              </Field>
            </div>
            <div className="grid-2">
              <Field label={`${t('request.budget')} ${t('common.optionalField')}`} htmlFor="rbudget" hint={t('request.budgetHint')}>
                <TextInput id="rbudget" inputMode="decimal" dir="ltr" value={form.budget}
                  onChange={(e) => set('budget', e.target.value.replace(/[^\d.]/g, ''))} />
              </Field>
              <Field label={t('common.currency')} htmlFor="rbcur">
                <Select id="rbcur" value={form.budgetCurrency} onChange={(e) => set('budgetCurrency', e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="LBP">LBP</option>
                </Select>
              </Field>
            </div>
            <Field label={t('request.uploads')}>
              <label className="file-drop" htmlFor="req-files">
                {locale === 'ar' ? 'اضغط لاختيار صور أو مخططات أو مستندات' : 'Tap to choose photos, plans or documents'}
              </label>
              <input id="req-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }}
                onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
              <div className="file-list">
                {files.map((f) => <span key={f.name}>📎 {f.name} <span className="muted">({Math.round(f.size / 1024)} KB)</span></span>)}
              </div>
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <div className="card" style={{ background: 'var(--slate-50)', marginBottom: '1rem' }}>
              <div className="detail-grid">
                <div className="detail-item"><div className="k">{t('request.contactName')}</div><div className="v">{form.contactName}</div></div>
                <div className="detail-item"><div className="k">{t('request.phone')}</div><div className="v ltr-span" dir="ltr">{form.phone}</div></div>
                <div className="detail-item"><div className="k">{t('request.category')}</div>
                  <div className="v">{(() => { const c = requestCategories.find((x) => x.id === form.categoryId); return c ? (locale === 'ar' ? c.nameAr : c.nameEn) : '—'; })()}</div></div>
                <div className="detail-item"><div className="k">{t('request.governorate')}</div><div className="v">{form.governorate || '—'}{form.town ? ` — ${form.town}` : ''}</div></div>
              </div>
              <div className="detail-item" style={{ marginTop: '0.6rem' }}>
                <div className="k">{t('request.description')}</div>
                <div className="v small">{form.description}</div>
              </div>
            </div>
            <div className="alert alert-info">{t('request.subtitle')}</div>
            <div className="checkbox-row">
              <input id="rconsent" type="checkbox" checked={form.consentGiven} required
                aria-invalid={!!errors.consentGiven}
                onChange={(e) => set('consentGiven', e.target.checked)} />
              <label htmlFor="rconsent" style={{ fontWeight: 400 }}>
                {t('request.consent')} <Link to="/privacy" target="_blank">({t('apply.consentLink')})</Link>
              </label>
            </div>
            {errors.consentGiven && <div style={{ color: 'var(--red-700)', fontSize: '0.8rem' }}>{errors.consentGiven}</div>}
          </>
        )}

        <div className="row" style={{ marginTop: '1.4rem', justifyContent: 'space-between' }}>
          {step > 0
            ? <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>{t('common.previous')}</Button>
            : <span />}
          {step < 2
            ? <Button type="button" onClick={() => { if (validateStep(step)) setStep((s) => s + 1); }}>{t('common.next')}</Button>
            : <Button type="submit" variant="gold" busy={busy}>{busy ? t('apply.submitting') : t('common.submit')}</Button>}
        </div>
      </form>
    </MultiStepShell>
  );
}
