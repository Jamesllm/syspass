import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit.js';
import { HttpError, allowedClients, assertClientAccess, requireAdmin, requireUser } from '../auth.js';
import { orgKey, unseal } from '../crypto.js';
import { q, tx } from '../db.js';
import { can, requirePerm } from '../permissions.js';
import {
  AccountInput, ResourceInput, deleteAccount, insertAccount, resourceClient, saveResource, storedAccount, updateAccount,
} from '../vault.js';

const Id = z.object({ id: z.uuid() });
const ClientInput = z.object({
  name: z.string().trim().min(1, 'Escribe un nombre').max(120),
  notes: z.string().trim().max(2000).default(''),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Color no válido').transform((c) => c.toLowerCase()).nullable().default(null),
});
const GroupInput = z.object({
  name: z.string().trim().min(1, 'Escribe un nombre').max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido').default('#8a8a8a'),
});
const Reveal = z.object({ purpose: z.enum(['ver', 'copiar']).default('ver') });
const AddAccounts = z.object({ accounts: z.array(AccountInput).min(1).max(500) });

const uniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';

const EVENT_TEXT: Record<string, string> = {
  created: 'creó la cuenta',
  password: 'cambió la contraseña',
  username: 'cambió el usuario',
  role: 'cambió el rol',
  notes: 'editó la nota',
  deleted: 'eliminó la cuenta',
  'password.view': 'vio la contraseña',
  'password.copy': 'copió la contraseña',
};

export async function vaultRoutes(app: FastifyInstance) {
  /** Todo lo que el usuario puede ver en su empresa, sin contraseñas. */
  app.get('/api/vault', async (req) => {
    const u = requireUser(req);
    const allowed = await allowedClients(u);
    const ids = allowed ? [...allowed] : null;
    // Quién modificó: solo para quien puede ver el historial
    const showWho = can(u, 'history.view');

    const clients = await q(
      `select id, name, notes, color from clients
        where org_id = $1 and ($2::uuid[] is null or id = any($2)) order by lower(name)`, [u.orgId, ids]);
    const groups = await q(
      `select g.id, g.name, g.color, g.position,
              (select count(*)::int from resources r where r.group_id = g.id) as "resourceCount"
         from groups g where g.org_id = $1 order by g.position, lower(g.name)`, [u.orgId]);
    const resources = await q<{ id: string }>(
      `select r.id, r.client_id as "clientId", r.group_id as "groupId", r.name, r.host, r.notes, r.updated_at as "updatedAt",
              r.account_sort as "accountSort",
              case when $3 then coalesce(nullif(us.name, ''), us.username) end as "updatedBy"
         from resources r left join users us on us.id = r.updated_by
        where r.org_id = $1 and ($2::uuid[] is null or r.client_id = any($2))
        order by lower(r.name)`, [u.orgId, ids, showWho]);
    const accounts = await q<{ resourceId: string; fp: string | null }>(
      `select a.id, a.resource_id as "resourceId", a.role, a.username, a.notes, a.strength,
              a.pass_enc is not null as "hasPassword", a.pass_changed_at as "passwordChangedAt",
              a.created_at as "createdAt", a.updated_at as "updatedAt",
              case when $3 then coalesce(nullif(uu.name, ''), uu.username) end as "updatedBy",
              a.pass_fp as fp
         from accounts a join resources r on r.id = a.resource_id
         left join users uu on uu.id = a.updated_by
        where r.org_id = $1 and ($2::uuid[] is null or r.client_id = any($2))
        order by a.position, a.created_at`, [u.orgId, ids, showWho]);

    // Repetidas: dentro de toda la empresa, aunque el usuario no vea las otras cuentas.
    const dup = await q<{ fp: string; n: number }>(
      `select a.pass_fp as fp, count(*)::int as n
         from accounts a join resources r on r.id = a.resource_id
        where r.org_id = $1 and a.pass_fp is not null
        group by a.pass_fp having count(*) > 1`, [u.orgId]);
    const reused = new Map(dup.map((d) => [d.fp, d.n]));

    const byResource = new Map<string, unknown[]>();
    for (const { fp, ...a } of accounts) {
      const list = byResource.get(a.resourceId) ?? [];
      list.push({ ...a, reusedCount: fp ? reused.get(fp) ?? 0 : 0 });
      byResource.set(a.resourceId, list);
    }
    return { clients, groups, resources: resources.map((r) => ({ ...r, accounts: byResource.get(r.id) ?? [] })) };
  });

  /** Descifra una contraseña y deja constancia en la auditoría. */
  app.post('/api/accounts/:id/reveal', async (req) => {
    const u = requireUser(req);
    const { id } = Id.parse(req.params);
    const { purpose } = Reveal.parse(req.body ?? {});
    requirePerm(u, purpose === 'copiar' ? 'passwords.copy' : 'passwords.view');
    const [a] = await q<{ pass_enc: string | null; client_id: string; username: string; resource: string }>(
      `select a.pass_enc, r.client_id, a.username, r.name as resource
         from accounts a join resources r on r.id = a.resource_id
        where a.id = $1 and r.org_id = $2`, [id, u.orgId]);
    if (!a) throw new HttpError(404, 'Cuenta no encontrada');
    await assertClientAccess(u, a.client_id);
    if (!a.pass_enc) return { password: '' };
    const password = unseal(await orgKey(u.orgId), a.pass_enc, id);
    await audit(req, purpose === 'copiar' ? 'password.copy' : 'password.view', {
      type: 'account', id, summary: `${a.resource} · ${a.username || 'sin usuario'}`,
    });
    return { password };
  });

  /* ── Recursos ── */

  app.post('/api/resources', async (req) => {
    const u = requireUser(req);
    requirePerm(u, 'resources.create');
    const input = ResourceInput.parse(req.body);
    await assertClientAccess(u, input.clientId);
    const out = await tx(async (db) => {
      const r = await saveResource(db, u, input);
      await audit(req, 'resource.create', { type: 'resource', id: r.id, summary: `${input.name} · ${r.created} cuenta(s)` }, db);
      return r;
    });
    return { id: out.id };
  });

  app.put('/api/resources/:id', async (req) => {
    const u = requireUser(req);
    requirePerm(u, 'resources.edit');
    const { id } = Id.parse(req.params);
    const input = ResourceInput.parse(req.body);
    const prev = await resourceClient(id, u.orgId);
    await assertClientAccess(u, prev.client_id);
    await assertClientAccess(u, input.clientId);
    await tx(async (db) => {
      const r = await saveResource(db, u, input, id, { canDelete: can(u, 'resources.delete') });
      const extra = [
        r.created && `${r.created} cuenta(s) nueva(s)`,
        r.passwordChanges && `${r.passwordChanges} contraseña(s) cambiada(s)`,
        r.removed && `${r.removed} cuenta(s) eliminada(s)`,
      ].filter(Boolean).join(', ');
      await audit(req, 'resource.update', { type: 'resource', id, summary: extra ? `${input.name} · ${extra}` : input.name }, db);
    });
    return { id };
  });

  app.delete('/api/resources/:id', async (req) => {
    const u = requireUser(req);
    requirePerm(u, 'resources.delete');
    const { id } = Id.parse(req.params);
    const prev = await resourceClient(id, u.orgId);
    await assertClientAccess(u, prev.client_id);
    await tx(async (db) => {
      const accs = await q<{ id: string; resource_id: string; role: string; username: string; notes: string; pass_fp: string | null }>(
        'select id, resource_id, role, username, notes, pass_fp from accounts where resource_id = $1', [id], db);
      for (const a of accs) await deleteAccount(db, u, a);
      await q('delete from resources where id = $1 and org_id = $2', [id, u.orgId], db);
      await audit(req, 'resource.delete', { type: 'resource', id, summary: prev.name }, db);
    });
    return { ok: true };
  });

  /** Orden de las cuentas del recurso: se guarda en el servidor y lo ven todos igual */
  app.put('/api/resources/:id/sort', async (req) => {
    const u = requireUser(req);
    requirePerm(u, 'resources.edit');
    const { id } = Id.parse(req.params);
    const { sort } = z.object({ sort: z.enum(['manual', 'name', 'name_desc', 'user', 'recent']) }).parse(req.body);
    const res = await resourceClient(id, u.orgId);
    await assertClientAccess(u, res.client_id);
    await q('update resources set account_sort = $3 where id = $1 and org_id = $2', [id, u.orgId, sort]);
    return { id, sort };
  });

  /* ── Cuentas una por una ── */

  /** Agregar una o varias cuentas (p. ej. desde la lista usuario;contraseña) */
  app.post('/api/resources/:id/accounts', async (req) => {
    const u = requireUser(req);
    requirePerm(u, 'resources.create');
    const { id } = Id.parse(req.params);
    const { accounts } = AddAccounts.parse(req.body);
    const res = await resourceClient(id, u.orgId);
    await assertClientAccess(u, res.client_id);
    const created = await tx(async (db) => {
      const [{ n }] = await q<{ n: number }>('select coalesce(max(position), -1)::int + 1 as n from accounts where resource_id = $1', [id], db);
      let i = 0;
      for (const a of accounts) {
        if (!a.username && !a.password && !a.role && !a.notes) continue;
        await insertAccount(db, u, id, n + i, a);
        i++;
      }
      await q('update resources set updated_at = now(), updated_by = $2 where id = $1', [id, u.id], db);
      await audit(req, 'resource.update', { type: 'resource', id, summary: `${res.name} · ${i} cuenta(s) nueva(s)` }, db);
      return i;
    });
    return { created };
  });

  app.put('/api/accounts/:id', async (req) => {
    const u = requireUser(req);
    requirePerm(u, 'resources.edit');
    const { id } = Id.parse(req.params);
    const input = AccountInput.parse(req.body);
    const prev = await storedAccount(id, u.orgId);
    await assertClientAccess(u, prev.client_id);
    const r = await tx(async (db) => {
      const out = await updateAccount(db, u, prev, input);
      if (out.changed) {
        await q('update resources set updated_at = now(), updated_by = $2 where id = $1', [prev.resource_id, u.id], db);
        await audit(req, 'resource.update', {
          type: 'account', id, summary: `${prev.resource_name} · ${input.username || prev.username || 'cuenta'}${out.passwordChanged ? ' · contraseña cambiada' : ''}`,
        }, db);
      }
      return out;
    });
    return { id, changed: r.changed };
  });

  app.delete('/api/accounts/:id', async (req) => {
    const u = requireUser(req);
    requirePerm(u, 'resources.delete');
    const { id } = Id.parse(req.params);
    const prev = await storedAccount(id, u.orgId);
    await assertClientAccess(u, prev.client_id);
    await tx(async (db) => {
      await deleteAccount(db, u, prev);
      await q('update resources set updated_at = now(), updated_by = $2 where id = $1', [prev.resource_id, u.id], db);
      await audit(req, 'resource.update', { type: 'account', id, summary: `${prev.resource_name} · cuenta ${prev.username || ''} eliminada` }, db);
    });
    return { ok: true };
  });

  /** Línea de tiempo de una cuenta: cambios y quién vio o copió la contraseña */
  app.get('/api/accounts/:id/history', async (req) => {
    const u = requireUser(req);
    requirePerm(u, 'history.view');
    const { id } = Id.parse(req.params);
    const prev = await storedAccount(id, u.orgId);
    await assertClientAccess(u, prev.client_id);
    const rows = await q<{ action: string; detail: string; at: string; who: string; ip: string }>(
      `select e.action, e.detail, e.at, coalesce(nullif(us.name, ''), nullif(e.username, ''), '') as who, '' as ip
         from account_events e left join users us on us.id = e.user_id
        where e.account_id = $1 and e.org_id = $2
       union all
       select a.action, '' as detail, a.at, coalesce(nullif(us.name, ''), a.username) as who, a.ip
         from audit a left join users us on us.id = a.user_id
        where a.target_id = $1 and a.org_id = $2 and a.action in ('password.view', 'password.copy')
        order by at desc limit 300`, [id, u.orgId]);
    return rows.map((r) => ({ ...r, text: EVENT_TEXT[r.action] ?? r.action }));
  });

  /* ── Grupos ── */

  app.post('/api/groups', async (req) => {
    const u = requireUser(req);
    requirePerm(u, 'groups.manage');
    const input = GroupInput.parse(req.body);
    try {
      const [g] = await q<{ id: string }>(
        `insert into groups (org_id, name, color, position)
         values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from groups where org_id = $1)) returning id`,
        [u.orgId, input.name, input.color]);
      await audit(req, 'group.create', { type: 'group', id: g.id, summary: input.name });
      return g;
    } catch (e) {
      if (uniqueViolation(e)) throw new HttpError(409, 'Ya existe un grupo con ese nombre');
      throw e;
    }
  });

  app.put('/api/groups/:id', async (req) => {
    const u = requireUser(req);
    requirePerm(u, 'groups.manage');
    const { id } = Id.parse(req.params);
    const input = GroupInput.parse(req.body);
    try {
      const rows = await q('update groups set name = $3, color = $4 where id = $1 and org_id = $2 returning id', [id, u.orgId, input.name, input.color]);
      if (!rows.length) throw new HttpError(404, 'Grupo no encontrado');
    } catch (e) {
      if (uniqueViolation(e)) throw new HttpError(409, 'Ya existe un grupo con ese nombre');
      throw e;
    }
    await audit(req, 'group.update', { type: 'group', id, summary: input.name });
    return { id };
  });

  /** Borrar un grupo; si tiene recursos hay que indicar a qué grupo pasan (?moveTo=) */
  app.delete('/api/groups/:id', async (req) => {
    const u = requireUser(req);
    requirePerm(u, 'groups.manage');
    const { id } = Id.parse(req.params);
    const moveTo = z.object({ moveTo: z.uuid().optional() }).parse(req.query).moveTo;
    const [g] = await q<{ name: string; n: number }>(
      'select g.name, (select count(*)::int from resources r where r.group_id = g.id) as n from groups g where g.id = $1 and g.org_id = $2', [id, u.orgId]);
    if (!g) throw new HttpError(404, 'Grupo no encontrado');
    if (g.n > 0 && !moveTo) throw new HttpError(409, `El grupo tiene ${g.n} recurso(s): elige a qué grupo pasan`);
    if (moveTo === id) throw new HttpError(400, 'Elige otro grupo de destino');
    await tx(async (db) => {
      if (g.n > 0) {
        const [dest] = await q('select 1 from groups where id = $1 and org_id = $2', [moveTo, u.orgId], db);
        if (!dest) throw new HttpError(400, 'El grupo de destino no existe');
        await q('update resources set group_id = $2 where group_id = $1', [id, moveTo], db);
      }
      await q('delete from groups where id = $1 and org_id = $2', [id, u.orgId], db);
      await audit(req, 'group.delete', { type: 'group', id, summary: `${g.name}${g.n ? ` · ${g.n} recurso(s) movido(s)` : ''}` }, db);
    });
    return { ok: true };
  });

  /* ── Clientes (solo administradores) ── */

  app.post('/api/clients', async (req) => {
    const u = requireAdmin(req);
    const input = ClientInput.parse(req.body);
    try {
      const [c] = await q<{ id: string }>('insert into clients (org_id, name, notes, color) values ($1, $2, $3, $4) returning id',
        [u.orgId, input.name, input.notes, input.color]);
      await audit(req, 'client.create', { type: 'client', id: c.id, summary: input.name });
      return c;
    } catch (e) {
      if (uniqueViolation(e)) throw new HttpError(409, 'Ya existe un cliente con ese nombre');
      throw e;
    }
  });

  app.put('/api/clients/:id', async (req) => {
    const u = requireAdmin(req);
    const { id } = Id.parse(req.params);
    const input = ClientInput.parse(req.body);
    try {
      const rows = await q('update clients set name = $3, notes = $4, color = $5, updated_at = now() where id = $1 and org_id = $2 returning id',
        [id, u.orgId, input.name, input.notes, input.color]);
      if (!rows.length) throw new HttpError(404, 'Cliente no encontrado');
    } catch (e) {
      if (uniqueViolation(e)) throw new HttpError(409, 'Ya existe un cliente con ese nombre');
      throw e;
    }
    await audit(req, 'client.update', { type: 'client', id, summary: input.name });
    return { id };
  });

  app.delete('/api/clients/:id', async (req) => {
    const u = requireAdmin(req);
    const { id } = Id.parse(req.params);
    const [c] = await q<{ name: string; n: number }>(
      `select c.name, (select count(*)::int from resources where client_id = c.id) as n
         from clients c where c.id = $1 and c.org_id = $2`, [id, u.orgId]);
    if (!c) throw new HttpError(404, 'Cliente no encontrado');
    await tx(async (db) => {
      await q('delete from clients where id = $1 and org_id = $2', [id, u.orgId], db);
      await audit(req, 'client.delete', { type: 'client', id, summary: `${c.name} · ${c.n} recurso(s)` }, db);
    });
    return { ok: true };
  });
}
