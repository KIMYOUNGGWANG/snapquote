"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useAuthGuard } from "@/lib/use-auth-guard"
import { acceptTeamInvite, createTeamInvite, getTeamEstimates, getTeamWorkspace, type TeamEstimatesResponse, type TeamWorkspaceResponse } from "@/lib/team"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/toast"
import { Loader2, RefreshCw, Users, Copy, Lock, ArrowRight, UserPlus, FolderKanban, Clock3, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

function TeamPageContent() {
    const { authResolved, isAuthenticated } = useAuthGuard("/team")
    const searchParams = useSearchParams()
    const inviteToken = searchParams.get("invite")?.trim() || ""
    const [loading, setLoading] = useState(true)
    const [workspace, setWorkspace] = useState<TeamWorkspaceResponse | null>(null)
    const [estimateFeed, setEstimateFeed] = useState<TeamEstimatesResponse | null>(null)
    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole] = useState<"admin" | "member">("member")
    const [creatingInvite, setCreatingInvite] = useState(false)
    const [acceptingInvite, setAcceptingInvite] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const workspaceData = await getTeamWorkspace()
            setWorkspace(workspaceData)

            if (workspaceData?.hasWorkspace) {
                const estimatesData = await getTeamEstimates()
                setEstimateFeed(estimatesData)
            } else {
                setEstimateFeed(null)
            }
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!authResolved || !isAuthenticated) return
        void load()
    }, [authResolved, isAuthenticated, load])

    const canManage = Boolean(workspace?.workspace?.canManage)
    const workspaceRole = workspace?.workspace?.role || null
    const hasInviteToken = Boolean(inviteToken)
    const invitePreview = useMemo(() => {
        if (!workspace?.pendingInvites?.length || !inviteToken) return null
        return workspace.pendingInvites.find((invite) => invite.token === inviteToken) || null
    }, [workspace?.pendingInvites, inviteToken])
    const sharedEstimates = useMemo(() => estimateFeed?.estimates ?? [], [estimateFeed?.estimates])
    const sharedEstimateMetrics = useMemo(() => {
        const draftCount = sharedEstimates.filter((estimate) => estimate.status === "draft").length
        const sentCount = sharedEstimates.filter((estimate) => estimate.status === "sent").length
        const paidCount = sharedEstimates.filter((estimate) => estimate.status === "paid").length
        const latestUpdatedAt = sharedEstimates.reduce<string | null>((latest, estimate) => {
            if (!latest) return estimate.updatedAt
            return new Date(estimate.updatedAt).getTime() > new Date(latest).getTime() ? estimate.updatedAt : latest
        }, null)

        return {
            total: sharedEstimates.length,
            draftCount,
            sentCount,
            paidCount,
            latestUpdatedAt,
        }
    }, [sharedEstimates])

    const latestSyncLabel = sharedEstimateMetrics.latestUpdatedAt
        ? new Date(sharedEstimateMetrics.latestUpdatedAt).toLocaleString()
        : "No synced estimates yet"

    const handleCopyInvite = async (inviteUrl: string) => {
        await navigator.clipboard.writeText(inviteUrl)
        toast("🔗 Team invite copied.", "success")
    }

    const handleCreateInvite = async () => {
        setCreatingInvite(true)
        try {
            const result = await createTeamInvite({
                email: inviteEmail,
                role: inviteRole,
            })
            setInviteEmail("")
            setInviteRole("member")
            await navigator.clipboard.writeText(result.invite.inviteUrl)
            toast("✅ Team invite created and copied.", "success")
            await load()
        } catch (error: any) {
            toast(`❌ ${error.message || "Failed to create invite."}`, "error")
        } finally {
            setCreatingInvite(false)
        }
    }

    const handleAcceptInvite = async () => {
        if (!inviteToken) return
        setAcceptingInvite(true)
        try {
            const result = await acceptTeamInvite(inviteToken)
            toast(result.deduped ? "ℹ️ Already in this Team workspace." : "✅ Joined Team workspace.", "success")
            await load()
        } catch (error: any) {
            toast(`❌ ${error.message || "Failed to accept invite."}`, "error")
        } finally {
            setAcceptingInvite(false)
        }
    }

    if (!authResolved || !isAuthenticated || loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-5xl space-y-6 px-4 pb-20 pt-6">
            <Card className="overflow-hidden border-primary/[0.15] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
                <CardContent className="space-y-6 p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-3">
                            <Badge className="w-fit bg-white/10 text-white hover:bg-white/10">
                                <Users className="mr-1 h-3.5 w-3.5" />
                                Team Workspace
                            </Badge>
                            <div className="space-y-2">
                                <h1 className="text-3xl font-semibold tracking-[-0.04em]">
                                    {workspace?.hasWorkspace ? (workspace.workspace?.name || "Crew Workspace") : "Shared crew quoting"}
                                </h1>
                                <p className="max-w-2xl text-sm leading-6 text-slate-300">
                                    Invite crew members, keep one synced estimate feed across the workspace, and move shared drafts into the composer without losing ownership context.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {workspaceRole ? (
                                <Badge variant="secondary" className="bg-white/10 text-white uppercase">
                                    {workspaceRole}
                                </Badge>
                            ) : null}
                            {workspace?.eligible ? (
                                <Badge variant="secondary" className="bg-emerald-500/[0.15] text-emerald-200 hover:bg-emerald-500/[0.15]">
                                    Team billing active
                                </Badge>
                            ) : null}
                            <Button variant="outline" size="sm" className="border-white/[0.15] bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => void load()}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Members</p>
                                <Users className="h-4 w-4 text-slate-400" />
                            </div>
                            <p className="mt-3 text-3xl font-semibold">{workspace?.members.length || 0}</p>
                            <p className="mt-1 text-xs text-slate-400">Crew with workspace access</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Pending invites</p>
                                <UserPlus className="h-4 w-4 text-slate-400" />
                            </div>
                            <p className="mt-3 text-3xl font-semibold">{workspace?.pendingInvites.length || 0}</p>
                            <p className="mt-1 text-xs text-slate-400">Crew still waiting to join</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Shared estimates</p>
                                <FolderKanban className="h-4 w-4 text-slate-400" />
                            </div>
                            <p className="mt-3 text-3xl font-semibold">{sharedEstimateMetrics.total}</p>
                            <p className="mt-1 text-xs text-slate-400">
                                {sharedEstimateMetrics.draftCount} draft · {sharedEstimateMetrics.sentCount} sent · {sharedEstimateMetrics.paidCount} paid
                            </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Latest sync</p>
                                <Clock3 className="h-4 w-4 text-slate-400" />
                            </div>
                            <p className="mt-3 text-sm font-semibold leading-6">{latestSyncLabel}</p>
                            <p className="mt-1 text-xs text-slate-400">Cloud estimate feed activity</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {hasInviteToken && (
                <Card className="border-sky-300/30 bg-sky-50/70">
                    <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-sky-900">Team invite detected</p>
                            <p className="text-sm text-sky-800">
                                {invitePreview
                                    ? `${invitePreview.email} was invited as ${invitePreview.role}.`
                                    : "Join the shared Team workspace linked in this invite."}
                            </p>
                        </div>
                        <Button onClick={() => void handleAcceptInvite()} disabled={acceptingInvite}>
                            {acceptingInvite ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Accept invite
                        </Button>
                    </CardContent>
                </Card>
            )}

            {!workspace?.hasWorkspace ? (
                <Card className="border-dashed">
                    <CardContent className="space-y-5 py-10 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                            <Lock className="h-7 w-7 text-muted-foreground" />
                        </div>
                        <div className="space-y-2">
                            <p className="text-xl font-semibold">
                                {workspace?.eligible ? "Your Team workspace is ready to initialize." : "No Team workspace access yet."}
                            </p>
                            <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">
                                {workspace?.eligible
                                    ? "Workspace bootstrap is available. Refresh once if billing just changed, then invite your first crew member and start sharing synced estimates."
                                    : "You need the Team plan or a valid invite link to join one shared crew workspace."}
                            </p>
                        </div>
                        <Button asChild>
                            <Link href="/pricing?plan=team">
                                See Team plan
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                        <div className="space-y-6">
                            <Card className="border-border/70">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <CardTitle className="text-lg">Shared Estimate Feed</CardTitle>
                                            <CardDescription>
                                                Synced cloud estimates visible across the workspace. Device-local drafts still appear after normal sync.
                                            </CardDescription>
                                        </div>
                                        <Badge variant="outline" className="uppercase">
                                            {sharedEstimateMetrics.total} total
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {sharedEstimates.length ? (
                                        sharedEstimates.map((estimate) => (
                                            <div key={estimate.estimateId} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="space-y-1">
                                                        <p className="font-semibold">{estimate.clientName || "Client"}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {estimate.ownerBusinessName || estimate.ownerUserId} · {estimate.estimateNumber}
                                                        </p>
                                                    </div>
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "w-fit uppercase",
                                                            estimate.status === "paid" && "border-emerald-200 bg-emerald-50 text-emerald-800",
                                                            estimate.status === "sent" && "border-sky-200 bg-sky-50 text-sky-800",
                                                            estimate.status === "draft" && "border-amber-200 bg-amber-50 text-amber-800",
                                                        )}
                                                    >
                                                        {estimate.status}
                                                    </Badge>
                                                </div>
                                                <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="space-y-1">
                                                        <p className="text-lg font-semibold">${estimate.totalAmount.toFixed(2)}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Updated {new Date(estimate.updatedAt).toLocaleString()}
                                                        </p>
                                                    </div>
                                                    <Button asChild size="sm" variant="outline">
                                                        <Link href={`/new-estimate?teamEstimateId=${encodeURIComponent(estimate.estimateId)}`}>
                                                            Open in Composer
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                                            No synced team estimates yet.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-6">
                            <Card className="border-border/70">
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <ShieldCheck className="h-4 w-4" />
                                        Workspace Access
                                    </CardTitle>
                                    <CardDescription>
                                        Keep crew roles, invite state, and workspace access visible in one place.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Your role</p>
                                        <p className="mt-2 text-lg font-semibold uppercase">{workspaceRole}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {canManage ? "You can invite members and manage workspace access." : "You can review the shared estimate feed and open synced estimates."}
                                        </p>
                                    </div>

                                    {canManage ? (
                                        <div className="rounded-2xl border border-border/70 p-4 space-y-3">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold">Invite a crew member</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Invite links are shareable. Teammates sign in and join from the link.
                                                </p>
                                            </div>
                                            <div className="grid gap-3">
                                                <Input
                                                    type="email"
                                                    value={inviteEmail}
                                                    onChange={(event) => setInviteEmail(event.target.value)}
                                                    placeholder="tech@crew.com"
                                                />
                                                <select
                                                    value={inviteRole}
                                                    onChange={(event) => setInviteRole(event.target.value === "admin" ? "admin" : "member")}
                                                    className="flex h-11 w-full rounded-xl border border-input/80 bg-background/80 px-3.5 py-2 text-sm shadow-[0_14px_28px_-22px_rgba(15,23,42,0.8)] transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                                >
                                                    <option value="member">Member</option>
                                                    <option value="admin">Admin</option>
                                                </select>
                                                <Button onClick={() => void handleCreateInvite()} disabled={creatingInvite || !inviteEmail.trim()}>
                                                    {creatingInvite ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                                                    Create invite
                                                </Button>
                                            </div>
                                        </div>
                                    ) : null}
                                </CardContent>
                            </Card>

                            <Card className="border-border/70">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-lg">Crew Members</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {workspace.members.map((member) => (
                                        <div key={member.userId} className="flex items-center justify-between rounded-2xl border border-border/70 p-3">
                                            <div>
                                                <p className="font-medium">{member.businessName || member.email || member.userId}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Joined {new Date(member.joinedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <Badge variant="outline" className="uppercase">{member.role}</Badge>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>

                            {workspace.pendingInvites.length > 0 ? (
                                <Card className="border-border/70">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-lg">Pending Invites</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {workspace.pendingInvites.map((invite) => (
                                            <div key={invite.inviteId} className="rounded-2xl border border-border/70 p-3 space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="font-medium">{invite.email}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <Button variant="outline" size="sm" onClick={() => void handleCopyInvite(invite.inviteUrl)}>
                                                        <Copy className="mr-1 h-3 w-3" />
                                                        Copy
                                                    </Button>
                                                </div>
                                                <p className="text-xs font-mono text-muted-foreground break-all">{invite.inviteUrl}</p>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            ) : null}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

function TeamPageFallback() {
    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    )
}

export default function TeamPage() {
    return (
        <Suspense fallback={<TeamPageFallback />}>
            <TeamPageContent />
        </Suspense>
    )
}
