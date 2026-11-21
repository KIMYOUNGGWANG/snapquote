import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const schemaUrl = new URL("../../supabase_schema.sql", import.meta.url);
const profileGrantsMigrationUrl = new URL("../../supabase/migrations/20261121100000_restrict_profile_client_writes.sql", import.meta.url);

// Columns lib/server/effective-plan.ts trusts to decide the plan: browsers must never be able to write them.
const SERVER_ONLY_PROFILE_COLUMNS = [
  "plan_tier",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_subscription_status",
  "stripe_subscription_price_id",
  "stripe_subscription_current_period_end",
  "stripe_cancel_at_period_end",
  "stripe_subscription_updated_at",
  "stripe_account_id",
  "stripe_charges_enabled",
  "stripe_payouts_enabled",
  "stripe_details_submitted",
  "stripe_onboarded_at",
  "referral_trial_ends_at",
  "referral_bonus_ends_at",
  "referral_credit_balance_months",
  "referred_by_token",
];

describe("Supabase schema contract", () => {
  test("fresh schema accepts every supported billing plan tier", async () => {
    const schema = await readFile(schemaUrl, "utf8");

    assert.match(
      schema,
      /plan_tier text check \(plan_tier in \('free', 'starter', 'pro', 'team'\)\) default 'free'/,
    );
    assert.match(
      schema,
      /plan_tier text check \(plan_tier in \('free', 'starter', 'pro', 'team'\)\) default 'free' not null/,
    );
  });

  test("fresh schema has job completion columns", async () => {
    const schema = await readFile(schemaUrl, "utf8");

    assert.match(schema, /amount_paid numeric\(12,2\) not null default 0/);
    assert.match(schema, /completion jsonb/);
    assert.match(schema, /added_on_site boolean not null default false/);
  });

  test("fresh schema has the private completion photos bucket with an owner-folder insert policy", async () => {
    const schema = await readFile(schemaUrl, "utf8");

    assert.match(schema, /values \('completion-photos', 'completion-photos', false, 409600,/);
    assert.match(schema, /for insert to authenticated\s+with check \(bucket_id = 'completion-photos' and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text\)/);
  });

  test("profile writes from browsers are limited to an allowlist that excludes billing columns", async () => {
    const migration = await readFile(profileGrantsMigrationUrl, "utf8");

    assert.match(migration, /revoke all on public\.profiles from anon;/);
    assert.match(migration, /revoke insert, update, delete, truncate on public\.profiles from authenticated;/);
    assert.match(migration, /for update using \(\(select auth\.uid\(\)\) = id\) with check \(\(select auth\.uid\(\)\) = id\)/);
    assert.match(migration, /grant insert \(%s\), update \(%s\) on public\.profiles to authenticated/);
    assert.match(migration, /raise exception 'profiles is still writable outside the browser allowlist/);

    const allowlist = migration.match(/browser_columns text\[\] := array\[([^\]]+)\]/)?.[1] ?? "";
    assert.match(allowlist, /'business_name'/);
    assert.match(allowlist, /'public_slug'/);
    for (const column of SERVER_ONLY_PROFILE_COLUMNS) {
      assert.doesNotMatch(allowlist, new RegExp(`'${column}'`), column);
    }
  });

  test("fresh schema applies the same browser write allowlist to profiles", async () => {
    const schema = await readFile(schemaUrl, "utf8");

    assert.match(schema, /revoke all on profiles from anon;/);
    assert.match(schema, /revoke insert, update, delete, truncate on profiles from authenticated;/);
    assert.match(schema, /create policy "Users can update own profile" on profiles for update using \(auth\.uid\(\) = id\) with check \(auth\.uid\(\) = id\);/);

    const grant = schema.match(/grant insert \(([^)]+)\), update \(([^)]+)\) on profiles to authenticated;/);
    assert.ok(grant, "profiles column grant is missing");
    assert.equal(grant[1], grant[2], "insert and update allowlists should match");
    for (const column of SERVER_ONLY_PROFILE_COLUMNS) {
      assert.doesNotMatch(grant[1], new RegExp(`\\b${column}\\b`), column);
    }
  });
});
