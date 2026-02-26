/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    experimental: {
        esmExternals: "loose",
    },
    images: {
        // Security mitigation:
        // disable server-side image optimization path until Next major upgrade.
        unoptimized: true,
        remotePatterns: [],
    },
}

export default nextConfig
