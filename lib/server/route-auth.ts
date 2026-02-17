import { NextResponse } from "next/server"
import { createAuthedSupabaseClient, parseBearerToken } from "@/lib/server/supabase-auth"

type RouteAuthSuccess = {
    ok: true
    userId: string
}

type RouteAuthFailure = {
    ok: false
    response: NextResponse
}

export type RouteAuthResult = RouteAuthSuccess | RouteAuthFailure

export async function requireAuthenticatedUser(req: Request): Promise<RouteAuthResult> {
    const token = parseBearerToken(req)
    if (!token) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: { message: "Unauthorized", code: 401 } },
                { status: 401 }
            ),
        }
    }

    const supabase = createAuthedSupabaseClient(token)
    if (!supabase) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: { message: "Supabase is not configured", code: 500 } },
                { status: 500 }
            ),
        }
    }

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: { message: "Unauthorized", code: 401 } },
                { status: 401 }
            ),
        }
    }

    return {
        ok: true,
        userId: user.id,
    }
}
