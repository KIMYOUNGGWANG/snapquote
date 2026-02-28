import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"

const CLIENT_ID_PATTERN = /^[a-zA-Z0-9:_-]{3,64}$/
const TABLE_NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/
const RECORD_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/
const MAX_CHANGES_PER_REQUEST = 200
const MAX_MUTATIONS_JSON_BYTES = 20_000

type SyncChangeInput = {
    table: string
    recordId: string
    timestamp: number
    mutations: Record<string, unknown>
}

type NormalizedSyncPayload = {
    clientId: string
    changes: SyncChangeInput[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isSafeIntegerTimestamp(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function normalizeChange(input: unknown): SyncChangeInput | null {
    if (!isPlainObject(input)) return null

    const table = typeof input.table === "string" ? input.table.trim() : ""
    const recordId = typeof input.recordId === "string" ? input.recordId.trim() : ""
    const timestamp = input.timestamp
    const mutations = input.mutations

    if (!TABLE_NAME_PATTERN.test(table)) return null
    if (!RECORD_ID_PATTERN.test(recordId)) return null
    if (!isSafeIntegerTimestamp(timestamp)) return null
    if (!isPlainObject(mutations)) return null

    const mutationBytes = Buffer.byteLength(JSON.stringify(mutations), "utf8")
    if (mutationBytes > MAX_MUTATIONS_JSON_BYTES) return null

    return {
        table,
        recordId,
        timestamp,
        mutations,
    }
}

function normalizeSyncPayload(input: unknown): NormalizedSyncPayload | null {
    if (!isPlainObject(input)) return null

    const clientId = typeof input.clientId === "string" ? input.clientId.trim() : ""
    if (!CLIENT_ID_PATTERN.test(clientId)) return null

    if (!Array.isArray(input.changes)) return null
    if (input.changes.length > MAX_CHANGES_PER_REQUEST) return null

    const normalized: SyncChangeInput[] = []
    for (const rawChange of input.changes) {
        const change = normalizeChange(rawChange)
        if (!change) return null
        normalized.push(change)
    }

    return {
        clientId,
        changes: normalized,
    }
}

function mergeChanges(changes: SyncChangeInput[]): SyncChangeInput[] {
    const latestByRecord = new Map<string, SyncChangeInput>()

    for (const change of changes) {
        const key = `${change.table}::${change.recordId}`
        const existing = latestByRecord.get(key)

        if (!existing || change.timestamp > existing.timestamp) {
            latestByRecord.set(key, change)
            continue
        }

        if (change.timestamp === existing.timestamp) {
            latestByRecord.set(key, {
                ...existing,
                mutations: {
                    ...existing.mutations,
                    ...change.mutations,
                },
            })
        }
    }

    return Array.from(latestByRecord.values())
}

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `sync-crdt:${auth.userId}:${ip}`,
        limit: 30,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase service configuration is missing", code: 500 } },
            { status: 500 }
        )
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        )
    }

    const payload = normalizeSyncPayload(body)
    if (!payload) {
        return NextResponse.json(
            { error: "Invalid CRDT sync payload" },
            { status: 400 }
        )
    }

    const mergedChanges = mergeChanges(payload.changes)
    const serverTimestamp = Date.now()

    if (mergedChanges.length === 0) {
        return NextResponse.json({
            ok: true,
            mergedCount: 0,
            serverTimestamp,
        })
    }

    const rows = mergedChanges.map((change) => ({
        user_id: auth.userId,
        client_id: payload.clientId,
        table_name: change.table,
        record_id: change.recordId,
        logical_ts: change.timestamp,
        payload: change.mutations,
    }))

    const { error } = await supabase
        .from("sync_change_log")
        .upsert(rows, {
            onConflict: "user_id,client_id,table_name,record_id,logical_ts",
            ignoreDuplicates: true,
        })

    if (error) {
        console.error("CRDT sync upsert failed:", error)
        return NextResponse.json(
            { error: { message: "Failed to persist sync changes", code: 500 } },
            { status: 500 }
        )
    }

    return NextResponse.json({
        ok: true,
        mergedCount: rows.length,
        serverTimestamp,
    })
}
