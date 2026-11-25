import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit.js';
import { HttpError, requireAdmin, requirePlatformAdmin } from '../auth.js';
import { q } from '../db.js';
import { Accent, Logo, orgBrand } from '../orgs.js';

const OrgUpdate = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre de la empresa').max(80),
  accent: Accent.nullable(),
  /** null = quitar logo; undefined = no cambiarlo */
  logo: Logo.nullable().optional(),
});
const StatusUpdate = z.object({ status: z.enum(['active', 'suspended']) });
const Id = z.object({ id: z.uuid() });

export async function orgRoutes(app: FastifyInstance) {
  /* ── Marca de la propia empresa (admin) ── */
  app.get('/api/org', async (req) => {
    const u = requireAdmin(req);
    return orgBrand(u.orgId);
  });

  app.put('/api/org', async (req) => {
    const u = requireAdmin(req);
    const body = OrgUpdate.parse(req.body);
    await q(
      `update orgs set name = $2, accent = $3, logo = case when $5 then $4 else logo end where id = $1`,
      [u.orgId, body.name, body.accent, body.logo ?? null, body.logo !== undefined],
    );
    await audit(req, 'org.update', { type: 'org', id: u.orgId, summary: body.name });
    return orgBrand(u.orgId);
  });

  /* ── Panel de plataforma (equipo SysPass) ── */
  app.get('/api/platform/orgs', async (req) => {
    requirePlatformAdmin(req);
    return q(
      `select o.id, o.slug, o.name, o.status, o.is_platform as "isPlatform", o.created_at as "createdAt",
              (select count(*)::int from users u where u.org_id = o.id) as users,
              (select count(*)::int from resources r where r.org_id = o.id) as resources,
              (select max(last_login_at) from users u where u.org_id = o.id) as "lastActivity"
         from orgs o order by o.created_at desc`);
  });

  app.put('/api/platform/orgs/:id', async (req) => {
    requirePlatformAdmin(req);
    const { id } = Id.parse(req.params);
    const { status } = StatusUpdate.parse(req.body);
    const [o] = await q<{ name: string; is_platform: boolean }>('select name, is_platform from orgs where id = $1', [id]);
    if (!o) throw new HttpError(404, 'Empresa no encontrada');
    if (o.is_platform) throw new HttpError(400, 'No se puede suspender la empresa de la plataforma');
    await q('update orgs set status = $2 where id = $1', [id, status]);
    if (status === 'suspended') await q('delete from sessions where user_id in (select id from users where org_id = $1)', [id]);
    await audit(req, status === 'suspended' ? 'org.suspend' : 'org.activate', { type: 'org', id, summary: o.name });
    return { ok: true };
  });
}
