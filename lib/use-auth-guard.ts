"use client"

import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

type AuthGuardState = {
    authResolved: boolean
    isAuthenticated: boolean
    userId: string | null
    email: string | null
}

export function useAuthGuard(nextPath: string): AuthGuardState {
    const [state, setState] = useState<AuthGuardState>({
        authResolved: false,
        isAuthenticated: false,
        userId: null,
        email: null,
    })

    useEffect(() => {
        let active = true

        const fallbackTimer = window.setTimeout(() => {
            if (!active) return
            setState({
                authResolved: true,
                isAuthenticated: false,
                userId: null,
                email: null,
            })
        }, 2500)

        const syncState = (session: Session | null) => {
            if (!active) return
            window.clearTimeout(fallbackTimer)

            if (!session?.user) {
                setState({
                    authResolved: true,
                    isAuthenticated: false,
                    userId: null,
                    email: null,
                })
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
                window.clearTimeout(fallbackTimer)
                setState({
                    authResolved: true,
                isAuthenticated: false,
                userId: null,
                email: null,
            })
        })

        return () => {
            active = false
            window.clearTimeout(fallbackTimer)
        }
    }, [nextPath])

    return state
}
