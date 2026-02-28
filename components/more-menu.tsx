"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { History, Users, Settings, Moon, Sun, LogOut, FileText, LifeBuoy, LogIn, Loader2, Sparkles } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"

interface MoreMenuProps {
    children: React.ReactNode
}

export function MoreMenu({ children }: MoreMenuProps) {
    const { theme, setTheme } = useTheme()
    const pathname = usePathname()
    const [authLoading, setAuthLoading] = useState(true)
    const [userEmail, setUserEmail] = useState<string | null>(null)

    const menuItems = [
        { href: "/clients", label: "Clients", icon: Users, description: "Manage your customer list" },
        { href: "/history", label: "History", icon: History, description: "View past estimates" },
        { href: "/drafts", label: "Drafts", icon: FileText, description: "WIP estimates" },
        { href: "/pricing", label: "Upgrade / Billing", icon: Sparkles, description: "Manage your subscription" },
        { href: "/profile", label: "Settings", icon: Settings, description: "App preferences" },
    ]

    const loginHref = useMemo(() => {
        const params = new URLSearchParams({ next: pathname || "/" })
        return `/login?${params.toString()}`
    }, [pathname])

    useEffect(() => {
        let active = true

        void supabase.auth.getSession().then(({ data }) => {
            if (!active) return
            setUserEmail(data.session?.user?.email ?? null)
            setAuthLoading(false)
        })

        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!active) return
            setUserEmail(session?.user?.email ?? null)
            setAuthLoading(false)
        })

        return () => {
            active = false
            data.subscription.unsubscribe()
        }
    }, [])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        window.location.href = "/"
    }

    const handleRestartTutorial = () => {
        // Clear onboarding flag to trigger modal on reload
        localStorage.removeItem("snapquote_onboarding_completed")
        window.location.href = "/"
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="fixed bottom-4 left-4 right-4 z-50 w-auto rounded-2xl border bg-background p-0 shadow-2xl translate-x-0 translate-y-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottomtop-auto top-auto md:max-w-sm md:mx-auto">
                <div className="p-4 pb-0">
                    <DialogHeader className="flex flex-row items-center justify-between mb-4">
                        <DialogTitle className="text-lg font-semibold">Menu</DialogTitle>
                    </DialogHeader>

                    <div className="rounded-xl border bg-muted/30 p-3 mb-3">
                        {authLoading ? (
                            <p className="text-xs text-muted-foreground flex items-center gap-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Checking account...
                            </p>
                        ) : userEmail ? (
                            <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">
                                    Signed in as <span className="font-medium text-foreground">{userEmail}</span>
                                </p>
                                <DialogClose asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={handleSignOut}
                                    >
                                        <LogOut className="h-4 w-4 mr-2" />
                                        Sign Out
                                    </Button>
                                </DialogClose>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">
                                    Not signed in yet. First login email automatically creates your account.
                                </p>
                                <DialogClose asChild>
                                    <Button className="w-full justify-start">
                                        <Link href={loginHref} className="flex items-center w-full">
                                            <LogIn className="h-4 w-4 mr-2" />
                                            Sign In / Sign Up
                                        </Link>
                                    </Button>
                                </DialogClose>
                            </div>
                        )}
                    </div>

                    <div className="grid gap-2">
                        {menuItems.map((item) => (
                            <DialogClose asChild key={item.href}>
                                <Link
                                    href={item.href}
                                    className="flex items-center p-3 rounded-xl hover:bg-muted transition-colors"
                                >
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mr-4">
                                        <item.icon className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-medium">{item.label}</div>
                                        <div className="text-xs text-muted-foreground">{item.description}</div>
                                    </div>
                                </Link>
                            </DialogClose>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t mt-2 bg-muted/30 rounded-b-2xl">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Appearance</div>
                        <div className="flex gap-2">
                            <DialogClose asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 px-0"
                                    onClick={handleRestartTutorial}
                                    title="Restart Tutorial"
                                >
                                    <LifeBuoy className="h-4 w-4" />
                                    <span className="sr-only">Restart Tutorial</span>
                                </Button>
                            </DialogClose>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 px-0"
                                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            >
                                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                                <span className="sr-only">Toggle theme</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
