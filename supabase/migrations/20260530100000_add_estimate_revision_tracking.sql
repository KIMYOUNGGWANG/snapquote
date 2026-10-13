alter table estimates
  add column if not exists revision_of_estimate_id text,
  add column if not exists revision_of_estimate_number text,
  add column if not exists revision_requested_at timestamp with time zone,
  add column if not exists superseded_by_estimate_id text,
  add column if not exists superseded_at timestamp with time zone;

create index if not exists idx_estimates_revision_of
  on estimates (user_id, revision_of_estimate_id)
  where revision_of_estimate_id is not null;

create index if not exists idx_estimates_superseded_by
  on estimates (user_id, superseded_by_estimate_id)
  where superseded_by_estimate_id is not null;
