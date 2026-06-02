"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useAuthGuard } from "@/lib/use-auth-guard"
import { AuthGate } from "@/components/auth-gate"
import { acceptTeamInvite, createTeamInvite, getTeamEstimates, getTeamWorkspace, type TeamEstimatesResponse, type TeamWorkspaceResponse } from "@/lib/team"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/toast"
import { Loader2, RefreshCw, Users, Copy, Lock, ArrowRight, UserPlus, FolderKanban, Clock3, ShieldCheck, PlayCircle } from "lucide-react"
import { isEstimatePaidLike } from "@/lib/estimate-payment-state"
import { cn } from "@/lib/utils"

const teamBoxClass = "rounded-lg border border-white/10 bg-slate-950/55 p-4"
const teamMetricClass = "rounded-lg border border-white/10 bg-slate-950/55 px-3 py-2.5"
const teamBadgeClass = "border-white/10 bg-slate-950/65 text-slate-300"
const teamOutlineButtonClass = "border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900 hover:text-white"

type TeamPrimaryAction =
    | {
        kind: "acceptInvite"
        label: string
        description: string
    }
    | {
        kind: "link"
        label: string
        description: string
        href: string
    }

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message
    return fallback
}

function getTeamEstimateStatusTone(status: string) {
    if (status === "paid") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
    if (status === "sent") return "border-sky-400/30 bg-sky-500/10 text-sky-200"
    return "border-amber-400/30 bg-amber-500/10 text-amber-200"
}

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
        const draftCount = sharedEstimates.filter((estimate) => estimate.status === "draft" && !isEstimatePaidLike(estimate)).length
        const sentCount = sharedEstimates.filter((estimate) => estimate.status === "sent" && !isEstimatePaidLike(estimate)).length
        const paidCount = sharedEstimates.filter(isEstimatePaidLike).length
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
    const latestTeamEstimate = sharedEstimates[0] || null
    const primaryTeamAction = useMemo<TeamPrimaryAction>(() => {
        if (hasInviteToken) {
            return {
                kind: "acceptInvite",
                label: "Accept invite",
                description: invitePreview
                    ? `Join as ${invitePreview.role} for ${invitePreview.email}.`
                    : "Join the shared workspace from this invite link.",
            }
        }

        if (!workspace?.hasWorkspace) {
            return {
                kind: "link",
                label: workspace?.eligible ? "Review Team setup" : "See Team plan",
                description: workspace?.eligible
                    ? "Your billing can open a Team workspace; confirm setup and add the first crew member."
                    : "Upgrade or use an invite link before sharing crew estimates.",
                href: "/pricing?plan=team",
            }
        }

        if (canManage && workspace.members.length <= 1) {
            return {
                kind: "link",
                label: "Invite crew",
                description: "Add one teammate so shared quoting is ready before the next job.",
                href: "#invite-crew",
            }
        }

        if (latestTeamEstimate) {
            return {
                kind: "link",
                label: "Open latest",
                description: `Resume ${latestTeamEstimate.clientName || latestTeamEstimate.estimateNumber} in the shared composer.`,
                href: `/new-estimate?teamEstimateId=${encodeURIComponent(latestTeamEstimate.estimateId)}`,
            }
        }

        return {
            kind: "link",
            label: "Start shared quote",
            description: "Create a quote that can sync into this workspace feed.",
            href: "/new-estimate",
        }
    }, [canManage, hasInviteToken, invitePreview, latestTeamEstimate, workspace])

    const handleCopyInvite = async (inviteUrl: string) => {
        await navigator.clipboard.writeText(inviteUrl)
        toast("Team invite copied.", "success")
    }

    const handleCreateInvite = async () => {
        const trimmedInviteEmail = inviteEmail.trim()
        setCreatingInvite(true)
        try {
            const result = await createTeamInvite({
                email: trimmedInviteEmail,
                role: inviteRole,
            })
            setInviteEmail("")
            setInviteRole("member")
            await navigator.clipboard.writeText(result.invite.inviteUrl)
            toast("Team invite created and copied.", "success")
            await load()
        } catch (error: unknown) {
            toast(getErrorMessage(error, "Failed to create invite."), "error")
        } finally {
            setCreatingInvite(false)
        }
    }

    const handleAcceptInvite = async () => {
        if (!inviteToken) return
        setAcceptingInvite(true)
        try {
            const result = await acceptTeamInvite(inviteToken)
            toast(result.deduped ? "Already in this Team workspace." : "Joined Team workspace.", "success")
            await load()
        } catch (error: unknown) {
            toast(getErrorMessage(error, "Failed to accept invite."), "error")
        } finally {
            setAcceptingInvite(false)
        }
    }

    if (!authResolved) {
        return (
            <AuthGate
                loading
                nextPath="/team"
                title="Sign in to open team workspace"
                description="Shared crew quoting, invites, and synced estimates require a SnapQuote account."
            />
        )
    }

    if (!isAuthenticated) {
        return (
            <AuthGate
                loading={false}
                nextPath="/team"
                title="Sign in to open team workspace"
                description="Shared crew quoting, invites, and synced estimates require a SnapQuote account."
            />
        )
    }

    if (loading) {
        return (
            <AuthGate
                loading
                nextPath="/team"
                title="Loading team workspace"
                description="Loading workspace members, shared estimates, and pending invites."
                loadingLabel="Loading team workspace..."
            />
        )
    }

    return (
        <div className="team-console field-app min-h-screen px-4 pb-28 pt-5 text-white">
            <div className="mx-auto max-w-5xl space-y-5">
                <Card className="field-panel overflow-hidden" data-testid="team-command-center">
                    <CardContent className="space-y-4 p-4 sm:p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2.5">
                                <Badge className="w-fit border-white/10 bg-white/10 text-white hover:bg-white/10">
                                    <Users className="mr-1 h-3.5 w-3.5" />
                                    Team Workspace
                                </Badge>
                                <div className="space-y-1.5">
                                    <h1
                                        className="line-clamp-3 break-words text-xl font-semibold leading-tight text-white [overflow-wrap:anywhere] sm:text-3xl"
                                        data-testid="team-workspace-name"
                                    >
                                        {workspace?.hasWorkspace ? (workspace.workspace?.name || "Crew Workspace") : "Shared crew quoting"}
                                    </h1>
                                    <p className="line-clamp-2 max-w-2xl break-words text-xs leading-5 text-slate-300 [overflow-wrap:anywhere] sm:text-sm sm:leading-6">
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
                                <Button variant="outline" size="sm" className={teamOutlineButtonClass} onClick={() => void load()}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                            <div className={teamMetricClass}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Members</p>
                                    <Users className="h-4 w-4 text-slate-400" />
                                </div>
                                <p className="mt-2 text-2xl font-semibold">{workspace?.members.length || 0}</p>
                                <p className="mt-0.5 text-[11px] text-slate-400">Workspace access</p>
                            </div>
                            <div className={teamMetricClass}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Invites</p>
                                    <UserPlus className="h-4 w-4 text-slate-400" />
                                </div>
                                <p className="mt-2 text-2xl font-semibold">{workspace?.pendingInvites.length || 0}</p>
                                <p className="mt-0.5 text-[11px] text-slate-400">Pending crew</p>
                            </div>
                            <div className={teamMetricClass}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Shared</p>
                                    <FolderKanban className="h-4 w-4 text-slate-400" />
                                </div>
                                <p className="mt-2 text-2xl font-semibold">{sharedEstimateMetrics.total}</p>
                                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                    {sharedEstimateMetrics.draftCount} draft · {sharedEstimateMetrics.sentCount} sent · {sharedEstimateMetrics.paidCount} paid
                                </p>
                            </div>
                            <div className={teamMetricClass}>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Latest</p>
                                    <Clock3 className="h-4 w-4 text-slate-400" />
                                </div>
                                <p className="mt-2 line-clamp-2 break-words text-xs font-semibold leading-5 [overflow-wrap:anywhere]">{latestSyncLabel}</p>
                                <p className="mt-0.5 text-[11px] text-slate-400">Cloud activity</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 rounded-lg border border-blue-400/20 bg-blue-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-300/20 bg-blue-500/15 text-blue-100">
                                    <PlayCircle className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/80">Next best action</p>
                                    <p
                                        className="mt-1 line-clamp-3 break-words text-sm font-medium leading-5 text-white [overflow-wrap:anywhere]"
                                        data-testid="team-primary-action-description"
                                    >
                                        {primaryTeamAction.description}
                                    </p>
                                </div>
                            </div>
                            {primaryTeamAction.kind === "acceptInvite" ? (
                                <Button
                                    size="sm"
                                    className="w-full shrink-0 sm:w-auto"
                                    data-testid="team-primary-action"
                                    onClick={() => void handleAcceptInvite()}
                                    disabled={acceptingInvite}
                                >
                                    {acceptingInvite ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    {primaryTeamAction.label}
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            ) : (
                                <Button asChild size="sm" className="w-full shrink-0 sm:w-auto" data-testid="team-primary-action">
                                    <Link href={primaryTeamAction.href}>
                                        {primaryTeamAction.label}
                                        <ArrowRight className="h-4 w-4" />
                                    </Link>
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

            {hasInviteToken && (
                <Card className="field-card border-sky-400/30" id="team-invite-card">
                    <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-sky-100">Team invite detected</p>
                            <p className="break-words text-sm text-sky-200/80 [overflow-wrap:anywhere]">
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
                <Card className="field-card border-dashed" id="team-plan">
                    <CardContent className="space-y-5 py-10 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-slate-950/55">
                            <Lock className="h-7 w-7 text-slate-500" />
                        </div>
                        <div className="space-y-2">
                            <p className="text-xl font-semibold">
                                {workspace?.eligible ? "Your Team workspace is ready to initialize." : "No Team workspace access yet."}
                            </p>
                            <p className="mx-auto max-w-xl text-sm leading-6 text-slate-400">
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
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start" data-testid="team-workbench">
                        <div className="min-w-0 space-y-5" data-testid="team-feed-column">
                            <Card className="field-card" id="shared-estimate-feed" data-testid="shared-estimate-feed">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <CardTitle className="text-lg">Shared Estimate Feed</CardTitle>
                                            <CardDescription className="text-slate-400">
                                                Synced cloud estimates visible across the workspace. Device-local drafts still appear after normal sync.
                                            </CardDescription>
                                        </div>
                                        <Badge variant="outline" className={cn("uppercase", teamBadgeClass)}>
                                            {sharedEstimateMetrics.total} total
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {sharedEstimates.length ? (
                                        sharedEstimates.map((estimate) => {
                                            const estimateStatus = isEstimatePaidLike(estimate) ? "paid" : estimate.status

                                            return (
                                                <div key={estimate.estimateId} className={teamBoxClass}>
                                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                        <div className="min-w-0 space-y-1">
                                                            <p className="line-clamp-2 break-words font-semibold [overflow-wrap:anywhere]">{estimate.clientName || "Client"}</p>
                                                            <p className="line-clamp-2 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">
                                                                {estimate.ownerBusinessName || estimate.ownerUserId} · {estimate.estimateNumber}
                                                            </p>
                                                        </div>
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                "w-fit uppercase",
                                                                getTeamEstimateStatusTone(estimateStatus),
                                                            )}
                                                        >
                                                            {estimateStatus}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="space-y-1">
                                                            <p className="text-lg font-semibold">${estimate.totalAmount.toFixed(2)}</p>
                                                            <p className="line-clamp-2 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">
                                                                Updated {new Date(estimate.updatedAt).toLocaleString()}
                                                            </p>
                                                        </div>
                                                        <Button asChild size="sm" variant="outline" className={teamOutlineButtonClass}>
                                                            <Link href={`/new-estimate?teamEstimateId=${encodeURIComponent(estimate.estimateId)}`}>
                                                                Open in Composer
                                                            </Link>
                                                        </Button>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    ) : (
                                        <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">
                                            No synced team estimates yet.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <div className="min-w-0 space-y-5 lg:sticky lg:top-5" data-testid="team-workspace-panel">
                            <Card className="field-card" id="workspace-access" data-testid="workspace-access">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <ShieldCheck className="h-4 w-4 text-emerald-300" />
                                        Workspace Access
                                    </CardTitle>
                                    <CardDescription className="text-slate-400 lg:hidden">
                                        Keep crew roles, invite state, and workspace access visible in one place.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3 text-slate-300">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Your role</p>
                                            <Badge variant="outline" className={cn("uppercase", teamBadgeClass)}>{workspaceRole}</Badge>
                                        </div>
                                        <p className="mt-2 text-xs leading-4 text-slate-400">
                                            {canManage ? "Invite members and manage workspace access." : "Review the shared estimate feed and open synced estimates."}
                                        </p>
                                    </div>

                                    {canManage ? (
                                        <div className="scroll-mt-24 space-y-3 rounded-lg border border-white/10 bg-slate-950/55 p-3" id="invite-crew" data-testid="invite-crew-panel">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold">Invite a crew member</p>
                                                <p className="text-xs text-slate-400 lg:hidden">
                                                    Invite links are shareable. Teammates sign in and join from the link.
                                                </p>
                                            </div>
                                            <div className="grid gap-2">
                                                <Input
                                                    type="email"
                                                    value={inviteEmail}
                                                    onChange={(event) => setInviteEmail(event.target.value)}
                                                    placeholder="tech@crew.com"
                                                    className="h-10 rounded-lg border-white/10 bg-slate-950/70 text-white placeholder:text-slate-500"
                                                />
                                                <select
                                                    value={inviteRole}
                                                    onChange={(event) => setInviteRole(event.target.value === "admin" ? "admin" : "member")}
                                                    className="flex h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3.5 py-2 text-sm text-white shadow-none transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                                    aria-label="Crew member role"
                                                >
                                                    <option value="member">Member</option>
                                                    <option value="admin">Admin</option>
                                                </select>
                                                <Button className="h-10" onClick={() => void handleCreateInvite()} disabled={creatingInvite || !inviteEmail.trim()}>
                                                    {creatingInvite ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                                                    Create invite
                                                </Button>
                                            </div>
                                        </div>
                                    ) : null}
                                </CardContent>
                            </Card>

                            <Card className="field-card" data-testid="team-members-card">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-lg">Crew Members</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {workspace.members.map((member) => (
                                        <div key={member.userId} className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/55 p-3">
                                            <div className="min-w-0">
                                                <p className="line-clamp-2 break-words font-medium [overflow-wrap:anywhere]">{member.businessName || member.email || member.userId}</p>
                                                <p className="text-xs text-slate-400">
                                                    Joined {new Date(member.joinedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <Badge variant="outline" className={cn("uppercase", teamBadgeClass)}>{member.role}</Badge>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>

                            {workspace.pendingInvites.length > 0 ? (
                                <Card className="field-card" data-testid="team-pending-invites-card">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-lg">Pending Invites</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {workspace.pendingInvites.map((invite) => (
                                            <div key={invite.inviteId} className="space-y-3 rounded-lg border border-white/10 bg-slate-950/55 p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="break-words font-medium [overflow-wrap:anywhere]">{invite.email}</p>
                                                        <p className="text-xs text-slate-400">
                                                            {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <Button variant="outline" size="sm" className={teamOutlineButtonClass} onClick={() => void handleCopyInvite(invite.inviteUrl)}>
                                                        <Copy className="mr-1 h-3 w-3" />
                                                        Copy
                                                    </Button>
                                                </div>
                                                <p className="break-all font-mono text-xs text-slate-500">{invite.inviteUrl}</p>
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
        </div>
    )
}

function TeamPageFallback() {
    return (
        <AuthGate
            loading
            nextPath="/team"
            title="Loading team workspace"
            description="Loading workspace members, shared estimates, and pending invites."
            loadingLabel="Loading team workspace..."
        />
    )
}

export default function TeamPage() {
    return (
        <Suspense fallback={<TeamPageFallback />}>
            <TeamPageContent />
        </Suspense>
    )
}
