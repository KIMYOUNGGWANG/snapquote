-- Customer quote approval portal.
-- Public customer access is routed through server endpoints using Service Role.

create table if not exists estimate_share_links (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  estimate_id text not null,
  token_hash text not null unique,
  share_url text,
  estimate_snapshot jsonb not null,
  status text check (status in ('shared', 'viewed', 'approved', 'change_requested')) default 'shared' not null,
  viewed_at timestamp with time zone,
  approved_at timestamp with time zone,
  change_requested_at timestamp with time zone,
  customer_name text,
  customer_email text,
  customer_note text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, estimate_id)
);

alter table estimate_share_links enable row level security;

drop policy if exists "Users can view own estimate share links" on estimate_share_links;
drop policy if exists "Users can insert own estimate share links" on estimate_share_links;
drop policy if exists "Users can update own estimate share links" on estimate_share_links;
drop policy if exists "Users can delete own estimate share links" on estimate_share_links;

create policy "Users can view own estimate share links" on estimate_share_links
  for select using (auth.uid() = user_id);

create policy "Users can insert own estimate share links" on estimate_share_links
  for insert with check (auth.uid() = user_id);

create policy "Users can update own estimate share links" on estimate_share_links
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete own estimate share links" on estimate_share_links
  for delete using (auth.uid() = user_id);

create index if not exists idx_estimate_share_links_user_updated
  on estimate_share_links (user_id, updated_at desc);

create index if not exists idx_estimate_share_links_estimate
  on estimate_share_links (estimate_id);

create index if not exists idx_estimate_share_links_status
  on estimate_share_links (status, updated_at desc);
