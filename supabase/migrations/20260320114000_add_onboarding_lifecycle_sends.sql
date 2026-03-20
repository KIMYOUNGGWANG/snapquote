create table if not exists onboarding_lifecycle_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  stage text not null check (stage in ('day_0', 'day_3', 'day_7')),
  email text not null,
  subject text not null,
  message_preview text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  sent_at timestamp with time zone
);

create unique index if not exists onboarding_lifecycle_sends_user_stage_key
  on onboarding_lifecycle_sends (user_id, stage);

create index if not exists onboarding_lifecycle_sends_stage_created_idx
  on onboarding_lifecycle_sends (stage, created_at desc);

alter table onboarding_lifecycle_sends enable row level security;

create policy "Users can view own onboarding lifecycle sends"
  on onboarding_lifecycle_sends
  for select
  using (auth.uid() = user_id);
