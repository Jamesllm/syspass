import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './auth.js';
import { fingerprint, orgKey, seal, strength } from './crypto.js';
import { q, type Db } from './db.js';

/** Tipos de la versión 1.x; hoy sirven para crear los grupos por defecto y para el importador */
export const TYPES = ['servidor', 'nas', 'vpn', 'equipos', 'remoto', 'hipervisor', 'correo', 'web', 'bd', 'red', 'otro'] as const;

export const DEFAULT_GROUPS: { key: (typeof TYPES)[number]; name: string; color: string }[] = [
  { key: 'servidor', name: 'Servidor', color: '#4f86c6' },
  { key: 'nas', name: 'NAS', color: '#3aa39a' },
  { key: 'vpn', name: 'VPN', color: '#c08a2e' },
  { key: 'equipos', name: 'Equipos', color: '#8b96a5' },
  { key: 'remoto', name: 'Acceso remoto', color: '#d0613f' },
  { key: 'hipervisor', name: 'Hipervisor', color: '#6f7fd6' },
  { key: 'correo', name: 'Correo', color: '#b6648f' },
  { key: 'web', name: 'Plataforma web', color: '#3f9c5a' },
  { key: 'bd', name: 'Base de datos', color: '#a6723d' },
  { key: 'red', name: 'Red y firewall', color: '#5f9ea0' },
  { key: 'otro', name: 'Otro', color: '#8a8a8a' },
];

export async function seedGroups(db: Db, orgId: string) {
  for (const [i, g] of DEFAULT_GROUPS.entries()) {
    await q('insert into groups (org_id, name, color, legacy_type, position) values ($1, $2, $3, $4, $5)',
      [orgId, g.name, g.color, g.key, i + 1], db);
  }
}

export const AccountInput = z.object({
  id: z.uuid().optional(),
  role: z.string().trim().max(60).default(''),
  username: z.string().trim().max(200).default(''),
  /** undefined = no cambiar la contraseña guardada */
  password: z.string().max(500).optional(),
  notes: z.string().trim().max(1000).default(''),
});
export type AccountInput = z.infer<typeof AccountInput>;

export const ResourceInput = z.object({
  clientId: z.uuid(),
  groupId: z.uuid({ message: 'Elige un grupo' }),
  name: z.string().trim().min(1, 'Escribe un nombre').max(120),
  host: z.string().trim().max(255).default(''),
  notes: z.string().trim().max(4000).default(''),
  accounts: z.array(AccountInput).max(500).default([]),
});
export type ResourceInput = z.infer<typeof ResourceInput>;

/** Quién hace el cambio */
export interface Actor { id: string; username: string; orgId: string }

const isEmpty = (a: AccountInput) => !a.username && !a.role && !a.password && !a.notes;

/* ── Historial ───────────────────────── */

async function recordEvent(db: Db, actor: Actor, accountId: string, resourceId: string, action: string, detail = '') {
  await q(
    `insert into account_events (org_id, account_id, resource_id, user_id, username, action, detail)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [actor.orgId, accountId, resourceId, actor.id, actor.username, action, detail], db);
}

/* ── Cuentas ───────────────────────── */

interface StoredAccount { id: string; resource_id: string; role: string; username: string; notes: string; pass_fp: string | null }

export async function insertAccount(db: Db, actor: Actor, resourceId: string, position: number, a: AccountInput): Promise<string> {
  const id = randomUUID();
  const dek = await orgKey(actor.orgId, db);
  const pw = a.password ?? '';
  await q(
    `insert into accounts (id, resource_id, position, role, username, notes, pass_enc, pass_fp, strength, pass_changed_at, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, case when $7::text is null then null else now() end, $10, $10)`,
    [id, resourceId, position, a.role, a.username, a.notes, pw ? seal(dek, pw, id) : null, pw ? fingerprint(actor.orgId, pw) : null, strength(pw), actor.id],
    db);
  await recordEvent(db, actor, id, resourceId, 'created', pw ? 'con contraseña' : 'sin contraseña');
  return id;
}

/** Aplica cambios a una cuenta y registra cada uno en su historial. Devuelve si la contraseña cambió. */
export async function updateAccount(db: Db, actor: Actor, prev: StoredAccount, a: AccountInput, position?: number) {
  const changes: [string, string][] = [];
  if (a.username !== prev.username) changes.push(['username', prev.username && a.username ? `${prev.username} → ${a.username}` : a.username || 'sin usuario']);
  if (a.role !== prev.role) changes.push(['role', a.role || 'sin rol']);
  if (a.notes !== prev.notes) changes.push(['notes', '']);

  let passSql = '';
  const params: unknown[] = [prev.id, a.role, a.username, a.notes];
  let passwordChanged = false;
  if (a.password !== undefined) {
    const fp = a.password ? fingerprint(actor.orgId, a.password) : null;
    if (fp !== prev.pass_fp) {
      passwordChanged = true;
      changes.push(['password', a.password ? '' : 'contraseña quitada']);
      const dek = await orgKey(actor.orgId, db);
      params.push(a.password ? seal(dek, a.password, prev.id) : null, fp, strength(a.password));
      passSql = ', pass_enc = $6, pass_fp = $7, strength = $8, pass_changed_at = now()';
    }
  }

  if (changes.length) {
    params.splice(4, 0, actor.id);
    await q(`update accounts set role = $2, username = $3, notes = $4, updated_by = $5, updated_at = now()${passSql} where id = $1`, params, db);
    for (const [action, detail] of changes) await recordEvent(db, actor, prev.id, prev.resource_id, action, detail);
  }
  if (position !== undefined) await q('update accounts set position = $2 where id = $1 and position <> $2', [prev.id, position], db);
  return { changed: changes.length > 0, passwordChanged };
}

export async function deleteAccount(db: Db, actor: Actor, prev: StoredAccount) {
  await recordEvent(db, actor, prev.id, prev.resource_id, 'deleted', prev.username);
  await q('delete from accounts where id = $1', [prev.id], db);
}

export async function storedAccount(id: string, orgId: string, db?: Db) {
  const [a] = await q<StoredAccount & { client_id: string; resource_name: string }>(
    `select a.id, a.resource_id, a.role, a.username, a.notes, a.pass_fp, r.client_id, r.name as resource_name
       from accounts a join resources r on r.id = a.resource_id
      where a.id = $1 and r.org_id = $2`, [id, orgId], db);
  if (!a) throw new HttpError(404, 'Cuenta no encontrada');
  return a;
}

/* ── Recursos ───────────────────────── */

export async function assertGroup(db: Db, orgId: string, groupId: string) {
  const [g] = await q<{ legacy_type: string | null }>('select legacy_type from groups where id = $1 and org_id = $2', [groupId, orgId], db);
  if (!g) throw new HttpError(400, 'El grupo no existe');
  return g;
}

/**
 * Crea o actualiza un recurso con sus cuentas (dentro de una transacción).
 * canDelete: si el usuario puede quitar cuentas al editar.
 */
export async function saveResource(db: Db, actor: Actor, input: ResourceInput, existingId?: string, opts: { canDelete?: boolean } = {}) {
  const id = existingId ?? randomUUID();
  const group = await assertGroup(db, actor.orgId, input.groupId);
  const legacyType = group.legacy_type ?? 'otro';
  if (existingId) {
    await q(
      `update resources set client_id = $2, group_id = $3, type = $4, name = $5, host = $6, notes = $7, updated_at = now(), updated_by = $8
        where id = $1 and org_id = $9`,
      [id, input.clientId, input.groupId, legacyType, input.name, input.host, input.notes, actor.id, actor.orgId], db);
  } else {
    await q(
      `insert into resources (id, org_id, client_id, group_id, type, name, host, notes, updated_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, actor.orgId, input.clientId, input.groupId, legacyType, input.name, input.host, input.notes, actor.id], db);
  }

  const current = await q<StoredAccount>('select id, resource_id, role, username, notes, pass_fp from accounts where resource_id = $1', [id], db);
  const byId = new Map(current.map((a) => [a.id, a]));
  const keep = new Set<string>();
  let passwordChanges = 0;
  let created = 0;

  for (const [position, a] of input.accounts.entries()) {
    if (isEmpty(a)) continue;
    const prev = a.id ? byId.get(a.id) : undefined;
    if (prev) {
      keep.add(prev.id);
      const r = await updateAccount(db, actor, prev, a, position);
      if (r.passwordChanged) passwordChanges++;
    } else {
      keep.add(await insertAccount(db, actor, id, position, a));
      created++;
    }
  }

  const removed = current.filter((a) => !keep.has(a.id));
  if (removed.length && !opts.canDelete) throw new HttpError(403, 'No tienes permiso para eliminar cuentas');
  for (const a of removed) await deleteAccount(db, actor, a);
  return { id, passwordChanges, created, removed: removed.length };
}

export async function resourceClient(id: string, orgId: string, db?: Db): Promise<{ client_id: string; name: string }> {
  const [r] = await q<{ client_id: string; name: string }>('select client_id, name from resources where id = $1 and org_id = $2', [id, orgId], db);
  if (!r) throw new HttpError(404, 'Recurso no encontrado');
  return r;
}

export async function findOrCreateClient(db: Db, orgId: string, name: string): Promise<string> {
  const [found] = await q<{ id: string }>('select id from clients where org_id = $1 and lower(name) = lower($2)', [orgId, name], db);
  if (found) return found.id;
  const [created] = await q<{ id: string }>('insert into clients (org_id, name) values ($1, $2) returning id', [orgId, name], db);
  return created.id;
}

/** Grupo para un tipo inferido por el importador (o "Otro") */
export async function groupForType(db: Db, orgId: string, type: string): Promise<string> {
  const [g] = await q<{ id: string }>(
    `select id from groups where org_id = $1 and legacy_type = any($2::text[])
      order by (legacy_type = $3) desc, position limit 1`, [orgId, [type, 'otro'], type], db);
  if (g) return g.id;
  const [created] = await q<{ id: string }>(
    `insert into groups (org_id, name, color, legacy_type, position) values ($1, 'Otro', '#8a8a8a', 'otro', 99)
     on conflict (org_id, lower(name)) do update set legacy_type = coalesce(groups.legacy_type, 'otro') returning id`, [orgId], db);
  return created.id;
}
