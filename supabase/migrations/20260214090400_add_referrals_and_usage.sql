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
