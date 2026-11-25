import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit.js';
import { HttpError, requireAdmin } from '../auth.js';
import { hashPassword, tempPassword } from '../crypto.js';
import { q, tx, type Db } from '../db.js';
import { parseCredentialsTxt } from '../importTxt.js';
import { findOrCreateClient, saveResource } from '../vault.js';

const Id = z.object({ id: z.uuid() });
const Role = z.enum(['admin', 'editor', 'lector']);
const UserCreate = z.object({
  username: z.string().trim().min(3, 'Mínimo 3 caracteres').max(60).regex(/^[a-zA-Z0-9._@-]+$/, 'Solo letras, números y . _ @ -'),
  name: z.string().trim().max(120).default(''),
  role: Role,
  clientIds: z.array(z.uuid()).default([]),
});
const UserUpdate = z.object({
  name: z.string().trim().max(120),
  role: Role,
  active: z.boolean(),
  clientIds: z.array(z.uuid()).default([]),
  resetPassword: z.boolean().default(false),
});
const ImportBody = z.object({ text: z.string().min(1).max(500_000) });
const AuditQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  q: z.string().trim().max(100).optional(),
});

/** Asigna clientes a un usuario, solo si pertenecen a la misma empresa. */
async function setUserClients(db: Db, orgId: string, userId: string, clientIds: string[]) {
  const valid = clientIds.length
    ? await q<{ id: string }>('select id from clients where org_id = $1 and id = any($2::uuid[])', [orgId, clientIds], db)
    : [];
  if (valid.length !== new Set(clientIds).size) throw new HttpError(400, 'Algún cliente no pertenece a tu empresa');
  await q('delete from user_clients where user_id = $1', [userId], db);
  for (const c of valid) await q('insert into user_clients values ($1, $2)', [userId, c.id], db);
}

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/users', async (req) => {
    const me = requireAdmin(req);
    return q(
      `select u.id, u.username, u.name, u.role, u.active, u.must_change as "mustChange", u.last_login_at as "lastLoginAt",
              coalesce(array_agg(uc.client_id) filter (where uc.client_id is not null), '{}') as "clientIds"
         from users u left join user_clients uc on uc.user_id = u.id
        where u.org_id = $1
        group by u.id order by lower(u.username)`, [me.orgId]);
  });

  app.post('/api/users', async (req) => {
    const me = requireAdmin(req);
    const input = UserCreate.parse(req.body);
    const temp = tempPassword();
    const hash = await hashPassword(temp);
    try {
      const id = await tx(async (db) => {
        const [u] = await q<{ id: string }>(
          'insert into users (org_id, username, name, role, pass_hash, must_change) values ($1, $2, $3, $4, $5, true) returning id',
          [me.orgId, input.username, input.name, input.role, hash], db);
        await setUserClients(db, me.orgId, u.id, input.clientIds);
        await audit(req, 'user.create', { type: 'user', id: u.id, summary: `${input.username} · ${input.role}` }, db);
        return u.id;
      });
      return { id, tempPassword: temp };
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'Ese usuario ya existe');
      throw e;
    }
  });

  app.put('/api/users/:id', async (req) => {
    const me = requireAdmin(req);
    const { id } = Id.parse(req.params);
    const input = UserUpdate.parse(req.body);
    if (id === me.id && (input.role !== 'admin' || !input.active)) {
      throw new HttpError(400, 'No puedes quitarte el rol de administrador ni desactivarte');
    }
    const temp = input.resetPassword ? tempPassword() : null;
    const hash = temp ? await hashPassword(temp) : null;
    await tx(async (db) => {
      const rows = await q<{ username: string }>(
        `update users set name = $3, role = $4, active = $5,
                pass_hash = coalesce($6, pass_hash), must_change = must_change or $6 is not null
          where id = $1 and org_id = $2 returning username`, [id, me.orgId, input.name, input.role, input.active, hash], db);
      if (!rows.length) throw new HttpError(404, 'Usuario no encontrado');
      await setUserClients(db, me.orgId, id, input.role === 'admin' ? [] : input.clientIds);
      if (temp || !input.active) await q('delete from sessions where user_id = $1', [id], db);
      const notes = [input.role, input.active ? '' : 'desactivado', temp ? 'contraseña restablecida' : ''].filter(Boolean).join(' · ');
      await audit(req, 'user.update', { type: 'user', id, summary: `${rows[0].username} · ${notes}` }, db);
    });
    return { id, tempPassword: temp };
  });

  app.get('/api/audit', async (req) => {
    const me = requireAdmin(req);
    const p = AuditQuery.parse(req.query);
    const like = p.q ? `%${p.q}%` : null;
    return q(
      `select id, at, username, action, target_type as "targetType", summary, ip
         from audit
        where org_id = $1
          and ($2::bigint is null or id < $2)
          and ($3::text is null or username ilike $3 or summary ilike $3 or action ilike $3)
        order by id desc limit $4`, [me.orgId, p.before ?? null, like, p.limit]);
  });

  /** Vista previa: no guarda nada y no devuelve contraseñas. */
  app.post('/api/import/txt/preview', async (req) => {
    requireAdmin(req);
    const { text } = ImportBody.parse(req.body);
    return {
      resources: parseCredentialsTxt(text).map((r) => ({
        client: r.client, type: r.type, name: r.name, host: r.host, notes: r.notes,
        accounts: r.accounts.map((a) => ({ role: a.role, username: a.username, hasPassword: !!a.password, notes: a.notes })),
      })),
    };
  });

  app.post('/api/import/txt/commit', async (req) => {
    const me = requireAdmin(req);
    const { text } = ImportBody.parse(req.body);
    const parsed = parseCredentialsTxt(text);
    return tx(async (db) => {
      let accounts = 0;
      const clients = new Set<string>();
      for (const r of parsed) {
        const clientId = await findOrCreateClient(db, me.orgId, r.client);
        clients.add(clientId);
        await saveResource(db, me, { clientId, type: r.type, name: r.name, host: r.host, notes: r.notes, accounts: r.accounts });
        accounts += r.accounts.length;
      }
      await audit(req, 'import.txt', { summary: `${clients.size} cliente(s), ${parsed.length} recurso(s), ${accounts} cuenta(s)` }, db);
      return { clients: clients.size, resources: parsed.length, accounts };
    });
  });
}
