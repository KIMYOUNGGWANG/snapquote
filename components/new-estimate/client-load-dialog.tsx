"use client"

import { useEffect, useMemo, useState } from "react"
import { Mail, Phone, Plus, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Client } from "@/lib/db"

type ClientLoadDialogProps = {
    clients: Client[]
    onAddClient: () => void
    onOpenChange: (open: boolean) => void
    onSelectClient: (client: Client) => void
    open: boolean
}

export function ClientLoadDialog({
    clients,
    onAddClient,
    onOpenChange,
    onSelectClient,
    open,
}: ClientLoadDialogProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const normalizedSearchQuery = searchQuery.trim().toLowerCase()
    const hasActiveSearch = normalizedSearchQuery.length > 0

    useEffect(() => {
        if (!open) {
            setSearchQuery("")
        }
    }, [open])

    const filteredClients = useMemo(() => {
        if (!normalizedSearchQuery) return clients

        return clients.filter((client) => {
            const searchText = [
                client.name,
                client.address,
                client.email,
                client.phone,
                client.notes,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()

            return searchText.includes(normalizedSearchQuery)
        })
    }, [clients, normalizedSearchQuery])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Select Client</DialogTitle>
                    <DialogDescription>
                        Choose a saved customer to prefill the quote and delivery details.
                    </DialogDescription>
                </DialogHeader>
                {clients.length > 0 ? (
                    <div className="space-y-2">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                            <Input
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search name, phone, email, address"
                                aria-label="Search saved clients"
                                className="border-white/10 bg-slate-950/70 pl-9 pr-12 text-white placeholder:text-slate-500"
                                data-testid="client-load-search-input"
                            />
                            {hasActiveSearch ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 text-slate-400 hover:bg-white/10 hover:text-white"
                                    onClick={() => setSearchQuery("")}
                                    aria-label="Clear client search"
                                    data-testid="client-load-clear-search"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            ) : null}
                        </div>
                        <p className="text-xs text-slate-500" data-testid="client-load-count">
                            {filteredClients.length} of {clients.length} saved clients
                        </p>
                    </div>
                ) : null}
                <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                    {clients.length === 0 ? (
                        <p className="py-4 text-center text-slate-400">No clients found.</p>
                    ) : filteredClients.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-white/10 bg-slate-950/40 p-4 text-center" data-testid="client-load-empty-search">
                            <Search className="mx-auto h-8 w-8 text-slate-500" />
                            <p className="mt-2 text-sm font-semibold text-white">No matching clients</p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">
                                No saved customer matches &ldquo;{searchQuery.trim()}&rdquo;.
                            </p>
                        </div>
                    ) : (
                        filteredClients.map((client) => (
                            <button
                                key={client.id}
                                type="button"
                                className="w-full rounded-lg border border-white/10 bg-slate-950/60 p-3 text-left text-white transition-colors hover:bg-slate-900"
                                onClick={() => onSelectClient(client)}
                            >
                                <p className="font-bold">{client.name}</p>
                                {client.address && <p className="text-xs text-slate-400">{client.address}</p>}
                                {(client.phone || client.email) && (
                                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                                        {client.phone && (
                                            <span className="inline-flex items-center gap-1">
                                                <Phone className="h-3 w-3 text-blue-200" />
                                                {client.phone}
                                            </span>
                                        )}
                                        {client.email && (
                                            <span className="inline-flex items-center gap-1">
                                                <Mail className="h-3 w-3 text-blue-200" />
                                                {client.email}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </button>
                        ))
                    )}
                    <Button
                        variant="outline"
                        className="mt-2 w-full rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900"
                        onClick={onAddClient}
                    >
                        <Plus className="mr-2 h-4 w-4" /> Add New Client
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
