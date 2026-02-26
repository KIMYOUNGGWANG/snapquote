-- Fix Missing Foreign Key Indexes
create index if not exists idx_estimate_items_estimate on estimate_items (estimate_id);
create index if not exists idx_automations_user on automations (user_id);
create index if not exists idx_job_queue_user on job_queue (user_id);
create index if not exists idx_feedback_user on feedback (user_id);

-- Mitigate referral_events public insert DDoS Risk
drop policy if exists "Anyone can insert referral events" on referral_events;

-- Relax frontend pricing experiment policy
drop policy if exists "Authenticated can view active pricing experiments" on pricing_experiments;
drop policy if exists "Anyone can view active pricing experiments" on pricing_experiments;

create policy "Anyone can view active pricing experiments" on pricing_experiments
  for select
  using (is_active = true);

-- Cleanup redundant index
drop index if exists idx_estimate_attachments_estimate;
