-- Browsers may only write the business-profile columns of their own profiles row.
-- Billing, Stripe and referral columns (plan_tier, stripe_*, referral_*) are written by server routes with the
-- service role, and lib/server/effective-plan.ts trusts them to decide the plan, so a signed-in user must not be
-- able to set them through the Supabase REST API (e.g. plan_tier = 'team' or stripe_subscription_status = 'active').
--
-- Allowlist by column privileges. This file is the source of truth for what browsers may write: revoking the
-- table-level privileges also drops any column grants made elsewhere, and every column added later stays
-- read-only for browsers until it is added to browser_columns below (and to supabase_schema.sql).
--
-- Everything runs in one DO block so a failed check at the end leaves the table exactly as it was,
-- whether or not the migration runner wraps the file in a transaction.

do $$
declare
  -- Columns the app writes with the signed-in user's token:
  --   app/profile/page.tsx upsert, components/setup-wizard.tsx update,
  --   components/customer-request/request-link-card.tsx update,
  --   lib/server/usage-quota.ts + app/api/referrals/token/route.ts upsert({ id }).
  -- public_slug / request_hide_price_range arrive with 20261121000000_add_customer_requests.sql, which grants
  -- them itself, so either order works; they are granted here too when they already exist.
  browser_columns text[] := array[
    'id', 'business_name', 'logo_url', 'phone', 'email', 'address', 'license_number',
    'tax_rate', 'default_tax_rate', 'state_province', 'payment_link', 'estimate_template_url',
    'public_slug', 'request_hide_price_range'
  ];
  existing text;
  leaked text;
  extra_policies text;
begin
  -- Written by app/profile/page.tsx but never defined in a migration; the live DB has them (the profile save works).
  -- Defining them here keeps local/CI resets identical to production, so the grants below are the same everywhere.
  alter table public.profiles add column if not exists state_province text;
  alter table public.profiles add column if not exists payment_link text;
  alter table public.profiles add column if not exists estimate_template_url text;

  revoke all on public.profiles from anon;
  revoke insert, update, delete, truncate on public.profiles from authenticated;

  -- Pin the row owner on writes explicitly instead of relying on USING being reused as WITH CHECK.
  drop policy if exists "Users can update own profile" on public.profiles;
  create policy "Users can update own profile" on public.profiles
    for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into existing
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = any (browser_columns);

  -- id is in the UPDATE grant because a PostgREST upsert (merge-duplicates) sets every payload column in
  -- ON CONFLICT DO UPDATE, the primary key included; the policy above pins it to the caller.
  execute format('grant insert (%s), update (%s) on public.profiles to authenticated', existing, existing);

  -- REVOKE only warns when the running role is not the grantor, and PUBLIC grants are inherited,
  -- so prove the result instead of trusting it.
  select string_agg(format('%s:%s', r.role_name, c.column_name), ', ')
    into leaked
    from information_schema.columns c
   cross join (values ('authenticated'), ('anon')) as r(role_name)
   where c.table_schema = 'public' and c.table_name = 'profiles'
     and (r.role_name = 'anon' or c.column_name <> all (browser_columns))
     and (has_column_privilege(r.role_name, 'public.profiles', c.column_name, 'INSERT')
       or has_column_privilege(r.role_name, 'public.profiles', c.column_name, 'UPDATE'));
  if leaked is not null then
    raise exception 'profiles is still writable outside the browser allowlist: %', leaked;
  end if;

  -- Another permissive write policy (e.g. added by hand on the live DB) could undo the owner pin above.
  select string_agg(policyname, ', ')
    into extra_policies
    from pg_policies
   where schemaname = 'public' and tablename = 'profiles'
     and cmd in ('INSERT', 'UPDATE', 'ALL')
     and policyname not in ('Users can update own profile', 'Users can insert own profile');
  if extra_policies is not null then
    raise exception 'unexpected write policies on profiles, review before applying: %', extra_policies;
  end if;
end
$$;
