import { OpenAI } from "openai"
import { NextResponse } from "next/server"
import { buildGenerateSystemPrompt } from "@/lib/ai/generate-prompt"
import {
    buildGeminiGenerateUserParts,
    buildOpenAiGenerateUserContent,
} from "@/lib/ai/generate-provider-parts"
import { requireGeminiText } from "@/lib/ai/gemini"
import { parsePotentialJsonContent } from "@/lib/ai/json"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { parseJsonRequest } from "@/lib/server/request-validation"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { resolveGeneratePlanTier } from "@/lib/server/generate-plan-tier"
import { enforceUsageQuota, recordUsage } from "@/lib/server/usage-quota"
import { generateRequestSchema } from "@/lib/validation/api-schemas"
import { ANONYMOUS_GENERATE_LIMIT } from "@/lib/free-tier"
import { normalizeEstimatePayload } from "@/lib/estimates/normalize"

type ModelGenerationResult = {
    content: string
    promptTokens: number
    completionTokens: number
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

const OPENAI_GENERATE_MODEL = process.env.OPENAI_GENERATE_MODEL?.trim() || "gpt-4o"
const GEMINI_GENERATE_MODEL = process.env.GEMINI_GENERATE_MODEL?.trim() || "gemini-2.5-flash"
const GENERATE_PROVIDER = process.env.GENERATE_AI_PROVIDER?.trim().toLowerCase() || "auto"
const GENERATE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const GENERATE_RATE_LIMIT_MAX = 20
const ANONYMOUS_GENERATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const PRO_TIERS = new Set(["pro", "team"])

function resolveGenerateProvider(): "openai" | "gemini" {
    if (GENERATE_PROVIDER === "openai") {
        return "openai"
    }

    if (GENERATE_PROVIDER === "gemini") {
        return "gemini"
    }

    return process.env.GEMINI_API_KEY?.trim() ? "gemini" : "openai"
}

async function generateWithGemini(params: {
    systemPrompt: string
    notes?: string
    images?: string[]
}): Promise<ModelGenerationResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
        throw new Error("Gemini is not configured. Please add GEMINI_API_KEY.")
    }

    const parts = buildGeminiGenerateUserParts({
        notes: params.notes,
        images: params.images,
    })

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_GENERATE_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            systemInstruction: {
                role: "system",
                parts: [{ text: params.systemPrompt }],
            },
            contents: [
                {
                    role: "user",
                    parts,
                },
            ],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1500,
                responseMimeType: "application/json",
            },
        }),
        cache: "no-store",
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
        const providerMessage =
            typeof payload?.error?.message === "string" && payload.error.message.trim()
                ? payload.error.message.trim()
                : `Gemini request failed (${response.status})`
        throw new Error(providerMessage)
    }

    const content = requireGeminiText(payload)
    return {
        content,
        promptTokens: Number(payload?.usageMetadata?.promptTokenCount || 0),
        completionTokens: Number(payload?.usageMetadata?.candidatesTokenCount || 0),
    }
}

async function generateWithOpenAI(params: {
    systemPrompt: string
    notes?: string
    images?: string[]
}): Promise<ModelGenerationResult> {
    const userMessageContent = buildOpenAiGenerateUserContent({
        notes: params.notes,
        images: params.images,
    })

    const response = await openai.chat.completions.create({
        model: OPENAI_GENERATE_MODEL,
        messages: [
            { role: "system", content: params.systemPrompt },
            {
                role: "user",
                content: userMessageContent,
            },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1500,
    })

    const content = response.choices[0].message.content
    if (!content) {
        throw new Error("No content generated")
    }

    return {
        content,
        promptTokens: Number(response.usage?.prompt_tokens || 0),
        completionTokens: Number(response.usage?.completion_tokens || 0),
    }
}

export async function POST(req: Request) {
    try {
        const parsedPayload = await parseJsonRequest(req, generateRequestSchema)
        if (!parsedPayload.ok) {
            return parsedPayload.response
        }

        const {
            images,
            notes,
            sourceLanguage,
            userProfile,
            projectType,
            workflow = "standard",
            photoContext,
        } = parsedPayload.data

        if (workflow === "photo_estimate" && (!images || images.length === 0)) {
            return NextResponse.json(
                { error: "At least one jobsite photo is required for photo estimate mode." },
                { status: 400 }
            )
        }

        if (workflow === "photo_estimate") {
            const auth = await requireAuthenticatedUser(req)
            if (!auth.ok) {
                return NextResponse.json(
                    { error: "Log in required for photo estimate mode." },
                    { status: 401 }
                )
            }

            const planTierResult = await resolveGeneratePlanTier(auth.userId)
            if (!planTierResult.ok) {
                return NextResponse.json(
                    { error: planTierResult.error },
                    { status: planTierResult.status }
                )
            }

            if (!PRO_TIERS.has(planTierResult.planTier)) {
                return NextResponse.json(
                    { error: "Photo estimate mode requires a Pro or Team plan." },
                    { status: 402 }
                )
            }
        }

        const quota = await enforceUsageQuota(req, "generate", { requireAuth: false })
        if (!quota.ok) {
            return NextResponse.json(
                {
                    error: quota.error || "Free plan limit reached",
                    code: "FREE_PLAN_LIMIT_REACHED",
                    metric: "generate",
                    usage: quota.used,
                    limit: quota.limit,
                },
                { status: quota.status || 402 }
            )
        }

        const ip = getClientIp(req)
        if (quota.isAnonymous && workflow !== "photo_estimate") {
            const anonymousQuota = await checkRateLimit({
                key: `generate:anonymous:${ip}`,
                limit: ANONYMOUS_GENERATE_LIMIT,
                windowMs: ANONYMOUS_GENERATE_WINDOW_MS,
            })

            if (!anonymousQuota.allowed) {
                const used = ANONYMOUS_GENERATE_LIMIT - Math.max(0, anonymousQuota.remaining ?? 0)
                return NextResponse.json(
                    {
                        error: "Anonymous trial limit reached. Sign in to continue generating estimates.",
                        code: "FREE_PLAN_LIMIT_REACHED",
                        metric: "generate",
                        usage: used,
                        limit: ANONYMOUS_GENERATE_LIMIT,
                    },
                    { status: 402 }
                )
            }
        }

        const rateLimit = await checkRateLimit({
            key: `generate:${ip}`,
            limit: GENERATE_RATE_LIMIT_MAX,
            windowMs: GENERATE_RATE_LIMIT_WINDOW_MS,
        })

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: "Too many requests. Please wait and try again." },
                { status: 429 }
            )
        }

        // Use provided userProfile or defaults
        const profile = userProfile || {}
        const systemPrompt = buildGenerateSystemPrompt(
            profile,
            projectType,
            sourceLanguage || "auto",
            workflow,
            photoContext || ""
        )

        const provider = resolveGenerateProvider()
        const modelResult =
            provider === "gemini"
                ? await generateWithGemini({ systemPrompt, notes, images })
                : await generateWithOpenAI({ systemPrompt, notes, images })

        const rawEstimate = parsePotentialJsonContent(modelResult.content)
        const estimate = normalizeEstimatePayload(rawEstimate)

        await recordUsage(quota.context, "generate", {
            promptTokens: modelResult.promptTokens,
            completionTokens: modelResult.completionTokens,
        })

        return NextResponse.json(estimate)
    } catch (error) {
        console.error("Error generating estimate:", error)
        return NextResponse.json(
            { error: "Failed to generate estimate" },
            { status: 500 }
        )
    }
}
