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

-- Enable RLS
alter table profiles enable row level security;
alter table clients enable row level security;
alter table estimates enable row level security;
alter table estimate_items enable row level security;

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
