-- SysPass 1.4.2 · color de cada cliente para distinguirlo en el menú y en las tarjetas
alter table clients add column color text
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
