-- Persist manual and automated quote follow-up cooldowns.
-- This keeps local follow-up actions, cloud sync, and quote recovery automation aligned.

alter table estimates
  add column if not exists first_followed_up_at timestamp with time zone,
  add column if not exists last_followed_up_at timestamp with time zone;

create index if not exists idx_estimates_followup
  on estimates (status, last_followed_up_at, created_at)
  where status = 'sent';

create index if not exists idx_estimates_quote_recovery_ready
  on estimates (user_id, sent_at)
  where status = 'sent'
    and first_followup_queued_at is null
    and first_followed_up_at is null
    and last_followed_up_at is null;
