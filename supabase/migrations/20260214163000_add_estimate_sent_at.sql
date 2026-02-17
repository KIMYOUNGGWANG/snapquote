-- Track when an estimate was actually sent (used by automations like Quote Chaser).

alter table estimates
  add column if not exists sent_at timestamp with time zone;

create index if not exists idx_estimates_sent_at
  on estimates (status, sent_at, created_at)
  where status = 'sent';

