alter table estimate_items
  add column if not exists local_id text,
  add column if not exists item_number int default 0 not null,
  add column if not exists category text,
  add column if not exists unit text,
  add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now()) not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimate_items_local_id_len_check'
  ) then
    alter table estimate_items
      add constraint estimate_items_local_id_len_check check (local_id is null or char_length(local_id) <= 64);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimate_items_category_check'
  ) then
    alter table estimate_items
      add constraint estimate_items_category_check check (category is null or category in ('PARTS', 'LABOR', 'SERVICE', 'OTHER'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimate_items_unit_len_check'
  ) then
    alter table estimate_items
      add constraint estimate_items_unit_len_check check (unit is null or char_length(unit) <= 16);
  end if;
end $$;
