-- Edge functions (cron-scheduler, send-message) write scheduled_for / error_message,
-- which only existed in the hand-maintained supabase_schema.sql snapshot.
alter table public.job_queue
  add column if not exists scheduled_for timestamp with time zone default timezone('utc'::text, now()) not null,
  add column if not exists error_message text;
