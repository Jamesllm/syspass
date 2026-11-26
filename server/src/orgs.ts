import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { newWrappedOrgKey } from './crypto.js';
import { q, type Db } from './db.js';

/** Códigos que no puede usar una empresa */
const RESERVED = new Set(['syspass', 'admin', 'api', 'www', 'app', 'registro', 'login', 'soporte', 'support', 'root', 'system', 'platform']);

export const Slug = z.string().trim().toLowerCase()
  .min(3, 'El código debe tener al menos 3 caracteres')
  .max(32, 'El código puede tener hasta 32 caracteres')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Usa solo minúsculas, números y guiones (sin guion al inicio o al final)');

export const isReserved = (slug: string) => RESERVED.has(slug);

export const Accent = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido');
/** Logo como data URL. SVG es seguro porque solo se muestra dentro de <img> (no ejecuta scripts). */
export const Logo = z.string()
  .max(280_000, 'El logo debe pesar menos de 200 KB')
  .regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/, 'El logo debe ser PNG, JPG, WEBP o SVG');

export interface OrgBrand { id: string; slug: string; name: string; logo: string | null; accent: string | null; isPlatform: boolean }

export async function createOrg(db: Db, input: { slug: string; name: string; isPlatform?: boolean }): Promise<string> {
  const id = randomUUID();
  await q(
    'insert into orgs (id, slug, name, is_platform, dek_enc) values ($1, $2, $3, $4, $5)',
    [id, input.slug, input.name, input.isPlatform ?? false, newWrappedOrgKey(id)], db,
  );
  return id;
}

export async function orgBrand(id: string, db?: Db): Promise<OrgBrand> {
  const [o] = await q<OrgBrand>(
    'select id, slug, name, logo, accent, is_platform as "isPlatform" from orgs where id = $1', [id], db);
  return o;
}

/**
 * Empresa que usa el modo "una sola empresa".
 * Con SYSPASS_ORG definido usa esa; si no, la única empresa que no sea la de plataforma,
 * o la de plataforma si es la única que existe. null si no se puede decidir.
 */
export async function singleOrg(slug: string): Promise<{ id: string; slug: string; status: string } | null> {
  if (slug) {
    const [o] = await q<{ id: string; slug: string; status: string }>('select id, slug, status from orgs where lower(slug) = $1', [slug]);
    return o ?? null;
  }
  const rows = await q<{ id: string; slug: string; status: string; is_platform: boolean }>(
    'select id, slug, status, is_platform from orgs order by created_at');
  const regular = rows.filter((o) => !o.is_platform);
  if (regular.length === 1) return regular[0];
  if (regular.length === 0 && rows.length === 1) return rows[0];
  return null;
}
