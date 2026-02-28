-- TB-12: CRDT sync journal table
create table if not exists sync_change_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  client_id text not null,
  table_name text not null,
  record_id text not null,
  logical_ts bigint not null,
  payload jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint sync_change_log_client_id_len_check check (char_length(client_id) <= 64),
  constraint sync_change_log_table_name_len_check check (char_length(table_name) <= 64),
  constraint sync_change_log_record_id_len_check check (char_length(record_id) <= 128),
  constraint sync_change_log_logical_ts_check check (logical_ts >= 0),
  constraint sync_change_log_payload_size_check check (pg_column_size(payload) <= 20000)
);

create unique index if not exists idx_sync_change_log_unique_event
  on sync_change_log (user_id, client_id, table_name, record_id, logical_ts);

create index if not exists idx_sync_change_log_lookup
  on sync_change_log (user_id, table_name, record_id, logical_ts desc);

alter table sync_change_log enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sync_change_log'
      and policyname = 'Users can view own sync change log'
  ) then
    create policy "Users can view own sync change log"
      on sync_change_log
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sync_change_log'
      and policyname = 'Users can insert own sync change log'
  ) then
    create policy "Users can insert own sync change log"
      on sync_change_log
      for insert
      with check (auth.uid() = user_id);
  end if;
end
$$;

-- TB-18: feedback metadata support for richer in-app reports
alter table feedback
  add column if not exists metadata jsonb default '{}'::jsonb not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'feedback_metadata_size_check'
      and conrelid = 'feedback'::regclass
  ) then
    alter table feedback
      add constraint feedback_metadata_size_check
      check (pg_column_size(metadata) <= 8192);
  end if;
end
$$;
