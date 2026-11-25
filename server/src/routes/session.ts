import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit.js';
import { COOKIE, HttpError, cookieOptions, requireUser } from '../auth.js';
import { config } from '../config.js';
import { DUMMY_HASH, hashPassword, newToken, sha256, verifyPassword } from '../crypto.js';
import { q, tx, type Db } from '../db.js';
import { Slug, createOrg, isReserved, orgBrand } from '../orgs.js';

const Password = z.string().min(12, 'La contraseña debe tener al menos 12 caracteres').max(200);
const Username = z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres').max(60)
  .regex(/^[a-zA-Z0-9._@-]+$/, 'Usuario: solo letras, números y . _ @ -');

const Login = z.object({
  org: z.string().trim().toLowerCase().min(1, 'Escribe el código de tu empresa').max(40),
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});
const Register = z.object({
  orgName: z.string().trim().min(2, 'Escribe el nombre de la empresa').max(80),
  slug: Slug,
  name: z.string().trim().min(2, 'Escribe tu nombre').max(120),
  username: Username,
  password: Password,
});
const ChangePw = z.object({ current: z.string().min(1).max(200), next: Password });

async function startSession(req: FastifyRequest, reply: FastifyReply, userId: string, db?: Db) {
  const token = newToken();
  await q(
    `insert into sessions (id, user_id, expires_at, ip, user_agent)
     values ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
    [sha256(token), userId, config.maxHours, req.ip, String(req.headers['user-agent'] ?? '').slice(0, 300)], db,
  );
  reply.setCookie(COOKIE, token, cookieOptions());
}

export async function sessionRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', { config: { rateLimit: { max: 8, timeWindow: '5 minutes' } } }, async (req, reply) => {
    const body = Login.parse(req.body);
    const [u] = await q<{ id: string; username: string; pass_hash: string; active: boolean; org_id: string; org_status: string }>(
      `select u.id, u.username, u.pass_hash, u.active, u.org_id, o.status as org_status
         from users u join orgs o on o.id = u.org_id
        where lower(o.slug) = $1 and lower(u.username) = lower($2)`,
      [body.org, body.username],
    );
    const ok = await verifyPassword(body.password, u?.pass_hash ?? DUMMY_HASH);
    if (!u || !ok || !u.active) {
      if (u) await audit(req, 'login.fail', { summary: body.username }, undefined, { id: u.id, username: body.username, orgId: u.org_id });
      throw new HttpError(401, 'Empresa, usuario o contraseña incorrectos');
    }
    if (u.org_status !== 'active') throw new HttpError(403, 'Esta empresa está suspendida. Escribe a soporte de SysPass');
    await startSession(req, reply, u.id);
    await q('update users set last_login_at = now() where id = $1', [u.id]);
    await q("delete from sessions where expires_at < now() or last_seen < now() - interval '2 days'");
    await audit(req, 'login', {}, undefined, { id: u.id, username: u.username, orgId: u.org_id });
    return { ok: true };
  });

  /** Registro público de una empresa con su primer administrador. */
  app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = Register.parse(req.body);
    if (isReserved(body.slug)) throw new HttpError(409, 'Ese código está reservado, elige otro', 'slug');
    const [taken] = await q('select 1 from orgs where lower(slug) = $1', [body.slug]);
    if (taken) throw new HttpError(409, 'Ese código ya está en uso, elige otro', 'slug');
    const hash = await hashPassword(body.password);
    await tx(async (db) => {
      const orgId = await createOrg(db, { slug: body.slug, name: body.orgName });
      const [u] = await q<{ id: string }>(
        `insert into users (org_id, username, name, role, pass_hash, must_change) values ($1, $2, $3, 'admin', $4, false) returning id`,
        [orgId, body.username, body.name, hash], db);
      await audit(req, 'org.register', { type: 'org', id: orgId, summary: `${body.orgName} (${body.slug})` }, db,
        { id: u.id, username: body.username, orgId });
      await startSession(req, reply, u.id, db);
    });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.user) await q('delete from sessions where id = $1', [req.user.sessionId]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    const u = requireUser(req, { allowMustChange: true });
    const org = await orgBrand(u.orgId);
    return {
      user: { id: u.id, username: u.username, name: u.name, role: u.role, mustChange: u.mustChange },
      org,
      idleMinutes: config.idleMinutes,
    };
  });

  app.post('/api/auth/password', async (req) => {
    const u = requireUser(req, { allowMustChange: true });
    const body = ChangePw.parse(req.body);
    const [row] = await q<{ pass_hash: string }>('select pass_hash from users where id = $1', [u.id]);
    if (!(await verifyPassword(body.current, row.pass_hash))) throw new HttpError(400, 'La contraseña actual no coincide');
    if (body.current === body.next) throw new HttpError(400, 'La nueva contraseña debe ser distinta');
    await q('update users set pass_hash = $2, must_change = false where id = $1', [u.id, await hashPassword(body.next)]);
    await q('delete from sessions where user_id = $1 and id <> $2', [u.id, u.sessionId]);
    await audit(req, 'user.password', { type: 'user', id: u.id, summary: u.username });
    return { ok: true };
  });

  /* ── Públicas: marca de una empresa (login) y disponibilidad de código (registro) ── */

  app.get('/api/public/orgs/:slug', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const slug = String((req.params as { slug: string }).slug).toLowerCase();
    const [o] = await q<{ name: string; logo: string | null; accent: string | null }>(
      "select name, logo, accent from orgs where lower(slug) = $1 and status = 'active'", [slug]);
    if (!o) throw new HttpError(404, 'Empresa no encontrada');
    return o;
  });

  app.get('/api/public/slug-available', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const parsed = Slug.safeParse((req.query as { slug?: string }).slug ?? '');
    if (!parsed.success) return { available: false, reason: parsed.error.issues[0]?.message };
    if (isReserved(parsed.data)) return { available: false, reason: 'Código reservado' };
    const [taken] = await q('select 1 from orgs where lower(slug) = $1', [parsed.data]);
    return { available: !taken, reason: taken ? 'Ya está en uso' : undefined };
  });
}
