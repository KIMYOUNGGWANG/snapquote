"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { History, Users, Settings, Moon, Sun, LogOut, X, FileText, LifeBuoy } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MoreMenuProps {
    children: React.ReactNode
}

export function MoreMenu({ children }: MoreMenuProps) {
    const { theme, setTheme } = useTheme()

    const menuItems = [
        { href: "/clients", label: "Clients", icon: Users, description: "Manage your customer list" },
        { href: "/history", label: "History", icon: History, description: "View past estimates" },
        { href: "/drafts", label: "Drafts", icon: FileText, description: "WIP estimates" },
        { href: "/profile", label: "Settings", icon: Settings, description: "App preferences" },
    ]

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
                        <DialogClose className="opacity-70 hover:opacity-100">
                            <X className="h-5 w-5" />
                        </DialogClose>
                    </DialogHeader>

                    <div className="grid gap-2">
                        {menuItems.map((item) => (
                            <Link
                                key={item.href}
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
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t mt-2 bg-muted/30 rounded-b-2xl">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">Appearance</div>
                        <div className="flex gap-2">
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
