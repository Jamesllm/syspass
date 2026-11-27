/** Tema de la interfaz: el del sistema, claro u oscuro. Se recuerda en cada navegador. */
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'sp_theme';

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

export function setTheme(t: Theme) {
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch { /* sin almacenamiento: solo esta sesión */ }
  applyTheme(t);
}
