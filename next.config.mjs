import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    devIndicators: false,
    turbopack: {
        root: projectRoot,
    },
    experimental: {
        // Lets e2e tests mock server-side fetches (e.g. the portal's Supabase read). Dev server only.
        testProxy: process.env.NODE_ENV === "development",
    },
    allowedDevOrigins: [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ],
    images: {
        // Security mitigation:
        // disable server-side image optimization path until Next major upgrade.
        unoptimized: true,
        remotePatterns: [],
    },
}

export default nextConfig
