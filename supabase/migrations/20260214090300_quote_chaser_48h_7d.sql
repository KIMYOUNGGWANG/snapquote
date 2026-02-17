alter table estimates
  add column if not exists first_followed_up_at timestamp with time zone,
  add column if not exists second_followed_up_at timestamp with time zone;

create index if not exists idx_estimates_followup_stage1
  on estimates (status, first_followed_up_at, created_at)
  where status = 'sent';

create index if not exists idx_estimates_followup_stage2
  on estimates (status, second_followed_up_at, created_at)
  where status = 'sent';
