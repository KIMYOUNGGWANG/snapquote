alter table profiles
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false,
  add column if not exists stripe_onboarded_at timestamp with time zone;

create unique index if not exists idx_profiles_stripe_account_id_unique
  on profiles (stripe_account_id)
  where stripe_account_id is not null;
