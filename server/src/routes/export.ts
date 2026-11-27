/**
 * Exportar a Excel (.xlsx): todo, un cliente o un grupo (o ambos).
 * Sin contraseñas por defecto; con contraseñas solo con el permiso "export.passwords" y queda en la auditoría.
 */
import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit.js';
import { HttpError, allowedClients, requireUser } from '../auth.js';
import { orgKey, unseal } from '../crypto.js';
import { q } from '../db.js';
import { requirePerm } from '../permissions.js';

const ExportBody = z.object({
  clientId: z.uuid().optional(),
  groupId: z.uuid().optional(),
  includePasswords: z.boolean().default(false),
});

interface Row {
  account_id: string | null; client: string; grp: string; resource: string; host: string; resource_notes: string;
  role: string | null; username: string | null; pass_enc: string | null; account_notes: string | null;
  updated_at: string | null; updated_by: string | null; pass_changed_at: string | null;
}

const safeName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'syspass';

export async function exportRoutes(app: FastifyInstance) {
  app.post('/api/export', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const u = requireUser(req);
    requirePerm(u, 'export');
    const body = ExportBody.parse(req.body ?? {});
    if (body.includePasswords) requirePerm(u, 'export.passwords');

    const allowed = await allowedClients(u);
    if (body.clientId && allowed && !allowed.has(body.clientId)) throw new HttpError(404, 'Cliente no encontrado');
    const ids = allowed ? [...allowed] : null;

    const rows = await q<Row>(
      `select a.id as account_id, c.name as client, g.name as grp, r.name as resource, r.host, r.notes as resource_notes,
              a.role, a.username, a.pass_enc, a.notes as account_notes,
              coalesce(a.updated_at, r.updated_at) as updated_at,
              coalesce(nullif(uu.name, ''), uu.username, nullif(ur.name, ''), ur.username) as updated_by,
              a.pass_changed_at
         from resources r
         join clients c on c.id = r.client_id
         join groups g on g.id = r.group_id
         left join accounts a on a.resource_id = r.id
         left join users uu on uu.id = a.updated_by
         left join users ur on ur.id = r.updated_by
        where r.org_id = $1
          and ($2::uuid[] is null or r.client_id = any($2))
          and ($3::uuid is null or r.client_id = $3)
          and ($4::uuid is null or r.group_id = $4)
        order by lower(c.name), g.position, lower(r.name), a.position`,
      [u.orgId, ids, body.clientId ?? null, body.groupId ?? null]);

    const dek = body.includePasswords ? await orgKey(u.orgId) : null;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SysPass';
    wb.created = new Date();
    const ws = wb.addWorksheet('Accesos', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Cliente', key: 'client', width: 22 },
      { header: 'Grupo', key: 'grp', width: 16 },
      { header: 'Recurso', key: 'resource', width: 28 },
      { header: 'IP / URL / ID', key: 'host', width: 26 },
      { header: 'Rol', key: 'role', width: 16 },
      { header: 'Usuario', key: 'username', width: 28 },
      ...(dek ? [{ header: 'Contraseña', key: 'password', width: 26 }] : []),
      { header: 'Notas', key: 'notes', width: 34 },
      { header: 'Modificado', key: 'updated', width: 18 },
      { header: 'Modificado por', key: 'by', width: 20 },
      { header: 'Contraseña cambiada', key: 'passChanged', width: 20 },
    ];
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF171717' } };
    header.alignment = { vertical: 'middle' };
    header.height = 20;

    let accounts = 0;
    for (const r of rows) {
      let password = '';
      if (dek && r.account_id && r.pass_enc) {
        try { password = unseal(dek, r.pass_enc, r.account_id); } catch { password = '(no se pudo descifrar)'; }
      }
      if (r.account_id) accounts++;
      ws.addRow({
        client: r.client, grp: r.grp, resource: r.resource, host: r.host,
        role: r.role ?? '', username: r.username ?? '', password,
        notes: [r.account_notes, !r.account_id ? r.resource_notes : ''].filter(Boolean).join(' · '),
        updated: r.updated_at ? new Date(r.updated_at) : null,
        by: r.updated_by ?? '',
        passChanged: r.pass_changed_at ? new Date(r.pass_changed_at) : null,
      });
    }
    for (const key of ['updated', 'passChanged']) ws.getColumn(key).numFmt = 'dd/mm/yyyy hh:mm';
    if (dek) ws.getColumn('password').font = { name: 'Consolas' };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

    // Nombre del archivo según lo exportado
    const [names] = await q<{ client: string | null; grp: string | null; org: string }>(
      `select (select name from clients where id = $2) as client, (select name from groups where id = $3) as grp,
              (select name from orgs where id = $1) as org`, [u.orgId, body.clientId ?? null, body.groupId ?? null]);
    const scope = [names.client, names.grp].filter(Boolean).join('-') || 'todo';
    const file = `syspass-${safeName(names.org)}-${safeName(scope)}-${new Date().toISOString().slice(0, 10)}.xlsx`;

    await audit(req, body.includePasswords ? 'export.passwords' : 'export', {
      summary: `${[names.client, names.grp].filter(Boolean).join(' · ') || 'Todo'} · ${accounts} cuenta(s)${body.includePasswords ? ' · CON contraseñas' : ''}`,
    });

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${file}"`)
      .header('x-filename', file);
    return reply.send(buf);
  });
}
