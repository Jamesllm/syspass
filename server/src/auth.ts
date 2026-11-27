import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { q } from './db.js';
import { sha256 } from './crypto.js';

export type Role = 'admin' | 'editor' | 'lector';
export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  mustChange: boolean;
  sessionId: string;
  orgId: string;
  /** Empresa dueña de la plataforma: ve el panel de Empresas */
  isPlatform: boolean;
  /** Casillas de permisos (los admin tienen todos) */
  permissions: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export const COOKIE = 'sp_sid';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function cookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.secureCookies,
    maxAge: config.maxHours * 3600,
  };
}

export function registerAuth(app: FastifyInstance) {
  app.decorateRequest('user', null);

  // Defensa CSRF: toda escritura debe traer la cabecera propia de la app.
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-dv'] !== '1') {
      return reply.code(403).send({ error: 'Solicitud no permitida' });
    }
  });

  app.addHook('preHandler', async (req: FastifyRequest) => {
    const token = req.cookies[COOKIE];
    if (!token) return;
    const id = sha256(token);
    const rows = await q<{
      user_id: string; username: string; name: string; role: Role; must_change: boolean; active: boolean;
      org_id: string; is_platform: boolean; org_status: string; stale: boolean; permissions: string[];
    }>(
      `select s.user_id, u.username, u.name, u.role, u.must_change, u.active, u.permissions,
              u.org_id, o.is_platform, o.status as org_status,
              s.last_seen < now() - interval '1 minute' as stale
         from sessions s
         join users u on u.id = s.user_id
         join orgs o on o.id = u.org_id
        where s.id = $1 and s.expires_at > now()
          and s.last_seen > now() - make_interval(mins => $2)`,
      [id, config.idleMinutes],
    );
    const r = rows[0];
    if (!r || !r.active || r.org_status !== 'active') return;
    if (r.stale) await q('update sessions set last_seen = now() where id = $1', [id]);
    req.user = {
      id: r.user_id, username: r.username, name: r.name, role: r.role, mustChange: r.must_change,
      sessionId: id, orgId: r.org_id, isPlatform: r.is_platform, permissions: r.permissions ?? [],
    };
  });
}

export function requireUser(req: FastifyRequest, opts: { allowMustChange?: boolean } = {}): SessionUser {
  if (!req.user) throw new HttpError(401, 'Inicia sesión para continuar', 'auth');
  if (req.user.mustChange && !opts.allowMustChange) throw new HttpError(403, 'Debes cambiar tu contraseña', 'must_change');
  return req.user;
}

export function requireAdmin(req: FastifyRequest): SessionUser {
  const u = requireUser(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Solo un administrador puede hacer esto');
  return u;
}

export function requirePlatformAdmin(req: FastifyRequest): SessionUser {
  const u = requireAdmin(req);
  if (!u.isPlatform) throw new HttpError(403, 'Solo el equipo de SysPass puede hacer esto');
  return u;
}

/** Clientes visibles dentro de la empresa del usuario. null = todos (admin). */
export async function allowedClients(u: SessionUser): Promise<Set<string> | null> {
  if (u.role === 'admin') return null;
  const rows = await q<{ client_id: string }>(
    `select uc.client_id from user_clients uc join clients c on c.id = uc.client_id
      where uc.user_id = $1 and c.org_id = $2`, [u.id, u.orgId]);
  return new Set(rows.map((r) => r.client_id));
}

/** El cliente existe en la empresa del usuario y este lo tiene asignado. Lo que puede hacer lo deciden sus permisos. */
export async function assertClientAccess(u: SessionUser, clientId: string) {
  const [c] = await q('select 1 from clients where id = $1 and org_id = $2', [clientId, u.orgId]);
  if (!c) throw new HttpError(404, 'No encontrado');
  const allowed = await allowedClients(u);
  if (allowed && !allowed.has(clientId)) throw new HttpError(404, 'No encontrado');
}
