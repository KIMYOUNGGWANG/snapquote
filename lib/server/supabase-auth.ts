import { createClient } from "@supabase/supabase-js"

export function parseBearerToken(req: Request): string {
    const authHeader = req.headers.get("authorization") || ""
    if (!authHeader.toLowerCase().startsWith("bearer ")) return ""
    return authHeader.slice(7).trim()
}

export function createAuthedSupabaseClient(accessToken: string) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        return null
    }

    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        }
    )
}
