-- Pricing experiments and conversion tracking (Stripe-excluded).

create table if not exists pricing_experiments (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  is_active boolean default false not null,
  config jsonb default '{}'::jsonb not null,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(name),
  constraint pricing_experiments_name_len_check check (char_length(name) <= 80),
  constraint pricing_experiments_config_size_check check (pg_column_size(config) <= 16384)
);

create table if not exists pricing_assignments (
  id uuid default gen_random_uuid() primary key,
  experiment_id uuid references pricing_experiments(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  variant text not null,
  assigned_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(experiment_id, user_id),
  constraint pricing_assignments_variant_len_check check (char_length(variant) <= 40)
);

create table if not exists pricing_conversions (
  id uuid default gen_random_uuid() primary key,
  experiment_id uuid references pricing_experiments(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  variant text not null,
  event_name text not null,
  external_id text,
  metadata jsonb default '{}'::jsonb not null,
  occurred_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint pricing_conversions_variant_len_check check (char_length(variant) <= 40),
  constraint pricing_conversions_event_name_len_check check (char_length(event_name) <= 60),
  constraint pricing_conversions_metadata_size_check check (pg_column_size(metadata) <= 8192)
);

create unique index if not exists idx_pricing_conversions_external_id_unique
  on pricing_conversions (external_id)
  where external_id is not null;

alter table pricing_experiments enable row level security;
alter table pricing_assignments enable row level security;
alter table pricing_conversions enable row level security;

-- RLS policies
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pricing_experiments'
      and policyname = 'Authenticated can view active pricing experiments'
  ) then
    create policy "Authenticated can view active pricing experiments"
      on pricing_experiments
      for select
      to authenticated
      using (is_active = true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pricing_assignments'
      and policyname = 'Users can view own pricing assignments'
  ) then
    create policy "Users can view own pricing assignments"
      on pricing_assignments
      for select
      to authenticated
      using (user_id = (select auth.uid()));
  end if;

  -- No direct insert/update/delete for pricing_assignments. Use security definer function.

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pricing_conversions'
      and policyname = 'Users can view own pricing conversions'
  ) then
    create policy "Users can view own pricing conversions"
      on pricing_conversions
      for select
      to authenticated
      using (user_id = (select auth.uid()));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pricing_conversions'
      and policyname = 'Users can insert own pricing conversions'
  ) then
    create policy "Users can insert own pricing conversions"
      on pricing_conversions
      for insert
      to authenticated
      with check (user_id = (select auth.uid()));
  end if;
end
$$;

-- Deterministic assignment helper (prevents clients from selecting their own variants).
create or replace function public.get_or_create_pricing_assignment(experiment_name text)
returns table (
  out_experiment_id uuid,
  out_variant text,
  out_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_experiment_id uuid;
  v_config jsonb;
  v_variants jsonb;
  v_variant text;
  v_existing_variant text;
  v_hash_int int;
  v_count int;
  v_index int;
  v_elem jsonb;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select id, config
    into v_experiment_id, v_config
  from public.pricing_experiments
  where name = experiment_name
    and is_active = true
    and (started_at is null or started_at <= now())
    and (ended_at is null or ended_at > now())
  limit 1;

  if v_experiment_id is null then
    return;
  end if;

  select pa.variant
    into v_existing_variant
  from public.pricing_assignments pa
  where pa.experiment_id = v_experiment_id
    and pa.user_id = v_user_id
  limit 1;

  if v_existing_variant is not null then
    out_experiment_id := v_experiment_id;
    out_variant := v_existing_variant;
    out_created := false;
    return next;
    return;
  end if;

  v_variants := coalesce(v_config->'variants', '[]'::jsonb);
  v_count := case
    when jsonb_typeof(v_variants) = 'array' then jsonb_array_length(v_variants)
    else 0
  end;

  if v_count <= 0 then
    v_variant := 'control';
  else
    v_hash_int := (('x' || substr(md5(v_user_id::text || ':' || v_experiment_id::text), 1, 8))::bit(32)::int);
    if v_hash_int < 0 then
      v_hash_int := v_hash_int * -1;
    end if;

    v_index := v_hash_int % v_count;
    v_elem := v_variants->v_index;

    if jsonb_typeof(v_elem) = 'object' then
      v_variant := coalesce(v_elem->>'name', v_elem->>'variant', 'control');
    elsif jsonb_typeof(v_elem) = 'string' then
      v_variant := trim(both '\"' from v_elem::text);
    else
      v_variant := 'control';
    end if;
  end if;

  insert into public.pricing_assignments (experiment_id, user_id, variant)
  values (v_experiment_id, v_user_id, v_variant)
  on conflict (experiment_id, user_id) do nothing;

  out_experiment_id := v_experiment_id;
  out_variant := v_variant;
  out_created := true;
  return next;
end;
$$;

grant execute on function public.get_or_create_pricing_assignment(text) to authenticated;

-- Indexes (FK columns are not automatically indexed)
create index if not exists idx_pricing_assignments_experiment
  on pricing_assignments (experiment_id);

create index if not exists idx_pricing_assignments_user
  on pricing_assignments (user_id);

create index if not exists idx_pricing_conversions_experiment_time
  on pricing_conversions (experiment_id, occurred_at desc);

create index if not exists idx_pricing_conversions_user_time
  on pricing_conversions (user_id, occurred_at desc);

-- Seed a default experiment (safe to rerun).
insert into pricing_experiments (name, is_active, config)
values (
  'pricing_v1',
  true,
  jsonb_build_object(
    'currency', 'USD',
    'variants', jsonb_build_array(
      jsonb_build_object('name', 'low', 'priceMonthly', 19, 'ctaLabel', 'Join Pro waitlist'),
      jsonb_build_object('name', 'high', 'priceMonthly', 29, 'ctaLabel', 'Join Pro waitlist')
    )
  )
)
on conflict (name) do update
  set is_active = excluded.is_active,
      config = excluded.config,
      updated_at = timezone('utc'::text, now());

