type Bucket = {
    count: number
    resetAt: number
}

const buckets = new Map<string, Bucket>()
let hasLoggedProviderFallback = false
let hasLoggedMissingUpstashConfig = false

interface RateLimitOptions {
    key: string
    limit: number
    windowMs: number
}

interface RateLimitResult {
    allowed: boolean
    remaining: number
    resetAt: number
}

type RateLimitProvider = "memory" | "upstash"

function normalizeProvider(value: string | undefined): RateLimitProvider | null {
    if (!value) return null
    const normalized = value.trim().toLowerCase()
    if (normalized === "memory") return "memory"
    if (normalized === "upstash") return "upstash"
    return null
}

function hasUpstashConfig(): boolean {
    return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

function resolveProvider(): RateLimitProvider {
    const explicit = normalizeProvider(process.env.RATE_LIMIT_PROVIDER)
    if (explicit === "memory") return "memory"
    if (explicit === "upstash") {
        if (hasUpstashConfig()) return "upstash"
        if (!hasLoggedMissingUpstashConfig) {
            hasLoggedMissingUpstashConfig = true
            console.warn("RATE_LIMIT_PROVIDER=upstash but Upstash env vars are missing. Falling back to memory limiter.")
        }
        return "memory"
    }

    return hasUpstashConfig() ? "upstash" : "memory"
}

export function getClientIp(req: Request): string {
    const forwardedFor = req.headers.get("x-forwarded-for")
    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim()
    }

    const realIp = req.headers.get("x-real-ip")
    return realIp?.trim() || "unknown"
}

function getMemoryRateLimit(options: RateLimitOptions): RateLimitResult {
    const now = Date.now()
    const existing = buckets.get(options.key)

    if (!existing || existing.resetAt <= now) {
        buckets.set(options.key, { count: 1, resetAt: now + options.windowMs })
        return {
            allowed: true,
            remaining: options.limit - 1,
            resetAt: now + options.windowMs,
        }
    }

    if (existing.count >= options.limit) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: existing.resetAt,
        }
    }

    existing.count += 1
    buckets.set(options.key, existing)

    return {
        allowed: true,
        remaining: Math.max(0, options.limit - existing.count),
        resetAt: existing.resetAt,
    }
}

function sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 180)
}

async function callUpstash(command: Array<string | number>): Promise<unknown> {
    const baseUrl = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!baseUrl || !token) {
        throw new Error("Upstash config missing")
    }

    const commandPath = command.map((part) => encodeURIComponent(String(part))).join("/")
    const response = await fetch(`${baseUrl}/${commandPath}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
    })

    if (!response.ok) {
        throw new Error(`Upstash request failed: ${response.status}`)
    }

    const payload = await response.json() as { result?: unknown; error?: string }
    if (payload.error) {
        throw new Error(`Upstash error: ${payload.error}`)
    }

    return payload.result
}

async function getUpstashRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
    const now = Date.now()
    const redisKey = `rl:${sanitizeKey(options.key)}`

    const incrementResult = await callUpstash(["INCR", redisKey])
    const count = Number(incrementResult || 0)

    if (!Number.isFinite(count) || count <= 0) {
        throw new Error("Invalid Upstash INCR response")
    }

    if (count === 1) {
        await callUpstash(["PEXPIRE", redisKey, options.windowMs])
    }

    const ttlResult = await callUpstash(["PTTL", redisKey])
    const ttlMs = Number(ttlResult || 0)
    const effectiveTtl = ttlMs > 0 ? ttlMs : options.windowMs

    return {
        allowed: count <= options.limit,
        remaining: count <= options.limit ? Math.max(0, options.limit - count) : 0,
        resetAt: now + effectiveTtl,
    }
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
    const provider = resolveProvider()
    if (provider === "memory") {
        return getMemoryRateLimit(options)
    }

    try {
        return await getUpstashRateLimit(options)
    } catch (error) {
        if (!hasLoggedProviderFallback) {
            hasLoggedProviderFallback = true
            console.error("Upstash rate limiter unavailable. Falling back to in-memory limiter.", error)
        }
        return getMemoryRateLimit(options)
    }
}
