import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../lib/api';
import { IconChevronLeft, IconChevronRight, IconX, IconAlert } from './Icons';

/* ---------------- data fetching hook ---------------- */

export function useApi<T>(path: string | null, deps: unknown[] = []): {
  data: T | null; loading: boolean; error: ApiError | null; reload: () => void; setData: (d: T) => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!path) { setLoading(false); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    api<T>(path, { signal: ctrl.signal })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => { if (!ctrl.signal.aborted) setError(e as ApiError); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
     
  }, [path, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload, setData };
}

/* ---------------- spinners / states ---------------- */

export function Spinner({ label }: { label?: string }) {
  return <div className="loading-page" role="status" aria-live="polite"><div className="spinner" />{label && <span>{label}</span>}</div>;
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <IconAlert size={34} />
      <div style={{ fontWeight: 700, color: 'var(--slate-700)' }}>{title}</div>
      {hint && <div className="small">{hint}</div>}
      {children && <div style={{ marginTop: '0.8rem' }}>{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError | Error | null; onRetry?: () => void }) {
  const { t } = useTranslation();
  if (!error) return null;
  const code = error instanceof ApiError ? error.status : 0;
  const key = code === 401 ? 'errors.e401' : code === 403 ? 'errors.e403' : code === 404 ? 'errors.e404'
    : code === 409 ? 'errors.e409' : code === 429 ? 'errors.e429' : code === 0 ? 'errors.errorNetwork' : 'errors.e500';
  return (
    <div className="alert alert-error" role="alert">
      {t(key)} {error instanceof ApiError && error.code !== 'HTTP_' + code && <span className="small">({error.code})</span>}
      {onRetry && <button type="button" className="btn btn-outline btn-sm" style={{ marginInlineStart: '0.6rem' }} onClick={onRetry}>{t('common.retry')}</button>}
    </div>
  );
}

/* ---------------- buttons ---------------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'gold' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  busy?: boolean;
};
export function Button({ variant = 'primary', size = 'md', busy, disabled, children, ...rest }: BtnProps) {
  return (
    <button
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''}`}
      disabled={disabled || busy}
      {...rest}
    >
      {busy && <span className="spinner" style={{ width: 14, height: 14, margin: 0, borderWidth: 2, borderTopColor: 'currentColor' }} aria-hidden />}
      {children}
    </button>
  );
}

/* ---------------- form fields ---------------- */

interface FieldProps {
  label: string; error?: string; hint?: string; required?: boolean;
  children: ReactNode; htmlFor?: string;
}
export function Field({ label, error, hint, required, children, htmlFor }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label} {required && <span aria-hidden style={{ color: 'var(--red-700)' }}>*</span>}</label>
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  );
}

export function TextInput({ invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={`input ${invalid ? 'invalid' : ''}`} aria-invalid={invalid || undefined} {...rest} />;
}
export function Select({ invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select className={`select ${invalid ? 'invalid' : ''}`} aria-invalid={invalid || undefined} {...rest}>{children}</select>;
}
export function TextArea({ invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={`textarea ${invalid ? 'invalid' : ''}`} aria-invalid={invalid || undefined} {...rest} />;
}

/* ---------------- badges ---------------- */

export type BadgeColor = 'green' | 'red' | 'amber' | 'blue' | 'grey' | 'gold';
export function Badge({ color = 'grey', children }: { color?: BadgeColor; children: ReactNode }) {
  return <span className={`badge badge-${color}`}>{children}</span>;
}

const STATUS_COLORS: Record<string, BadgeColor> = {
  // applications
  draft: 'grey', submitted: 'blue', under_review: 'amber', shortlisted: 'gold', interview: 'gold',
  approved: 'green', rejected: 'red', hired: 'green',
  // requests
  needs_info: 'amber', site_visit: 'blue', estimating: 'amber', quotation_prepared: 'gold',
  quotation_sent: 'blue', accepted: 'green', declined: 'red', expired: 'grey', contracted: 'green',
  in_progress: 'blue', completed: 'green', cancelled: 'grey',
  // projects / misc
  planning: 'amber', on_hold: 'grey', todo: 'grey', blocked: 'red', done: 'green',
  pending: 'amber', paid: 'green', partial: 'amber', sent: 'blue', pending_approval: 'amber',
  active: 'green', suspended: 'red', candidate: 'amber', on_leave: 'amber', terminated: 'grey', retired: 'grey',
  available: 'green', busy: 'amber', unavailable: 'red',
  present: 'green', absent: 'red', late: 'amber', leave: 'blue', half_day: 'amber',
  open: 'red', mitigating: 'amber', closed: 'green',
  low: 'grey', normal: 'blue', high: 'amber', urgent: 'red', medium: 'amber', critical: 'red',
  advance: 'amber', payment: 'blue', settlement: 'green',
  proposed: 'amber',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge color={STATUS_COLORS[status] ?? 'grey'}>{label ?? status}</Badge>;
}

/* ---------------- modal ---------------- */

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className={`modal ${wide ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: '0.8rem' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><IconX size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; danger?: boolean;
  onConfirm: () => void | Promise<void>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{useTranslation().t('common.cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); onClose(); } }}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------------- toasts ---------------- */

interface Toast { id: number; msg: string; kind: 'info' | 'error' | 'success' }
const ToastCtx = createContext<(msg: string, kind?: Toast['kind']) => void>(() => undefined);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, msg, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = (): ((msg: string, kind?: 'info' | 'error' | 'success') => void) => useContext(ToastCtx);

/* ---------------- data table with server pagination ---------------- */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  num?: boolean;
  hideBelow?: number; // px
}

export function DataTable<T>({
  columns, rows, page, pageSize, total, onPage, sort, dir, onSort, loading, emptyText, onRowClick, rowKey,
}: {
  rowKey?: (row: T, i: number) => string;
  columns: Array<Column<T>>;
  rows: T[];
  page: number; pageSize: number; total: number;
  onPage: (p: number) => void;
  sort?: string; dir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  loading?: boolean;
  emptyText: string;
  onRowClick?: (row: T) => void;
}) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.num ? 'num' : undefined} aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortable && onSort
                    ? <button type="button" className="sortable" style={{ background: 'none', border: 'none', font: 'inherit', color: 'inherit', padding: 0, cursor: 'pointer' }} onClick={() => onSort(c.key)}>{c.header}{sort === c.key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>
                    : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={columns.length}><Spinner /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={columns.length}><EmptyState title={emptyText} /></td></tr>
            )}
            {!loading && rows.map((row, i) => (
              <tr key={rowKey ? rowKey(row, i) : String((row as { id?: string | number }).id ?? i)} style={onRowClick ? { cursor: 'pointer' } : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : undefined}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 0 && (
        <div className="pager">
          <span className="muted">{t('common.showing', { from, to, total })}</span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('common.previous')}>
            <IconChevronLeft size={15} />
          </Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label={t('common.next')}>
            <IconChevronRight size={15} />
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- misc ---------------- */

export function Progress({ pct, label }: { pct: number; label?: string }) {
  return (
    <div>
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      {label && <div className="small muted" style={{ marginTop: 3 }}>{label}</div>}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && <span className="sep"> / </span>}
          {it.to ? <a href={it.to}>{it.label}</a> : <span>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: Array<{ key: string; label: string }>; active: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tb) => (
        <button key={tb.key} type="button" role="tab" aria-selected={active === tb.key}
          className={`tab ${active === tb.key ? 'active' : ''}`} onClick={() => onChange(tb.key)}>
          {tb.label}
        </button>
      ))}
    </div>
  );
}

export function Bars({ data, gold }: { data: Array<{ label: string; value: number }>; gold?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
          <span className="bar-track"><span className={`bar-fill ${gold ? 'gold' : ''}`} style={{ width: `${(d.value / max) * 100}%`, display: 'block' }} /></span>
          <b className="mono-num">{d.value}</b>
        </div>
      ))}
      {data.length === 0 && <div className="muted small">—</div>}
    </div>
  );
}

/** Formats a money string for display; keeps LTR for digits inside RTL text. */
export function Money({ amount, currency, locale }: { amount: string | number | null | undefined; currency: string; locale: string }) {
  if (amount === null || amount === undefined || amount === '') return <span>—</span>;
  const n = Number(amount);
  const formatted = currency === 'LBP'
    ? Math.round(n).toLocaleString(locale === 'ar' ? 'ar-LB' : 'en-US')
    : n.toLocaleString(locale === 'ar' ? 'ar-LB' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <span className="ltr-span mono-num" dir="ltr">{currency} {formatted}</span>;
}

export function fmtDate(d: string | Date | null | undefined, locale: string): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString(locale === 'ar' ? 'ar-LB' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(d: string | Date | null | undefined, locale: string): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleString(locale === 'ar' ? 'ar-LB' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
