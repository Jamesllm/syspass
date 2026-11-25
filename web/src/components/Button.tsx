import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Copy } from 'lucide-react';
import { copyToClipboard } from '../lib/clipboard';
import { errorText } from '../lib/api';
import { cx } from '../lib/format';
import { useToast } from './Toast';

/** Tamaño y trazo únicos para todos los íconos de la app */
export const ICON = { size: 16, strokeWidth: 1.5 } as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  block?: boolean;
  loading?: boolean;
  loadingText?: string;
};

export function Button({
  variant = 'default', size = 'md', icon: Icon, block, loading, loadingText,
  className, children, type = 'button', disabled, ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx('btn', variant !== 'default' && variant, size !== 'md' && size, block && 'block', className)}
      {...rest}
    >
      {Icon && <Icon {...ICON} />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: LucideIcon;
  /** Texto para lectores de pantalla y tooltip */
  label: string;
  active?: boolean;
};

export function IconButton({ icon: Icon, label, active, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} title={label} className={cx('icon-btn', active && 'on', className)} {...rest}>
      <Icon {...ICON} />
    </button>
  );
}

/** Copia un valor (o lo obtiene con una función, p. ej. una contraseña del servidor) y avisa con un toast. */
export function CopyButton({ value, label, done, secret }: {
  value: string | (() => Promise<string>);
  label: string;
  done: string;
  secret?: boolean;
}) {
  const toast = useToast();
  async function copy() {
    try {
      await copyToClipboard(typeof value === 'string' ? value : await value(), secret);
      toast(done);
    } catch (e) {
      toast(errorText(e), 'err');
    }
  }
  return <IconButton icon={Copy} label={label} onClick={copy} />;
}
