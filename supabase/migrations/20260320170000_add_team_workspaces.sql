create table if not exists team_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (owner_user_id)
);

create table if not exists team_workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references team_workspaces(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text not null check (role in ('owner', 'admin', 'member')),
  joined_at timestamp with time zone not null default timezone('utc'::text, now()),
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (workspace_id, user_id),
  unique (user_id)
);

create table if not exists team_workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references team_workspaces(id) on delete cascade not null,
  email text not null,
  role text not null check (role in ('admin', 'member')),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references profiles(id) on delete set null not null,
  accepted_by uuid references profiles(id) on delete set null,
  expires_at timestamp with time zone not null,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create unique index if not exists team_workspace_invites_workspace_email_pending_key
  on team_workspace_invites (workspace_id, lower(email))
  where status = 'pending';

create index if not exists team_workspace_members_workspace_idx
  on team_workspace_members (workspace_id, role);

create index if not exists team_workspace_invites_workspace_status_idx
  on team_workspace_invites (workspace_id, status, created_at desc);

alter table team_workspaces enable row level security;
alter table team_workspace_members enable row level security;
alter table team_workspace_invites enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'team_workspaces'
      and policyname = 'Users can view own team workspaces'
  ) then
    create policy "Users can view own team workspaces"
      on team_workspaces
      for select
      using (
        exists (
          select 1
          from team_workspace_members
          where team_workspace_members.workspace_id = team_workspaces.id
            and team_workspace_members.user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'team_workspace_members'
      and policyname = 'Users can view members in own workspace'
  ) then
    create policy "Users can view members in own workspace"
      on team_workspace_members
      for select
      using (
        exists (
          select 1
          from team_workspace_members as viewer
          where viewer.workspace_id = team_workspace_members.workspace_id
            and viewer.user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'team_workspace_invites'
      and policyname = 'Users can view invites in own workspace'
  ) then
    create policy "Users can view invites in own workspace"
      on team_workspace_invites
      for select
      using (
        exists (
          select 1
          from team_workspace_members
          where team_workspace_members.workspace_id = team_workspace_invites.workspace_id
            and team_workspace_members.user_id = auth.uid()
        )
      );
  end if;
end
$$;
