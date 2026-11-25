import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './auth.js';
import { fingerprint, orgKey, seal, strength } from './crypto.js';
import { q, type Db } from './db.js';

export const TYPES = ['servidor', 'nas', 'vpn', 'equipos', 'remoto', 'hipervisor', 'correo', 'web', 'bd', 'red', 'otro'] as const;

export const AccountInput = z.object({
  id: z.uuid().optional(),
  role: z.string().trim().max(60).default(''),
  username: z.string().trim().max(200).default(''),
  /** undefined = no cambiar la contraseña guardada */
  password: z.string().max(500).optional(),
  notes: z.string().trim().max(1000).default(''),
});

export const ResourceInput = z.object({
  clientId: z.uuid(),
  type: z.enum(TYPES),
  name: z.string().trim().min(1, 'Escribe un nombre').max(120),
  host: z.string().trim().max(255).default(''),
  notes: z.string().trim().max(4000).default(''),
  accounts: z.array(AccountInput).max(60).default([]),
});
export type ResourceInput = z.infer<typeof ResourceInput>;

/**
 * Crea o actualiza un recurso con sus cuentas (dentro de una transacción).
 * Las contraseñas se cifran con la llave de la empresa.
 */
export async function saveResource(db: Db, actor: { id: string; orgId: string }, input: ResourceInput, existingId?: string) {
  const id = existingId ?? randomUUID();
  const dek = await orgKey(actor.orgId, db);
  if (existingId) {
    await q(
      `update resources set client_id = $2, type = $3, name = $4, host = $5, notes = $6, updated_at = now(), updated_by = $7
        where id = $1 and org_id = $8`,
      [id, input.clientId, input.type, input.name, input.host, input.notes, actor.id, actor.orgId], db,
    );
  } else {
    await q(
      `insert into resources (id, org_id, client_id, type, name, host, notes, updated_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, actor.orgId, input.clientId, input.type, input.name, input.host, input.notes, actor.id], db,
    );
  }

  const current = await q<{ id: string; pass_fp: string | null }>('select id, pass_fp from accounts where resource_id = $1', [id], db);
  const currentById = new Map(current.map((a) => [a.id, a]));
  const keep = new Set<string>();
  let passwordChanges = 0;

  for (const [position, a] of input.accounts.entries()) {
    if (!a.username && !a.role && !a.password && !a.notes) continue;
    const prev = a.id ? currentById.get(a.id) : undefined;
    const accId = prev ? prev.id : randomUUID();
    keep.add(accId);

    const params: unknown[] = [accId, id, position, a.role, a.username, a.notes];
    const withPassword = a.password !== undefined;
    if (withPassword) {
      const fp = a.password ? fingerprint(actor.orgId, a.password!) : null;
      const changed = !prev || prev.pass_fp !== fp;
      if (changed) passwordChanges++;
      params.push(a.password ? seal(dek, a.password, accId) : null, fp, strength(a.password!), changed);
    }

    if (prev) {
      await q(withPassword
        ? `update accounts set position = $3, role = $4, username = $5, notes = $6, pass_enc = $7, pass_fp = $8, strength = $9,
                  pass_changed_at = case when $10 then now() else pass_changed_at end, updated_at = now()
            where id = $1 and resource_id = $2`
        : `update accounts set position = $3, role = $4, username = $5, notes = $6, updated_at = now()
            where id = $1 and resource_id = $2`, params, db);
    } else {
      if (!withPassword) params.push(null, null, 0, false);
      await q(
        `insert into accounts (id, resource_id, position, role, username, notes, pass_enc, pass_fp, strength, pass_changed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, case when $7::text is null then null else now() end)`,
        params.slice(0, 9), db);
    }
  }

  const removed = current.filter((a) => !keep.has(a.id)).map((a) => a.id);
  if (removed.length) await q('delete from accounts where id = any($1::uuid[])', [removed], db);
  return { id, passwordChanges, removed: removed.length };
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
