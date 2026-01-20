"use client"

import { useState, useEffect, useRef } from "react"
import { Clock, Play, Pause, Trash2, ArrowLeft, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { saveTimeEntry, updateTimeEntry, getTimeEntries, deleteTimeEntry, type TimeEntry } from "@/lib/db"
import { toast } from "@/components/toast"

export default function TimeTrackingPage() {
    const [entries, setEntries] = useState<TimeEntry[]>([])
    const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null)
    const [projectName, setProjectName] = useState("")
    const [elapsedTime, setElapsedTime] = useState(0) // seconds
    const intervalRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        loadEntries()
    }, [])

    // Timer effect
    useEffect(() => {
        if (activeEntry) {
            intervalRef.current = setInterval(() => {
                const start = new Date(activeEntry.startTime)
                const now = new Date()
                setElapsedTime(Math.floor((now.getTime() - start.getTime()) / 1000))
            }, 1000)
        } else {
            setElapsedTime(0)
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [activeEntry])

    const loadEntries = async () => {
        const data = await getTimeEntries()
        // Find active entry (no endTime)
        const active = data.find(e => !e.endTime)
        setActiveEntry(active || null)
        if (active) {
            setProjectName(active.projectName || "")
        }
        setEntries(data.filter(e => e.endTime).reverse()) // Completed entries, recent first
    }

    const handleStart = async () => {
        const now = new Date()
        const id = await saveTimeEntry({
            projectName: projectName || undefined,
            startTime: now.toISOString(),
            date: now.toISOString().split('T')[0],
        })
        setActiveEntry({
            id,
            projectName: projectName || undefined,
            startTime: now.toISOString(),
            date: now.toISOString().split('T')[0],
        })
        toast("⏱️ Timer started!", "success")
    }

    const handleStop = async () => {
        if (!activeEntry) return
        const now = new Date()
        const start = new Date(activeEntry.startTime)
        const duration = Math.floor((now.getTime() - start.getTime()) / 60000) // minutes

        await updateTimeEntry({
            ...activeEntry,
            endTime: now.toISOString(),
            duration,
        })

        setActiveEntry(null)
        setProjectName("")
        toast(`✅ Logged ${formatDuration(duration)}`, "success")
        loadEntries()
    }

    const handleDelete = async (id: string) => {
        await deleteTimeEntry(id)
        toast("🗑️ Entry deleted", "success")
        loadEntries()
    }

    const formatDuration = (minutes: number): string => {
        const h = Math.floor(minutes / 60)
        const m = minutes % 60
        if (h > 0) return `${h}h ${m}m`
        return `${m}m`
    }

    const formatElapsed = (seconds: number): string => {
        const h = Math.floor(seconds / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        const s = seconds % 60
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }

    // Calculate today's total
    const today = new Date().toISOString().split('T')[0]
    const todayTotal = entries
        .filter(e => e.date === today)
        .reduce((sum, e) => sum + (e.duration || 0), 0)

    // Calculate weekly total
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weeklyTotal = entries
        .filter(e => new Date(e.date) >= weekAgo)
        .reduce((sum, e) => sum + (e.duration || 0), 0)

    return (
        <div className="min-h-screen bg-background p-4 pb-24">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link href="/">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    ⏱️ Time Tracking
                </h1>
            </div>

            {/* Timer Card */}
            <Card className="mb-6">
                <CardContent className="pt-6">
                    {/* Timer Display */}
                    <div className="text-center mb-4">
                        <p className="text-5xl font-mono font-bold">
                            {formatElapsed(elapsedTime)}
                        </p>
                        {activeEntry && (
                            <p className="text-sm text-muted-foreground mt-2">
                                {activeEntry.projectName || "No project"}
                            </p>
                        )}
                    </div>

                    {/* Project Name */}
                    {!activeEntry && (
                        <Input
                            placeholder="Project name (optional)"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            className="mb-4"
                        />
                    )}

                    {/* Start/Stop Button */}
                    {activeEntry ? (
                        <Button
                            className="w-full bg-destructive hover:bg-destructive/90"
                            onClick={handleStop}
                        >
                            <Pause className="h-5 w-5 mr-2" />
                            Stop Timer
                        </Button>
                    ) : (
                        <Button className="w-full" onClick={handleStart}>
                            <Play className="h-5 w-5 mr-2" />
                            Start Timer
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <Card>
                    <CardContent className="pt-4 text-center">
                        <p className="text-sm text-muted-foreground">Today</p>
                        <p className="text-2xl font-bold">{formatDuration(todayTotal)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 text-center">
                        <p className="text-sm text-muted-foreground">This Week</p>
                        <p className="text-2xl font-bold">{formatDuration(weeklyTotal)}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Entries List */}
            <h3 className="font-medium mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Recent Entries
            </h3>
            <div className="space-y-2">
                {entries.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                        <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p>No time entries yet</p>
                    </div>
                )}

                {entries.map((entry) => (
                    <Card key={entry.id}>
                        <CardContent className="py-3 flex items-center justify-between">
                            <div>
                                <p className="font-medium">{entry.projectName || "No project"}</p>
                                <p className="text-xs text-muted-foreground">{entry.date}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-mono font-bold">
                                    {formatDuration(entry.duration || 0)}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive h-8 w-8"
                                    onClick={() => handleDelete(entry.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
