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
