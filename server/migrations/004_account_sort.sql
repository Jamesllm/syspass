-- SysPass 1.4.1 · orden de las cuentas de cada recurso (se guarda en el servidor, igual para todos)
alter table resources add column account_sort text not null default 'manual'
  check (account_sort in ('manual', 'name', 'name_desc', 'user', 'recent'));
