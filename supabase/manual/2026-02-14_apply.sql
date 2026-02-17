-- Manual apply bundle (2026-02-14)
-- Use this in Supabase Dashboard -> SQL Editor if you are not using Supabase CLI.
-- Safe to re-run: migrations are written to be mostly idempotent (IF NOT EXISTS / ON CONFLICT).

-- ------------------------------------------------------------------
-- SOURCE: supabase/migrations/20260214090000_enable_uuid_extension.sql
-- ------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------
-- SOURCE: supabase/migrations/20260214090100_add_analytics_events.sql
-- ------------------------------------------------------------------
create table if not exists analytics_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  event_name text not null,
  estimate_id uuid references estimates(id) on delete set null,
  estimate_number text,
  channel text,
  external_id text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table analytics_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'analytics_events'
      and policyname = 'Users can view own analytics events'
  ) then
    create policy "Users can view own analytics events"
      on analytics_events
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'analytics_events'
      and policyname = 'Users can insert own analytics events'
  ) then
    create policy "Users can insert own analytics events"
      on analytics_events
      for insert
      with check (auth.uid() = user_id);
  end if;
end
$$;

create index if not exists idx_analytics_events_user_created
  on analytics_events (user_id, created_at desc);

create index if not exists idx_analytics_events_user_event_created
  on analytics_events (user_id, event_name, created_at desc);

create index if not exists idx_analytics_events_estimate_created
  on analytics_events (estimate_id, created_at desc)
  where estimate_id is not null;

create unique index if not exists idx_analytics_events_external_id_unique
  on analytics_events (external_id)
  where external_id is not null;

-- ------------------------------------------------------------------
-- SOURCE: supabase/migrations/20260214090200_add_ops_alerts.sql
-- ------------------------------------------------------------------
create table if not exists ops_alerts (
  id uuid default gen_random_uuid() primary key,
  source text not null,
  severity text check (severity in ('info', 'warning', 'error')) default 'error',
  alert_key text not null,
  message text not null,
  context jsonb default '{}'::jsonb not null,
  occurrences int default 1 not null,
  first_seen_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_seen_at timestamp with time zone default timezone('utc'::text, now()) not null,
  resolved_at timestamp with time zone
);

alter table ops_alerts enable row level security;

create index if not exists idx_ops_alerts_unresolved_last_seen
  on ops_alerts (last_seen_at desc)
  where resolved_at is null;

create index if not exists idx_ops_alerts_source_last_seen
  on ops_alerts (source, last_seen_at desc);

create unique index if not exists idx_ops_alerts_alert_key_unresolved
  on ops_alerts (alert_key)
  where resolved_at is null;

-- ------------------------------------------------------------------
-- SOURCE: supabase/migrations/20260214090300_quote_chaser_48h_7d.sql
-- ------------------------------------------------------------------
alter table estimates
  add column if not exists first_followed_up_at timestamp with time zone,
  add column if not exists second_followed_up_at timestamp with time zone;

create index if not exists idx_estimates_followup_stage1
  on estimates (status, first_followed_up_at, created_at)
  where status = 'sent';

create index if not exists idx_estimates_followup_stage2
  on estimates (status, second_followed_up_at, created_at)
  where status = 'sent';

-- ------------------------------------------------------------------
-- SOURCE: supabase/migrations/20260214090400_add_referrals_and_usage.sql
-- ------------------------------------------------------------------
alter table profiles
  add column if not exists plan_tier text check (plan_tier in ('free', 'pro')) default 'free';

create table if not exists referral_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  token text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id),
  unique(token)
);

create table if not exists referral_events (
  id uuid default gen_random_uuid() primary key,
  token text references referral_tokens(token) on delete cascade not null,
  event_name text not null,
  source text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists usage_counters_monthly (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  period_start date not null,
  plan_tier text check (plan_tier in ('free', 'pro')) default 'free' not null,
  generate_count int default 0 not null,
  transcribe_count int default 0 not null,
  send_email_count int default 0 not null,
  openai_prompt_tokens bigint default 0 not null,
  openai_completion_tokens bigint default 0 not null,
  openai_estimated_cost double precision default 0 not null,
  resend_estimated_cost double precision default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, period_start)
);

alter table referral_tokens enable row level security;
alter table referral_events enable row level security;
alter table usage_counters_monthly enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can insert own profile'
  ) then
    create policy "Users can insert own profile"
      on profiles
      for insert
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_tokens'
      and policyname = 'Users can view own referral tokens'
  ) then
    create policy "Users can view own referral tokens"
      on referral_tokens
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_tokens'
      and policyname = 'Users can insert own referral tokens'
  ) then
    create policy "Users can insert own referral tokens"
      on referral_tokens
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_tokens'
      and policyname = 'Users can update own referral tokens'
  ) then
    create policy "Users can update own referral tokens"
      on referral_tokens
      for update
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_events'
      and policyname = 'Anyone can insert referral events'
  ) then
    create policy "Anyone can insert referral events"
      on referral_events
      for insert
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_events'
      and policyname = 'Users can view own referral events'
  ) then
    create policy "Users can view own referral events"
      on referral_events
      for select
      using (
        exists (
          select 1
          from referral_tokens
          where referral_tokens.token = referral_events.token
            and referral_tokens.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'usage_counters_monthly'
      and policyname = 'Users can view own usage counters'
  ) then
    create policy "Users can view own usage counters"
      on usage_counters_monthly
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'usage_counters_monthly'
      and policyname = 'Users can insert own usage counters'
  ) then
    create policy "Users can insert own usage counters"
      on usage_counters_monthly
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'usage_counters_monthly'
      and policyname = 'Users can update own usage counters'
  ) then
    create policy "Users can update own usage counters"
      on usage_counters_monthly
      for update
      using (auth.uid() = user_id);
  end if;
end
$$;

create index if not exists idx_referral_tokens_user
  on referral_tokens (user_id);

create index if not exists idx_referral_events_token_created
  on referral_events (token, created_at desc);

create index if not exists idx_usage_monthly_user_period
  on usage_counters_monthly (user_id, period_start desc);

create index if not exists idx_usage_monthly_user_updated
  on usage_counters_monthly (user_id, updated_at desc);

-- ------------------------------------------------------------------
-- SOURCE: supabase/migrations/20260214113000_harden_referral_events_policy.sql
-- ------------------------------------------------------------------
-- Harden referral_events insert surface while preserving anonymous tracking.
-- Supabase RLS best-practice: restrict "public insert" policies with tight WITH CHECK predicates.

alter table referral_events
  add constraint referral_events_event_name_check
  check (event_name in ('landing_visit', 'quote_share_click', 'signup_start')) not valid;

alter table referral_events
  add constraint referral_events_token_format_check
  check (token ~ '^[a-z0-9]{8,32}$') not valid;

alter table referral_events
  add constraint referral_events_source_length_check
  check (source is null or char_length(source) <= 40) not valid;

alter table referral_events
  add constraint referral_events_metadata_size_check
  check (pg_column_size(metadata) <= 4096) not valid;

drop policy if exists "Anyone can insert referral events" on referral_events;

create policy "Anyone can insert referral events"
  on referral_events
  for insert
  with check (
    token ~ '^[a-z0-9]{8,32}$'
    and event_name in ('landing_visit', 'quote_share_click', 'signup_start')
    and (source is null or char_length(source) <= 40)
    and pg_column_size(metadata) <= 4096
  );

-- ------------------------------------------------------------------
-- SOURCE: supabase/migrations/20260214160000_add_estimate_sections_and_attachments.sql
-- ------------------------------------------------------------------
-- Normalize estimate sections and attachments to close offline/local-only gaps.
-- Notes:
-- - We keep legacy `estimate_items` as-is for backward compatibility.
-- - `local_id` stores client-side ids like `section-xxxxxxxx` / `item-xxxxxxxx`.

create table if not exists estimate_sections (
  id uuid default gen_random_uuid() primary key,
  estimate_id uuid references estimates(id) on delete cascade not null,
  local_id text not null,
  division_code text,
  name text not null,
  sort_order int default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(estimate_id, local_id),
  constraint estimate_sections_local_id_len_check check (char_length(local_id) <= 64),
  constraint estimate_sections_division_code_len_check check (division_code is null or char_length(division_code) <= 16),
  constraint estimate_sections_name_len_check check (char_length(name) <= 120)
);

create table if not exists estimate_section_items (
  id uuid default gen_random_uuid() primary key,
  estimate_id uuid references estimates(id) on delete cascade not null,
  section_id uuid references estimate_sections(id) on delete cascade not null,
  local_id text not null,
  item_number int default 0 not null,
  category text,
  unit text,
  description text,
  quantity int,
  unit_price float,
  total float,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(section_id, local_id),
  constraint estimate_section_items_local_id_len_check check (char_length(local_id) <= 64),
  constraint estimate_section_items_category_check check (category is null or category in ('PARTS', 'LABOR', 'SERVICE', 'OTHER')),
  constraint estimate_section_items_unit_len_check check (unit is null or char_length(unit) <= 16),
  constraint estimate_section_items_description_len_check check (description is null or char_length(description) <= 500),
  constraint estimate_section_items_quantity_check check (quantity is null or quantity >= 0),
  constraint estimate_section_items_unit_price_check check (unit_price is null or unit_price >= 0),
  constraint estimate_section_items_total_check check (total is null or total >= 0)
);

create table if not exists estimate_attachments (
  id uuid default gen_random_uuid() primary key,
  estimate_id uuid references estimates(id) on delete cascade not null,
  photos jsonb default '[]'::jsonb not null,
  audio_url text,
  original_transcript text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(estimate_id),
  constraint estimate_attachments_photos_is_array_check check (jsonb_typeof(photos) = 'array'),
  constraint estimate_attachments_photos_count_check check (jsonb_array_length(photos) <= 5),
  constraint estimate_attachments_photos_size_check check (pg_column_size(photos) <= 5242880),
  constraint estimate_attachments_transcript_len_check check (original_transcript is null or char_length(original_transcript) <= 20000)
);

alter table estimate_sections enable row level security;
alter table estimate_section_items enable row level security;
alter table estimate_attachments enable row level security;

do $$
begin
  -- estimate_sections policies
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_sections'
      and policyname = 'Users can view own estimate sections'
  ) then
    create policy "Users can view own estimate sections"
      on estimate_sections
      for select
      using (
        exists (
          select 1
          from estimates
          where id = estimate_sections.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_sections'
      and policyname = 'Users can insert own estimate sections'
  ) then
    create policy "Users can insert own estimate sections"
      on estimate_sections
      for insert
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_sections.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_sections'
      and policyname = 'Users can update own estimate sections'
  ) then
    create policy "Users can update own estimate sections"
      on estimate_sections
      for update
      using (
        exists (
          select 1
          from estimates
          where id = estimate_sections.estimate_id
            and user_id = (select auth.uid())
        )
      )
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_sections.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_sections'
      and policyname = 'Users can delete own estimate sections'
  ) then
    create policy "Users can delete own estimate sections"
      on estimate_sections
      for delete
      using (
        exists (
          select 1
          from estimates
          where id = estimate_sections.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  -- estimate_section_items policies
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_section_items'
      and policyname = 'Users can view own estimate section items'
  ) then
    create policy "Users can view own estimate section items"
      on estimate_section_items
      for select
      using (
        exists (
          select 1
          from estimates
          where id = estimate_section_items.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_section_items'
      and policyname = 'Users can insert own estimate section items'
  ) then
    create policy "Users can insert own estimate section items"
      on estimate_section_items
      for insert
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_section_items.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_section_items'
      and policyname = 'Users can update own estimate section items'
  ) then
    create policy "Users can update own estimate section items"
      on estimate_section_items
      for update
      using (
        exists (
          select 1
          from estimates
          where id = estimate_section_items.estimate_id
            and user_id = (select auth.uid())
        )
      )
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_section_items.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_section_items'
      and policyname = 'Users can delete own estimate section items'
  ) then
    create policy "Users can delete own estimate section items"
      on estimate_section_items
      for delete
      using (
        exists (
          select 1
          from estimates
          where id = estimate_section_items.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  -- estimate_attachments policies
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_attachments'
      and policyname = 'Users can view own estimate attachments'
  ) then
    create policy "Users can view own estimate attachments"
      on estimate_attachments
      for select
      using (
        exists (
          select 1
          from estimates
          where id = estimate_attachments.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_attachments'
      and policyname = 'Users can insert own estimate attachments'
  ) then
    create policy "Users can insert own estimate attachments"
      on estimate_attachments
      for insert
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_attachments.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_attachments'
      and policyname = 'Users can update own estimate attachments'
  ) then
    create policy "Users can update own estimate attachments"
      on estimate_attachments
      for update
      using (
        exists (
          select 1
          from estimates
          where id = estimate_attachments.estimate_id
            and user_id = (select auth.uid())
        )
      )
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_attachments.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_attachments'
      and policyname = 'Users can delete own estimate attachments'
  ) then
    create policy "Users can delete own estimate attachments"
      on estimate_attachments
      for delete
      using (
        exists (
          select 1
          from estimates
          where id = estimate_attachments.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;
end
$$;

-- Indexes for FK columns and common query patterns
create index if not exists idx_estimate_sections_estimate
  on estimate_sections (estimate_id, sort_order);

create index if not exists idx_estimate_section_items_section
  on estimate_section_items (section_id);

create index if not exists idx_estimate_section_items_estimate
  on estimate_section_items (estimate_id);

create index if not exists idx_estimate_attachments_estimate
  on estimate_attachments (estimate_id);

-- ------------------------------------------------------------------
-- SOURCE: supabase/migrations/20260214161000_add_pricing_experiments.sql
-- ------------------------------------------------------------------
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
  experiment_id uuid,
  variant text,
  created boolean
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
    experiment_id := v_experiment_id;
    variant := v_existing_variant;
    created := false;
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

  experiment_id := v_experiment_id;
  variant := v_variant;
  created := true;
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


-- ------------------------------------------------------------------
-- SOURCE: supabase/migrations/20260214162000_followup_queue_tracking_and_retry.sql
-- ------------------------------------------------------------------
-- Follow-up hardening:
-- 1) separate "queued" timestamps from "sent" timestamps for 48h/7d quote chaser,
-- 2) add basic job retry counters on job_queue (for worker/backoff strategies).

alter table estimates
  add column if not exists first_followup_queued_at timestamp with time zone,
  add column if not exists second_followup_queued_at timestamp with time zone;

create index if not exists idx_estimates_followup_queue_stage1
  on estimates (status, first_followup_queued_at, created_at)
  where status = 'sent';

create index if not exists idx_estimates_followup_queue_stage2
  on estimates (status, second_followup_queued_at, created_at)
  where status = 'sent';

alter table job_queue
  add column if not exists attempt_count int default 0 not null,
  add column if not exists max_attempts int default 3 not null,
  add column if not exists last_attempt_at timestamp with time zone;


-- ------------------------------------------------------------------
-- SOURCE: supabase/migrations/20260214163000_add_estimate_sent_at.sql
-- ------------------------------------------------------------------
-- Track when an estimate was actually sent (used by automations like Quote Chaser).

alter table estimates
  add column if not exists sent_at timestamp with time zone;

create index if not exists idx_estimates_sent_at
  on estimates (status, sent_at, created_at)
  where status = 'sent';


-- ------------------------------------------------------------------
-- SOURCE: supabase/migrations/20260214164000_harden_estimate_sent_at_and_automation_indexes.sql
-- ------------------------------------------------------------------
-- Harden sent_at semantics and optimize automation candidate indexes.

-- 1) Backfill sent_at for existing sent estimates (best-effort).
update estimates
set sent_at = coalesce(sent_at, updated_at, created_at)
where status = 'sent'
  and sent_at is null;

-- 2) Auto-set sent_at when an estimate enters 'sent' status.
create or replace function public.set_estimate_sent_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'sent' and new.sent_at is null then
    if TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and old.status is distinct from 'sent') then
      new.sent_at = now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_estimate_sent_at on estimates;

create trigger trg_set_estimate_sent_at
before insert or update of status on estimates
for each row
execute function public.set_estimate_sent_at();

-- 3) Replace low-selectivity queue indexes with user-scoped candidate indexes.
drop index if exists idx_estimates_followup_queue_stage1;
drop index if exists idx_estimates_followup_queue_stage2;

create index if not exists idx_estimates_quote_chaser_stage1_candidates
  on estimates (user_id, sent_at)
  where status = 'sent' and first_followup_queued_at is null;

create index if not exists idx_estimates_quote_chaser_stage2_candidates
  on estimates (user_id, sent_at)
  where status = 'sent'
    and first_followed_up_at is not null
    and second_followup_queued_at is null;

create index if not exists idx_estimates_review_request_candidates
  on estimates (user_id, updated_at)
  where status = 'paid' and review_requested_at is null;


