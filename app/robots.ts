import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://snapquote.ai'

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/api/',
                    '/new-estimate/',
                    '/profile/',
                    '/receipts/',
                    '/time-tracking/',
                    '/history/',
                    '/clients/',
                    '/automation/',
                    '/payment-success/',
                ],
            },
        ],
        sitemap: `${siteUrl}/sitemap.xml`,
    }
}
