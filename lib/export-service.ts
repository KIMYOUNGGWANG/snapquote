import { LocalEstimate, BusinessInfo } from "./estimates-storage";
import { PriceListItem } from "@/types";

export interface SnapQuoteBackup {
    version: number;
    timestamp: string;
    profile: BusinessInfo | null;
    estimates: LocalEstimate[];
    priceList: PriceListItem[];
}

export function generateFullBackupJSON(
    profile: BusinessInfo | null,
    estimates: LocalEstimate[],
    priceList: PriceListItem[]
): string {
    const backup: SnapQuoteBackup = {
        version: 1,
        timestamp: new Date().toISOString(),
        profile,
        estimates,
        priceList
    };
    return JSON.stringify(backup, null, 2);
}

export function generateQuickBooksCSV(estimates: LocalEstimate[]): string {
    // Columns expected by QB Online (Generic Import):
    // Date, EstimateNo, Customer, Amount, Tax, Total, Status, Memo
    const headers = [
        "Date",
        "EstimateNo",
        "Customer",
        "Item(Summary)",
        "Rate",
        "Qty",
        "Amount",
        "Tax Amount",
        "Total Amount",
        "Status"
    ];

    const rows = estimates.map(est => {
        const date = new Date(est.createdAt).toLocaleDateString('en-US'); // Format: MM/DD/YYYY
        // Escape quotes in strings
        const customer = (est.clientName || "Client").replace(/"/g, '""');
        const summary = (est.summary_note || "Service").replace(/"/g, '""');

        // CSV Format
        return [
            `"${date}"`,
            `"${est.estimateNumber}"`,
            `"${customer}"`,
            `"${summary}"`,
            est.items.length > 0 ? est.items[0].unit_price : 0, // Simplified: just first item or summary for basic export
            1, // Simplified Qty
            est.totalAmount.toFixed(2),
            est.taxAmount.toFixed(2),
            est.totalAmount.toFixed(2),
            `"${est.type === 'invoice' ? 'Invoice' : 'Estimate'}"`
        ].join(",");
    });

    return [headers.join(","), ...rows].join("\n");
}

export function downloadCSV(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
