'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/toast'

interface Automation {
    id: string
    type: string
    is_enabled: boolean
    settings: {
        delay_days?: number
        review_link?: string
    }
}

export function AutomationSettings() {
    const [automations, setAutomations] = useState<Automation[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchAutomations()
    }, [])

    const fetchAutomations = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
            .from('automations')
            .select('*')
            .eq('user_id', user.id)

        if (error) {
            toast("Failed to load settings", "error")
        } else {
            setAutomations(data || [])
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
            const { data, error } = await supabase
                .from('automations')
                .insert({ user_id: user.id, type, is_enabled: enabled, settings: { delay_days: 3 } })
                .select()
                .single()

            if (error) toast("Creation failed", "error")
            else if (data) setAutomations(prev => [...prev, data])
        }
    }

    const updateDelay = async (id: string, days: number) => {
        const { error } = await supabase
            .from('automations')
            .update({ settings: { delay_days: days } })
            .eq('id', id)

        if (error) toast("Update failed", "error")
        else {
            setAutomations(prev => prev.map(a => a.id === id ? { ...a, settings: { ...a.settings, delay_days: days } } : a))
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

    if (loading) return <div>Loading settings...</div>

    const quoteChaser = automations.find(a => a.type === 'quote_chaser')
    const reviewRequest = automations.find(a => a.type === 'review_request')

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Quote Chaser</CardTitle>
                            <CardDescription>Automatically follow up on sent quotes after 3 days.</CardDescription>
                        </div>
                        <Switch
                            checked={quoteChaser?.is_enabled || false}
                            onCheckedChange={(checked) => toggleAutomation('quote_chaser', checked)}
                        />
                    </div>
                </CardHeader>
                {quoteChaser?.is_enabled && (
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <Label htmlFor="chaser-delay">Delay (Days)</Label>
                            <Input
                                id="chaser-delay"
                                type="number"
                                className="w-20"
                                value={quoteChaser.settings.delay_days}
                                onChange={(e) => updateDelay(quoteChaser.id, parseInt(e.target.value))}
                            />
                        </div>
                    </CardContent>
                )}
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Reputation Manager</CardTitle>
                            <CardDescription>Send review requests to customers after payment is received.</CardDescription>
                        </div>
                        <Switch
                            checked={reviewRequest?.is_enabled || false}
                            onCheckedChange={(checked) => toggleAutomation('review_request', checked)}
                        />
                    </div>
                </CardHeader>
                {reviewRequest?.is_enabled && (
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
