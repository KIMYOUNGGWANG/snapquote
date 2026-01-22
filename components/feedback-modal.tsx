"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MessageSquarePlus, Star, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/toast"


export function FeedbackModal() {
    const [open, setOpen] = useState(false)
    const [rating, setRating] = useState(5)
    const [category, setCategory] = useState("feature")
    const [description, setDescription] = useState("")
    const [loading, setLoading] = useState(false)

    const handleSubmit = async () => {
        if (!description) return

        setLoading(true)


        try {
            const { data: { user } } = await supabase.auth.getUser()

            const { error } = await supabase.from('feedback').insert({
                user_id: user?.id,
                rating,
                category,
                description,
            })

            if (error) throw error

            toast("✅ Feedback submitted! Thank you.", "success")
            setOpen(false)
            setDescription("")
            setRating(5)
            setCategory("feature")
        } catch (error) {
            console.error("Feedback error:", error)
            toast("❌ Failed to submit feedback. Please try again.", "error")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    className="fixed bottom-20 right-4 z-50 rounded-full shadow-lg"
                    size="icon"
                >
                    <MessageSquarePlus className="h-6 w-6" />
                    <span className="sr-only">Feedback</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Send Feedback</DialogTitle>
                    <DialogDescription>
                        Help us improve SnapQuote. Report a bug or suggest a feature.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="rating" className="text-right">
                            Rating
                        </Label>
                        <div className="flex gap-1 col-span-3">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                    key={star}
                                    className={`h-6 w-6 cursor-pointer ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
                                    onClick={() => setRating(star)}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="category" className="text-right">
                            Category
                        </Label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="w-[180px] col-span-3">
                                <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="feature">Feature Request</SelectItem>
                                <SelectItem value="bug">Bug Report</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="description" className="text-right">
                            Message
                        </Label>
                        <Textarea
                            id="description"
                            className="col-span-3"
                            placeholder="Tell us what you think..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" onClick={handleSubmit} disabled={loading || !description}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Submit
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
