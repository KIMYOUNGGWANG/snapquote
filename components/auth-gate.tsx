"use client"

import Link from "next/link"
import { Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"

type AuthGateProps = {
    loading: boolean
    nextPath: string
    title: string
    description: string
    loadingLabel?: string
}

function buildLoginHref(nextPath: string): string {
    const params = new URLSearchParams({ next: nextPath || "/" })
    return `/login?${params.toString()}`
}

export function AuthGate({
    loading,
    nextPath,
    title,
    description,
    loadingLabel = "Checking your session...",
}: AuthGateProps) {
    return (
        <div className="field-app flex min-h-screen items-center justify-center px-4 pb-28 pt-10 text-slate-300">
            <div className="field-panel w-full max-w-sm p-5 text-center" data-testid={loading ? "auth-gate-loading" : "auth-gate-signin"}>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-slate-950 text-slate-200">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                </div>
                <h1 className="mt-4 text-xl font-semibold text-white">{loading ? loadingLabel : title}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
                {!loading && (
                    <div className="mt-5 grid gap-2">
                        <Button asChild className="rounded-lg">
                            <Link href={buildLoginHref(nextPath)} data-testid="auth-gate-signin-link">Sign in</Link>
                        </Button>
                        <Button asChild variant="outline" className="rounded-lg border-white/10 bg-slate-950/60 text-slate-200">
                            <Link href="/">Back to field console</Link>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
