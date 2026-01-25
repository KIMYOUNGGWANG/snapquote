import { PriceListItem } from "@/types"

export type TradeType = 'general' | 'plumber' | 'electrician' | 'hvac' | 'handyman'

export interface TradePreset {
    id: TradeType
    name: string
    icon: string
    description: string
    color: string
    initialItems: Omit<PriceListItem, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>[]
}

export const TRADE_PRESETS: TradePreset[] = [
    {
        id: 'plumber',
        name: 'Plumber',
        icon: 'Droplets',
        description: 'Pipes, fittings, and leak detection',
        color: 'bg-blue-500',
        initialItems: [
            { name: "Emergency Call-out (Day)", category: "SERVICE", price: 150, unit: "LS", keywords: ["emergency", "visit", "trip charge"] },
            { name: "Copper Pipe 1/2\" (Type L)", category: "PARTS", price: 3.50, unit: "LF", keywords: ["pipe", "copper", "water line"] },
            { name: "PEX Tubing 1/2\"", category: "PARTS", price: 0.80, unit: "LF", keywords: ["pex", "plastic pipe"] },
            { name: "Ball Valve 1/2\" (Sweat)", category: "PARTS", price: 15.00, unit: "ea", keywords: ["valve", "shutoff"] },
            { name: "Toilet Installation (Standard)", category: "LABOR", price: 180.00, unit: "LS", keywords: ["toilet", "commode", "install"] },
            { name: "Leak Detection Service", category: "SERVICE", price: 250.00, unit: "LS", keywords: ["leak", "detection", "investigation"] }
        ]
    },
    {
        id: 'electrician',
        name: 'Electrician',
        icon: 'Zap',
        description: 'Wiring, panels, and lighting',
        color: 'bg-yellow-500',
        initialItems: [
            { name: "Troubleshooting / Diagnostics", category: "SERVICE", price: 180, unit: "hr", keywords: ["diagnosis", "troubleshoot", "check"] },
            { name: "Romex 14/2 Wire", category: "PARTS", price: 1.20, unit: "LF", keywords: ["wire", "romex", "14/2"] },
            { name: "Breaker 15A (AFCI/GFCI)", category: "PARTS", price: 85.00, unit: "ea", keywords: ["breaker", "fuse", "afci", "gfci"] },
            { name: "Pot Light (LED Wafer)", category: "PARTS", price: 45.00, unit: "ea", keywords: ["light", "potlight", "recessed"] },
            { name: "New Circuit Run (Up to 50ft)", category: "LABOR", price: 350.00, unit: "LS", keywords: ["circuit", "new line"] },
            { name: "Panel Upgrade (100A to 200A)", category: "LABOR", price: 2500.00, unit: "LS", keywords: ["panel", "service upgrade"] }
        ]
    },
    {
        id: 'hvac',
        name: 'HVAC Tech',
        icon: 'Thermometer',
        description: 'Heating, Cooling, and Ventilation',
        color: 'bg-red-500',
        initialItems: [
            { name: "Diagnostic Visit", category: "SERVICE", price: 140, unit: "LS", keywords: ["diagnostic", "service call"] },
            { name: "R-410A Refrigerant", category: "PARTS", price: 85.00, unit: "lb", keywords: ["freon", "refrigerant", "f-gas"] },
            { name: "Capacitor (Dual Run)", category: "PARTS", price: 75.00, unit: "ea", keywords: ["capacitor", "start kit"] },
            { name: "Contactor 2-Pole", category: "PARTS", price: 60.00, unit: "ea", keywords: ["contactor", "relay"] },
            { name: "Furnace Maintenance/Tune-up", category: "SERVICE", price: 160.00, unit: "LS", keywords: ["maintenance", "cleaning", "inspection"] }
        ]
    },
    {
        id: 'handyman',
        name: 'Handyman',
        icon: 'Hammer',
        description: 'General repairs and assembly',
        color: 'bg-green-500',
        initialItems: [
            { name: "Hourly Labor Rate", category: "LABOR", price: 85, unit: "hr", keywords: ["labor", "work"] },
            { name: "Daily Rate (8 hrs)", category: "LABOR", price: 600, unit: "day", keywords: ["day rate", "full day"] },
            { name: "Drywall Patch (Small)", category: "LABOR", price: 150.00, unit: "LS", keywords: ["patch", "hole", "drywall"] },
            { name: "TV Mounting (up to 55\")", category: "LABOR", price: 120.00, unit: "LS", keywords: ["tv", "mount"] },
            { name: "Furniture Assembly", category: "LABOR", price: 65.00, unit: "hr", keywords: ["assembly", "ikea"] }
        ]
    },
    {
        id: 'general',
        name: 'General Contractor',
        icon: 'HardHat',
        description: 'Renovations and construction',
        color: 'bg-slate-500',
        initialItems: [
            { name: "Demolition Labor", category: "LABOR", price: 65, unit: "hr", keywords: ["demo", "removal"] },
            { name: "Debris Disposal (Bin)", category: "SERVICE", price: 450, unit: "LS", keywords: ["disposal", "bin", "trash"] },
            { name: "Permit Application Fee", category: "SERVICE", price: 300, unit: "LS", keywords: ["permit", "license"] },
            { name: "Project Management", category: "SERVICE", price: 10, unit: "%", keywords: ["management", "pm fee"] }
        ]
    }
]
