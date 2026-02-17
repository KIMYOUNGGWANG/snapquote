import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
    // Cache pages and static assets for offline use
    runtimeCaching: [
        {
            urlPattern: /^https?.*/, // Cache all HTTP requests
            handler: 'NetworkFirst',
            options: {
                cacheName: 'offlineCache',
                expiration: {
                    maxEntries: 200,
                    maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
                },
            },
        },
    ],
    fallbacks: {
        document: '/~offline', // Optional: offline fallback page
    },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    experimental: {
        esmExternals: 'loose',
    },
};

export default withPWA(nextConfig);
