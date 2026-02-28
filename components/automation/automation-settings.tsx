'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, Terminal } from 'lucide-react'

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

export function AutomationSettings() {
    const [automations, setAutomations] = useState<Automation[]>([])
    const [loading, setLoading] = useState(true)
    const [firstFollowupDays, setFirstFollowupDays] = useState(2)
    const [secondFollowupDays, setSecondFollowupDays] = useState(7)
    const [missingTable, setMissingTable] = useState(false)

    useEffect(() => {
        fetchAutomations()
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

    useEffect(() => {
        if (!quoteChaser?.settings) return

        const normalizedFirstDelayDays = Math.max(
            1,
            Math.round(((quoteChaser.settings.first_delay_hours
                ?? (quoteChaser.settings.delay_days ? quoteChaser.settings.delay_days * 24 : 48)) / 24) * 10) / 10
        )
        const normalizedSecondDelayDays = Math.max(
            normalizedFirstDelayDays + 1,
            Math.round(((quoteChaser.settings.second_delay_hours ?? 168) / 24) * 10) / 10
        )

        setFirstFollowupDays(normalizedFirstDelayDays)
        setSecondFollowupDays(normalizedSecondDelayDays)
    }, [quoteChaser?.settings, quoteChaser?.settings?.first_delay_hours, quoteChaser?.settings?.second_delay_hours, quoteChaser?.settings?.delay_days])

    if (loading) return <div>Loading settings...</div>

    return (
        <div className="space-y-6">
            {missingTable && (
                <Alert variant="destructive">
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
                            className="w-full mt-2"
                            onClick={fetchAutomations}
                        >
                            마이그레이션을 실행했습니다, 다시 확인하기
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            <Card className={missingTable ? 'opacity-50 pointer-events-none' : ''}>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Quote Chaser</CardTitle>
                            <CardDescription>Automatically follow up on sent quotes at 48h and 7 days.</CardDescription>
                        </div>
                        <Switch
                            checked={quoteChaser?.is_enabled || false}
                            onCheckedChange={(checked) => toggleAutomation('quote_chaser', checked)}
                            disabled={missingTable}
                        />
                    </div>
                </CardHeader>
                {quoteChaser?.is_enabled && quoteChaser?.settings && (
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <Label htmlFor="chaser-delay-first">1st Follow-up (Days)</Label>
                            <Input
                                id="chaser-delay-first"
                                type="number"
                                className="w-20"
                                value={firstFollowupDays}
                                min={1}
                                step={0.5}
                                onChange={(e) => setFirstFollowupDays(Number(e.target.value))}
                                onBlur={(e) => {
                                    const value = Number(e.target.value)
                                    if (!Number.isFinite(value)) return
                                    updateQuoteChaserDelays(quoteChaser.id, value, secondFollowupDays)
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-4">
                            <Label htmlFor="chaser-delay-second">2nd Follow-up (Days)</Label>
                            <Input
                                id="chaser-delay-second"
                                type="number"
                                className="w-20"
                                value={secondFollowupDays}
                                min={2}
                                step={0.5}
                                onChange={(e) => setSecondFollowupDays(Number(e.target.value))}
                                onBlur={(e) => {
                                    const value = Number(e.target.value)
                                    if (!Number.isFinite(value)) return
                                    updateQuoteChaserDelays(quoteChaser.id, firstFollowupDays, value)
                                }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Recommended: 2 days and 7 days. Second follow-up is sent only if still not paid.
                        </p>
                    </CardContent>
                )}
            </Card>

            <Card className={missingTable ? 'opacity-50 pointer-events-none' : ''}>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Reputation Manager</CardTitle>
                            <CardDescription>Send review requests to customers after payment is received.</CardDescription>
                        </div>
                        <Switch
                            checked={reviewRequest?.is_enabled || false}
                            onCheckedChange={(checked) => toggleAutomation('review_request', checked)}
                            disabled={missingTable}
                        />
                    </div>
                </CardHeader>
                {reviewRequest?.is_enabled && reviewRequest?.settings && (
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">Requests will be sent 24 hours after an estimate is marked as &apos;paid&apos;.</p>
                        <div className="flex items-center gap-4">
                            <Label htmlFor="review-link">Google/Yelp Link</Label>
                            <Input
                                id="review-link"
                                type="url"
                                placeholder="https://g.page/..."
                                className="flex-1"
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
