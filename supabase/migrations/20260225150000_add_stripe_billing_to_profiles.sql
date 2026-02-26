alter table profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_subscription_status text,
  add column if not exists stripe_subscription_price_id text,
  add column if not exists stripe_subscription_current_period_end timestamp with time zone,
  add column if not exists stripe_cancel_at_period_end boolean not null default false,
  add column if not exists stripe_subscription_updated_at timestamp with time zone;

create unique index if not exists idx_profiles_stripe_customer_id_unique
  on profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists idx_profiles_stripe_subscription_id_unique
  on profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;
