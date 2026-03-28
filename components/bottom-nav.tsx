"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useHaptic } from "@/hooks/use-haptic"
import { History, Home, PlusCircle, Settings, Users } from "lucide-react"
import { cn } from "@/lib/utils"

export function BottomNav(): JSX.Element {
    const pathname = usePathname()
    const haptic = useHaptic()

    const links = [
        { href: "/", label: "Home", icon: Home },
        { href: "/history", label: "History", icon: History },
        { href: "/new-estimate", label: "New", icon: PlusCircle, isMain: true },
        { href: "/clients", label: "Clients", icon: Users },
        { href: "/profile", label: "Profile", icon: Settings },
    ]

    return (
        <div className="fixed bottom-6 left-0 right-0 z-[100] flex justify-center pointer-events-none w-full">
            <nav className="flex items-center justify-between px-2 py-2 mx-auto bg-background/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 pointer-events-auto w-[calc(100%-2rem)] max-w-sm pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
                {links.map(({ href, label, icon: Icon, isMain }) => {
                    const isActive = pathname === href

                    if (isMain) {
                        return (
                            <Link
                                key={href}
                                href={href}
                                aria-label={label}
                                title={label}
                                onClick={() => haptic.medium()}
                                className="relative -top-6 mx-2"
                            >
                                <div className={cn(
                                    "flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-transform active:scale-95",
                                    "bg-gradient-to-tr from-blue-600 to-blue-400 text-white shadow-blue-500/30"
                                )}>
                                    <PlusCircle className="h-7 w-7" />
                                    <span className="sr-only">{label}</span>
                                </div>
                            </Link>
                        )
                    }

                    return (
                        <Link
                            key={href}
                            href={href}
                            onClick={() => haptic.light()}
                            className={cn(
                                "flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300",
                                isActive
                                    ? "text-blue-400 bg-blue-500/10"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                            )}
                        >
                            <Icon className={cn("h-5 w-5 mb-0.5", isActive && "fill-current/20")} />
                            <span className="text-[9px] font-medium">{label}</span>
                        </Link>
                    )
                })}
            </nav>
        </div>
    )
}
