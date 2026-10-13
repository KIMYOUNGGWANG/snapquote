alter table estimates
  add column if not exists payment_link text,
  add column if not exists payment_link_id text,
  add column if not exists payment_link_type text,
  add column if not exists payment_completed_at timestamp with time zone,
  add column if not exists last_payment_session_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimates_payment_link_type_check'
  ) then
    alter table estimates
      add constraint estimates_payment_link_type_check
      check (payment_link_type is null or payment_link_type in ('full', 'deposit', 'custom'));
  end if;
end $$;

create index if not exists idx_estimates_payment_link_id
  on estimates (user_id, payment_link_id)
  where payment_link_id is not null;

create index if not exists idx_estimates_payment_completed
  on estimates (user_id, payment_completed_at desc)
  where payment_completed_at is not null;
