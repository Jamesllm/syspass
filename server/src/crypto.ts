import {
  createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync,
  randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual,
} from 'node:crypto';
import { config } from './config.js';
import { q, type Db } from './db.js';

function scrypt(pw: string, salt: Buffer, len: number, opts: object): Promise<Buffer> {
  return new Promise((res, rej) => scryptCb(pw, salt, len, opts, (err, key) => (err ? rej(err) : res(key))));
}

const derive = (info: string) => Buffer.from(hkdfSync('sha256', config.vaultKey, Buffer.alloc(0), info, 32));
/** Llave de la versión 1 (antes de multiempresa); solo se usa para leer datos v1 y migrarlos. */
const legacyKey = derive('drago-vault/enc/v1');
/** Envuelve las llaves de datos de cada empresa. */
const wrapKey = derive('syspass/wrap/v1');
const fpKey = derive('drago-vault/fp/v1');

function aesSeal(tag: string, key: Buffer, plain: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return [tag, iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

function aesOpen(key: Buffer, blob: string, aad: string): Buffer {
  const [, iv, tag, ct] = blob.split('.');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]);
}

/* ── Llaves por empresa (cifrado de sobre) ───────────────────────── */

/** Genera la llave de datos de una empresa nueva, ya envuelta para guardarla en orgs.dek_enc. */
export const newWrappedOrgKey = (orgId: string) => aesSeal('w1', wrapKey, randomBytes(32), orgId);

const keyCache = new Map<string, Buffer>();

export async function orgKey(orgId: string, db?: Db): Promise<Buffer> {
  const cached = keyCache.get(orgId);
  if (cached) return cached;
  const [row] = await q<{ dek_enc: string | null }>('select dek_enc from orgs where id = $1', [orgId], db);
  if (!row?.dek_enc) throw new Error(`La empresa ${orgId} no tiene llave de cifrado (ejecuta npm run migrate)`);
  const dek = aesOpen(wrapKey, row.dek_enc, orgId);
  keyCache.set(orgId, dek);
  return dek;
}

/* ── Contraseñas guardadas ───────────────────────── */

/** Cifra con la llave de la empresa. El id de la cuenta va como AAD: el texto cifrado no sirve en otra fila. */
export const seal = (dek: Buffer, plain: string, accountId: string) => aesSeal('v2', dek, Buffer.from(plain, 'utf8'), accountId);

/** Descifra v2 (llave de empresa) o v1 (llave anterior, para la migración). */
export function unseal(dek: Buffer | null, blob: string, accountId: string): string {
  const v = blob.slice(0, 3);
  if (v === 'v2.') {
    if (!dek) throw new Error('Falta la llave de la empresa');
    return aesOpen(dek, blob, accountId).toString('utf8');
  }
  if (v === 'v1.') return aesOpen(legacyKey, blob, accountId).toString('utf8');
  throw new Error('Formato de cifrado desconocido');
}

/** Huella para detectar contraseñas repetidas dentro de una empresa sin descifrarlas (ignora mayúsculas). */
export const fingerprint = (orgId: string, p: string) =>
  createHmac('sha256', fpKey).update(`${orgId}\0${p.toLowerCase()}`).digest('base64');

/** 1 débil · 2 media · 3 fuerte · 0 vacía */
export function strength(p: string): number {
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

/* ── Contraseñas de usuarios ───────────────────────── */

const N = 32768, R = 8, P = 1, LEN = 32;
const opts = (n: number, r: number, p: number) => ({ N: n, r, p, maxmem: 256 * n * r });

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, LEN, opts(N, R, P));
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${h.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const h = await scrypt(pw, Buffer.from(salt, 'base64'), LEN, opts(Number(n), Number(r), Number(p)));
  const expected = Buffer.from(hash, 'base64');
  return expected.length === h.length && timingSafeEqual(expected, h);
}

/** Hash fijo: un usuario inexistente tarda lo mismo que uno real. */
export const DUMMY_HASH = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(32).toString('base64')}`;

export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('base64url');

/** Contraseña temporal legible: 4 grupos de 4, sin caracteres ambiguos. */
export function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const group = () => Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join('');
  return [group(), group(), group(), group()].join('-');
}
