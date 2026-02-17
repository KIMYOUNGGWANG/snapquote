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
