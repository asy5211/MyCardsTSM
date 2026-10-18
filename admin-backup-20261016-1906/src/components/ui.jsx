// The small building blocks every page uses: buttons, cards, badges, form fields, dialogs, tables' helpers.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mediaUrl } from '../api.js';

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, children, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="spinner spinner-sm" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, padded = true, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'card-body' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="page-head">
      <div>
        {back && <Link to={back.to} className="back-link">← {back.label}</Link>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone, to }) {
  const body = (
    <>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ? `tone-${tone}` : ''}`}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </>
  );
  return to ? <Link to={to} className="stat stat-link">{body}</Link> : <div className="stat">{body}</div>;
}

export function Badge({ tone = 'gray', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** map: { value: { label, tone } } as defined in format.js */
export function StatusBadge({ map, value }) {
  const entry = map[value] || { label: value, tone: 'gray' };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

export function Field({ label, hint, error, required, children, className = '' }) {
  return (
    <label className={`field ${error ? 'has-error' : ''} ${className}`}>
      <span className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <div>{error.message || String(error)}</div>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Alert({ tone = 'info', children }) {
  return <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : undefined}>{children}</div>;
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

/** A picture with a box icon when there is none (or it fails to load). */
export function Thumb({ src, size = 44, alt = '', rounded = true }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const url = mediaUrl(src);
  return (
    <span className={`thumb ${rounded ? 'thumb-round' : ''}`} style={{ width: size, height: size }}>
      {url && !broken ? (
        <img src={url} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Zm0 0 9 4.5m0 0 9-4.5M12 12v9" />
        </svg>
      )}
    </span>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={`tab ${value === t.value ? 'active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined && t.count !== null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <input
      type="search"
      className="input search"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      aria-label={placeholder}
    />
  );
}

export function Pagination({ total, limit, offset, onChange }) {
  if (!total) return null;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div className="pagination">
      <span>
        {from}–{to} of {total.toLocaleString('en-US')}
      </span>
      <div className="pagination-buttons">
        <Button size="sm" variant="secondary" disabled={offset <= 0} onClick={() => onChange(Math.max(0, offset - limit))}>← Previous</Button>
        <Button size="sm" variant="secondary" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Next →</Button>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('input, textarea, select, button.btn-primary');
    first?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/**
 * Asks a question with one text box, used for "why?" steps (suspend, hold, decline, cancel) and for
 * entering a reference number. onConfirm(text) may throw an ApiError; its message is shown in the dialog.
 */
export function PromptModal({
  title, description, label, placeholder, confirmLabel = 'Confirm', danger = false,
  required = true, minLength = 3, multiline = true, initial = '', onConfirm, onClose,
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    const value = text.trim();
    if (required && value.length < minLength) {
      setError(`Please enter at least ${minLength} characters.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(value);
      onClose();
    } catch (e) {
      setError(e.fieldErrors ? Object.values(e.fieldErrors)[0] || e.message : e.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy}>{confirmLabel}</Button>
        </>
      )}
    >
      {description && <p className="muted">{description}</p>}
      <Field label={label} error={error}>
        {multiline ? (
          <textarea className="input" rows={3} value={text} placeholder={placeholder} maxLength={255} onChange={(e) => setText(e.target.value)} />
        ) : (
          <input className="input" value={text} placeholder={placeholder} maxLength={120} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        )}
      </Field>
    </Modal>
  );
}

export function ConfirmModal({ title, children, confirmLabel = 'Confirm', danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={go} loading={busy}>{confirmLabel}</Button>
        </>
      )}
    >
      {children}
      {error && <Alert tone="error">{error}</Alert>}
    </Modal>
  );
}

// ---- Toasts --------------------------------------------------------------------------

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setItems((list) => [...list, { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/** Row that opens a page when clicked or activated with the keyboard. */
export function ClickRow({ to, children, className = '' }) {
  const navigate = useNavigate();
  return (
    <tr
      className={`click-row ${className}`}
      tabIndex={0}
      onClick={(e) => { if (!e.target.closest('a,button,input,select,label')) navigate(to); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.target.closest('a,button,input,select')) navigate(to); }}
    >
      {children}
    </tr>
  );
}

export function KeyValue({ rows }) {
  return (
    <dl className="kv">
      {rows.filter((r) => r[1] !== undefined).map(([k, v]) => (
        <div key={k} className="kv-row">
          <dt>{k}</dt>
          <dd>{v === null || v === '' ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  );
}
