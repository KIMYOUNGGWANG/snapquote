const PRODUCTION_SITE_URL = "https://snapquotes.app"

// Public origin for canonical URLs, sitemap and robots. When NEXT_PUBLIC_SITE_URL is
// missing it falls back to the app URL, then our own production domain, so search
// engines are never pointed at a domain we don't own.
export function getSiteUrl(): string {
    const configured =
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        PRODUCTION_SITE_URL

    return configured.replace(/\/+$/, "")
}
