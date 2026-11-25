import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit.js';
import { HttpError, allowedClients, assertClientAccess, requireAdmin, requireUser } from '../auth.js';
import { orgKey, unseal } from '../crypto.js';
import { q, tx } from '../db.js';
import { ResourceInput, resourceClient, saveResource } from '../vault.js';

const Id = z.object({ id: z.uuid() });
const ClientInput = z.object({ name: z.string().trim().min(1, 'Escribe un nombre').max(120), notes: z.string().trim().max(2000).default('') });
const Reveal = z.object({ purpose: z.enum(['ver', 'copiar']).default('ver') });

const uniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';

export async function vaultRoutes(app: FastifyInstance) {
  /** Todo lo que el usuario puede ver en su empresa, sin contraseñas. */
  app.get('/api/vault', async (req) => {
    const u = requireUser(req);
    const allowed = await allowedClients(u);
    const ids = allowed ? [...allowed] : null;

    const clients = await q(
      `select id, name, notes from clients
        where org_id = $1 and ($2::uuid[] is null or id = any($2)) order by lower(name)`, [u.orgId, ids]);
    const resources = await q<{ id: string }>(
      `select r.id, r.client_id as "clientId", r.type, r.name, r.host, r.notes, r.updated_at as "updatedAt",
              coalesce(nullif(us.name, ''), us.username, '') as "updatedBy"
         from resources r left join users us on us.id = r.updated_by
        where r.org_id = $1 and ($2::uuid[] is null or r.client_id = any($2))
        order by lower(r.name)`, [u.orgId, ids]);
    const accounts = await q<{ resourceId: string; fp: string | null }>(
      `select a.id, a.resource_id as "resourceId", a.role, a.username, a.notes, a.strength,
              a.pass_enc is not null as "hasPassword", a.pass_changed_at as "passwordChangedAt", a.pass_fp as fp
         from accounts a join resources r on r.id = a.resource_id
        where r.org_id = $1 and ($2::uuid[] is null or r.client_id = any($2))
        order by a.position, a.created_at`, [u.orgId, ids]);

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
    return { clients, resources: resources.map((r) => ({ ...r, accounts: byResource.get(r.id) ?? [] })) };
  });

  /** Descifra una contraseña y deja constancia en la auditoría. */
  app.post('/api/accounts/:id/reveal', async (req) => {
    const u = requireUser(req);
    const { id } = Id.parse(req.params);
    const { purpose } = Reveal.parse(req.body ?? {});
    const [a] = await q<{ pass_enc: string | null; client_id: string; username: string; resource: string }>(
      `select a.pass_enc, r.client_id, a.username, r.name as resource
         from accounts a join resources r on r.id = a.resource_id
        where a.id = $1 and r.org_id = $2`, [id, u.orgId]);
    if (!a) throw new HttpError(404, 'Cuenta no encontrada');
    await assertClientAccess(u, a.client_id, false);
    if (!a.pass_enc) return { password: '' };
    const password = unseal(await orgKey(u.orgId), a.pass_enc, id);
    await audit(req, purpose === 'copiar' ? 'password.copy' : 'password.view', {
      type: 'account', id, summary: `${a.resource} · ${a.username || 'sin usuario'}`,
    });
    return { password };
  });

  app.post('/api/resources', async (req) => {
    const u = requireUser(req);
    const input = ResourceInput.parse(req.body);
    await assertClientAccess(u, input.clientId, true);
    const out = await tx(async (db) => {
      const r = await saveResource(db, u, input);
      await audit(req, 'resource.create', { type: 'resource', id: r.id, summary: input.name }, db);
      return r;
    });
    return { id: out.id };
  });

  app.put('/api/resources/:id', async (req) => {
    const u = requireUser(req);
    const { id } = Id.parse(req.params);
    const input = ResourceInput.parse(req.body);
    const prev = await resourceClient(id, u.orgId);
    await assertClientAccess(u, prev.client_id, true);
    await assertClientAccess(u, input.clientId, true);
    await tx(async (db) => {
      const r = await saveResource(db, u, input, id);
      const extra = [r.passwordChanges && `${r.passwordChanges} contraseña(s) cambiada(s)`, r.removed && `${r.removed} cuenta(s) eliminada(s)`]
        .filter(Boolean).join(', ');
      await audit(req, 'resource.update', { type: 'resource', id, summary: extra ? `${input.name} · ${extra}` : input.name }, db);
    });
    return { id };
  });

  app.delete('/api/resources/:id', async (req) => {
    const u = requireUser(req);
    const { id } = Id.parse(req.params);
    const prev = await resourceClient(id, u.orgId);
    await assertClientAccess(u, prev.client_id, true);
    await tx(async (db) => {
      await q('delete from resources where id = $1 and org_id = $2', [id, u.orgId], db);
      await audit(req, 'resource.delete', { type: 'resource', id, summary: prev.name }, db);
    });
    return { ok: true };
  });

  app.post('/api/clients', async (req) => {
    const u = requireAdmin(req);
    const input = ClientInput.parse(req.body);
    try {
      const [c] = await q<{ id: string }>('insert into clients (org_id, name, notes) values ($1, $2, $3) returning id', [u.orgId, input.name, input.notes]);
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
      const rows = await q('update clients set name = $3, notes = $4, updated_at = now() where id = $1 and org_id = $2 returning id',
        [id, u.orgId, input.name, input.notes]);
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
