-- 3D walkthrough preview add-on (WalkPlan). A contractor requests a "finished room" 3D preview for an estimate;
-- the operator builds it offline and attaches the link, which the customer portal shows live (no re-share needed).
-- Separate table instead of an estimates column: the local-first estimate sync never touches it, and only
-- server routes (service_role) write it, so clients cannot point their customers at arbitrary URLs.
-- estimate_id is text (no FK) like estimate_share_links, because estimates may exist only on the device.
create table if not exists public.estimate_walkthroughs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  estimate_id text not null,
  status text not null default 'requested' check (status in ('requested', 'ready')),
  url text check (url is null or url ~ '^https://'),
  requested_at timestamp with time zone not null default timezone('utc'::text, now()),
  ready_at timestamp with time zone,
  primary key (user_id, estimate_id),
  constraint estimate_walkthroughs_ready_has_url check (status <> 'ready' or url is not null)
);

alter table public.estimate_walkthroughs enable row level security;

-- Read-only for the owner. No insert/update/delete policies: writes go through server routes only.
drop policy if exists "Users can view own walkthroughs" on public.estimate_walkthroughs;
create policy "Users can view own walkthroughs" on public.estimate_walkthroughs
  for select using ((select auth.uid()) = user_id);

-- Defense in depth: even if RLS is later disabled or a permissive policy is added, clients still cannot write.
revoke insert, update, delete, truncate on public.estimate_walkthroughs from anon, authenticated;
