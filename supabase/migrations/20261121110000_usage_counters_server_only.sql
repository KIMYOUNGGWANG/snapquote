-- usage_counters_monthly holds the free-plan quota counters that lib/server/usage-quota.ts enforces.
-- Browsers could insert/update their own row, so anyone could reset generate_count to 0 and bypass the quota.
-- The server now reads and writes these rows with the service role only (usage-quota.ts verifies the user's token,
-- then uses createServiceSupabaseClient; supabase/functions/send-message already uses the service role).
-- Owners keep read access through the existing "Users can view own usage counters" policy.
--
-- Deploy the usage-quota.ts change before applying this: the previous code wrote counters with the user's token.
-- Rolling the app back to that code after this migration silently stops counting (writes are denied), so roll
-- back this migration together with it. Pair with 20261121100000_restrict_profile_client_writes.sql: without it
-- a user could skip the quota by raising their own plan_tier instead.
-- Everything runs in one DO block so a failed check leaves the table exactly as it was.

do $$
declare
  leaked text;
  extra_policies text;
begin
  -- Do not queue behind a long transaction while holding the table lock the API needs.
  perform set_config('lock_timeout', '5s', true);

  drop policy if exists "Users can insert own usage counters" on public.usage_counters_monthly;
  drop policy if exists "Users can update own usage counters" on public.usage_counters_monthly;

  revoke insert, update, delete, truncate on public.usage_counters_monthly from public;
  revoke all on public.usage_counters_monthly from anon;
  revoke all on public.usage_counters_monthly from authenticated;
  grant select on public.usage_counters_monthly to authenticated;
  grant select, insert, update on public.usage_counters_monthly to service_role;

  -- REVOKE only warns when the running role is not the grantor, and PUBLIC grants are inherited,
  -- so prove the result instead of trusting it.
  select string_agg(format('%s:%s', r.role_name, c.column_name), ', ')
    into leaked
    from information_schema.columns c
   cross join (values ('authenticated'), ('anon')) as r(role_name)
   where c.table_schema = 'public' and c.table_name = 'usage_counters_monthly'
     and (has_column_privilege(r.role_name, 'public.usage_counters_monthly', c.column_name, 'INSERT')
       or has_column_privilege(r.role_name, 'public.usage_counters_monthly', c.column_name, 'UPDATE'));
  if leaked is null
     and (has_table_privilege('authenticated', 'public.usage_counters_monthly', 'DELETE, TRUNCATE')
       or has_table_privilege('anon', 'public.usage_counters_monthly', 'DELETE, TRUNCATE')) then
    leaked := 'DELETE/TRUNCATE';
  end if;
  if leaked is not null then
    raise exception 'usage_counters_monthly is still writable by API roles: %', leaked;
  end if;

  -- The server now depends on the service role for every counter write.
  -- (A comma list means "any of", so each privilege is checked on its own.)
  if not (has_table_privilege('service_role', 'public.usage_counters_monthly', 'SELECT')
      and has_table_privilege('service_role', 'public.usage_counters_monthly', 'INSERT')
      and has_table_privilege('service_role', 'public.usage_counters_monthly', 'UPDATE')) then
    raise exception 'service_role cannot read and write usage_counters_monthly';
  end if;

  select string_agg(policyname, ', ')
    into extra_policies
    from pg_policies
   where schemaname = 'public' and tablename = 'usage_counters_monthly'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if extra_policies is not null then
    raise exception 'unexpected write policies on usage_counters_monthly, review before applying: %', extra_policies;
  end if;
end
$$;
