import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { cx } from '../lib/format';
import { STRENGTH_LABEL, estimateStrength, generatePassword } from '../lib/password';
import { IconButton } from './Button';

/** Etiqueta + control. Envuelve cualquier input. */
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('field', className)}>
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

/** Dos campos lado a lado en escritorio, uno sobre otro en móvil */
export const FieldRow = ({ children }: { children: ReactNode }) => <div className="field-row">{children}</div>;

export function Input({ mono, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input className={cx('input', mono && 'mono', className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('textarea', className)} {...rest} />;
}

export function Select({ options, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select className={cx('select', className)} {...rest}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Checkbox({ label, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export const FormError = ({ children }: { children?: ReactNode }) => (
  <p className="form-error" role="alert">{children}</p>
);

/** Campo de contraseña con botón para mostrar y, opcionalmente, para generar una segura. */
export function PasswordInput({ value, onChange, generator, showMeter, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
  value: string;
  onChange: (v: string) => void;
  generator?: boolean;
  showMeter?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <span className={cx('pw-input', generator && 'with-gen', className)}>
        <input className="input mono" type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
        <span className="tools">
          <IconButton icon={shown ? EyeOff : Eye} label={shown ? 'Ocultar' : 'Mostrar'} onClick={() => setShown(!shown)} />
          {generator && (
            <IconButton icon={RefreshCw} label="Generar contraseña segura" onClick={() => { onChange(generatePassword()); setShown(true); }} />
          )}
        </span>
      </span>
      {showMeter && value && <StrengthMeter strength={estimateStrength(value)} />}
    </>
  );
}

export function StrengthMeter({ strength }: { strength: number }) {
  return (
    <div className="meter" data-s={strength}>
      <span className="bars"><i /><i /><i /></span>
      <span>{STRENGTH_LABEL[strength]}</span>
    </div>
  );
}
