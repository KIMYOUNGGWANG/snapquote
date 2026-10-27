import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, describe, test } from "node:test"

import pg from "pg"

// Runs the real migration against a throwaway local Postgres; skipped where initdb is not on PATH (CI).
function hasInitdb() {
  try {
    execFileSync("initdb", ["--version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const MIGRATION = readFileSync(
  new URL("../../supabase/migrations/20261026000001_guard_estimate_payment_state.sql", import.meta.url),
  "utf8"
)
const PAYMENT_COLUMNS = ["status", "sent_at", "payment_completed_at", "payment_link", "payment_link_id", "payment_link_type", "payment_state_version"]

describe("estimates payment state guard trigger", { skip: !hasInitdb() && "initdb not available" }, () => {
  let dataDir
  let client

  before(async () => {
    // macOS postmaster refuses to start without an explicit locale.
    const env = { ...process.env, LC_ALL: "C" }
    dataDir = mkdtempSync(path.join(tmpdir(), "sq-pg-"))
    execFileSync("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust"], { stdio: "ignore", env })
    execFileSync("pg_ctl", ["-D", dataDir, "-o", `-k ${dataDir} -p 54329 -c listen_addresses=''`, "-w", "start"], { stdio: "ignore", env })
    client = new pg.Client({ host: dataDir, port: 54329, user: "postgres", database: "postgres" })
    await client.connect()
    await client.query(`
      create role authenticated;
      create role service_role;
      create table public.estimates (
        id text primary key,
        status text check (status in ('draft', 'sent', 'paid')) default 'draft',
        sent_at timestamptz,
        payment_completed_at timestamptz,
        payment_link text,
        payment_link_id text,
        payment_link_type text,
        ai_summary text,
        updated_at timestamptz
      );
      grant all on public.estimates to authenticated, service_role;
    `)
    await client.query(MIGRATION)
  })

  after(async () => {
    await client?.end()
    if (dataDir) {
      execFileSync("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop"], { stdio: "ignore" })
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  // Same shape as the PostgREST upsert the sync push sends (insert ... on conflict do update), as `authenticated`.
  async function clientPush(row) {
    const columns = Object.keys(row)
    const sql = `insert into public.estimates (${columns.join(", ")}) values (${columns.map((_, index) => `$${index + 1}`).join(", ")})
      on conflict (id) do update set ${columns.filter((column) => column !== "id").map((column) => `${column} = excluded.${column}`).join(", ")}
      returning ${PAYMENT_COLUMNS.join(", ")}, ai_summary`
    await client.query("set role authenticated")
    try {
      return (await client.query(sql, Object.values(row))).rows[0]
    } finally {
      await client.query("reset role")
    }
  }

  async function serverUpdate(id, fields) {
    const columns = Object.keys(fields)
    await client.query("set role service_role")
    try {
      await client.query(
        `update public.estimates set ${columns.map((column, index) => `${column} = $${index + 2}`).join(", ")} where id = $1`,
        [id, ...Object.values(fields)]
      )
    } finally {
      await client.query("reset role")
    }
  }

  test("a stale sent push after the webhook marked it paid keeps it paid but stores the other edits", async () => {
    await clientPush({ id: "e1", status: "draft", payment_state_version: 0, ai_summary: "first" })
    const sent = await clientPush({ id: "e1", status: "sent", sent_at: "2026-10-26T09:00:00Z", payment_state_version: 0, ai_summary: "first" })
    assert.equal(sent.status, "sent")
    assert.equal(sent.payment_state_version, 1)

    await serverUpdate("e1", { status: "paid", payment_completed_at: "2026-10-26T10:00:00Z" })

    const stale = await clientPush({ id: "e1", status: "sent", sent_at: "2026-10-26T09:00:00Z", payment_completed_at: null, payment_state_version: 1, ai_summary: "offline edit" })
    assert.equal(stale.status, "paid")
    assert.ok(stale.payment_completed_at)
    assert.equal(stale.payment_state_version, 2)
    assert.equal(stale.ai_summary, "offline edit")
  })

  test("a stale push after finalize keeps the balance link instead of the old one", async () => {
    const oldLink = { payment_link: "https://pay.test/full", payment_link_id: "plink_full", payment_link_type: "full" }
    await clientPush({ id: "e2", status: "sent", ...oldLink, payment_state_version: 0 })

    await serverUpdate("e2", { payment_link: "https://pay.test/balance", payment_link_id: "plink_balance", payment_link_type: "custom" })

    const stale = await clientPush({ id: "e2", status: "sent", ...oldLink, payment_state_version: 0 })
    assert.equal(stale.payment_link, "https://pay.test/balance")
    assert.equal(stale.payment_link_id, "plink_balance")
    assert.equal(stale.payment_link_type, "custom")
  })

  test("a stale paid push after finalize reopened it stays reopened", async () => {
    await clientPush({ id: "e3", status: "paid", payment_completed_at: "2026-10-26T10:00:00Z", payment_state_version: 0 })
    await serverUpdate("e3", { status: "sent", payment_completed_at: null })

    const stale = await clientPush({ id: "e3", status: "paid", payment_completed_at: "2026-10-26T10:00:00Z", payment_state_version: 0 })
    assert.equal(stale.status, "sent")
    assert.equal(stale.payment_completed_at, null)
  })

  test("an up-to-date client can still mark paid and attach a link, and cannot forge the version", async () => {
    await clientPush({ id: "e4", status: "sent", payment_state_version: 0 })
    const linked = await clientPush({ id: "e4", status: "sent", payment_link: "https://pay.test/new", payment_link_id: "plink_new", payment_link_type: "full", payment_state_version: 0 })
    assert.equal(linked.payment_link, "https://pay.test/new")
    assert.equal(linked.payment_state_version, 1)

    const paid = await clientPush({ id: "e4", status: "paid", payment_link: "https://pay.test/new", payment_link_id: "plink_new", payment_link_type: "full", payment_state_version: 1 })
    assert.equal(paid.status, "paid")
    assert.equal(paid.payment_state_version, 2)

    const forged = await clientPush({ id: "e4", status: "paid", payment_link: "https://pay.test/new", payment_link_id: "plink_new", payment_link_type: "full", payment_state_version: 99 })
    assert.equal(forged.payment_state_version, 2)
  })
})
