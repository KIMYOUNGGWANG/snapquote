import { NextResponse } from "next/server"
import { ZodError, type ZodType } from "zod"

type ValidationFailureOptions = {
    fallbackMessage?: string
    statusByMessage?: Record<string, number>
}

type ValidationSuccess<T> = {
    ok: true
    data: T
}

type ValidationFailure = {
    ok: false
    response: NextResponse
}

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

function resolveValidationMessage(error: ZodError, fallbackMessage: string): string {
    const issue = error.issues[0]
    if (!issue) return fallbackMessage

    if (issue.code === "unrecognized_keys") {
        return fallbackMessage
    }

    const message = issue.message?.trim()
    if (!message || message === "Invalid input") {
        return fallbackMessage
    }

    return message
}

function buildValidationFailure(
    error: ZodError,
    options: ValidationFailureOptions = {}
): ValidationFailure {
    const fallbackMessage = options.fallbackMessage || "Invalid request payload"
    const errorMessage = resolveValidationMessage(error, fallbackMessage)
    const status = options.statusByMessage?.[errorMessage] || 400

    return {
        ok: false,
        response: NextResponse.json(
            {
                error: errorMessage,
            },
            {
                status,
            }
        ),
    }
}

export async function parseJsonRequest<T>(
    req: Request,
    schema: ZodType<T>,
    options: ValidationFailureOptions = {}
): Promise<ValidationResult<T>> {
    let payload: unknown
    try {
        payload = await req.json()
    } catch {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Invalid JSON payload" },
                { status: 400 }
            ),
        }
    }

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
        return buildValidationFailure(parsed.error, options)
    }

    return {
        ok: true,
        data: parsed.data,
    }
}

export function parseFormDataPayload<T>(
    input: unknown,
    schema: ZodType<T>,
    options: ValidationFailureOptions = {}
): ValidationResult<T> {
    const parsed = schema.safeParse(input)
    if (!parsed.success) {
        return buildValidationFailure(parsed.error, options)
    }

    return {
        ok: true,
        data: parsed.data,
    }
}
