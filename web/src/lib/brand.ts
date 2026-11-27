/**
 * Color de marca de cada empresa. A partir de un solo color se calculan dos variantes
 * que siempre cumplen contraste 4.5:1: una para tema claro y otra para tema oscuro.
 */

const DEFAULT_LIGHT = '#0f766e';
const DEFAULT_DARK = '#3fbfa9';
const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#19191b';

export const PRESET_ACCENTS = ['#0f766e', '#2563eb', '#4f46e5', '#c2410c', '#be123c', '#15803d', '#0e7490', '#a16207'];

type RGB = [number, number, number];

const toRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function luminance([r, g, b]: RGB) {
  const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(toRgb(a)), luminance(toRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Texto sobre un fondo de ese color: blanco mientras se lea bien (3:1), si no casi negro */
export function inkOn(hex: string) {
  return contrast('#ffffff', hex) >= 3 ? '#ffffff' : '#171717';
}

/** Variables CSS para pintar algo con el color de un cliente (fondo y texto legible) */
export function clientVars(hex: string | null | undefined): Record<string, string> | undefined {
  return hex ? { '--client': hex, '--client-ink': inkOn(hex) } : undefined;
}

/** Acerca el color a `toward` (negro o blanco) lo justo para llegar a 4.5:1 sobre `surface`. */
function ensureContrast(hex: string, surface: string, toward: RGB) {
  const base = toRgb(hex);
  for (let t = 0; t <= 1; t += 0.04) {
    const c = toHex(mix(base, toward, t));
    if (contrast(c, surface) >= 4.5) return c;
  }
  return toHex(toward);
}

export function accentVariants(hex: string | null) {
  if (!hex) return { light: DEFAULT_LIGHT, dark: DEFAULT_DARK };
  return {
    light: ensureContrast(hex, LIGHT_SURFACE, [0, 0, 0]),
    dark: ensureContrast(hex, DARK_SURFACE, [255, 255, 255]),
  };
}

/** Aplica el color de la empresa a toda la interfaz (variables CSS en :root). */
export function applyAccent(hex: string | null) {
  const { light, dark } = accentVariants(hex);
  const root = document.documentElement.style;
  root.setProperty('--brand-light', light);
  root.setProperty('--brand-dark', dark);
}

export function applyTitle(orgName?: string) {
  document.title = orgName && orgName !== 'SysPass' ? `${orgName} · SysPass` : 'SysPass';
}

/** Recuerda el código de la última empresa usada en este navegador. */
const ORG_KEY = 'sp_org';
export const rememberedOrg = () => { try { return localStorage.getItem(ORG_KEY) ?? ''; } catch { return ''; } };
export const rememberOrg = (slug: string) => { try { localStorage.setItem(ORG_KEY, slug); } catch { /* sin almacenamiento */ } };

/** "Mi Empresa S.A.C." → "mi-empresa-sac" */
export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/, '');
