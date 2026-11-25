-- SysPass · multiempresa
create table orgs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  name        text not null,
  logo        text,            -- data URL de imagen (png, jpg, webp o svg), máx. ~200 KB
  accent      text,            -- color de marca #rrggbb
  status      text not null default 'active' check (status in ('active', 'suspended')),
  is_platform boolean not null default false,
  dek_enc     text,            -- llave de datos de la empresa, envuelta con la llave maestra
  created_at  timestamptz not null default now()
);
create unique index orgs_slug_uq on orgs (lower(slug));

-- Si ya había datos (instalación de una sola empresa), pasan a la empresa DRAGO
insert into orgs (slug, name) select 'drago', 'DRAGO' where exists (select 1 from users);

alter table users add column org_id uuid references orgs(id) on delete cascade;
update users set org_id = (select id from orgs where slug = 'drago');
alter table users alter column org_id set not null;
drop index users_username_uq;
create unique index users_username_uq on users (org_id, lower(username));

alter table clients add column org_id uuid references orgs(id) on delete cascade;
update clients set org_id = (select id from orgs where slug = 'drago');
alter table clients alter column org_id set not null;
drop index clients_name_uq;
create unique index clients_name_uq on clients (org_id, lower(name));

alter table resources add column org_id uuid references orgs(id) on delete cascade;
update resources set org_id = (select id from orgs where slug = 'drago');
alter table resources alter column org_id set not null;
create index resources_org_idx on resources (org_id);

alter table audit add column org_id uuid references orgs(id) on delete cascade;
update audit set org_id = (select id from orgs where slug = 'drago');
create index audit_org_idx on audit (org_id, id desc);
