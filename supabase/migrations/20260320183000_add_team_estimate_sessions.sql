create table if not exists public.team_estimate_sessions (
    estimate_id uuid primary key references public.estimates(id) on delete cascade,
    workspace_id uuid not null references public.team_workspaces(id) on delete cascade,
    editor_user_id uuid not null references public.profiles(id) on delete cascade,
    acquired_at timestamptz not null default timezone('utc', now()),
    heartbeat_at timestamptz not null default timezone('utc', now()),
    expires_at timestamptz not null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists team_estimate_sessions_workspace_id_idx
    on public.team_estimate_sessions (workspace_id);

create index if not exists team_estimate_sessions_editor_user_id_idx
    on public.team_estimate_sessions (editor_user_id);

create index if not exists team_estimate_sessions_expires_at_idx
    on public.team_estimate_sessions (expires_at);

alter table public.team_estimate_sessions enable row level security;

create policy "Team sessions viewable by workspace members"
    on public.team_estimate_sessions
    for select
    using (
        exists (
            select 1
            from public.team_workspace_members member
            where member.workspace_id = team_estimate_sessions.workspace_id
              and member.user_id = auth.uid()
        )
    );
