"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Users, Plus, Trash2, ArrowLeft, Search, Phone, Mail, MapPin, UserRound, ClipboardList, Pencil, FileText, X, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { saveClient, getClients, deleteClient, type Client } from "@/lib/db"
import { saveClientEstimatePrefill } from "@/lib/client-estimate-prefill"
import { dismissToasts, toast } from "@/components/toast"

export default function ClientsPage() {
    const router = useRouter()
    const [clients, setClients] = useState<Client[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingClient, setEditingClient] = useState<Client | null>(null)
    const [clientToDelete, setClientToDelete] = useState<Client | null>(null)
    const [formData, setFormData] = useState<Partial<Client>>({})
    const [isHydrated, setIsHydrated] = useState(false)
    const [recentlySavedClientId, setRecentlySavedClientId] = useState<string | null>(null)

    const loadClients = useCallback(async () => {
        const data = await getClients()
        setClients(data.sort((a, b) => a.name.localeCompare(b.name)))
    }, [])

    useEffect(() => {
        setIsHydrated(true)
    }, [])

    useEffect(() => {
        void loadClients()
    }, [loadClients])

    const handleSave = useCallback(async () => {
        const name = formData.name?.trim() || ""

        if (!name) {
            toast("Client name is required", "error")
            return
        }

        const savedClientId = await saveClient({
            id: editingClient?.id,
            name,
            email: formData.email?.trim() || undefined,
            phone: formData.phone?.trim() || undefined,
            address: formData.address?.trim() || undefined,
            notes: formData.notes?.trim() || undefined,
        })

        dismissToasts()
        setRecentlySavedClientId(savedClientId)
        setIsDialogOpen(false)
        setEditingClient(null)
        setFormData({})
        void loadClients()
    }, [editingClient, formData, loadClients])

    const startEdit = useCallback((client: Client) => {
        setEditingClient(client)
        setFormData(client)
        setIsDialogOpen(true)
    }, [])

    const startAdd = useCallback(() => {
        setEditingClient(null)
        setFormData({})
        setIsDialogOpen(true)
    }, [])

    const requestDelete = useCallback((client: Client, event: React.MouseEvent) => {
        event.stopPropagation()
        setClientToDelete(client)
    }, [])

    const confirmDelete = useCallback(async () => {
        if (!clientToDelete) return

        await deleteClient(clientToDelete.id)
        setRecentlySavedClientId((savedClientId) => savedClientId === clientToDelete.id ? null : savedClientId)
        toast("Client deleted", "success")
        setClientToDelete(null)
        void loadClients()
    }, [clientToDelete, loadClients])

    const startEstimateForClient = useCallback((client: Client) => {
        const didStoreClient = saveClientEstimatePrefill(client)

        if (!didStoreClient) {
            toast("Client could not be loaded for a quote.", "error")
            return
        }

        dismissToasts()
        router.push("/new-estimate?capture=type&client=1")
    }, [router])

    const filteredClients = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return clients

        return clients.filter((client) =>
            client.name.toLowerCase().includes(query) ||
            client.phone?.toLowerCase().includes(query) ||
            client.email?.toLowerCase().includes(query) ||
            client.address?.toLowerCase().includes(query) ||
            client.notes?.toLowerCase().includes(query)
        )
    }, [clients, searchQuery])

    const clientsWithContact = useMemo(() => {
        return clients.filter((client) => Boolean(client.phone?.trim() || client.email?.trim())).length
    }, [clients])

    const clientsWithAddress = useMemo(() => {
        return clients.filter((client) => Boolean(client.address?.trim())).length
    }, [clients])

    const canSaveClient = Boolean(formData.name?.trim())
    const hasActiveSearch = searchQuery.trim().length > 0
    const hasNoClients = clients.length === 0
    const hasNoSearchMatches = clients.length > 0 && filteredClients.length === 0
    const nextQuoteClient = filteredClients.find((client) => Boolean(client.address?.trim())) || filteredClients[0] || null

    return (
        <div className="field-app min-h-screen px-4 pb-28 pt-5">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
                <header className="field-panel space-y-4 p-4 sm:p-5" data-testid="clients-summary-panel">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <Button asChild variant="ghost" size="icon" className="h-11 min-h-11 min-w-11 w-11 rounded-lg border border-white/10 bg-slate-950/50">
                                <Link href="/" aria-label="Back to home">
                                    <ArrowLeft className="h-5 w-5" />
                                </Link>
                            </Button>
                            <div>
                                <h1 className="text-2xl font-semibold tracking-tight text-white">Clients</h1>
                                <p className="text-sm text-slate-400">Fast customer lookup before a quote.</p>
                            </div>
                        </div>
                        <Button type="button" onClick={startAdd} disabled={!isHydrated} className="h-10 rounded-lg px-3">
                            <Plus className="h-4 w-4" />
                            New
                        </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 lg:hidden">
                        <div className="field-mini">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Saved</p>
                            <p className="mt-1 text-xl font-semibold text-white">{clients.length}</p>
                        </div>
                        <div className="field-mini">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reachable</p>
                            <p className="mt-1 text-xl font-semibold text-white">{clientsWithContact}</p>
                        </div>
                        <div className="field-mini">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Addressed</p>
                            <p className="mt-1 text-xl font-semibold text-white">{clientsWithAddress}</p>
                        </div>
                    </div>
                </header>

                <div
                    className="grid w-full min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
                    data-testid="clients-workbench"
                >
                <div className="order-2 min-w-0 space-y-4 lg:order-1" data-testid="clients-directory-column">
                <section className="field-panel w-full min-w-0 p-3" data-testid="clients-search-panel">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <Input
                            placeholder="Search clients, addresses, notes"
                            className="h-12 rounded-lg border-white/10 bg-slate-950/70 pl-10 pr-12 text-white placeholder:text-slate-500"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            data-testid="client-search-input"
                        />
                        {hasActiveSearch ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                                onClick={() => setSearchQuery("")}
                                aria-label="Clear client search"
                                data-testid="client-search-clear"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        ) : null}
                    </div>
                </section>

                <section className="w-full min-w-0 space-y-3" data-testid="clients-list-section">
                    <div className="field-section-title">
                        <span>Client list</span>
                        <span data-testid="client-list-count">
                            {hasActiveSearch ? `${filteredClients.length} of ${clients.length} shown` : `${filteredClients.length} shown`}
                        </span>
                    </div>

                    {hasNoClients && (
                        <div className="field-panel px-5 py-12 text-center">
                            <Users className="mx-auto h-11 w-11 text-slate-500" />
                            <p className="mt-4 font-semibold text-white">No clients found</p>
                            <p className="mx-auto mt-1 max-w-60 text-sm leading-6 text-slate-400">Add a customer once, then reuse them from the truck.</p>
                            <Button
                                type="button"
                                className="mt-5 h-10 rounded-lg px-4"
                                onClick={startAdd}
                                disabled={!isHydrated}
                                data-testid="empty-add-client-button"
                            >
                                <Plus className="h-4 w-4" />
                                Add client
                            </Button>
                        </div>
                    )}

                    {hasNoSearchMatches && (
                        <div className="field-panel px-5 py-10 text-center" data-testid="client-search-empty-state">
                            <Search className="mx-auto h-11 w-11 text-slate-500" />
                            <p className="mt-4 font-semibold text-white">No matching clients</p>
                            <p className="mx-auto mt-1 max-w-64 text-sm leading-6 text-slate-400">
                                No saved customer matches &ldquo;{searchQuery.trim()}&rdquo;.
                            </p>
                            <div className="mt-5 grid gap-2 sm:flex sm:justify-center">
                                <Button
                                    type="button"
                                    className="h-10 rounded-lg px-4"
                                    onClick={() => setSearchQuery("")}
                                    data-testid="client-search-empty-clear"
                                >
                                    <X className="h-4 w-4" />
                                    Clear search
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-10 rounded-lg border-white/10 bg-slate-950/70 px-4 text-slate-200 hover:bg-slate-900 hover:text-white"
                                    onClick={startAdd}
                                    disabled={!isHydrated}
                                >
                                    <Plus className="h-4 w-4" />
                                    Add client
                                </Button>
                            </div>
                        </div>
                    )}

                    {filteredClients.map((client) => {
                        const initials = client.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase() || "CL"
                        const hasContact = Boolean(client.phone?.trim() || client.email?.trim())
                        const hasAddress = Boolean(client.address?.trim())
                        const quoteReadiness = hasAddress
                            ? "Quote ready"
                            : hasContact
                                ? "Needs address"
                                : "Needs contact"

                        const wasRecentlySaved = recentlySavedClientId === client.id

                        return (
                            <div
                                key={client.id}
                                className="field-card w-full p-4 text-left transition-colors hover:border-blue-400/35 hover:bg-slate-900"
                                data-testid="client-card"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950 text-sm font-semibold text-slate-200">
                                        {initials}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h3
                                                    className="line-clamp-3 break-words text-base font-semibold leading-tight text-white [overflow-wrap:anywhere]"
                                                    data-testid="client-card-name"
                                                >
                                                    {client.name}
                                                </h3>
                                                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                                                    <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-300">
                                                        <UserRound className="h-3 w-3" />
                                                        {quoteReadiness}
                                                    </span>
                                                    {hasContact ? (
                                                        <span className="rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-2 py-1 text-emerald-200">
                                                            Contact saved
                                                        </span>
                                                    ) : null}
                                                    {hasAddress ? (
                                                        <span className="rounded-lg border border-blue-300/25 bg-blue-500/10 px-2 py-1 text-blue-200">
                                                            Address saved
                                                        </span>
                                                    ) : null}
                                                    {wasRecentlySaved ? (
                                                        <span
                                                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-emerald-100"
                                                            data-testid="client-recent-status"
                                                        >
                                                            <CheckCircle2 className="h-3 w-3" />
                                                            Just saved
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="rounded-lg text-slate-500 hover:text-blue-200"
                                                    onClick={() => startEdit(client)}
                                                    aria-label={`Edit ${client.name}`}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="shrink-0 rounded-lg text-slate-500 hover:text-red-200"
                                                    onClick={(event) => requestDelete(client, event)}
                                                    aria-label={`Delete ${client.name}`}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        <Button
                                            type="button"
                                            className="mt-3 h-10 w-full rounded-lg"
                                            onClick={() => startEstimateForClient(client)}
                                            aria-label={`Start quote for ${client.name}`}
                                            data-testid="client-start-estimate-button"
                                        >
                                            <FileText className="h-4 w-4" />
                                            Start Quote
                                        </Button>

                                        <div className="mt-3 grid gap-2 text-sm text-slate-300">
                                            {client.phone && (
                                                <div className="flex min-w-0 items-start gap-2">
                                                    <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                                                    <span className="truncate">{client.phone}</span>
                                                </div>
                                            )}
                                            {client.email && (
                                                <div className="flex min-w-0 items-start gap-2">
                                                    <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                                                    <span className="line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere]">{client.email}</span>
                                                </div>
                                            )}
                                            {client.address && (
                                                <div className="flex min-w-0 items-start gap-2">
                                                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                                                    <span className="line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere]">{client.address}</span>
                                                </div>
                                            )}
                                            {client.notes && (
                                                <div className="flex min-w-0 items-start gap-2">
                                                    <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                                                    <span className="line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere]">{client.notes}</span>
                                                </div>
                                            )}
                                        </div>

                                        {client.phone || client.email ? (
                                            <div
                                                className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between"
                                                data-testid="client-card-actions"
                                            >
                                                {client.phone ? (
                                                    <Button
                                                        asChild
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-10 rounded-lg border-white/10 bg-slate-950/70 text-slate-200 hover:bg-slate-900 hover:text-white"
                                                    >
                                                        <a href={`tel:${client.phone}`} aria-label={`Call ${client.name}`}>
                                                            <Phone className="h-4 w-4" />
                                                            Call
                                                        </a>
                                                    </Button>
                                                ) : null}
                                                {client.email ? (
                                                    <Button
                                                        asChild
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-10 rounded-lg border-white/10 bg-slate-950/70 text-slate-200 hover:bg-slate-900 hover:text-white"
                                                    >
                                                        <a href={`mailto:${client.email}`} aria-label={`Email ${client.name}`}>
                                                            <Mail className="h-4 w-4" />
                                                            Email
                                                        </a>
                                                    </Button>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </section>
                </div>

                <aside className="order-1 hidden gap-4 lg:order-2 lg:grid lg:sticky lg:top-5" data-testid="clients-side-panel">
                    <section className="field-card p-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-slate-950/70 text-slate-200">
                                <Users className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-white">Client readiness</p>
                                <p className="mt-1 text-xs leading-5 text-slate-400">Keep repeat customers ready for one-tap quoting.</p>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-2">
                            <div className="field-mini">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Saved</p>
                                <p className="mt-1 text-2xl font-semibold text-white">{clients.length}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="field-mini">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reachable</p>
                                    <p className="mt-1 text-xl font-semibold text-white">{clientsWithContact}</p>
                                </div>
                                <div className="field-mini">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Addressed</p>
                                    <p className="mt-1 text-xl font-semibold text-white">{clientsWithAddress}</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="field-card border-blue-400/20 bg-blue-500/10 p-4">
                        <p className="text-sm font-semibold text-blue-50">Next quote shortcut</p>
                        <p className="mt-1 text-sm leading-6 text-blue-50/75">
                            {nextQuoteClient
                                ? "Start from the most complete saved customer record and skip retyping contact details."
                                : "Add a customer once, then reuse them from the truck."}
                        </p>
                        {nextQuoteClient ? (
                            <Button
                                type="button"
                                className="mt-4 h-11 w-full rounded-lg"
                                onClick={() => startEstimateForClient(nextQuoteClient)}
                                data-testid="clients-next-quote-button"
                            >
                                <FileText className="h-4 w-4" />
                                Start quote
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                className="mt-4 h-11 w-full rounded-lg"
                                onClick={startAdd}
                                disabled={!isHydrated}
                                data-testid="clients-side-add-button"
                            >
                                <Plus className="h-4 w-4" />
                                Add client
                            </Button>
                        )}
                    </section>
                </aside>
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-lg border-white/10 bg-slate-950 p-0 text-white sm:max-w-lg">
                    <DialogHeader className="border-b border-white/10 p-5 pr-16 text-left">
                        <DialogTitle>{editingClient ? "Edit Client" : "New Client"}</DialogTitle>
                        <DialogDescription className="mt-1 leading-6">
                            Store the customer details you need for faster quote reuse.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 space-y-4 overflow-y-auto p-5" data-testid="client-form-fields">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-200">Name *</label>
                            <Input
                                placeholder="Customer name"
                                className="rounded-lg border-white/10 bg-slate-900/80 text-white"
                                value={formData.name || ""}
                                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                            />
                            {!canSaveClient ? (
                                <p className="text-xs text-slate-500">Enter a client name to save.</p>
                            ) : null}
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-200">Phone</label>
                            <Input
                                placeholder="(555) 123-4567"
                                className="rounded-lg border-white/10 bg-slate-900/80 text-white"
                                value={formData.phone || ""}
                                onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-200">Email</label>
                            <Input
                                placeholder="client@example.com"
                                type="email"
                                className="rounded-lg border-white/10 bg-slate-900/80 text-white"
                                value={formData.email || ""}
                                onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-200">Address</label>
                            <Textarea
                                placeholder="Service address"
                                className="min-h-24 rounded-lg border-white/10 bg-slate-900/80 text-white"
                                value={formData.address || ""}
                                onChange={(event) => setFormData((prev) => ({ ...prev, address: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-200">Notes</label>
                            <Textarea
                                placeholder="Gate code, preferences, or site notes"
                                className="min-h-24 rounded-lg border-white/10 bg-slate-900/80 text-white"
                                value={formData.notes || ""}
                                onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter className="grid grid-cols-2 gap-2 border-t border-white/10 bg-slate-950/95 p-4 sm:grid-cols-2 sm:justify-stretch sm:space-x-0" data-testid="client-form-actions">
                        <Button variant="outline" className="h-12 min-h-12 rounded-lg border-white/10 bg-slate-900/70" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button className="h-12 min-h-12 rounded-lg" onClick={handleSave} disabled={!canSaveClient}>Save Client</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ConfirmDialog
                open={Boolean(clientToDelete)}
                onClose={() => setClientToDelete(null)}
                onConfirm={confirmDelete}
                title={clientToDelete ? `Delete ${clientToDelete.name}?` : "Delete client?"}
                description="This removes the saved customer record from this device. Existing estimates are not deleted."
            />
        </div>
    )
}
