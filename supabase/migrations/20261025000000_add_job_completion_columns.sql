-- Job completion report: cumulative payments, on-site added sections, and the completion report payload.
alter table public.estimates
  add column if not exists amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0);

alter table public.estimate_sections
  add column if not exists added_on_site boolean not null default false;

alter table public.estimate_attachments
  add column if not exists completion jsonb;
