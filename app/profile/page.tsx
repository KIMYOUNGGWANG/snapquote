"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader2, Save, Building2, Upload, X } from "lucide-react"
import Image from "next/image"
import { getProfile, saveProfile, clearAllEstimates, getStorageStats, type BusinessInfo } from "@/lib/estimates-storage"

export default function ProfilePage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [profile, setProfile] = useState<BusinessInfo>({
        business_name: "",
        phone: "",
        email: "",
        address: "",
        license_number: "",
        tax_rate: 13,
        logo_url: ""
    })
    const [uploading, setUploading] = useState(false)
    const [logoPreview, setLogoPreview] = useState<string | null>(null)
    const [storageStats, setStorageStats] = useState({ estimateCount: 0, storageUsed: "0 KB" })

    useEffect(() => {
        loadProfile()
    }, [])

    const loadProfile = () => {
        try {
            const savedProfile = getProfile()
            if (savedProfile) {
                setProfile(savedProfile)
                if (savedProfile.logo_url) {
                    setLogoPreview(savedProfile.logo_url)
                }
            }
            setStorageStats(getStorageStats())
        } catch (error) {
            console.error("Error loading profile:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = () => {
        setSaving(true)
        try {
            saveProfile(profile)
            alert("✅ Profile saved locally!")
            setStorageStats(getStorageStats())
        } catch (error) {
            console.error("Error saving profile:", error)
            alert("Failed to save profile.")
        } finally {
            setSaving(false)
        }
    }

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file')
            return
        }

        setUploading(true)
        try {
            // Convert to base64 for localStorage
            const reader = new FileReader()
            reader.onloadend = () => {
                const base64 = reader.result as string
                setProfile({ ...profile, logo_url: base64 })
                setLogoPreview(base64)
                setUploading(false)
            }
            reader.onerror = () => {
                alert('Failed to upload logo')
                setUploading(false)
            }
            reader.readAsDataURL(file)
        } catch (error) {
            console.error('Error uploading logo:', error)
            alert('Failed to upload logo')
            setUploading(false)
        }
    }

    const handleRemoveLogo = () => {
        setProfile({ ...profile, logo_url: "" })
        setLogoPreview(null)
    }

    const handleClearData = () => {
        if (confirm("⚠️ This will delete ALL your estimates and profile data. This cannot be undone. Are you sure?")) {
            clearAllEstimates()
            setProfile({
                business_name: "",
                phone: "",
                email: "",
                address: "",
                license_number: "",
                tax_rate: 13,
                logo_url: ""
            })
            setLogoPreview(null)
            alert("All data cleared successfully.")
            setStorageStats(getStorageStats())
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="max-w-md mx-auto space-y-6 pb-20">
            <CardHeader className="px-0">
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <Building2 className="h-6 w-6" />
                    Business Profile
                </CardTitle>
                <CardDescription>
                    This information will appear on your estimates and PDFs.
                </CardDescription>
            </CardHeader>

            <Card>
                <CardContent className="pt-6 space-y-4">
                    {/* Logo Upload */}
                    <div className="space-y-2">
                        <Label>Business Logo</Label>
                        <div className="flex items-center gap-4">
                            {logoPreview ? (
                                <div className="relative w-24 h-24 border-2 border-muted rounded-lg overflow-hidden">
                                    <Image
                                        src={logoPreview}
                                        alt="Business Logo"
                                        fill
                                        className="object-contain p-2"
                                    />
                                    <button
                                        onClick={handleRemoveLogo}
                                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-24 h-24 border-2 border-dashed border-muted-foreground/25 rounded-lg flex items-center justify-center bg-muted/50">
                                    <Upload className="h-6 w-6 text-muted-foreground" />
                                </div>
                            )}
                            <div className="flex-1">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    disabled={uploading}
                                    className="cursor-pointer"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Upload your company logo (appears on PDF header)
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="business_name">Business Name *</Label>
                        <Input
                            id="business_name"
                            value={profile.business_name}
                            onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                            placeholder="Your Company Name"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input
                            id="phone"
                            value={profile.phone}
                            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                            placeholder="(416) 555-1234"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={profile.email}
                            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                            placeholder="contact@yourcompany.com"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="address">Business Address</Label>
                        <Input
                            id="address"
                            value={profile.address}
                            onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                            placeholder="123 Main St, Toronto, ON"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="license">License Number</Label>
                        <Input
                            id="license"
                            value={profile.license_number}
                            onChange={(e) => setProfile({ ...profile, license_number: e.target.value })}
                            placeholder="LIC-123456"
                        />
                        <p className="text-xs text-muted-foreground">
                            Your trade license number (will appear on PDF footer)
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="tax_rate">Default Tax Rate (%)</Label>
                        <Input
                            id="tax_rate"
                            type="number"
                            value={profile.tax_rate}
                            onChange={(e) => setProfile({ ...profile, tax_rate: Number(e.target.value) })}
                            placeholder="13"
                        />
                        <p className="text-xs text-muted-foreground">
                            HST/GST rate for your region (e.g., Ontario = 13%)
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Button
                className="w-full h-12 text-lg font-semibold"
                onClick={handleSave}
                disabled={saving}
            >
                {saving ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                    </>
                ) : (
                    <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Profile
                    </>
                )}
            </Button>

            {/* Storage Info */}
            <Card className="border-dashed">
                <CardContent className="pt-6">
                    <div className="space-y-3">
                        <h3 className="font-semibold text-sm">📊 Storage Information</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Estimates Saved</p>
                                <p className="font-bold text-lg">{storageStats.estimateCount}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Storage Used</p>
                                <p className="font-bold text-lg">{storageStats.storageUsed}</p>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            💡 All data is stored locally in your browser
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Clear Data Section */}
            <Card className="border-destructive/50">
                <CardContent className="pt-6">
                    <div className="space-y-3">
                        <h3 className="font-semibold text-sm text-destructive">⚠️ Danger Zone</h3>
                        <p className="text-sm text-muted-foreground">
                            Clear all estimates and profile data from this browser.
                        </p>
                        <Button
                            variant="destructive"
                            className="w-full"
                            onClick={handleClearData}
                        >
                            Clear All Data
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
