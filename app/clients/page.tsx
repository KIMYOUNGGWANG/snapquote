"use client"

import { useState, useEffect } from "react"
import { Users, Plus, Pencil, Trash2, ArrowLeft, Search, Phone, Mail, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import Link from "next/link"
import { saveClient, getClients, deleteClient, type Client } from "@/lib/db"
import { toast } from "@/components/toast"

export default function ClientsPage() {
    const [clients, setClients] = useState<Client[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingClient, setEditingClient] = useState<Client | null>(null)
    const [formData, setFormData] = useState<Partial<Client>>({})

    useEffect(() => {
        loadClients()
    }, [])

    const loadClients = async () => {
        const data = await getClients()
        setClients(data.sort((a, b) => a.name.localeCompare(b.name)))
    }

    const handleSave = async () => {
        if (!formData.name) {
            toast("⚠️ Client name is required", "error")
            return
        }

        await saveClient({
            id: editingClient?.id,
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            notes: formData.notes,
        })

        toast(editingClient ? "✅ Client updated" : "✅ Client added", "success")
        setIsDialogOpen(false)
        setEditingClient(null)
        setFormData({})
        loadClients()
    }

    const startEdit = (client: Client) => {
        setEditingClient(client)
        setFormData(client)
        setIsDialogOpen(true)
    }

    const startAdd = () => {
        setEditingClient(null)
        setFormData({})
        setIsDialogOpen(true)
    }

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (confirm("Are you sure you want to delete this client?")) {
            await deleteClient(id)
            toast("🗑️ Client deleted", "success")
            loadClients()
        }
    }

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.includes(searchQuery) ||
        c.email?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="min-h-screen bg-background p-4 pb-24">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link href="/">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    👥 Clients
                </h1>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search clients..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Button onClick={startAdd}>
                    <Plus className="h-4 w-4 mr-2" />
                    New
                </Button>
            </div>

            {/* Client List */}
            <div className="space-y-4">
                {filteredClients.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No clients found</p>
                    </div>
                )}

                {filteredClients.map((client) => (
                    <Card key={client.id} className="overflow-hidden hover:border-primary transition-colors cursor-pointer" onClick={() => startEdit(client)}>
                        <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-lg">{client.name}</h3>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => handleDelete(client.id, e)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="space-y-1 text-sm text-muted-foreground">
                                {client.phone && (
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-3 w-3" />
                                        {client.phone}
                                    </div>
                                )}
                                {client.email && (
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-3 w-3" />
                                        {client.email}
                                    </div>
                                )}
                                {client.address && (
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-3 w-3" />
                                        <span className="truncate">{client.address}</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingClient ? "Edit Client" : "New Client"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Name *</label>
                            <Input
                                placeholder="Customer Name"
                                value={formData.name || ""}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Phone</label>
                            <Input
                                placeholder="(555) 123-4567"
                                value={formData.phone || ""}
                                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Email</label>
                            <Input
                                placeholder="client@example.com"
                                type="email"
                                value={formData.email || ""}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Address</label>
                            <Textarea
                                placeholder="Service address"
                                value={formData.address || ""}
                                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Notes</label>
                            <Textarea
                                placeholder="Gate code, preferences, etc."
                                value={formData.notes || ""}
                                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave}>Save Client</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
