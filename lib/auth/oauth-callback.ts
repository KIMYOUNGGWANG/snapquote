const SAFE_INTENT_PATTERN = /^[a-z0-9_-]{1,48}$/i
const MAX_ERROR_MESSAGE_LENGTH = 180

export function normalizeNextPath(raw: string | null | undefined): string {
    if (!raw) return "/"
    const trimmed = raw.trim()
    if (!trimmed.startsWith("/")) return "/"
    if (trimmed.startsWith("//")) return "/"
    return trimmed
}

export function normalizeIntent(raw: string | null | undefined): string {
    if (!raw) return ""
    const trimmed = raw.trim()
    if (!SAFE_INTENT_PATTERN.test(trimmed)) return ""
    return trimmed
}

export function normalizeOAuthError(raw: string | null | undefined): string {
    const fallback = "OAuth sign-in failed"
    if (!raw) return fallback

    const compact = raw.replace(/\s+/g, " ").trim()
    if (!compact) return fallback
    return compact.slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

export function buildPostAuthRedirectPath(nextPath: string, intent: string): string {
    const normalizedPath = normalizeNextPath(nextPath)
    const normalizedIntent = normalizeIntent(intent)
    const target = new URL(normalizedPath, "https://snapquote.local")

    if (normalizedIntent) {
        target.searchParams.set("intent", normalizedIntent)
    }

    return `${target.pathname}${target.search}${target.hash}`
}

export function buildLoginErrorRedirectPath(nextPath: string, intent: string, errorMessage: string): string {
    const params = new URLSearchParams()
    params.set("next", normalizeNextPath(nextPath))

    const normalizedIntent = normalizeIntent(intent)
    if (normalizedIntent) {
        params.set("intent", normalizedIntent)
    }

    params.set("oauth_error", normalizeOAuthError(errorMessage))
    return `/login?${params.toString()}`
}
