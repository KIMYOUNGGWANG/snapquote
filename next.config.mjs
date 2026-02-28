/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        // Security mitigation:
        // disable server-side image optimization path until Next major upgrade.
        unoptimized: true,
        remotePatterns: [],
    },
}

export default nextConfig
