"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { ArrowLeft, Calendar, Clock, FileText, Pause, Play, Search, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { saveTimeEntry, updateTimeEntry, getTimeEntries, deleteTimeEntry, type TimeEntry } from "@/lib/db"
import { saveTimeEntryEstimatePrefill } from "@/lib/time-entry-estimate-prefill"
import { dismissToasts, toast } from "@/components/toast"

function getLocalDateKey(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
}

function formatLoggedDuration(minutes: number): string {
    if (minutes <= 0) return "less than 1m"
    return formatDuration(minutes)
}

function formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatDateLabel(dateKey: string): string {
    const date = new Date(`${dateKey}T12:00:00`)
    if (Number.isNaN(date.getTime())) return dateKey
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export default function TimeTrackingPage() {
    const router = useRouter()
    const [entries, setEntries] = useState<TimeEntry[]>([])
    const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null)
    const [projectName, setProjectName] = useState("")
    const [searchQuery, setSearchQuery] = useState("")
    const [elapsedTime, setElapsedTime] = useState(0)
    const [entryToDelete, setEntryToDelete] = useState<TimeEntry | null>(null)
    const intervalRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        loadEntries()
    }, [])

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
        const active = data.find(e => !e.endTime)
        const completedEntries = data
            .filter(e => e.endTime)
            .sort((a, b) => {
                const timeA = new Date(a.endTime || a.startTime).getTime()
                const timeB = new Date(b.endTime || b.startTime).getTime()
                return timeB - timeA
            })

        setActiveEntry(active || null)
        if (active) {
            setProjectName(active.projectName || "")
        }
        setEntries(completedEntries)
    }

    const handleStart = async () => {
        const now = new Date()
        const dateKey = getLocalDateKey(now)
        const trimmedProjectName = projectName.trim()
        const id = await saveTimeEntry({
            projectName: trimmedProjectName || undefined,
            startTime: now.toISOString(),
            date: dateKey,
        })
        setActiveEntry({
            id,
            projectName: trimmedProjectName || undefined,
            startTime: now.toISOString(),
            date: dateKey,
        })
        setProjectName(trimmedProjectName)
        dismissToasts()
        toast("Timer started.", "success")
    }

    const handleStop = async () => {
        if (!activeEntry) return
        const now = new Date()
        const start = new Date(activeEntry.startTime)
        const duration = Math.floor((now.getTime() - start.getTime()) / 60000)

        await updateTimeEntry({
            ...activeEntry,
            endTime: now.toISOString(),
            duration,
        })

        setActiveEntry(null)
        setProjectName("")
        dismissToasts()
        void loadEntries()
    }

    const confirmDeleteEntry = async () => {
        if (!entryToDelete) return

        await deleteTimeEntry(entryToDelete.id)
        toast("Entry deleted.", "success")
        setEntryToDelete(null)
        loadEntries()
    }

    const startEstimateFromTimeEntry = (entry: TimeEntry) => {
        const didStoreEntry = saveTimeEntryEstimatePrefill(entry)

        if (!didStoreEntry) {
            toast("Time entry could not be loaded for a quote.", "error")
            return
        }

        router.push("/new-estimate?capture=type&time=1")
    }

    const today = getLocalDateKey(new Date())
    const todayTotal = entries
        .filter(e => e.date === today)
        .reduce((sum, e) => sum + (e.duration || 0), 0)

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weeklyTotal = entries
        .filter(e => new Date(e.date) >= weekAgo)
        .reduce((sum, e) => sum + (e.duration || 0), 0)

    const allLoggedTotal = entries.reduce((sum, e) => sum + (e.duration || 0), 0)
    const latestEntry = entries[0]
    const normalizedSearchQuery = searchQuery.trim().toLowerCase()
    const filteredEntries = useMemo(() => {
        if (!normalizedSearchQuery) return entries

        return entries.filter((entry) => {
            const haystack = [
                entry.projectName || "No project",
                entry.date,
                formatDateLabel(entry.date),
                formatLoggedDuration(entry.duration || 0),
                entry.startTime,
                entry.endTime,
            ].join(" ").toLowerCase()

            return haystack.includes(normalizedSearchQuery)
        })
    }, [entries, normalizedSearchQuery])

    const nextActionTitle = activeEntry
        ? "Timer running"
        : latestEntry
            ? "Last labor log is quote-ready"
            : "Start labor capture"
    const nextActionDescription = activeEntry
        ? `${activeEntry.projectName || "This job"} has been running for ${formatElapsed(elapsedTime)}. Stop when labor is ready to save.`
        : latestEntry
            ? `${latestEntry.projectName || "No project"} logged ${formatLoggedDuration(latestEntry.duration || 0)} on ${formatDateLabel(latestEntry.date)}.`
            : "Start a timer, save the labor log, then turn that time into a quote with one tap."
    const nextActionLabel = activeEntry ? "Stop" : latestEntry ? "Quote" : "Start"
    const hasSearch = normalizedSearchQuery.length > 0

    return (
        <div className="time-console field-app min-h-screen px-4 pb-28 pt-5 text-white">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4" data-testid="time-shell">
                <div className="flex items-center gap-3">
                    <Button asChild variant="ghost" size="icon" className="rounded-lg text-slate-300 hover:bg-white/10 hover:text-white">
                        <Link href="/" aria-label="Back to home">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Crew ops</p>
                        <h1 className="text-xl font-semibold text-white">Time Tracking</h1>
                    </div>
                </div>

                <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start" data-testid="time-workbench">
                    <div className="min-w-0 space-y-3" data-testid="time-timer-panel">
                        <section className="field-panel overflow-hidden">
                            <div className="border-b border-white/10 bg-slate-950/60 px-3 py-3 sm:px-4 sm:py-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-500/10 text-blue-200">
                                            <Clock className="h-4 w-4" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current session</p>
                                            <p
                                                className="line-clamp-2 break-words text-sm text-slate-300 [overflow-wrap:anywhere]"
                                                data-testid="time-current-session-project"
                                            >
                                                {activeEntry ? activeEntry.projectName || "No project" : "Ready to start"}
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${activeEntry ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-400"}`}
                                        data-testid="time-timer-status"
                                    >
                                        {activeEntry ? "Running" : "Idle"}
                                    </span>
                                </div>

                                <div className="text-center">
                                    <p className="font-mono text-4xl font-bold leading-[1.25] tracking-tight text-white sm:text-5xl sm:leading-[1.25] lg:text-6xl lg:leading-[1.25]" data-testid="time-elapsed-display">
                                        {formatElapsed(elapsedTime)}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3 p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_12rem] lg:items-center lg:space-y-0 lg:p-4">
                                {!activeEntry && (
                                    <Input
                                        placeholder="Project name (optional)"
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value)}
                                        className="h-11 rounded-lg border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
                                    />
                                )}

                                {activeEntry ? (
                                    <Button
                                        className="h-11 w-full rounded-lg bg-red-600 text-white hover:bg-red-500 lg:col-span-2"
                                        onClick={handleStop}
                                    >
                                        <Pause className="mr-2 h-5 w-5" />
                                        Stop Timer
                                    </Button>
                                ) : (
                                    <Button className="h-11 w-full rounded-lg" onClick={handleStart}>
                                        <Play className="mr-2 h-5 w-5" />
                                        Start Timer
                                    </Button>
                                )}
                            </div>
                        </section>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="field-mini px-2 py-2">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Today</p>
                                <p className="mt-1 text-xl font-bold text-white">{formatDuration(todayTotal)}</p>
                            </div>
                            <div className="field-mini px-2 py-2">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">This week</p>
                                <p className="mt-1 text-xl font-bold text-white">{formatDuration(weeklyTotal)}</p>
                            </div>
                            <div className="field-mini px-2 py-2">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Logged</p>
                                <p className="mt-1 text-xl font-bold text-white">{formatDuration(allLoggedTotal)}</p>
                            </div>
                        </div>
                    </div>

                    <div className="min-w-0 space-y-3 lg:sticky lg:top-5" data-testid="time-insights-panel">
                        <section className="field-card flex items-center justify-between gap-3 p-3" data-testid="time-command-center">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-white/10 bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                                        Next action
                                    </span>
                                    <span className="rounded-full border border-white/10 bg-slate-950/70 px-2 py-0.5 text-[10px] text-slate-400">
                                        {entries.length} saved log{entries.length === 1 ? "" : "s"}
                                    </span>
                                </div>
                                <p className="mt-2 line-clamp-2 break-words text-sm font-semibold text-white [overflow-wrap:anywhere]" data-testid="time-next-action-title">
                                    {nextActionTitle}
                                </p>
                                <p className="mt-1 line-clamp-3 break-words text-xs leading-4 text-slate-400 [overflow-wrap:anywhere]" data-testid="time-next-action-description">
                                    {nextActionDescription}
                                </p>
                            </div>
                            <Button
                                type="button"
                                className="h-10 shrink-0 rounded-lg px-3"
                                onClick={() => {
                                    if (activeEntry) {
                                        void handleStop()
                                        return
                                    }

                                    if (latestEntry) {
                                        startEstimateFromTimeEntry(latestEntry)
                                        return
                                    }

                                    void handleStart()
                                }}
                                data-testid="time-next-action-button"
                            >
                                {activeEntry ? (
                                    <Pause className="h-4 w-4" />
                                ) : latestEntry ? (
                                    <FileText className="h-4 w-4" />
                                ) : (
                                    <Play className="h-4 w-4" />
                                )}
                                {nextActionLabel}
                            </Button>
                        </section>

                        <div className="field-section-title">
                            <span>Recent Entries</span>
                            <Calendar className="h-4 w-4" />
                        </div>

                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search projects or dates"
                                aria-label="Search time entries"
                                className="h-11 rounded-lg border-white/10 bg-slate-950 pl-9 pr-12 text-white placeholder:text-slate-500"
                                data-testid="time-entry-search-input"
                            />
                            {searchQuery ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                                    onClick={() => setSearchQuery("")}
                                    aria-label="Clear time entry search"
                                    data-testid="time-entry-clear-search"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            ) : null}
                        </div>

                        <div className="space-y-2" data-testid="time-entry-list">
                            {entries.length === 0 && (
                                <div className="field-card flex items-center justify-between gap-3 p-3 text-slate-400">
                                    <div className="flex min-w-0 items-center gap-3 text-left">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950/70">
                                            <Clock className="h-5 w-5 opacity-70" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-medium text-white">No time entries yet</p>
                                            <p className="text-xs leading-4 text-slate-500" data-testid="time-empty-state-description">
                                                Track labor, then quote it.
                                            </p>
                                        </div>
                                    </div>
                                    {!activeEntry ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="h-11 min-h-11 shrink-0 rounded-lg px-3"
                                            onClick={handleStart}
                                            data-testid="empty-start-time-button"
                                        >
                                            <Play className="h-4 w-4" />
                                            First timer
                                        </Button>
                                    ) : (
                                        <p className="shrink-0 text-right text-xs leading-5 text-slate-500">
                                            Stop to save
                                        </p>
                                    )}
                                </div>
                            )}

                            {entries.length > 0 && filteredEntries.length === 0 && (
                                <div className="field-card flex items-center justify-between gap-3 p-3 text-slate-400" data-testid="time-entry-empty-search">
                                    <div className="flex min-w-0 items-center gap-3 text-left">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950/70">
                                            <Search className="h-5 w-5 opacity-70" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-medium text-white">No matching entries</p>
                                            <p className="text-xs leading-4 text-slate-500">
                                                Try a project name, date, or duration.
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-10 shrink-0 rounded-lg border-white/10 bg-slate-950/70 text-white hover:bg-slate-900"
                                        onClick={() => setSearchQuery("")}
                                    >
                                        Clear
                                    </Button>
                                </div>
                            )}

                            {filteredEntries.map((entry) => (
                                <div
                                    key={entry.id}
                                    className="field-row grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-3"
                                    data-testid="time-entry-row"
                                >
                                    <div className="min-w-0">
                                        <p
                                            className="line-clamp-3 break-words font-medium leading-5 text-white [overflow-wrap:anywhere]"
                                            data-testid="time-entry-project-name"
                                        >
                                            {entry.projectName || "No project"}
                                        </p>
                                        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500">
                                            <span>{entry.date}</span>
                                            <span className="rounded-md border border-white/10 bg-slate-950/60 px-1.5 py-0.5 font-mono text-slate-300">
                                                {formatLoggedDuration(entry.duration || 0)}
                                            </span>
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-2" data-testid="time-entry-actions">
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="h-10 rounded-lg px-3"
                                            onClick={() => startEstimateFromTimeEntry(entry)}
                                            aria-label={`Start quote from time entry for ${entry.projectName || "untitled project"}`}
                                            data-testid="time-entry-start-estimate-button"
                                        >
                                            <FileText className="h-4 w-4" />
                                            Quote
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-full min-w-10 rounded-lg text-red-300 hover:bg-red-500/10 hover:text-red-200 sm:w-10"
                                            onClick={() => setEntryToDelete(entry)}
                                            aria-label={`Delete time entry for ${entry.projectName || "untitled project"}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <ConfirmDialog
                    open={Boolean(entryToDelete)}
                    onClose={() => setEntryToDelete(null)}
                    onConfirm={confirmDeleteEntry}
                    title={entryToDelete ? `Delete ${entryToDelete.projectName || "this time entry"}?` : "Delete time entry?"}
                    description="This removes the saved time log from this device."
                />
            </div>
        </div>
    )
}
