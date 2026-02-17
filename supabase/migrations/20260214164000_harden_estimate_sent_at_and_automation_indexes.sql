-- Harden sent_at semantics and optimize automation candidate indexes.

-- 1) Backfill sent_at for existing sent estimates (best-effort).
update estimates
set sent_at = coalesce(sent_at, updated_at, created_at)
where status = 'sent'
  and sent_at is null;

-- 2) Auto-set sent_at when an estimate enters 'sent' status.
create or replace function public.set_estimate_sent_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'sent' and new.sent_at is null then
    if TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and old.status is distinct from 'sent') then
      new.sent_at = now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_estimate_sent_at on estimates;

create trigger trg_set_estimate_sent_at
before insert or update of status on estimates
for each row
execute function public.set_estimate_sent_at();

-- 3) Replace low-selectivity queue indexes with user-scoped candidate indexes.
drop index if exists idx_estimates_followup_queue_stage1;
drop index if exists idx_estimates_followup_queue_stage2;

create index if not exists idx_estimates_quote_chaser_stage1_candidates
  on estimates (user_id, sent_at)
  where status = 'sent' and first_followup_queued_at is null;

create index if not exists idx_estimates_quote_chaser_stage2_candidates
  on estimates (user_id, sent_at)
  where status = 'sent'
    and first_followed_up_at is not null
    and second_followup_queued_at is null;

create index if not exists idx_estimates_review_request_candidates
  on estimates (user_id, updated_at)
  where status = 'paid' and review_requested_at is null;

