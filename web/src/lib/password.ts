const SETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!#$%&*+-=?@^_'];

function randInt(n: number): number {
  const lim = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= lim);
  return buf[0] % n;
}

export function generatePassword(length = 20): string {
  const all = SETS.join('');
  const out = SETS.map((s) => s[randInt(s.length)]);
  while (out.length < length) out.push(all[randInt(all.length)]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

/** Igual que en el servidor: 1 débil · 2 media · 3 fuerte · 0 vacía */
export function estimateStrength(p: string): number {
  if (!p) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  let s = 0;
  if (p.length >= 12) s++;
  if (p.length >= 16) s++;
  if (classes >= 3) s++;
  if (classes === 4) s++;
  if (/(19|20)\d{2}/.test(p) || /(admin|soporte|password|passw|root|vmware|qwerty|1234|abc)/i.test(p)) s -= 2;
  if (p.length < 10) s = Math.min(s, 0);
  return s <= 1 ? 1 : s === 2 ? 2 : 3;
}

export const STRENGTH_LABEL = ['', 'Débil', 'Media', 'Fuerte'];

export type CharKind = 'l' | 'd' | 's';
export const charKind = (c: string): CharKind => (/\d/.test(c) ? 'd' : /[A-Za-z]/.test(c) ? 'l' : 's');
