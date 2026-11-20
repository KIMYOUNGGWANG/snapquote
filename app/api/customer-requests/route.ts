import { NextResponse } from "next/server"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { CUSTOMER_REQUEST_COLUMNS, toCustomerRequestSummary } from "@/lib/server/customer-requests"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import type { CustomerRequestSummary } from "@/lib/customer-requests"

/** The signed-in contractor's customer requests, newest first. */
export async function GET(request: Request) {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const supabase = createServiceSupabaseClient()
    if (!supabase) return NextResponse.json({ error: { message: "Not configured", code: 500 } }, { status: 500 })

    const { data, error } = await supabase
        .from("customer_requests")
        .select(CUSTOMER_REQUEST_COLUMNS)
        .eq("user_id", auth.userId)
        .order("created_at", { ascending: false })
        .limit(50)

    if (error) {
        console.error("Failed to load customer requests:", error)
        return NextResponse.json({ error: { message: "Failed to load requests", code: 500 } }, { status: 500 })
    }

    const requests = (Array.isArray(data) ? data : [])
        .map((row) => toCustomerRequestSummary(row as Record<string, unknown>))
        .filter((row): row is CustomerRequestSummary => row !== null)
    return NextResponse.json({ requests })
}
