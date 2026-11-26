/**
 * Crea una empresa (si no existe) y su administrador con contraseña temporal.
 * Lo usa el instalador en modo "una sola empresa".
 * Uso: node dist/scripts/org-init.js <codigo> "<Nombre de la empresa>" <usuario> "<Nombre completo>"
 */
import { hashPassword, tempPassword } from '../src/crypto.js';
import { pool, q, tx } from '../src/db.js';
import { Slug, createOrg, isReserved } from '../src/orgs.js';

const [rawSlug, orgName, username, name = ''] = process.argv.slice(2);
if (!rawSlug || !orgName || !username) {
  console.error('Uso: org-init <codigo> "<Nombre de la empresa>" <usuario> "<Nombre completo>"');
  process.exit(1);
}

const parsed = Slug.safeParse(rawSlug);
if (!parsed.success) {
  console.error(`Código de empresa inválido: ${parsed.error.issues[0]?.message}`);
  process.exit(1);
}
const slug = isReserved(parsed.data) ? `${parsed.data}-empresa` : parsed.data;

try {
  const temp = tempPassword();
  const hash = await hashPassword(temp);
  await tx(async (db) => {
    let [org] = await q<{ id: string }>('select id from orgs where lower(slug) = $1', [slug], db);
    if (!org) org = { id: await createOrg(db, { slug, name: orgName }) };
    await q(
      `insert into users (org_id, username, name, role, pass_hash, must_change) values ($1, $2, $3, 'admin', $4, true)
       on conflict (org_id, lower(username)) do update set pass_hash = excluded.pass_hash, must_change = true, active = true, role = 'admin'`,
      [org.id, username, name, hash], db,
    );
  });
  console.log(`\nEmpresa lista: ${orgName} (código ${slug})`);
  console.log(`Código: ${slug}`);
  console.log(`Administrador: ${username}`);
  console.log(`Contraseña temporal: ${temp}\n`);
} finally {
  await pool.end();
}
