-- sms_messages / sms_credit_ledger were created by hand in the dashboard and never
-- captured in a migration. Columns reconstructed from app/api/send-sms and
-- lib/server/quote-recovery-store.ts. Writes go through security definer
-- functions or the service role, so users only get read access to their own rows.

create table if not exists public.sms_messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  estimate_id text,
  to_phone_e164 text not null,
  provider_id text,
  status text default 'pending' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.sms_credit_ledger (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  delta_credits int not null,
  reason text not null,
  ref_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.sms_messages enable row level security;
alter table public.sms_credit_ledger enable row level security;

drop policy if exists "Users can view own sms messages" on public.sms_messages;
create policy "Users can view own sms messages" on public.sms_messages
  for select using (auth.uid() = user_id);

drop policy if exists "Users can view own sms credits" on public.sms_credit_ledger;
create policy "Users can view own sms credits" on public.sms_credit_ledger
  for select using (auth.uid() = user_id);
