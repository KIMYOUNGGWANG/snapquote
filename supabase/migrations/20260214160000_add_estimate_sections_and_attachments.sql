-- Normalize estimate sections and attachments to close offline/local-only gaps.
-- Notes:
-- - We keep legacy `estimate_items` as-is for backward compatibility.
-- - `local_id` stores client-side ids like `section-xxxxxxxx` / `item-xxxxxxxx`.

create table if not exists estimate_sections (
  id uuid default gen_random_uuid() primary key,
  estimate_id uuid references estimates(id) on delete cascade not null,
  local_id text not null,
  division_code text,
  name text not null,
  sort_order int default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(estimate_id, local_id),
  constraint estimate_sections_local_id_len_check check (char_length(local_id) <= 64),
  constraint estimate_sections_division_code_len_check check (division_code is null or char_length(division_code) <= 16),
  constraint estimate_sections_name_len_check check (char_length(name) <= 120)
);

create table if not exists estimate_section_items (
  id uuid default gen_random_uuid() primary key,
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
  unique(section_id, local_id),
  constraint estimate_section_items_local_id_len_check check (char_length(local_id) <= 64),
  constraint estimate_section_items_category_check check (category is null or category in ('PARTS', 'LABOR', 'SERVICE', 'OTHER')),
  constraint estimate_section_items_unit_len_check check (unit is null or char_length(unit) <= 16),
  constraint estimate_section_items_description_len_check check (description is null or char_length(description) <= 500),
  constraint estimate_section_items_quantity_check check (quantity is null or quantity >= 0),
  constraint estimate_section_items_unit_price_check check (unit_price is null or unit_price >= 0),
  constraint estimate_section_items_total_check check (total is null or total >= 0)
);

create table if not exists estimate_attachments (
  id uuid default gen_random_uuid() primary key,
  estimate_id uuid references estimates(id) on delete cascade not null,
  photos jsonb default '[]'::jsonb not null,
  audio_url text,
  original_transcript text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(estimate_id),
  constraint estimate_attachments_photos_is_array_check check (jsonb_typeof(photos) = 'array'),
  constraint estimate_attachments_photos_count_check check (jsonb_array_length(photos) <= 5),
  constraint estimate_attachments_photos_size_check check (pg_column_size(photos) <= 5242880),
  constraint estimate_attachments_transcript_len_check check (original_transcript is null or char_length(original_transcript) <= 20000)
);

alter table estimate_sections enable row level security;
alter table estimate_section_items enable row level security;
alter table estimate_attachments enable row level security;

do $$
begin
  -- estimate_sections policies
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_sections'
      and policyname = 'Users can view own estimate sections'
  ) then
    create policy "Users can view own estimate sections"
      on estimate_sections
      for select
      using (
        exists (
          select 1
          from estimates
          where id = estimate_sections.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_sections'
      and policyname = 'Users can insert own estimate sections'
  ) then
    create policy "Users can insert own estimate sections"
      on estimate_sections
      for insert
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_sections.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_sections'
      and policyname = 'Users can update own estimate sections'
  ) then
    create policy "Users can update own estimate sections"
      on estimate_sections
      for update
      using (
        exists (
          select 1
          from estimates
          where id = estimate_sections.estimate_id
            and user_id = (select auth.uid())
        )
      )
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_sections.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_sections'
      and policyname = 'Users can delete own estimate sections'
  ) then
    create policy "Users can delete own estimate sections"
      on estimate_sections
      for delete
      using (
        exists (
          select 1
          from estimates
          where id = estimate_sections.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  -- estimate_section_items policies
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_section_items'
      and policyname = 'Users can view own estimate section items'
  ) then
    create policy "Users can view own estimate section items"
      on estimate_section_items
      for select
      using (
        exists (
          select 1
          from estimates
          where id = estimate_section_items.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_section_items'
      and policyname = 'Users can insert own estimate section items'
  ) then
    create policy "Users can insert own estimate section items"
      on estimate_section_items
      for insert
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_section_items.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_section_items'
      and policyname = 'Users can update own estimate section items'
  ) then
    create policy "Users can update own estimate section items"
      on estimate_section_items
      for update
      using (
        exists (
          select 1
          from estimates
          where id = estimate_section_items.estimate_id
            and user_id = (select auth.uid())
        )
      )
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_section_items.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_section_items'
      and policyname = 'Users can delete own estimate section items'
  ) then
    create policy "Users can delete own estimate section items"
      on estimate_section_items
      for delete
      using (
        exists (
          select 1
          from estimates
          where id = estimate_section_items.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  -- estimate_attachments policies
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_attachments'
      and policyname = 'Users can view own estimate attachments'
  ) then
    create policy "Users can view own estimate attachments"
      on estimate_attachments
      for select
      using (
        exists (
          select 1
          from estimates
          where id = estimate_attachments.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_attachments'
      and policyname = 'Users can insert own estimate attachments'
  ) then
    create policy "Users can insert own estimate attachments"
      on estimate_attachments
      for insert
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_attachments.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_attachments'
      and policyname = 'Users can update own estimate attachments'
  ) then
    create policy "Users can update own estimate attachments"
      on estimate_attachments
      for update
      using (
        exists (
          select 1
          from estimates
          where id = estimate_attachments.estimate_id
            and user_id = (select auth.uid())
        )
      )
      with check (
        exists (
          select 1
          from estimates
          where id = estimate_attachments.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'estimate_attachments'
      and policyname = 'Users can delete own estimate attachments'
  ) then
    create policy "Users can delete own estimate attachments"
      on estimate_attachments
      for delete
      using (
        exists (
          select 1
          from estimates
          where id = estimate_attachments.estimate_id
            and user_id = (select auth.uid())
        )
      );
  end if;
end
$$;

-- Indexes for FK columns and common query patterns
create index if not exists idx_estimate_sections_estimate
  on estimate_sections (estimate_id, sort_order);

create index if not exists idx_estimate_section_items_section
  on estimate_section_items (section_id);

create index if not exists idx_estimate_section_items_estimate
  on estimate_section_items (estimate_id);

create index if not exists idx_estimate_attachments_estimate
  on estimate_attachments (estimate_id);
