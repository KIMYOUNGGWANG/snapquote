"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

type AuthGuardState = {
    authResolved: boolean
    isAuthenticated: boolean
    userId: string | null
    email: string | null
}

function buildLoginUrl(nextPath: string): string {
    const params = new URLSearchParams({ next: nextPath || "/" })
    return `/login?${params.toString()}`
}

export function useAuthGuard(nextPath: string): AuthGuardState {
    const router = useRouter()
    const [state, setState] = useState<AuthGuardState>({
        authResolved: false,
        isAuthenticated: false,
        userId: null,
        email: null,
    })

    useEffect(() => {
        let active = true

        const syncState = (session: Session | null) => {
            if (!active) return

            if (!session?.user) {
                setState({
                    authResolved: true,
                    isAuthenticated: false,
                    userId: null,
                    email: null,
                })
                router.replace(buildLoginUrl(nextPath))
                return
            }

            setState({
                authResolved: true,
                isAuthenticated: true,
                userId: session.user.id,
                email: session.user.email ?? null,
            })
        }

        void supabase.auth
            .getSession()
            .then(({ data }) => syncState(data.session))
            .catch(() => {
                if (!active) return
                setState({
                    authResolved: true,
                    isAuthenticated: false,
                    userId: null,
                    email: null,
                })
                router.replace(buildLoginUrl(nextPath))
            })

        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            syncState(session)
        })

        return () => {
            active = false
            data.subscription.unsubscribe()
        }
    }, [nextPath, router])

    return state
}

