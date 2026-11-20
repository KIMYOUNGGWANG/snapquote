-- Customer photo-diagnosis requests (Phase 1). A homeowner opens the contractor's public link /r/{public_slug},
-- uploads photos, sees an AI diagnosis, and sends a quote request. Only server routes (service_role) write here.

-- 1) Contractor's public request link and the "hide price range from customers" switch.
--    Nullable + unique (Postgres allows many NULLs): existing profiles are untouched until the contractor sets a slug.
--    The app saves an empty slug field as NULL, never ''. A released slug can be claimed by another contractor,
--    so the public page always shows the business name and logo before a customer sends anything.
alter table public.profiles add column if not exists public_slug text;
alter table public.profiles add column if not exists request_hide_price_range boolean not null default false;
alter table public.profiles drop constraint if exists profiles_public_slug_format;
alter table public.profiles add constraint profiles_public_slug_format
  check (public_slug is null or public_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
create unique index if not exists profiles_public_slug_key on public.profiles (public_slug);

-- 2) Customer requests. estimate_id is text without FK (like estimate_share_links): the draft estimate is created
--    on the contractor's device first and may never sync, so a uuid FK to estimates would reject valid links.
create table if not exists public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'drafted', 'dismissed')),
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  customer_email text check (customer_email is null or char_length(customer_email) <= 254),
  customer_phone text check (customer_phone is null or char_length(customer_phone) <= 40),
  -- Neighbourhood only. The exact address is collected by the contractor after the quote is agreed.
  area_label text check (area_label is null or char_length(area_label) <= 120),
  diagnosis jsonb not null check (jsonb_typeof(diagnosis) = 'object' and pg_column_size(diagnosis) <= 8192),
  -- Paths in the private request-photos bucket: {user_id}/{request_id}/{n}.jpg
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  estimate_id text check (estimate_id is null or char_length(estimate_id) <= 120),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint customer_requests_has_contact check (customer_email is not null or customer_phone is not null)
);

alter table public.customer_requests enable row level security;

-- Read-only for the owner. No insert/update/delete policies: writes go through server routes only.
drop policy if exists "Owner reads own customer requests" on public.customer_requests;
create policy "Owner reads own customer requests" on public.customer_requests
  for select using ((select auth.uid()) = user_id);

-- Defense in depth: even if RLS is later disabled or a permissive policy is added, clients still cannot write,
-- and anon (customers never read this table) cannot even select the PII.
revoke all on public.customer_requests from anon;
revoke insert, update, delete, truncate on public.customer_requests from anon, authenticated;
grant select on public.customer_requests to authenticated;

create index if not exists customer_requests_user_created_idx on public.customer_requests (user_id, created_at desc);

-- 3) Private bucket for request photos. No storage.objects policies: uploads and reads are service-role only
--    (the contractor's app downloads them through an authenticated server route).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-photos', 'request-photos', false, 409600, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
