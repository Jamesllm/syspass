/**
 * Crea (o restablece) un administrador de una empresa con contraseña temporal.
 * Uso: npm run admin:create -- <codigo-empresa> <usuario> "<Nombre completo>"
 */
import { hashPassword, tempPassword } from '../src/crypto.js';
import { pool, q } from '../src/db.js';

const [slug, username, name = ''] = process.argv.slice(2);
if (!slug || !username) {
  console.error('Uso: npm run admin:create -- <codigo-empresa> <usuario> "<Nombre completo>"');
  process.exit(1);
}

try {
  const [org] = await q<{ id: string; name: string }>('select id, name from orgs where lower(slug) = lower($1)', [slug]);
  if (!org) {
    console.error(`No existe la empresa "${slug}". Regístrala en /registro o con npm run platform:init`);
    process.exit(1);
  }
  const temp = tempPassword();
  await q(
    `insert into users (org_id, username, name, role, pass_hash, must_change) values ($1, $2, $3, 'admin', $4, true)
     on conflict (org_id, lower(username)) do update set pass_hash = excluded.pass_hash, must_change = true, active = true, role = 'admin'`,
    [org.id, username, name, await hashPassword(temp)],
  );
  console.log(`\nAdministrador listo: ${username} en ${org.name} (${slug})`);
  console.log(`Contraseña temporal: ${temp}`);
  console.log('Se pedirá cambiarla en el primer inicio de sesión.\n');
} finally {
  await pool.end();
}
