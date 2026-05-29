"use client"

import { useState, type KeyboardEvent, type ReactNode } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MessageSquarePlus, Star, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/toast"
import { cn } from "@/lib/utils"

interface FeedbackModalProps {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    trigger?: ReactNode
    showFloatingTrigger?: boolean
}

export function FeedbackModal({
    open,
    onOpenChange,
    trigger,
    showFloatingTrigger = false,
}: FeedbackModalProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const [rating, setRating] = useState(5)
    const [category, setCategory] = useState("feature")
    const [description, setDescription] = useState("")
    const [loading, setLoading] = useState(false)
    const isControlled = open !== undefined
    const dialogOpen = isControlled ? open : internalOpen
    const setDialogOpen = onOpenChange ?? setInternalOpen
    const focusRating = (nextRating: number) => {
        window.requestAnimationFrame(() => {
            document.getElementById(`feedback-rating-${nextRating}`)?.focus()
        })
    }

    const handleRatingKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentRating: number) => {
        const keyMap: Record<string, number> = {
            ArrowLeft: Math.max(1, currentRating - 1),
            ArrowDown: Math.max(1, currentRating - 1),
            ArrowRight: Math.min(5, currentRating + 1),
            ArrowUp: Math.min(5, currentRating + 1),
            Home: 1,
            End: 5,
        }
        const nextRating = keyMap[event.key]

        if (!nextRating) return

        event.preventDefault()
        setRating(nextRating)
        focusRating(nextRating)
    }

    const handleSubmit = async () => {
        const trimmedDescription = description.trim()

        if (!trimmedDescription) return

        setLoading(true)

        try {
            const {
                data: { session },
            } = await supabase.auth.getSession()

            const response = await fetch("/api/feedback", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    ...(session?.access_token
                        ? { authorization: `Bearer ${session.access_token}` }
                        : {}),
                },
                body: JSON.stringify({
                    type: category,
                    message: trimmedDescription,
                    metadata: {
                        rating,
                        path: typeof window !== "undefined" ? window.location.pathname : "",
                        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
                    },
                }),
            })

            if (!response.ok) {
                const payload = await response.json().catch(() => null)
                const message =
                    typeof payload?.error === "string"
                        ? payload.error
                        : "Failed to submit feedback"
                throw new Error(message)
            }

            toast("Feedback submitted. Thank you.", "success")
            setDialogOpen(false)
            setDescription("")
            setRating(5)
            setCategory("feature")
        } catch (error) {
            console.error("Feedback error:", error)
            toast("Failed to submit feedback. Please try again.", "error")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            {trigger ? (
                <DialogTrigger asChild>{trigger}</DialogTrigger>
            ) : showFloatingTrigger ? (
                <div className="pointer-events-none fixed bottom-24 left-0 right-0 z-[90] mx-auto flex max-w-md justify-end px-4">
                    <DialogTrigger asChild>
                        <Button
                            className="pointer-events-auto rounded-lg shadow-lg"
                            size="icon"
                            aria-label="Send feedback"
                        >
                            <MessageSquarePlus className="h-6 w-6" />
                            <span className="sr-only">Feedback</span>
                        </Button>
                    </DialogTrigger>
                </div>
            ) : null}
            <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border-white/10 bg-slate-950 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Send Feedback</DialogTitle>
                    <DialogDescription>
                        Help us improve SnapQuote. Report a bug or suggest a feature.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-5 py-2">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-200">
                            Rating
                        </Label>
                        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Feedback rating">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    id={`feedback-rating-${star}`}
                                    type="button"
                                    role="radio"
                                    aria-checked={rating === star}
                                    aria-label={`${star} out of 5 stars`}
                                    tabIndex={rating === star ? 0 : -1}
                                    className={cn(
                                        "flex h-11 w-full min-w-11 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                        star <= rating
                                            ? "border-yellow-300/35 bg-yellow-400/10 text-yellow-300"
                                            : "border-white/10 bg-slate-900/80 text-slate-500 hover:border-white/20 hover:text-slate-300"
                                    )}
                                    onClick={() => setRating(star)}
                                    onKeyDown={(event) => handleRatingKeyDown(event, star)}
                                >
                                    <Star className={cn("h-5 w-5", star <= rating && "fill-current")} />
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-200">
                            Category
                        </Label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger aria-label="Feedback category" className="h-12 w-full rounded-lg border-white/10 bg-slate-950/70 text-white">
                                <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="feature">Feature Request</SelectItem>
                                <SelectItem value="bug">Bug Report</SelectItem>
                                <SelectItem value="general">General</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="description" className="text-sm font-medium text-slate-200">
                            Message
                        </Label>
                        <Textarea
                            id="description"
                            className="min-h-28 rounded-lg border-white/10 bg-slate-950/70 text-white placeholder:text-slate-500"
                            placeholder="Tell us what you think..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:justify-stretch sm:space-x-0">
                    <Button
                        type="button"
                        variant="outline"
                        className="rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900"
                        onClick={() => setDialogOpen(false)}
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleSubmit} disabled={loading || !description.trim()} className="rounded-lg">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Submit
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
