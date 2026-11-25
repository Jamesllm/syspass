/**
 * Crea la empresa dueña de la plataforma (código "syspass") y su administrador.
 * Sus administradores ven el panel de Empresas para revisar y suspender cuentas.
 * Uso: npm run platform:init -- <usuario> "<Nombre completo>"
 */
import { hashPassword, tempPassword } from '../src/crypto.js';
import { pool, q, tx } from '../src/db.js';
import { createOrg } from '../src/orgs.js';

const [username, name = ''] = process.argv.slice(2);
if (!username) {
  console.error('Uso: npm run platform:init -- <usuario> "<Nombre completo>"');
  process.exit(1);
}

try {
  const temp = tempPassword();
  const hash = await hashPassword(temp);
  await tx(async (db) => {
    let [org] = await q<{ id: string }>("select id from orgs where lower(slug) = 'syspass'", [], db);
    if (!org) org = { id: await createOrg(db, { slug: 'syspass', name: 'SysPass', isPlatform: true }) };
    await q('update orgs set is_platform = true where id = $1', [org.id], db);
    await q(
      `insert into users (org_id, username, name, role, pass_hash, must_change) values ($1, $2, $3, 'admin', $4, true)
       on conflict (org_id, lower(username)) do update set pass_hash = excluded.pass_hash, must_change = true, active = true, role = 'admin'`,
      [org.id, username, name, hash], db,
    );
  });
  console.log(`\nPlataforma lista. Entra con empresa "syspass" y usuario ${username}`);
  console.log(`Contraseña temporal: ${temp}\n`);
} finally {
  await pool.end();
}
