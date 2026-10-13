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

const AUTH_GUARD_TIMEOUT_MS = 2500

const unauthenticatedState: AuthGuardState = {
    authResolved: true,
    isAuthenticated: false,
    userId: null,
    email: null,
}

function getAuthenticatedState(session: Session): AuthGuardState {
    return {
        authResolved: true,
        isAuthenticated: true,
        userId: session.user.id,
        email: session.user.email ?? null,
    }
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

        const timeout = new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), AUTH_GUARD_TIMEOUT_MS)
        })

        const session = Promise.resolve()
            .then(() => supabase.auth.getSession())
            .then(({ data }) => data.session)
            .catch(() => null)

        void Promise.race([session, timeout]).then((resolvedSession) => {
            if (!active) return
            setState(resolvedSession?.user ? getAuthenticatedState(resolvedSession) : unauthenticatedState)
        })

        return () => {
            active = false
        }
    }, [nextPath])

    return state
}
