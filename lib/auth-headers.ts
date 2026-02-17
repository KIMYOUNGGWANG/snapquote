import { supabase } from "@/lib/supabase"

export async function getAccessToken(): Promise<string> {
    try {
        const {
            data: { session },
        } = await supabase.auth.getSession()

        return session?.access_token || ""
    } catch {
        return ""
    }
}

export async function withAuthHeaders(baseHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
    const token = await getAccessToken()
    if (!token) return baseHeaders

    return {
        ...baseHeaders,
        authorization: `Bearer ${token}`,
    }
}
