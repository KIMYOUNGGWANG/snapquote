import { asTrimmedString } from "@/lib/server/quote-recovery-normalization"

export async function parseJsonBody(req: Request): Promise<unknown> {
    const raw = await req.text()
    if (!raw.trim()) return {}
    return JSON.parse(raw)
}

function parseBearerToken(req: Request): string {
    const authHeader = req.headers.get("authorization") || ""
    if (!authHeader.toLowerCase().startsWith("bearer ")) return ""
    return authHeader.slice(7).trim()
}

export function hasValidCronSecret(req: Request): boolean {
    const configured = process.env.CRON_SECRET?.trim() || ""
    if (!configured) return false

    const bearer = parseBearerToken(req)
    const cronHeader = asTrimmedString(req.headers.get("x-cron-secret"), 512)
    return bearer === configured || cronHeader === configured
}
