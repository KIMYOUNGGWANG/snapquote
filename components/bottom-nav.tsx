"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, PlusCircle, Receipt, Bot, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { MoreMenu } from "@/components/more-menu"

export function BottomNav() {
    const pathname = usePathname()

    const links = [
        { href: "/", label: "Home", icon: Home },
        { href: "/receipts", label: "Receipts", icon: Receipt },
        { href: "/new-estimate", label: "New", icon: PlusCircle, isMain: true },
        { href: "/automation", label: "Auto", icon: Bot },
        { href: "more", label: "More", icon: MoreHorizontal, isTrigger: true },
    ]

    return (
        <div className="fixed bottom-6 left-4 right-4 z-50 flex justify-center pointer-events-none">
            <nav className="flex items-center justify-between px-2 py-2 bg-background/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 pointer-events-auto w-full max-w-sm">
                {links.map(({ href, label, icon: Icon, isMain, isTrigger }) => {
                    const isActive = pathname === href

                    if (isMain) {
                        return (
                            <Link
                                key={href}
                                href={href}
                                className="relative -top-6 mx-2"
                            >
                                <div className={cn(
                                    "flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-transform active:scale-95",
                                    "bg-gradient-to-tr from-blue-600 to-blue-400 text-white shadow-blue-500/30"
                                )}>
                                    <PlusCircle className="h-7 w-7" />
                                </div>
                            </Link>
                        )
                    }

                    if (isTrigger) {
                        return (
                            <MoreMenu key="more-menu">
                                <button
                                    className={cn(
                                        "flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300",
                                        "text-muted-foreground hover:text-foreground hover:bg-white/5"
                                    )}
                                >
                                    <Icon className="h-5 w-5 mb-0.5" />
                                    <span className="text-[9px] font-medium">{label}</span>
                                </button>
                            </MoreMenu>
                        )
                    }

                    return (
                        <Link
                            key={href}
                            href={href}
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

