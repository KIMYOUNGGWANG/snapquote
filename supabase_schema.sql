-- Users (Technician Profiles)
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  business_name text,
  logo_url text,
  phone text,
  email text,
  address text,
  license_number text,
  tax_rate float default 13
);

-- Clients
create table clients (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade,
  name text,
  address text,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Estimates
create table estimates (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade,
  client_id uuid references clients(id),
  estimate_number text,
  status text check (status in ('draft', 'sent', 'paid')) default 'draft',
  total_amount float,
  tax_rate float default 13,
  tax_amount float,
  currency text default 'CAD',
  ai_summary text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Estimate Items
create table estimate_items (
  id uuid default uuid_generate_v4() primary key,
  estimate_id uuid references estimates(id) on delete cascade,
  description text,
  quantity int,
  unit_price float,
  total float
);

-- Feedback
create table feedback (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete set null,
  rating int check (rating >= 1 and rating <= 5),
  category text,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table profiles enable row level security;
alter table clients enable row level security;
alter table estimates enable row level security;
alter table estimate_items enable row level security;
alter table feedback enable row level security;

-- Policies (Simple for now: users can see their own data)
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

create policy "Users can view own clients" on clients for select using (auth.uid() = user_id);
create policy "Users can insert own clients" on clients for insert with check (auth.uid() = user_id);

create policy "Users can view own estimates" on estimates for select using (auth.uid() = user_id);
create policy "Users can insert own estimates" on estimates for insert with check (auth.uid() = user_id);

create policy "Users can view own estimate items" on estimate_items for select using (
  exists ( select 1 from estimates where id = estimate_items.estimate_id and user_id = auth.uid() )
);
create policy "Users can insert own estimate items" on estimate_items for insert with check (
  exists ( select 1 from estimates where id = estimate_items.estimate_id and user_id = auth.uid() )
);

-- Estimates (Update with tracking columns)
alter table estimates add column sent_at timestamp with time zone;
alter table estimates add column last_followed_up_at timestamp with time zone;

-- Automation Settings
create table automations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null, -- 'quote_chaser', 'review_request'
  is_enabled boolean default false,
  settings jsonb default '{}'::jsonb, -- { "delay_days": 3, "template_id": "default" }
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, type)
);

-- Job Queue (for Edge Functions)
create table job_queue (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  task_type text not null, -- 'email_followup', 'sms_followup', 'review_request'
  payload jsonb not null,
  status text check (status in ('pending', 'processing', 'completed', 'failed')) default 'pending',
  error_message text,
  scheduled_for timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table automations enable row level security;
alter table job_queue enable row level security;

-- Policies for Automations
create policy "Users can view own automations" on automations for select using (auth.uid() = user_id);
create policy "Users can update own automations" on automations for update using (auth.uid() = user_id);
create policy "Users can insert own automations" on automations for insert with check (auth.uid() = user_id);

-- Policies for Job Queue
-- Note: Edge Functions use service_role key which bypasses RLS
-- These policies protect against direct client-side access
create policy "Users can view own jobs" on job_queue for select using (auth.uid() = user_id);
create policy "Users cannot insert jobs directly" on job_queue for insert with check (false);
-- Jobs should only be created by Edge Functions with service_role key

-- Index for performance
create index idx_job_queue_status_scheduled on job_queue (status, scheduled_for) where status = 'pending';
create index idx_estimates_followup on estimates (status, last_followed_up_at, created_at) where status = 'sent';

-- Estimates (Add review tracking column)
alter table estimates add column if not exists review_requested_at timestamp with time zone;
