import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
    page: {
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        padding: 30,
        fontFamily: 'Helvetica',
    },
    header: {
        flexDirection: 'row',
        marginBottom: 20,
        borderBottomWidth: 2,
        borderBottomColor: '#2563EB',
        paddingBottom: 15,
        alignItems: 'flex-start',
    },
    headerContent: {
        flex: 1,
    },
    logo: {
        width: 60,
        height: 60,
        marginRight: 15,
        objectFit: 'contain',
    },
    businessName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1E40AF',
        marginBottom: 5,
    },
    businessInfo: {
        fontSize: 9,
        color: '#6B7280',
        marginBottom: 2,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 15,
        marginBottom: 5,
    },
    clientSection: {
        marginTop: 15,
        marginBottom: 15,
        padding: 10,
        backgroundColor: '#F9FAFB',
        borderRadius: 4,
    },
    clientLabel: {
        fontSize: 9,
        color: '#6B7280',
        marginBottom: 3,
    },
    clientName: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    clientAddress: {
        fontSize: 10,
        color: '#4B5563',
    },
    summaryBox: {
        marginBottom: 15,
        padding: 10,
        backgroundColor: '#EFF6FF',
        borderRadius: 4,
    },
    summaryText: {
        fontSize: 10,
        color: '#1E40AF',
    },
    table: {
        display: "flex",
        width: "auto",
        borderStyle: "solid",
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRightWidth: 0,
        borderBottomWidth: 0,
        marginTop: 10,
    },
    tableRow: {
        margin: "auto",
        flexDirection: "row"
    },
    tableCol: {
        width: "25%",
        borderStyle: "solid",
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderLeftWidth: 0,
        borderTopWidth: 0
    },
    tableCell: {
        margin: "auto",
        marginTop: 5,
        fontSize: 9,
        padding: 5
    },
    totalsSection: {
        marginTop: 20,
        alignSelf: 'flex-end',
        width: '40%',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    totalLabel: {
        fontSize: 10,
        color: '#6B7280',
    },
    totalValue: {
        fontSize: 10,
    },
    grandTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        marginTop: 4,
    },
    grandTotalLabel: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    grandTotalValue: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#2563EB',
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 30,
        right: 30,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        paddingTop: 10,
    },
    footerText: {
        fontSize: 8,
        color: '#9CA3AF',
        textAlign: 'center',
        marginBottom: 3,
    },
    disclaimer: {
        fontSize: 7,
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 8,
    },
    licenseText: {
        fontSize: 8,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 5,
    },
    legalBlock: {
        marginTop: 10,
        padding: 8,
        backgroundColor: '#F3F4F6',
        borderRadius: 4,
    },
    legalText: {
        fontSize: 7,
        color: '#4B5563',
        lineHeight: 1.4,
    },
    signatureSection: {
        marginTop: 20,
        marginBottom: 10,
    },
    signatureImage: {
        width: 150,
        height: 60,
        objectFit: 'contain',
        marginBottom: 5,
    },
    signatureLine: {
        borderTopWidth: 1,
        borderTopColor: '#000000',
        width: 200,
        marginBottom: 5,
    },
    signatureLabel: {
        fontSize: 9,
        color: '#4B5563',
    }
});

const LEGAL_TEMPLATES: Record<string, string> = {
    ON: "ONTARIO CONSUMER PROTECTION: This estimate is provided in accordance with the Consumer Protection Act. This is NOT a binding contract. A written agreement signed by both parties is required before work commences. You have the right to a written contract for any home renovation project exceeding $50.",
    BC: "BRITISH COLUMBIA NOTICE: This estimate is for information purposes only. Final pricing is subject to a formal written agreement and site inspection. All work will be performed in accordance with BC Building Code standards.",
    AB: "ALBERTA NOTICE: This estimate is subject to the Fair Trading Act. A formal contract must be executed before services begin. Estimate remains valid for 30 days.",
    CA: "CALIFORNIA HOME IMPROVEMENT NOTICE: This is an estimate only. California law requires a formal Home Improvement Contract for work exceeding $500. You, the buyer, have the right to cancel this transaction within three business days from the date of contract signing.",
    TX: "TEXAS LIEN LAW NOTICE: This estimate is not a contract. Chapter 53 of the Texas Property Code requires specific notices regarding mechanic's liens. A formal written agreement is required before performance of any work.",
    NY: "NEW YORK HOME IMPROVEMENT NOTICE: This is not a contract. New York State law requires all home improvement contracts to be in writing and signed by both parties. This estimate is valid for 30 days.",
    FL: "FLORIDA CONSTRUCTION LIEN LAW: This is an estimate only. Under Florida's Construction Lien Law (Chapter 713, Florida Statutes), those who work on your property or provide materials and are not paid have a right to enforce their claim for payment against your property.",
    OTHER: "IMPORTANT NOTICE: This is an estimate only, not a binding contract. Final costs may vary based on unforeseen conditions. Work requires written approval from both parties. Valid for 30 days from issue date."
};

interface EstimateItem {
    id?: string;
    itemNumber?: number;
    category?: 'PARTS' | 'LABOR' | 'SERVICE' | 'OTHER';
    description: string;
    quantity: number;
    unit?: 'ea' | 'LS' | 'hr' | 'day' | 'SF' | 'LF' | '%' | 'other';
    unit_price: number;
    total: number;
}

interface BusinessInfo {
    business_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    license_number?: string;
    logo_url?: string;
    state_province?: string;
}

interface ClientInfo {
    name?: string;
    address?: string;
}

interface EstimatePDFProps {
    items: EstimateItem[];
    total: number;
    summary: string;
    taxRate?: number;
    business?: BusinessInfo;
    client?: ClientInfo;
    paymentLink?: string;
    signature?: string;
    signedAt?: string;
}

export const EstimatePDF = ({
    items,
    total,
    summary,
    taxRate = 13,
    business,
    client,
    paymentLink,
    signature,
    signedAt
}: EstimatePDFProps) => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = subtotal * (taxRate / 100);
    const grandTotal = subtotal + taxAmount;
    const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Header with Business Info */}
                <View style={styles.header}>
                    {business?.logo_url ? (
                        // eslint-disable-next-line jsx-a11y/alt-text
                        <Image style={styles.logo} src={business.logo_url} />
                    ) : null}
                    <View style={styles.headerContent}>
                        <Text style={styles.businessName}>
                            {business?.business_name || "Your Business Name"}
                        </Text>
                        {business?.address ? (
                            <Text style={styles.businessInfo}>{business.address}</Text>
                        ) : null}
                        {business?.phone ? (
                            <Text style={styles.businessInfo}>Tel: {business.phone}</Text>
                        ) : null}
                        {business?.email ? (
                            <Text style={styles.businessInfo}>Email: {business.email}</Text>
                        ) : null}
                        <Text style={styles.title}>ESTIMATE</Text>
                        <Text style={styles.businessInfo}>Date: {today}</Text>
                    </View>
                </View>

                {/* Client Section */}
                {(client?.name || client?.address) && (
                    <View style={styles.clientSection}>
                        <Text style={styles.clientLabel}>BILL TO:</Text>
                        <Text style={styles.clientName}>{client.name || "Client"}</Text>
                        {client.address ? (
                            <Text style={styles.clientAddress}>{client.address}</Text>
                        ) : null}
                    </View>
                )}

                {/* Summary */}
                <View style={styles.summaryBox}>
                    <Text style={styles.summaryText}>&quot;{summary}&quot;</Text>
                </View>

                {/* Items Table */}
                <View style={styles.table}>
                    <View style={[styles.tableRow, { backgroundColor: '#F3F4F6' }]}>
                        <View style={[styles.tableCol, { width: '40%' }]}>
                            <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Description</Text>
                        </View>
                        <View style={[styles.tableCol, { width: '10%' }]}>
                            <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Qty</Text>
                        </View>
                        <View style={[styles.tableCol, { width: '10%' }]}>
                            <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Unit</Text>
                        </View>
                        <View style={[styles.tableCol, { width: '20%' }]}>
                            <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Unit Price</Text>
                        </View>
                        <View style={[styles.tableCol, { width: '20%' }]}>
                            <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Total</Text>
                        </View>
                    </View>

                    {items.map((item, i) => (
                        <View style={styles.tableRow} key={i}>
                            <View style={[styles.tableCol, { width: '40%' }]}>
                                <Text style={styles.tableCell}>
                                    {item.category ? `[${item.category}] ` : ''}{item.description || " "}
                                </Text>
                            </View>
                            <View style={[styles.tableCol, { width: '10%' }]}>
                                <Text style={styles.tableCell}>{item.quantity}</Text>
                            </View>
                            <View style={[styles.tableCol, { width: '10%' }]}>
                                <Text style={styles.tableCell}>{item.unit || 'ea'}</Text>
                            </View>
                            <View style={[styles.tableCol, { width: '20%' }]}>
                                <Text style={styles.tableCell}>${item.unit_price.toFixed(2)}</Text>
                            </View>
                            <View style={[styles.tableCol, { width: '20%' }]}>
                                <Text style={styles.tableCell}>${(item.total || item.quantity * item.unit_price).toFixed(2)}</Text>
                            </View>
                        </View>
                    ))}
                </View>

                {/* Totals */}
                <View style={styles.totalsSection}>
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Subtotal:</Text>
                        <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
                    </View>
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Tax ({taxRate}%):</Text>
                        <Text style={styles.totalValue}>${taxAmount.toFixed(2)}</Text>
                    </View>
                    <View style={styles.grandTotalRow}>
                        <Text style={styles.grandTotalLabel}>Total:</Text>
                        <Text style={styles.grandTotalValue}>${grandTotal.toFixed(2)}</Text>
                    </View>
                </View>

                {/* Payment Link Section */}
                {paymentLink ? (
                    <View style={{
                        marginTop: 20,
                        padding: 15,
                        backgroundColor: '#EFF6FF',
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: '#2563EB',
                        alignItems: 'center'
                    }}>
                        <Text style={{
                            fontSize: 12,
                            fontWeight: 'bold',
                            color: '#1E40AF',
                            marginBottom: 8
                        }}>
                            💳 PAY ONLINE
                        </Text>
                        <Text style={{
                            fontSize: 9,
                            color: '#3B82F6',
                            textDecoration: 'underline',
                            marginBottom: 5
                        }}>
                            {paymentLink}
                        </Text>
                        <Text style={{
                            fontSize: 8,
                            color: '#6B7280',
                            textAlign: 'center'
                        }}>
                            Click or copy this link to make a secure payment
                        </Text>
                    </View>
                ) : null}
                {/* Signature Section */}
                {signature ? (
                    <View style={styles.signatureSection}>
                        {/* eslint-disable-next-line jsx-a11y/alt-text */}
                        <Image style={styles.signatureImage} src={signature} />
                        <View style={styles.signatureLine} />
                        <Text style={styles.signatureLabel}>
                            Agreed and Accepted by {client?.name || "Client"}
                        </Text>
                        {signedAt && (
                            <Text style={[styles.signatureLabel, { fontSize: 8, color: '#9CA3AF' }]}>
                                Signed on {new Date(signedAt).toLocaleString()}
                            </Text>
                        )}
                    </View>
                ) : null}

                {/* Footer with Legal Disclaimer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>Thank you for your business!</Text>
                    {business?.license_number ? (
                        <Text style={styles.licenseText}>
                            License #: {business.license_number}
                        </Text>
                    ) : null}
                    <View style={styles.legalBlock}>
                        <Text style={styles.legalText}>
                            {LEGAL_TEMPLATES[business?.state_province || 'OTHER']}
                        </Text>
                    </View>
                </View>
            </Page>
        </Document >
    );
};
