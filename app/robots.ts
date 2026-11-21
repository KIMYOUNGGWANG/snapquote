import { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
    const siteUrl = getSiteUrl()

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/auth/',
                    '/api/',
                    '/new-estimate',
                    '/profile',
                    '/receipts',
                    '/time-tracking',
                    '/history',
                    '/clients',
                    '/automation',
                    '/payment-success',
                ],
            },
        ],
        sitemap: `${siteUrl}/sitemap.xml`,
    }
}
