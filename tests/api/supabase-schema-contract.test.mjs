import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const schemaUrl = new URL("../../supabase_schema.sql", import.meta.url);

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
});
