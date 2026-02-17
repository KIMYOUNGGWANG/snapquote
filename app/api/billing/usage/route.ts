import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { getUsageSnapshot } from "@/lib/server/usage-quota"

export async function GET(req: Request) {
    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `billing-usage:${ip}`,
        limit: 80,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    const snapshot = await getUsageSnapshot(req)

    if (!snapshot.ok) {
        return NextResponse.json(
            { error: { message: snapshot.error, code: snapshot.status } },
            { status: snapshot.status }
        )
    }

    return NextResponse.json(snapshot.data)
}
