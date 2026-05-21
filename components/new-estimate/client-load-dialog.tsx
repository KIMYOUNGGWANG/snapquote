"use client"

import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Select Client</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {clients.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">No clients found.</p>
                    ) : (
                        clients.map((client) => (
                            <button
                                key={client.id}
                                type="button"
                                className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted"
                                onClick={() => onSelectClient(client)}
                            >
                                <p className="font-bold">{client.name}</p>
                                {client.address && <p className="text-xs text-muted-foreground">{client.address}</p>}
                            </button>
                        ))
                    )}
                    <Button
                        variant="outline"
                        className="w-full mt-2"
                        onClick={onAddClient}
                    >
                        <Plus className="h-4 w-4 mr-2" /> Add New Client
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
