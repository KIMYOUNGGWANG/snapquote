'use client'

import {
    AutomationSettings,
    defaultAutomationStatusSummary,
    type AutomationStatusSummary,
} from '@/components/automation/automation-settings'
import { AuthGate } from '@/components/auth-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthGuard } from '@/lib/use-auth-guard'
import { Activity, ArrowRight, Bot, CheckCircle2, Clock3, PlayCircle, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

type AutomationLog = {
    id: string
    task_type: string | null
    status: string | null
    created_at: string | null
}

function formatTaskType(taskType: string | null) {
    return (taskType || 'Unknown').replace(/_/g, ' ')
}

function getLogStatusClass(status: string | null) {
    if (status === 'completed') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/10'
    if (status === 'failed') return 'border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/10'
    return 'border-amber-400/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/10'
}

export default function AutomationPage() {
    const { authResolved, isAuthenticated } = useAuthGuard('/automation')
    const [logs, setLogs] = useState<AutomationLog[]>([])
    const [automationSummary, setAutomationSummary] = useState<AutomationStatusSummary>(defaultAutomationStatusSummary)

    useEffect(() => {
        if (!authResolved || !isAuthenticated) return

        const fetchLogs = async () => {
            const { data } = await supabase
                .from('job_queue')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10)

            if (data) setLogs(data as AutomationLog[])
        }
        void fetchLogs()
    }, [authResolved, isAuthenticated])

    const handleStatusSummaryChange = useCallback((summary: AutomationStatusSummary) => {
        setAutomationSummary(summary)
    }, [])

    const logMetrics = useMemo(() => {
        const attentionCount = logs.filter((log) => log.status !== 'completed').length
        const latestCreatedAt = logs.reduce<string | null>((latest, log) => {
            if (!log.created_at) return latest
            if (!latest) return log.created_at
            return new Date(log.created_at).getTime() > new Date(latest).getTime() ? log.created_at : latest
        }, null)

        return {
            attentionCount,
            latestLabel: latestCreatedAt ? new Date(latestCreatedAt).toLocaleString() : 'No runs yet',
            latestCompactLabel: latestCreatedAt
                ? new Date(latestCreatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : '--',
        }
    }, [logs])

    if (!authResolved) {
        return (
            <AuthGate
                loading
                nextPath="/automation"
                title="Sign in to run automation"
                description="Quote recovery, review requests, and background logs are tied to your crew account."
            />
        )
    }

    if (!isAuthenticated) {
        return (
            <AuthGate
                loading={false}
                nextPath="/automation"
                title="Sign in to run automation"
                description="Quote recovery, review requests, and background logs are tied to your crew account."
            />
        )
    }

    return (
        <div className="field-app min-h-screen px-4 pb-28 pt-5">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
                <header className="field-panel overflow-hidden p-3 sm:p-5" data-testid="automation-command-center">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-2xl font-semibold tracking-tight text-white">Auto-Pilot</h1>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'rounded-md px-2 text-[10px] uppercase tracking-[0.16em]',
                                        automationSummary.missingTable
                                            ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                                            : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                                    )}
                                >
                                    {automationSummary.readyLabel}
                                </Badge>
                            </div>
                            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                                Keep quote follow-ups and review requests moving after the jobsite visit.
                            </p>
                        </div>
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-blue-600/15 text-blue-200">
                            <Bot className="h-5 w-5" />
                        </div>
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-2">
                        <div className="field-mini min-w-0 px-2 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Live bots</p>
                            <p className="mt-1 text-xl font-semibold text-white">
                                {automationSummary.enabledCount}/{automationSummary.totalBots}
                            </p>
                        </div>
                        <div className="field-mini min-w-0 px-2 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Log</p>
                            <p className="mt-1 text-xl font-semibold text-white">{logs.length}</p>
                        </div>
                        <div className="field-mini min-w-0 px-2 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Needs look</p>
                            <p className="mt-1 text-xl font-semibold text-white">{logMetrics.attentionCount}</p>
                        </div>
                        <div className="field-mini min-w-0 px-2 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Latest</p>
                            <p className="mt-1 text-sm font-semibold leading-6 text-white sm:hidden">{logMetrics.latestCompactLabel}</p>
                            <p className="mt-1 hidden truncate text-sm font-semibold leading-6 text-white sm:block">{logMetrics.latestLabel}</p>
                        </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-blue-400/20 bg-blue-500/10 p-3">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-300/20 bg-blue-500/15 text-blue-100">
                                {automationSummary.missingTable ? <TriangleAlert className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/80">Next best action</p>
                                <p className="mt-1 text-sm font-medium leading-5 text-white">{automationSummary.nextActionLabel}</p>
                            </div>
                        </div>
                        <Button asChild size="sm" className="shrink-0 rounded-lg px-3" data-testid="automation-primary-action">
                            <a href={automationSummary.nextActionHref}>
                                {automationSummary.nextActionCtaLabel}
                                <ArrowRight className="h-4 w-4" />
                            </a>
                        </Button>
                    </div>
                </header>

                <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start" data-testid="automation-workbench">
                    <div className="min-w-0 space-y-3" data-testid="automation-bots-section">
                        <div className="field-section-title">
                            <span>Bots</span>
                            <span>Quote recovery</span>
                        </div>
                        <AutomationSettings onStatusSummaryChange={handleStatusSummaryChange} />
                    </div>

                    <div id="automation-log" className="scroll-mt-24 space-y-3 lg:sticky lg:top-5" data-testid="automation-log-section">
                        <div className="field-section-title">
                            <span>Recent activity</span>
                            <span>{logs.length} entries</span>
                        </div>
                        <div className="field-panel p-4">
                            <div className="mb-4 flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950">
                                    <Activity className="h-5 w-5 text-slate-300" />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-white">Automation Log</h2>
                                    <p className="text-sm text-slate-400">Latest background actions from your bots.</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {logs.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-white/15 bg-slate-950/50 py-10 text-center">
                                        <Clock3 className="mx-auto h-10 w-10 text-slate-500" />
                                        <p className="mt-3 text-sm font-medium text-white">No recent activity</p>
                                        <p className="mt-1 text-xs text-slate-500">Runs will appear here after automation starts.</p>
                                    </div>
                                ) : (
                                    logs.map((log) => (
                                        <div key={log.id} className="field-row">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium capitalize text-white">{formatTaskType(log.task_type)}</p>
                                                <p className="text-xs text-slate-500">{log.created_at ? new Date(log.created_at).toLocaleString() : 'No timestamp'}</p>
                                            </div>
                                            <Badge variant="outline" className={cn('shrink-0 capitalize', getLogStatusClass(log.status))}>
                                                {log.status === 'completed' ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
                                                {log.status || 'pending'}
                                            </Badge>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}
