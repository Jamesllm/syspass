import type { FastifyRequest } from 'fastify';
import { q, pool, type Db } from './db.js';

export async function audit(
  req: FastifyRequest,
  action: string,
  target: { type?: string; id?: string | null; summary?: string } = {},
  db: Db = pool,
  as?: { id: string | null; username: string; orgId: string | null },
) {
  const u = as ?? req.user;
  await q(
    `insert into audit (org_id, user_id, username, action, target_type, target_id, summary, ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [u?.orgId ?? null, u?.id ?? null, u?.username ?? '', action, target.type ?? '', target.id ?? null, target.summary ?? '', req.ip],
    db,
  );
}
