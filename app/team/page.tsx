"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useAuthGuard } from "@/lib/use-auth-guard"
import { acceptTeamInvite, createTeamInvite, getTeamEstimates, getTeamWorkspace, type TeamEstimatesResponse, type TeamWorkspaceResponse } from "@/lib/team"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/toast"
import { Loader2, RefreshCw, Users, Copy, Lock, ArrowRight } from "lucide-react"

export default function TeamPage() {
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
        <div className="max-w-3xl mx-auto space-y-6 px-4 pb-20 pt-6">
            <CardHeader className="px-0">
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <Users className="h-6 w-6" />
                    Team Workspace
                </CardTitle>
                <CardDescription>
                    Invite crew members into one shared workspace and review synced estimates across the team.
                </CardDescription>
            </CardHeader>

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
                    <CardContent className="py-8 text-center space-y-4">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <Lock className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-lg font-semibold">
                                {workspace?.eligible ? "Your Team workspace will be created on first use." : "No Team workspace access yet."}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {workspace?.eligible
                                    ? "Your Team workspace is ready. Refresh this page once if billing just changed."
                                    : "You need the Team plan or a valid invite link to join a shared crew workspace."}
                            </p>
                        </div>
                        <Button asChild>
                            <Link href="/pricing">
                                See Team plan
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-lg">{workspace.workspace?.name}</CardTitle>
                                    <CardDescription>
                                        Role: <span className="font-medium uppercase">{workspaceRole}</span>
                                    </CardDescription>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => void load()}>
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs text-muted-foreground">Members</p>
                                    <p className="text-2xl font-semibold">{workspace.members.length}</p>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs text-muted-foreground">Pending invites</p>
                                    <p className="text-2xl font-semibold">{workspace.pendingInvites.length}</p>
                                </div>
                            </div>

                            {canManage && (
                                <div className="rounded-lg border p-4 space-y-3">
                                    <p className="text-sm font-medium">Invite a crew member</p>
                                    <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                                        <Input
                                            type="email"
                                            value={inviteEmail}
                                            onChange={(event) => setInviteEmail(event.target.value)}
                                            placeholder="tech@crew.com"
                                        />
                                        <select
                                            value={inviteRole}
                                            onChange={(event) => setInviteRole(event.target.value === "admin" ? "admin" : "member")}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        >
                                            <option value="member">Member</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                        <Button onClick={() => void handleCreateInvite()} disabled={creatingInvite || !inviteEmail.trim()}>
                                            {creatingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create invite"}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Invites create a shareable link. Crew members sign in and join from the link.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">Crew Members</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {workspace.members.map((member) => (
                                <div key={member.userId} className="flex items-center justify-between rounded-lg border p-3">
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

                    {workspace.pendingInvites.length > 0 && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg">Pending Invites</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {workspace.pendingInvites.map((invite) => (
                                    <div key={invite.inviteId} className="rounded-lg border p-3 space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="font-medium">{invite.email}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => void handleCopyInvite(invite.inviteUrl)}>
                                                <Copy className="h-3 w-3 mr-1" />
                                                Copy
                                            </Button>
                                        </div>
                                        <p className="text-xs font-mono text-muted-foreground break-all">{invite.inviteUrl}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">Shared Estimate Feed</CardTitle>
                            <CardDescription>
                                This feed shows synced cloud estimates across the workspace. Device-local drafts appear after normal sync.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {estimateFeed?.estimates?.length ? (
                                estimateFeed.estimates.map((estimate) => (
                                    <div key={estimate.estimateId} className="rounded-lg border p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-medium">{estimate.clientName || "Client"}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {estimate.ownerBusinessName || estimate.ownerUserId} · {estimate.estimateNumber}
                                                </p>
                                            </div>
                                            <Badge variant="outline" className="uppercase">{estimate.status}</Badge>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between text-sm">
                                            <span className="font-semibold">${estimate.totalAmount.toFixed(2)}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-muted-foreground">
                                                    Updated {new Date(estimate.updatedAt).toLocaleString()}
                                                </span>
                                                <Button asChild size="sm" variant="outline">
                                                    <Link href={`/new-estimate?teamEstimateId=${encodeURIComponent(estimate.estimateId)}`}>
                                                        Open in Composer
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                                    No synced team estimates yet.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}
