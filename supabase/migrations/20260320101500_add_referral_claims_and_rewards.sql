alter table profiles
  add column if not exists referral_trial_ends_at timestamp with time zone,
  add column if not exists referral_bonus_ends_at timestamp with time zone,
  add column if not exists referral_credit_balance_months integer default 0 not null,
  add column if not exists referred_by_token text;

create table if not exists referral_claims (
  id uuid default gen_random_uuid() primary key,
  token text references referral_tokens(token) on delete cascade not null,
  referrer_user_id uuid references profiles(id) on delete cascade not null,
  referred_user_id uuid references profiles(id) on delete cascade not null,
  source text,
  status text default 'processing' not null check (status in ('processing', 'granted', 'failed')),
  referrer_reward_mode text default 'none' not null check (referrer_reward_mode in ('pro_trial', 'pending_credit', 'none')),
  referrer_reward_ends_at timestamp with time zone,
  referred_reward_ends_at timestamp with time zone,
  reward_credit_months integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (referred_user_id)
);

alter table referral_claims enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_claims'
      and policyname = 'Users can view own referral claims'
  ) then
    create policy "Users can view own referral claims"
      on referral_claims
      for select
      using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);
  end if;
end
$$;

create index if not exists idx_referral_claims_referrer_created
  on referral_claims (referrer_user_id, created_at desc);

create index if not exists idx_referral_claims_referred
  on referral_claims (referred_user_id);
