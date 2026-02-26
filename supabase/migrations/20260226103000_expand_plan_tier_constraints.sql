do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%plan_tier%'
  loop
    execute format('alter table profiles drop constraint %I', c.conname);
  end loop;

  for c in
    select conname
    from pg_constraint
    where conrelid = 'usage_counters_monthly'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%plan_tier%'
  loop
    execute format('alter table usage_counters_monthly drop constraint %I', c.conname);
  end loop;
end
$$;

alter table profiles
  add constraint profiles_plan_tier_check
  check (plan_tier in ('free', 'starter', 'pro', 'team'));

alter table usage_counters_monthly
  add constraint usage_counters_monthly_plan_tier_check
  check (plan_tier in ('free', 'starter', 'pro', 'team'));
