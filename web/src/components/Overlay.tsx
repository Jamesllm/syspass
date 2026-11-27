import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { useLayer } from '../hooks';
import { cx } from '../lib/format';
import { Button, ICON, IconButton } from './Button';

/** Panel lateral (escritorio) o pantalla completa (móvil) para formularios largos. */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  useLayer(onClose);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </div>
        {children}
        <div className="sheet-foot">{footer}</div>
      </aside>
    </>
  );
}

/** Diálogo centrado (escritorio) que en móvil sube desde abajo. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useLayer(onClose);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={cx('modal', wide && 'wide')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </div>
        {children}
      </div>
    </>
  );
}

export function Confirm({ title, text, action, onCancel, onConfirm }: {
  title: string; text: ReactNode; action: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{text}</p>
      <div className="modal-actions">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" onClick={onConfirm} autoFocus>{action}</Button>
      </div>
    </Modal>
  );
}

/** Hoja que sube desde abajo, para menús y selectores. */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useLayer(onClose);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="bsheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="bsheet-grip" aria-hidden />
        <div className="bsheet-head">
          <h2>{title}</h2>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </div>
        <div className="bsheet-body">{children}</div>
      </div>
    </>
  );
}

export interface Option { value: string; label: string; meta?: ReactNode; icon?: ReactNode }

/** Lista de opciones de 48 px de alto, cómoda al tacto. */
export function PickList({ options, value, onPick }: { options: Option[]; value?: string; onPick: (v: string) => void }) {
  return (
    <ul className="picklist" role="listbox">
      {options.map((o) => (
        <li key={o.value}>
          <button type="button" role="option" aria-selected={o.value === value} className={cx(o.value === value && 'on')} onClick={() => onPick(o.value)}>
            {o.icon}
            <span className="label">{o.label}</span>
            {o.meta !== undefined && <span className="meta">{o.meta}</span>}
            <span className="tick">{o.value === value && <Check {...ICON} />}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Selector que abre una hoja inferior. `trigger` permite dibujar el botón a medida. */
export function SheetSelect({ title, value, options, onChange, trigger, className, children }: {
  title: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  trigger?: (current: Option | undefined) => ReactNode;
  className?: string;
  /** Contenido extra al final de la hoja (p. ej. "Nuevo cliente") */
  children?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" className={cx('select-pill', className)} onClick={() => setOpen(true)} aria-haspopup="listbox">
        {trigger ? trigger(current) : <span>{current?.label ?? title}</span>}
        <ChevronDown {...ICON} />
      </button>
      {open && (
        <BottomSheet title={title} onClose={close}>
          <PickList options={options} value={value} onPick={(v) => { onChange(v); close(); }} />
          {children?.(close)}
        </BottomSheet>
      )}
    </>
  );
}

/** Filtro en fila de chips (escritorio). */
export function ChipGroup({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={cx('chip', value === o.value && 'active')} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label} {o.meta !== undefined && <span className="n">{o.meta}</span>}
        </button>
      ))}
    </div>
  );
}

/** Pestañas segmentadas (p. ej. "Una por una" / "En lista") */
export function Tabs({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={cx(value === o.value && 'on')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
