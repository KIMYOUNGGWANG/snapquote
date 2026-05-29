alter table clients
  add column if not exists phone text,
  add column if not exists notes text;
