create extension if not exists "uuid-ossp";

-- Users (Technician Profiles)
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  business_name text,
  logo_url text,
  phone text,
  email text,
  address text,
  license_number text,
  tax_rate float default 13,
  plan_tier text check (plan_tier in ('free', 'pro')) default 'free'
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
  sent_at timestamp with time zone,
  first_followed_up_at timestamp with time zone,
  second_followed_up_at timestamp with time zone,
  last_followed_up_at timestamp with time zone,
  review_requested_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
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

-- Estimate Sections (normalized)
create table estimate_sections (
  id uuid default uuid_generate_v4() primary key,
  estimate_id uuid references estimates(id) on delete cascade not null,
  local_id text not null,
  division_code text,
  name text not null,
  sort_order int default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(estimate_id, local_id)
);

-- Estimate Section Items (normalized)
create table estimate_section_items (
  id uuid default uuid_generate_v4() primary key,
  estimate_id uuid references estimates(id) on delete cascade not null,
  section_id uuid references estimate_sections(id) on delete cascade not null,
  local_id text not null,
  item_number int default 0 not null,
  category text,
  unit text,
  description text,
  quantity int,
  unit_price float,
  total float,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(section_id, local_id)
);

-- Estimate Attachments (normalized)
create table estimate_attachments (
  id uuid default uuid_generate_v4() primary key,
  estimate_id uuid references estimates(id) on delete cascade not null,
  photos jsonb default '[]'::jsonb not null,
  audio_url text,
  original_transcript text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(estimate_id)
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

-- Analytics Events (conversion funnel)
create table analytics_events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  event_name text not null,
  estimate_id uuid references estimates(id) on delete set null,
  estimate_number text,
  channel text,
  external_id text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ops Alerts (webhook/reconcile failure monitoring)
create table ops_alerts (
  id uuid default uuid_generate_v4() primary key,
  source text not null,
  severity text check (severity in ('info', 'warning', 'error')) default 'error',
  alert_key text not null,
  message text not null,
  context jsonb default '{}'::jsonb not null,
  occurrences int default 1 not null,
  first_seen_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_seen_at timestamp with time zone default timezone('utc'::text, now()) not null,
  resolved_at timestamp with time zone
);
-- Note: ops_alerts is intentionally left without RLS policies to restrict read/write access to the Service Role only.

-- Referral Tokens (quote-share attribution)
create table referral_tokens (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  token text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id),
  unique(token)
);

-- Referral Events (public visit/click tracking)
create table referral_events (
  id uuid default uuid_generate_v4() primary key,
  token text references referral_tokens(token) on delete cascade not null,
  event_name text not null,
  source text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Monthly Usage Counters (free quota + cost observability)
create table usage_counters_monthly (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  period_start date not null,
  plan_tier text check (plan_tier in ('free', 'pro')) default 'free' not null,
  generate_count int default 0 not null,
  transcribe_count int default 0 not null,
  send_email_count int default 0 not null,
  openai_prompt_tokens bigint default 0 not null,
  openai_completion_tokens bigint default 0 not null,
  openai_estimated_cost double precision default 0 not null,
  resend_estimated_cost double precision default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, period_start)
);

-- Pricing Experiments
create table pricing_experiments (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  is_active boolean default false not null,
  config jsonb default '{}'::jsonb not null,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(name)
);

create table pricing_assignments (
  id uuid default gen_random_uuid() primary key,
  experiment_id uuid references pricing_experiments(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  variant text not null,
  assigned_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(experiment_id, user_id)
);

create table pricing_conversions (
  id uuid default gen_random_uuid() primary key,
  experiment_id uuid references pricing_experiments(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  variant text not null,
  event_name text not null,
  external_id text,
  metadata jsonb default '{}'::jsonb not null,
  occurred_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Automation Settings
create table automations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null,
  is_enabled boolean default false,
  settings jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, type)
);

-- Job Queue
create table job_queue (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  task_type text not null,
  payload jsonb not null,
  status text check (status in ('pending', 'processing', 'completed', 'failed')) default 'pending',
  error_message text,
  scheduled_for timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table profiles enable row level security;
alter table clients enable row level security;
alter table estimates enable row level security;
alter table estimate_items enable row level security;
alter table estimate_sections enable row level security;
alter table estimate_section_items enable row level security;
alter table estimate_attachments enable row level security;
alter table feedback enable row level security;
alter table analytics_events enable row level security;
alter table ops_alerts enable row level security;
alter table referral_tokens enable row level security;
alter table referral_events enable row level security;
alter table usage_counters_monthly enable row level security;
alter table pricing_experiments enable row level security;
alter table pricing_assignments enable row level security;
alter table pricing_conversions enable row level security;
alter table automations enable row level security;
alter table job_queue enable row level security;

-- Profiles policies
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- Clients policies
create policy "Users can view own clients" on clients for select using (auth.uid() = user_id);
create policy "Users can insert own clients" on clients for insert with check (auth.uid() = user_id);
create policy "Users can update own clients" on clients for update using (auth.uid() = user_id);
create policy "Users can delete own clients" on clients for delete using (auth.uid() = user_id);

-- Estimates policies
create policy "Users can view own estimates" on estimates for select using (auth.uid() = user_id);
create policy "Users can insert own estimates" on estimates for insert with check (auth.uid() = user_id);
create policy "Users can update own estimates" on estimates for update using (auth.uid() = user_id);
create policy "Users can delete own estimates" on estimates for delete using (auth.uid() = user_id);

-- Estimate Items policies
create policy "Users can view own estimate items" on estimate_items for select using (
  exists ( select 1 from estimates where id = estimate_items.estimate_id and user_id = auth.uid() )
);
create policy "Users can insert own estimate items" on estimate_items for insert with check (
  exists ( select 1 from estimates where id = estimate_items.estimate_id and user_id = auth.uid() )
);
create policy "Users can update own estimate items" on estimate_items for update using (
  exists ( select 1 from estimates where id = estimate_items.estimate_id and user_id = auth.uid() )
);
create policy "Users can delete own estimate items" on estimate_items for delete using (
  exists ( select 1 from estimates where id = estimate_items.estimate_id and user_id = auth.uid() )
);

-- Estimate Sections policies
create policy "Users can view own estimate sections" on estimate_sections for select using (
  exists ( select 1 from estimates where id = estimate_sections.estimate_id and user_id = auth.uid() )
);
create policy "Users can insert own estimate sections" on estimate_sections for insert with check (
  exists ( select 1 from estimates where id = estimate_sections.estimate_id and user_id = auth.uid() )
);
create policy "Users can update own estimate sections" on estimate_sections for update
  using ( exists ( select 1 from estimates where id = estimate_sections.estimate_id and user_id = auth.uid() ) )
  with check ( exists ( select 1 from estimates where id = estimate_sections.estimate_id and user_id = auth.uid() ) );
create policy "Users can delete own estimate sections" on estimate_sections for delete using (
  exists ( select 1 from estimates where id = estimate_sections.estimate_id and user_id = auth.uid() )
);

-- Estimate Section Items policies
create policy "Users can view own estimate section items" on estimate_section_items for select using (
  exists ( select 1 from estimates where id = estimate_section_items.estimate_id and user_id = auth.uid() )
);
create policy "Users can insert own estimate section items" on estimate_section_items for insert with check (
  exists ( select 1 from estimates where id = estimate_section_items.estimate_id and user_id = auth.uid() )
);
create policy "Users can update own estimate section items" on estimate_section_items for update
  using ( exists ( select 1 from estimates where id = estimate_section_items.estimate_id and user_id = auth.uid() ) )
  with check ( exists ( select 1 from estimates where id = estimate_section_items.estimate_id and user_id = auth.uid() ) );
create policy "Users can delete own estimate section items" on estimate_section_items for delete using (
  exists ( select 1 from estimates where id = estimate_section_items.estimate_id and user_id = auth.uid() )
);

-- Estimate Attachments policies
create policy "Users can view own estimate attachments" on estimate_attachments for select using (
  exists ( select 1 from estimates where id = estimate_attachments.estimate_id and user_id = auth.uid() )
);
create policy "Users can insert own estimate attachments" on estimate_attachments for insert with check (
  exists ( select 1 from estimates where id = estimate_attachments.estimate_id and user_id = auth.uid() )
);
create policy "Users can update own estimate attachments" on estimate_attachments for update
  using ( exists ( select 1 from estimates where id = estimate_attachments.estimate_id and user_id = auth.uid() ) )
  with check ( exists ( select 1 from estimates where id = estimate_attachments.estimate_id and user_id = auth.uid() ) );
create policy "Users can delete own estimate attachments" on estimate_attachments for delete using (
  exists ( select 1 from estimates where id = estimate_attachments.estimate_id and user_id = auth.uid() )
);

-- Feedback policies
create policy "Users can insert feedback" on feedback for insert with check (auth.uid() = user_id);
create policy "Users can view own feedback" on feedback for select using (auth.uid() = user_id);

-- Analytics Events policies
create policy "Users can view own analytics events" on analytics_events for select using (auth.uid() = user_id);
create policy "Users can insert own analytics events" on analytics_events for insert with check (auth.uid() = user_id);

-- Referral Token/Event policies
create policy "Users can view own referral tokens" on referral_tokens for select using (auth.uid() = user_id);
create policy "Users can insert own referral tokens" on referral_tokens for insert with check (auth.uid() = user_id);
create policy "Users can update own referral tokens" on referral_tokens for update using (auth.uid() = user_id);
-- Note: "Anyone can insert referral events" was removed as a critical security risk. Referral events should be inserted via Edge Functions using Service Role.
create policy "Users can view own referral events" on referral_events for select using (
  exists (
    select 1
    from referral_tokens
    where referral_tokens.token = referral_events.token
      and referral_tokens.user_id = auth.uid()
  )
);

-- Usage policies
create policy "Users can view own usage counters" on usage_counters_monthly for select using (auth.uid() = user_id);
create policy "Users can insert own usage counters" on usage_counters_monthly for insert with check (auth.uid() = user_id);
create policy "Users can update own usage counters" on usage_counters_monthly for update using (auth.uid() = user_id);

-- Pricing policies
create policy "Anyone can view active pricing experiments" on pricing_experiments
  for select
  using (is_active = true);

create policy "Users can view own pricing assignments" on pricing_assignments
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can view own pricing conversions" on pricing_conversions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert own pricing conversions" on pricing_conversions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Automations policies
create policy "Users can view own automations" on automations for select using (auth.uid() = user_id);
create policy "Users can update own automations" on automations for update using (auth.uid() = user_id);
create policy "Users can insert own automations" on automations for insert with check (auth.uid() = user_id);

-- Job Queue policies
create policy "Users can view own jobs" on job_queue for select using (auth.uid() = user_id);
create policy "Users cannot insert jobs directly" on job_queue for insert with check (false);

-- Indexes
create index idx_job_queue_status_scheduled on job_queue (status, scheduled_for) where status = 'pending';
create index idx_estimates_followup on estimates (status, last_followed_up_at, created_at) where status = 'sent';
create index idx_estimates_followup_stage1 on estimates (status, first_followed_up_at, created_at) where status = 'sent';
create index idx_estimates_followup_stage2 on estimates (status, second_followed_up_at, created_at) where status = 'sent';
create index idx_estimates_review on estimates (status, review_requested_at, updated_at) where status = 'paid';
create index idx_clients_user_id on clients (user_id);
create index idx_estimates_user_id on estimates (user_id);
create index idx_estimates_client_id on estimates (client_id);
create index idx_analytics_events_user_created on analytics_events (user_id, created_at desc);
create index idx_analytics_events_user_event_created on analytics_events (user_id, event_name, created_at desc);
create index idx_analytics_events_estimate_created on analytics_events (estimate_id, created_at desc) where estimate_id is not null;
create unique index idx_analytics_events_external_id_unique on analytics_events (external_id) where external_id is not null;
create index idx_ops_alerts_unresolved_last_seen on ops_alerts (last_seen_at desc) where resolved_at is null;
create index idx_ops_alerts_source_last_seen on ops_alerts (source, last_seen_at desc);
create unique index idx_ops_alerts_alert_key_unresolved on ops_alerts (alert_key) where resolved_at is null;
create index idx_referral_tokens_user on referral_tokens (user_id);
create index idx_referral_events_token_created on referral_events (token, created_at desc);
create index idx_usage_monthly_user_period on usage_counters_monthly (user_id, period_start desc);
create index idx_usage_monthly_user_updated on usage_counters_monthly (user_id, updated_at desc);
create index idx_estimate_sections_estimate on estimate_sections (estimate_id, sort_order);
create index idx_estimate_section_items_section on estimate_section_items (section_id);
create index idx_estimate_section_items_estimate on estimate_section_items (estimate_id);
create unique index idx_pricing_conversions_external_id_unique on pricing_conversions (external_id) where external_id is not null;
create index idx_pricing_assignments_experiment on pricing_assignments (experiment_id);
create index idx_pricing_assignments_user on pricing_assignments (user_id);
create index idx_pricing_conversions_experiment_time on pricing_conversions (experiment_id, occurred_at desc);
create index idx_pricing_conversions_user_time on pricing_conversions (user_id, occurred_at desc);

-- Foreign Key Missing Indexes (gemini-audit)
create index idx_estimate_items_estimate on estimate_items (estimate_id);
create index idx_automations_user on automations (user_id);
create index idx_job_queue_user on job_queue (user_id);
create index idx_feedback_user on feedback (user_id);
