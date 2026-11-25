import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const schemaUrl = new URL("../../supabase_schema.sql", import.meta.url);
const usageCountersMigrationUrl = new URL("../../supabase/migrations/20261121110000_usage_counters_server_only.sql", import.meta.url);

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

  test("quota counters are read-only for browsers", async () => {
    const schema = await readFile(schemaUrl, "utf8");
    const migration = await readFile(usageCountersMigrationUrl, "utf8");

    assert.match(schema, /create policy "Users can view own usage counters" on usage_counters_monthly for select/);
    assert.doesNotMatch(schema, /on usage_counters_monthly for (insert|update|delete|all)/);
    assert.match(schema, /revoke all on usage_counters_monthly from anon;/);
    assert.match(schema, /revoke all on usage_counters_monthly from authenticated;/);
    assert.match(schema, /grant select on usage_counters_monthly to authenticated;/);

    assert.match(migration, /drop policy if exists "Users can insert own usage counters"/);
    assert.match(migration, /drop policy if exists "Users can update own usage counters"/);
    assert.match(migration, /revoke all on public\.usage_counters_monthly from authenticated;/);
    assert.match(migration, /raise exception 'usage_counters_monthly is still writable by API roles/);
    assert.match(migration, /raise exception 'service_role cannot read and write usage_counters_monthly'/);
  });
});
