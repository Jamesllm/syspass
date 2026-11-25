import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint, newWrappedOrgKey, orgKey, seal, unseal } from '../src/crypto.js';
import { pool, q, tx } from '../src/db.js';

// server/scripts (tsx) o server/dist/scripts (compilado, p. ej. en Docker)
const here = dirname(fileURLToPath(import.meta.url));
const dir = [join(here, '../migrations'), join(here, '../../migrations')].find((d) => existsSync(d));
if (!dir) throw new Error('No se encontró la carpeta migrations');

await q('create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())');
const done = new Set((await q<{ name: string }>('select name from _migrations')).map((r) => r.name));
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

let applied = 0;
for (const f of files) {
  if (done.has(f)) continue;
  const sql = readFileSync(join(dir, f), 'utf8');
  await tx(async (db) => {
    await db.query(sql);
    await db.query('insert into _migrations (name) values ($1)', [f]);
  });
  console.log(`  aplicada ${f}`);
  applied++;
}
console.log(applied ? `Listo: ${applied} migración(es) aplicada(s)` : 'El esquema ya está al día');

// Cada empresa necesita su llave de datos
const noKey = await q<{ id: string; name: string }>('select id, name from orgs where dek_enc is null');
for (const o of noKey) {
  await q('update orgs set dek_enc = $2 where id = $1', [o.id, newWrappedOrgKey(o.id)]);
  console.log(`  llave creada para ${o.name}`);
}

// Recifrar contraseñas v1 (llave única) con la llave de su empresa
const legacy = await q<{ id: string; pass_enc: string; org_id: string }>(
  `select a.id, a.pass_enc, r.org_id from accounts a join resources r on r.id = a.resource_id where a.pass_enc like 'v1.%'`);
if (legacy.length) {
  await tx(async (db) => {
    for (const a of legacy) {
      const plain = unseal(null, a.pass_enc, a.id);
      const dek = await orgKey(a.org_id, db);
      await q('update accounts set pass_enc = $2, pass_fp = $3 where id = $1', [a.id, seal(dek, plain, a.id), fingerprint(a.org_id, plain)], db);
    }
  });
  console.log(`  ${legacy.length} contraseña(s) recifradas con la llave de su empresa`);
}
await pool.end();
