'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { triggerQuoteRecovery, type QuoteRecoveryResult } from '@/lib/quote-recovery'
import { AlertCircle, CheckCircle2, Eye, Loader2, Play, Send, Star, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Automation {
    id: string
    type: string
    is_enabled: boolean
    settings: {
        first_delay_hours?: number
        second_delay_hours?: number
        delay_days?: number // Legacy support
        review_link?: string
    }
}

export type AutomationStatusSummary = {
    loading: boolean
    missingTable: boolean
    totalBots: number
    enabledCount: number
    quoteChaserEnabled: boolean
    reviewRequestEnabled: boolean
    readyLabel: string
    nextActionLabel: string
    nextActionHref: string
    nextActionCtaLabel: string
}

export const defaultAutomationStatusSummary: AutomationStatusSummary = {
    loading: true,
    missingTable: false,
    totalBots: 2,
    enabledCount: 0,
    quoteChaserEnabled: false,
    reviewRequestEnabled: false,
    readyLabel: 'Loading',
    nextActionLabel: 'Loading bot status...',
    nextActionHref: '#automation-settings',
    nextActionCtaLabel: 'Open',
}

type AutomationSettingsProps = {
    onStatusSummaryChange?: (summary: AutomationStatusSummary) => void
}

function getQuoteChaserDelayDays(settings?: Automation["settings"]) {
    const firstDelayDays = Math.max(
        1,
        Math.round((((settings?.first_delay_hours ?? (settings?.delay_days ? settings.delay_days * 24 : 48)) / 24) * 10)) / 10
    )
    const secondDelayDays = Math.max(
        firstDelayDays + 1,
        Math.round((((settings?.second_delay_hours ?? 168) / 24) * 10)) / 10
    )

    return {
        firstDelayDays,
        secondDelayDays,
    }
}

function getAutomationBadgeClass(enabled: boolean) {
    return enabled
        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/10'
        : 'border-white/10 bg-slate-950/60 text-slate-400 hover:bg-slate-950/60'
}

function formatRecoveryAction(action: QuoteRecoveryResult["action"]) {
    return action.replace(/_/g, ' ')
}

function buildAutomationStatusSummary(input: {
    loading: boolean
    missingTable: boolean
    quoteChaserEnabled: boolean
    reviewRequestEnabled: boolean
}): AutomationStatusSummary {
    const enabledCount = Number(input.quoteChaserEnabled) + Number(input.reviewRequestEnabled)

    if (input.loading) {
        return defaultAutomationStatusSummary
    }

    if (input.missingTable) {
        return {
            loading: false,
            missingTable: true,
            totalBots: 2,
            enabledCount,
            quoteChaserEnabled: input.quoteChaserEnabled,
            reviewRequestEnabled: input.reviewRequestEnabled,
            readyLabel: 'Setup needed',
            nextActionLabel: 'Run the automations migration, then recheck settings',
            nextActionHref: '#automation-settings',
            nextActionCtaLabel: 'Open setup',
        }
    }

    if (!input.quoteChaserEnabled) {
        return {
            loading: false,
            missingTable: false,
            totalBots: 2,
            enabledCount,
            quoteChaserEnabled: false,
            reviewRequestEnabled: input.reviewRequestEnabled,
            readyLabel: `${enabledCount}/2 live`,
            nextActionLabel: 'Turn on Quote Chaser to start quote recovery',
            nextActionHref: '#quote-chaser-card',
            nextActionCtaLabel: 'Open setup',
        }
    }

    if (!input.reviewRequestEnabled) {
        return {
            loading: false,
            missingTable: false,
            totalBots: 2,
            enabledCount,
            quoteChaserEnabled: true,
            reviewRequestEnabled: false,
            readyLabel: `${enabledCount}/2 live`,
            nextActionLabel: 'Add Reputation Manager for paid-job review requests',
            nextActionHref: '#review-manager-card',
            nextActionCtaLabel: 'Open reviews',
        }
    }

    return {
        loading: false,
        missingTable: false,
        totalBots: 2,
        enabledCount,
        quoteChaserEnabled: true,
        reviewRequestEnabled: true,
        readyLabel: '2/2 live',
        nextActionLabel: 'Preview the next recovery batch before sending',
        nextActionHref: '#quote-recovery-copilot',
        nextActionCtaLabel: 'Preview batch',
    }
}

export function AutomationSettings({ onStatusSummaryChange }: AutomationSettingsProps = {}) {
    const [automations, setAutomations] = useState<Automation[]>([])
    const [loading, setLoading] = useState(true)
    const [missingTable, setMissingTable] = useState(false)
    const [recoveryRunning, setRecoveryRunning] = useState(false)
    const [recoveryPreviewed, setRecoveryPreviewed] = useState(false)
    const [recoveryResults, setRecoveryResults] = useState<QuoteRecoveryResult[]>([])
    const [recoveryMode, setRecoveryMode] = useState<'preview' | 'live' | null>(null)
    const [recoveryFeedback, setRecoveryFeedback] = useState<string | null>(null)
    const firstFollowupInputRef = useRef<HTMLInputElement | null>(null)
    const secondFollowupInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        void fetchAutomations()
    }, [])

    const fetchAutomations = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setLoading(false)
            return
        }

        const { data, error } = await supabase
            .from('automations')
            .select('*')
            .eq('user_id', user.id)

        if (error) {
            console.error('Error fetching automations:', error)
            // Determine if error is due to missing table
            if (error.code === '42P01') { // undefined_table
                setMissingTable(true)
                // toast("Setup required: Database migration needed", "error")
            } else {
                toast("Failed to load settings", "error")
            }
        } else {
            setAutomations(data || [])
            setMissingTable(false)
        }
        setLoading(false)
    }

    const toggleAutomation = async (type: string, enabled: boolean) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const existing = automations.find(a => a.type === type)

        if (existing) {
            const { error } = await supabase
                .from('automations')
                .update({ is_enabled: enabled })
                .eq('id', existing.id)

            if (error) toast("Update failed", "error")
            else setAutomations(prev => prev.map(a => a.id === existing.id ? { ...a, is_enabled: enabled } : a))
        } else {
            const defaultSettings = type === 'quote_chaser'
                ? { first_delay_hours: 48, second_delay_hours: 168 }
                : {}

            const { data, error } = await supabase
                .from('automations')
                .insert({ user_id: user.id, type, is_enabled: enabled, settings: defaultSettings })
                .select()
                .single()

            if (error) toast("Creation failed", "error")
            else if (data) setAutomations(prev => [...prev, data])
        }
    }

    const updateQuoteChaserDelays = async (id: string, firstDelayDays: number, secondDelayDays: number) => {
        const firstHours = Math.max(24, Math.round(firstDelayDays * 24))
        const secondHours = Math.max(firstHours + 24, Math.round(secondDelayDays * 24))

        const { error } = await supabase
            .from('automations')
            .update({ settings: { first_delay_hours: firstHours, second_delay_hours: secondHours } })
            .eq('id', id)

        if (error) toast("Update failed", "error")
        else {
            setAutomations(prev =>
                prev.map(a =>
                    a.id === id
                        ? { ...a, settings: { ...a.settings, first_delay_hours: firstHours, second_delay_hours: secondHours } }
                        : a
                )
            )
            toast("Settings updated", "success")
        }
    }

    const updateReviewLink = async (id: string, link: string) => {
        const existing = automations.find(a => a.id === id)
        const { error } = await supabase
            .from('automations')
            .update({ settings: { ...existing?.settings, review_link: link } })
            .eq('id', id)

        if (error) toast("Update failed", "error")
        else {
            setAutomations(prev => prev.map(a => a.id === id ? { ...a, settings: { ...a.settings, review_link: link } } : a))
            toast("Review link saved", "success")
        }
    }

    const quoteChaser = automations.find(a => a.type === 'quote_chaser')
    const reviewRequest = automations.find(a => a.type === 'review_request')
    const quoteChaserDelayDays = getQuoteChaserDelayDays(quoteChaser?.settings)
    const statusSummary = useMemo(
        () => buildAutomationStatusSummary({
            loading,
            missingTable,
            quoteChaserEnabled: Boolean(quoteChaser?.is_enabled),
            reviewRequestEnabled: Boolean(reviewRequest?.is_enabled),
        }),
        [loading, missingTable, quoteChaser?.is_enabled, reviewRequest?.is_enabled]
    )

    useEffect(() => {
        onStatusSummaryChange?.(statusSummary)
    }, [onStatusSummaryChange, statusSummary])

    const commitQuoteChaserDelays = () => {
        if (!quoteChaser) return

        const firstValue = Number(firstFollowupInputRef.current?.value ?? quoteChaserDelayDays.firstDelayDays)
        const secondValue = Number(secondFollowupInputRef.current?.value ?? quoteChaserDelayDays.secondDelayDays)
        if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) return

        void updateQuoteChaserDelays(quoteChaser.id, firstValue, secondValue)
    }

    const runQuoteRecovery = async (dryRun: boolean) => {
        setRecoveryRunning(true)
        setRecoveryMode(dryRun ? 'preview' : 'live')
        setRecoveryFeedback(null)
        try {
            const data = await triggerQuoteRecovery({ dryRun })
            setRecoveryResults(data.results)

            if (dryRun) {
                setRecoveryPreviewed(true)
                setRecoveryFeedback(
                    data.processedCount > 0
                        ? `Preview ready: ${data.processedCount} quote${data.processedCount > 1 ? 's' : ''} eligible for follow-up.`
                        : 'Preview ready: no quotes currently eligible for follow-up.'
                )
                return
            }

            setRecoveryFeedback(
                data.processedCount > 0
                    ? `Quote Recovery sent ${data.processedCount} follow-up${data.processedCount > 1 ? 's' : ''}.`
                    : 'Quote Recovery run finished with no eligible quotes.'
            )
        } catch (error: unknown) {
            console.error('Quote recovery trigger failed:', error)
            toast(error instanceof Error ? error.message : 'Failed to run Quote Recovery.', 'error')
        } finally {
            setRecoveryRunning(false)
        }
    }

    if (loading) {
        return (
            <div className="field-panel flex items-center gap-2 p-4 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading automation settings...
            </div>
        )
    }

    return (
        <div className="space-y-3" id="automation-settings">
            {missingTable && (
                <Alert variant="destructive" className="border-red-400/30 bg-red-950/30 text-red-100">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>설정 필요: 데이터베이스 마이그레이션이 필요합니다</AlertTitle>
                    <AlertDescription className="mt-2 space-y-2">
                        <p>데이터베이스에 <strong>automations</strong> 테이블이 없습니다.</p>
                        <div className="rounded bg-black/10 p-2 font-mono text-xs">
                            <div className="flex items-center gap-2 border-b border-white/10 pb-1 mb-1">
                                <Terminal className="h-3 w-3" />
                                <span>Supabase SQL Editor에서 실행할 SQL:</span>
                            </div>
                            <code className="block whitespace-pre-wrap">
                                {`create table if not exists automations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null,
  is_enabled boolean default false not null,
  settings jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, type)
);

alter table automations enable row level security;

create policy "Users can view own automations" on automations for select using (auth.uid() = user_id);
create policy "Users can insert own automations" on automations for insert with check (auth.uid() = user_id);
create policy "Users can update own automations" on automations for update using (auth.uid() = user_id);`}
                            </code>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full rounded-lg border-white/10 bg-slate-950/60 text-white"
                            onClick={fetchAutomations}
                        >
                            마이그레이션을 실행했습니다, 다시 확인하기
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            <div className="field-panel p-2" data-testid="automation-status-overview">
                <div className="grid grid-cols-3 gap-2">
                    <div className="field-mini flex min-w-0 items-center gap-2 px-2 py-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-500/10">
                            <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Enabled</p>
                            <p className="truncate text-sm font-semibold text-white">{statusSummary.enabledCount}/{statusSummary.totalBots}</p>
                        </div>
                    </div>
                    <div className="field-mini px-2 py-2">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quote</p>
                            <Badge variant="outline" className={cn('h-6 rounded-md px-2 text-[10px] uppercase', getAutomationBadgeClass(statusSummary.quoteChaserEnabled))}>
                                {statusSummary.quoteChaserEnabled ? 'On' : 'Off'}
                            </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-400">Recovery</p>
                    </div>
                    <div className="field-mini px-2 py-2">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reviews</p>
                            <Badge variant="outline" className={cn('h-6 rounded-md px-2 text-[10px] uppercase', getAutomationBadgeClass(statusSummary.reviewRequestEnabled))}>
                                {statusSummary.reviewRequestEnabled ? 'On' : 'Off'}
                            </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-400">After pay</p>
                    </div>
                </div>
            </div>

            <Card
                id="quote-chaser-card"
                data-testid="quote-chaser-card"
                className={`field-card scroll-mt-24 ${missingTable ? 'opacity-50 pointer-events-none' : ''}`}
            >
                <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-400/20 bg-blue-500/10 text-blue-200">
                                <Send className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <CardTitle className="text-base text-white">Quote Chaser</CardTitle>
                                    <Badge variant="outline" className={cn('h-6 rounded-md px-2 text-[10px] uppercase', getAutomationBadgeClass(Boolean(quoteChaser?.is_enabled)))}>
                                        {quoteChaser?.is_enabled ? 'On' : 'Off'}
                                    </Badge>
                                </div>
                                <CardDescription className="mt-1 text-slate-400">Automatically follow up on sent quotes at 48h and 7 days.</CardDescription>
                            </div>
                        </div>
                        <Switch
                            aria-label="Toggle Quote Chaser"
                            checked={quoteChaser?.is_enabled || false}
                            onCheckedChange={(checked) => toggleAutomation('quote_chaser', checked)}
                            disabled={missingTable}
                        />
                    </div>
                </CardHeader>
                {quoteChaser?.is_enabled && quoteChaser?.settings && (
                    <CardContent className="space-y-4 p-4 pt-0">
                        <div className="grid gap-2 sm:grid-cols-[1fr_5rem] sm:items-center">
                            <Label htmlFor="chaser-delay-first" className="text-slate-300">1st Follow-up (Days)</Label>
                            <Input
                                id="chaser-delay-first"
                                type="number"
                                className="rounded-lg border-white/10 bg-slate-950/70 text-white"
                                key={`${quoteChaser.id}-first-${quoteChaserDelayDays.firstDelayDays}`}
                                defaultValue={quoteChaserDelayDays.firstDelayDays}
                                min={1}
                                step={0.5}
                                ref={firstFollowupInputRef}
                                onBlur={commitQuoteChaserDelays}
                            />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_5rem] sm:items-center">
                            <Label htmlFor="chaser-delay-second" className="text-slate-300">2nd Follow-up (Days)</Label>
                            <Input
                                id="chaser-delay-second"
                                type="number"
                                className="rounded-lg border-white/10 bg-slate-950/70 text-white"
                                key={`${quoteChaser.id}-second-${quoteChaserDelayDays.secondDelayDays}`}
                                defaultValue={quoteChaserDelayDays.secondDelayDays}
                                min={2}
                                step={0.5}
                                ref={secondFollowupInputRef}
                                onBlur={commitQuoteChaserDelays}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Recommended: 2 days and 7 days. Second follow-up is sent only if still not paid.
                        </p>

                        <div id="quote-recovery-copilot" className="scroll-mt-24 space-y-3 rounded-lg border border-white/10 bg-slate-950/55 p-4" data-testid="quote-recovery-copilot">
                            <div className="space-y-1">
                                <p className="flex items-center gap-2 text-sm font-medium text-white">
                                    <Eye className="h-4 w-4 text-blue-200" />
                                    Quote Recovery Copilot
                                </p>
                                <p className="text-xs text-slate-400">
                                    Preview the next recovery batch before sending. Live runs are limited to Pro and Team accounts.
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="min-h-11 w-full rounded-lg border-white/10 bg-slate-900/70 text-white sm:w-auto"
                                    onClick={() => void runQuoteRecovery(true)}
                                    disabled={recoveryRunning}
                                    data-testid="quote-recovery-preview-button"
                                >
                                    {recoveryRunning && recoveryMode === 'preview' ? (
                                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                    ) : <Eye className="mr-2 h-3 w-3" />}
                                    Preview Next Batch
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="min-h-11 w-full rounded-lg sm:w-auto"
                                    onClick={() => void runQuoteRecovery(false)}
                                    disabled={recoveryRunning || !recoveryPreviewed}
                                    data-testid="quote-recovery-run-button"
                                >
                                    {recoveryRunning && recoveryMode === 'live' ? (
                                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                    ) : <Play className="mr-2 h-3 w-3" />}
                                    Run Now
                                </Button>
                            </div>

                            {!recoveryPreviewed && (
                                <p className="text-xs text-muted-foreground">
                                    Run one preview first to review message tone and contact channel selection.
                                </p>
                            )}

                            {recoveryFeedback && (
                                <div
                                    className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-100"
                                    data-testid="quote-recovery-feedback"
                                    role="status"
                                >
                                    {recoveryFeedback}
                                </div>
                            )}

                            {recoveryResults.length > 0 && (
                                <div className="space-y-2 rounded-lg border border-white/10 bg-slate-900/70 p-3" data-testid="quote-recovery-results">
                                    <p className="text-xs font-medium text-slate-400">
                                        {recoveryMode === 'live' ? 'Latest live run' : 'Latest preview'}
                                    </p>
                                    <div className="space-y-2">
                                        {recoveryResults.map((result) => (
                                            <div key={`${recoveryMode}-${result.estimateId}`} className="min-w-0 rounded-lg border border-white/10 bg-slate-950/50 p-2 text-sm" data-testid="quote-recovery-result-card">
                                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                                    <span className="min-w-0 break-words font-medium leading-5 text-white [overflow-wrap:anywhere]" data-testid="quote-recovery-result-estimate">
                                                        {result.estimateNumber}
                                                    </span>
                                                    <span className="shrink-0 text-xs uppercase tracking-wide text-slate-500" data-testid="quote-recovery-result-action">
                                                        {formatRecoveryAction(result.action)}
                                                    </span>
                                                </div>
                                                <p className="mt-2 break-words text-xs leading-5 text-slate-400 [overflow-wrap:anywhere]" data-testid="quote-recovery-result-message">
                                                    {result.messagePreview}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                )}
            </Card>

            <Card
                id="review-manager-card"
                data-testid="review-manager-card"
                className={`field-card scroll-mt-24 ${missingTable ? 'opacity-50 pointer-events-none' : ''}`}
            >
                <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-500/10 text-amber-200">
                                <Star className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <CardTitle className="text-base text-white">Reputation Manager</CardTitle>
                                    <Badge variant="outline" className={cn('h-6 rounded-md px-2 text-[10px] uppercase', getAutomationBadgeClass(Boolean(reviewRequest?.is_enabled)))}>
                                        {reviewRequest?.is_enabled ? 'On' : 'Off'}
                                    </Badge>
                                </div>
                                <CardDescription className="mt-1 text-slate-400">Send review requests to customers after payment is received.</CardDescription>
                            </div>
                        </div>
                        <Switch
                            aria-label="Toggle Reputation Manager"
                            checked={reviewRequest?.is_enabled || false}
                            onCheckedChange={(checked) => toggleAutomation('review_request', checked)}
                            disabled={missingTable}
                        />
                    </div>
                </CardHeader>
                {reviewRequest?.is_enabled && reviewRequest?.settings && (
                    <CardContent className="space-y-4 p-4 pt-0">
                        <p className="text-sm text-slate-400">Requests will be sent 24 hours after an estimate is marked as &apos;paid&apos;.</p>
                        <div className="grid gap-2">
                            <Label htmlFor="review-link" className="text-slate-300">Google/Yelp Link</Label>
                            <Input
                                id="review-link"
                                type="url"
                                placeholder="https://g.page/..."
                                className="rounded-lg border-white/10 bg-slate-950/70 text-white"
                                defaultValue={reviewRequest.settings.review_link || ''}
                                onBlur={(e) => updateReviewLink(reviewRequest.id, e.target.value)}
                            />
                        </div>
                    </CardContent>
                )}
            </Card>
        </div>
    )
}
