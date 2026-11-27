import { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cx } from '../lib/format';
import { getTheme, setTheme, type Theme } from '../lib/theme';

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Tema del sistema', icon: Monitor },
  { value: 'light', label: 'Tema claro', icon: Sun },
  { value: 'dark', label: 'Tema oscuro', icon: Moon },
];

/** Selector Sistema / Claro / Oscuro */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, set] = useState<Theme>(getTheme);
  return (
    <div className={cx('theme-toggle', className)} role="radiogroup" aria-label="Tema">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          className={cx(theme === value && 'on')}
          onClick={() => { setTheme(value); set(value); }}
        >
          <Icon size={15} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
