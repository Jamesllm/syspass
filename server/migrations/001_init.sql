-- DRAGO Vault · esquema inicial
create table users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null,
  name          text not null default '',
  pass_hash     text not null,
  role          text not null check (role in ('admin', 'editor', 'lector')),
  active        boolean not null default true,
  must_change   boolean not null default true,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index users_username_uq on users (lower(username));

create table clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_name_uq on clients (lower(name));

create table user_clients (
  user_id   uuid not null references users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  primary key (user_id, client_id)
);

create table resources (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  type       text not null,
  name       text not null,
  host       text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);
create index resources_client_idx on resources (client_id);

create table accounts (
  id              uuid primary key,
  resource_id     uuid not null references resources(id) on delete cascade,
  position        integer not null default 0,
  role            text not null default '',
  username        text not null default '',
  pass_enc        text,
  pass_fp         text,
  strength        smallint not null default 0,
  notes           text not null default '',
  pass_changed_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index accounts_resource_idx on accounts (resource_id);
create index accounts_fp_idx on accounts (pass_fp);

create table sessions (
  id         text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  expires_at timestamptz not null,
  ip         text not null default '',
  user_agent text not null default ''
);
create index sessions_user_idx on sessions (user_id);

create table audit (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  user_id     uuid references users(id) on delete set null,
  username    text not null default '',
  action      text not null,
  target_type text not null default '',
  target_id   uuid,
  summary     text not null default '',
  ip          text not null default ''
);
create index audit_at_idx on audit (at desc);
