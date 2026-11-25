import type { ReactNode } from 'react';
import { LockKeyhole, Search } from 'lucide-react';
import { cx } from '../lib/format';
import { ICON } from './Button';

/** Marca del producto */
export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark"><LockKeyhole size={14} strokeWidth={1.75} /></span>
      SysPass
    </span>
  );
}

/** Logo de la empresa o, si no tiene, su inicial sobre el color de marca */
export function OrgMark({ name, logo, size = 28 }: { name: string; logo: string | null; size?: number }) {
  return logo
    ? <img className="org-mark img" src={logo} alt="" width={size} height={size} />
    : <span className="org-mark" style={{ width: size, height: size, fontSize: size * 0.46 }} aria-hidden>{name.trim().charAt(0).toUpperCase() || '·'}</span>;
}

/** Marca de la empresa en la navegación: logo, nombre y "con SysPass" */
export function OrgBrand({ name, logo, platform }: { name: string; logo: string | null; platform?: boolean }) {
  return (
    <span className="org-brand">
      <OrgMark name={name} logo={logo} />
      <span className="org-brand-text">
        <strong>{name}</strong>
        <small>{platform ? 'Administración de la plataforma' : 'con SysPass'}</small>
      </span>
    </span>
  );
}

/** Título de página con descripción y acciones a la derecha. */
export function PageHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-title">
        {typeof title === 'string' ? <h1>{title}</h1> : title}
        {meta && <div className="meta">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Panel({ title, meta, children, footer, className }: {
  title?: string; meta?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  return (
    <section className={cx('panel', className)}>
      {title && (
        <div className="panel-head">
          <h2>{title}</h2>
          {meta && <span>{meta}</span>}
        </div>
      )}
      {children}
      {footer && <div className="panel-foot">{footer}</div>}
    </section>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, lead }: { label: string; value: ReactNode; hint?: string; lead?: boolean }) {
  return (
    <div className={cx('stat', lead && 'lead')}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export const StatGrid = ({ children }: { children: ReactNode }) => <div className="stats">{children}</div>;

export function SearchInput({ value, onChange, placeholder, shortcut, inputRef }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  shortcut?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className="search">
      <Search {...ICON} />
      <span className="sr">Buscar</span>
      <input
        ref={inputRef}
        className="input"
        type="search"
        enterKeyHint="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { onChange(''); e.currentTarget.blur(); } }}
      />
      {shortcut && !value && <span className="kbd">{shortcut}</span>}
    </label>
  );
}

export function Callout({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="callout">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
