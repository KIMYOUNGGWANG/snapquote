'use client'

import { AutomationSettings } from '@/components/automation/automation-settings'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AutomationPage() {
    const [logs, setLogs] = useState<any[]>([])

    useEffect(() => {
        const fetchLogs = async () => {
            const { data } = await supabase
                .from('job_queue')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10)

            if (data) setLogs(data)
        }
        fetchLogs()
    }, [])

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-10">
            <header>
                <h1 className="text-3xl font-bold">Auto-Pilot</h1>
                <p className="text-muted-foreground">The &quot;Invisible Office Manager&quot; running in the background.</p>
            </header>

            <section className="grid gap-6 md:grid-cols-2">
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Bots</h2>
                    <AutomationSettings />
                </div>

                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Recent Activity</h2>
                    <Card>
                        <CardHeader>
                            <CardTitle>Automation Log</CardTitle>
                            <CardDescription>Track the latest actions taken by your bots.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {logs.length === 0 ? (
                                    <p className="text-sm text-center py-10 text-muted-foreground">No recent activity.</p>
                                ) : (
                                    logs.map(log => (
                                        <div key={log.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium">{log.task_type.replace('_', ' ')}</p>
                                                <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
                                            </div>
                                            <Badge variant={log.status === 'completed' ? 'default' : 'outline'}>
                                                {log.status}
                                            </Badge>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    )
}
