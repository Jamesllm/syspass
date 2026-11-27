-- SysPass 1.4.0 · grupos editables, permisos por usuario e historial de cada cuenta

/* ── Grupos (antes "tipo" fijo) ── */
create table groups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  color       text not null default '#8a8a8a',
  legacy_type text,               -- tipo del que salió (lo usa el importador)
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index groups_name_uq on groups (org_id, lower(name));

insert into groups (org_id, name, color, legacy_type, position)
select o.id, d.name, d.color, d.key, d.pos
  from orgs o
 cross join (values
   ('servidor',   'Servidor',       '#4f86c6', 1),
   ('nas',        'NAS',            '#3aa39a', 2),
   ('vpn',        'VPN',            '#c08a2e', 3),
   ('equipos',    'Equipos',        '#8b96a5', 4),
   ('remoto',     'Acceso remoto',  '#d0613f', 5),
   ('hipervisor', 'Hipervisor',     '#6f7fd6', 6),
   ('correo',     'Correo',         '#b6648f', 7),
   ('web',        'Plataforma web', '#3f9c5a', 8),
   ('bd',         'Base de datos',  '#a6723d', 9),
   ('red',        'Red y firewall', '#5f9ea0', 10),
   ('otro',       'Otro',           '#8a8a8a', 11)
 ) as d(key, name, color, pos);

alter table resources add column group_id uuid references groups(id) on delete restrict;
update resources r set group_id = g.id from groups g where g.org_id = r.org_id and g.legacy_type = r.type;
update resources r set group_id = g.id from groups g where r.group_id is null and g.org_id = r.org_id and g.legacy_type = 'otro';
alter table resources alter column group_id set not null;
alter table resources alter column type set default 'otro';
create index resources_group_idx on resources (group_id);

/* ── Permisos por usuario (los admin tienen todos) ── */
alter table users add column permissions text[] not null default '{}';
update users set permissions = case role
  when 'editor' then array['passwords.view', 'passwords.copy', 'resources.create', 'resources.edit', 'resources.delete', 'export']
  when 'lector' then array['passwords.view', 'passwords.copy']
  else '{}'::text[] end;

/* ── Historial de cada cuenta ── */
alter table accounts add column created_by uuid references users(id) on delete set null;
alter table accounts add column updated_by uuid references users(id) on delete set null;

create table account_events (
  id          bigserial primary key,
  org_id      uuid not null references orgs(id) on delete cascade,
  account_id  uuid not null,       -- sin FK: el historial queda aunque se borre la cuenta
  resource_id uuid,
  user_id     uuid references users(id) on delete set null,
  username    text not null default '',
  action      text not null,       -- created · password · username · role · notes · deleted
  detail      text not null default '',
  at          timestamptz not null default now()
);
create index account_events_acc_idx on account_events (account_id, at desc);

-- Las cuentas que ya existían empiezan su historial con su fecha de creación
insert into account_events (org_id, account_id, resource_id, action, detail, at)
select r.org_id, a.id, r.id, 'created', 'Registrada antes del historial', a.created_at
  from accounts a join resources r on r.id = a.resource_id;
