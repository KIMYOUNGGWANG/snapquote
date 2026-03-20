create table if not exists quickbooks_connections (
  user_id uuid primary key references profiles(id) on delete cascade,
  realm_id text not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamp with time zone not null,
  refresh_token_expires_at timestamp with time zone,
  connected_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create table if not exists quickbooks_invoice_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  estimate_id text not null,
  estimate_number text not null,
  quickbooks_invoice_id text not null,
  quickbooks_customer_id text,
  quickbooks_invoice_doc_number text,
  quickbooks_invoice_status text not null default 'unknown' check (quickbooks_invoice_status in ('open', 'paid', 'unknown')),
  payload_snapshot jsonb not null default '{}'::jsonb,
  synced_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (user_id, estimate_id)
);

create index if not exists quickbooks_invoice_links_user_synced_idx
  on quickbooks_invoice_links (user_id, synced_at desc);

create index if not exists quickbooks_invoice_links_invoice_idx
  on quickbooks_invoice_links (quickbooks_invoice_id);

alter table quickbooks_connections enable row level security;
alter table quickbooks_invoice_links enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'quickbooks_connections'
      and policyname = 'Users can view own quickbooks connection'
  ) then
    create policy "Users can view own quickbooks connection"
      on quickbooks_connections
      for select
      using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'quickbooks_invoice_links'
      and policyname = 'Users can view own quickbooks invoice links'
  ) then
    create policy "Users can view own quickbooks invoice links"
      on quickbooks_invoice_links
      for select
      using (auth.uid() = user_id);
  end if;
end
$$;
