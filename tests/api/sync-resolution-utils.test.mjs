import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  DEFAULT_SYNC_BUFFER_MS,
  resolveLwwSyncAction,
  resolveSyncTimestamp,
} from "../../lib/sync-resolution.ts"

describe("sync LWW resolution", () => {
  test("prefers updatedAt and falls back to createdAt", () => {
    const timestamp = resolveSyncTimestamp(
      undefined,
      "2026-03-17T10:00:00.000Z",
    )

    assert.equal(timestamp, Date.parse("2026-03-17T10:00:00.000Z"))
  })

  test("ignores invalid timestamps and uses the next valid fallback", () => {
    const timestamp = resolveSyncTimestamp(
      "not-a-date",
      "2026-03-17T10:00:00.000Z",
    )

    assert.equal(timestamp, Date.parse("2026-03-17T10:00:00.000Z"))
  })

  test("returns push when the local copy is newer beyond the buffer", () => {
    const action = resolveLwwSyncAction({
      localUpdatedAt: "2026-03-17T10:00:02.500Z",
      localCreatedAt: "2026-03-17T10:00:00.000Z",
      cloudUpdatedAt: "2026-03-17T10:00:00.000Z",
      cloudCreatedAt: "2026-03-17T10:00:00.000Z",
    })

    assert.equal(action, "push")
  })

  test("returns pull when the cloud copy is newer beyond the buffer", () => {
    const action = resolveLwwSyncAction({
      localUpdatedAt: "2026-03-17T10:00:00.000Z",
      localCreatedAt: "2026-03-17T10:00:00.000Z",
      cloudUpdatedAt: "2026-03-17T10:00:02.500Z",
      cloudCreatedAt: "2026-03-17T10:00:00.000Z",
    })

    assert.equal(action, "pull")
  })

  test("returns noop when timestamps differ only within the safety buffer", () => {
    const action = resolveLwwSyncAction({
      localUpdatedAt: "2026-03-17T10:00:01.000Z",
      localCreatedAt: "2026-03-17T10:00:00.000Z",
      cloudUpdatedAt: "2026-03-17T10:00:00.200Z",
      cloudCreatedAt: "2026-03-17T10:00:00.000Z",
      bufferMs: DEFAULT_SYNC_BUFFER_MS,
    })

    assert.equal(action, "noop")
  })

  test("fails closed to noop when both timestamps are missing or invalid", () => {
    const action = resolveLwwSyncAction({
      localUpdatedAt: "invalid-local",
      cloudUpdatedAt: "invalid-cloud",
    })

    assert.equal(action, "noop")
  })
})
