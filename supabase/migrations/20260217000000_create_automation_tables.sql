-- Create automations table
create table if not exists automations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null,
  is_enabled boolean default false not null,
  settings jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, type)
);

alter table automations enable row level security;

create policy "Users can view own automations"
  on automations for select
  using (auth.uid() = user_id);

create policy "Users can insert own automations"
  on automations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own automations"
  on automations for update
  using (auth.uid() = user_id);

-- Create job_queue table
create table if not exists job_queue (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  task_type text not null,
  payload jsonb default '{}'::jsonb not null,
  status text check (status in ('pending', 'processing', 'completed', 'failed')) default 'pending' not null,
  scheduled_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  attempt_count int default 0 not null,
  max_attempts int default 3 not null,
  last_attempt_at timestamp with time zone
);

alter table job_queue enable row level security;

create policy "Users can view own job queue"
  on job_queue for select
  using (auth.uid() = user_id);

create policy "Users can insert own job queue"
  on job_queue for insert
  with check (auth.uid() = user_id);

-- Add indexes for job queue performance
create index if not exists idx_job_queue_status_scheduled
  on job_queue (status, scheduled_at)
  where status = 'pending';

create index if not exists idx_job_queue_user_created
  on job_queue (user_id, created_at desc);
