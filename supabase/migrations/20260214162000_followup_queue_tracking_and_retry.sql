-- Follow-up hardening:
-- 1) separate "queued" timestamps from "sent" timestamps for 48h/7d quote chaser,
-- 2) add basic job retry counters on job_queue (for worker/backoff strategies).

alter table estimates
  add column if not exists first_followup_queued_at timestamp with time zone,
  add column if not exists second_followup_queued_at timestamp with time zone;

create index if not exists idx_estimates_followup_queue_stage1
  on estimates (status, first_followup_queued_at, created_at)
  where status = 'sent';

create index if not exists idx_estimates_followup_queue_stage2
  on estimates (status, second_followup_queued_at, created_at)
  where status = 'sent';

alter table job_queue
  add column if not exists attempt_count int default 0 not null,
  add column if not exists max_attempts int default 3 not null,
  add column if not exists last_attempt_at timestamp with time zone;

