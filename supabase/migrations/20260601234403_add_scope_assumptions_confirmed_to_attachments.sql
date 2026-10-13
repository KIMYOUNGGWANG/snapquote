alter table estimate_attachments
  add column if not exists scope_assumptions_confirmed_at timestamp with time zone;
