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
    }
});

interface EstimateItem {
    description: string;
    quantity: number;
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
}

export const EstimatePDF = ({
    items,
    total,
    summary,
    taxRate = 13,
    business,
    client,
    paymentLink
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
                    {business?.logo_url && (
                        // eslint-disable-next-line jsx-a11y/alt-text
                        <Image style={styles.logo} src={business.logo_url} />
                    )}
                    <View style={styles.headerContent}>
                        <Text style={styles.businessName}>
                            {business?.business_name || "Your Business Name"}
                        </Text>
                        {business?.address && (
                            <Text style={styles.businessInfo}>{business.address}</Text>
                        )}
                        {business?.phone && (
                            <Text style={styles.businessInfo}>Tel: {business.phone}</Text>
                        )}
                        {business?.email && (
                            <Text style={styles.businessInfo}>Email: {business.email}</Text>
                        )}
                        <Text style={styles.title}>ESTIMATE</Text>
                        <Text style={styles.businessInfo}>Date: {today}</Text>
                    </View>
                </View>

                {/* Client Section */}
                {(client?.name || client?.address) && (
                    <View style={styles.clientSection}>
                        <Text style={styles.clientLabel}>BILL TO:</Text>
                        <Text style={styles.clientName}>{client.name || "Client"}</Text>
                        {client.address && (
                            <Text style={styles.clientAddress}>{client.address}</Text>
                        )}
                    </View>
                )}

                {/* Summary */}
                <View style={styles.summaryBox}>
                    <Text style={styles.summaryText}>&quot;{summary}&quot;</Text>
                </View>

                {/* Items Table */}
                <View style={styles.table}>
                    <View style={[styles.tableRow, { backgroundColor: '#F3F4F6' }]}>
                        <View style={[styles.tableCol, { width: '50%' }]}>
                            <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Description</Text>
                        </View>
                        <View style={[styles.tableCol, { width: '15%' }]}>
                            <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Qty</Text>
                        </View>
                        <View style={[styles.tableCol, { width: '15%' }]}>
                            <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Unit Price</Text>
                        </View>
                        <View style={[styles.tableCol, { width: '20%' }]}>
                            <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Total</Text>
                        </View>
                    </View>

                    {items.map((item, i) => (
                        <View style={styles.tableRow} key={i}>
                            <View style={[styles.tableCol, { width: '50%' }]}>
                                <Text style={styles.tableCell}>{item.description}</Text>
                            </View>
                            <View style={[styles.tableCol, { width: '15%' }]}>
                                <Text style={styles.tableCell}>{item.quantity}</Text>
                            </View>
                            <View style={[styles.tableCol, { width: '15%' }]}>
                                <Text style={styles.tableCell}>${item.unit_price.toFixed(2)}</Text>
                            </View>
                            <View style={[styles.tableCol, { width: '20%' }]}>
                                <Text style={styles.tableCell}>${item.total.toFixed(2)}</Text>
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
                {paymentLink && (
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
                )}

                {/* Footer with Legal Disclaimer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>Thank you for your business!</Text>
                    {business?.license_number && (
                        <Text style={styles.licenseText}>
                            License #: {business.license_number}
                        </Text>
                    )}
                    <Text style={styles.disclaimer}>
                        IMPORTANT NOTICE: This is an estimate only, not a binding contract.
                        Final costs may vary based on unforeseen conditions.
                        Work requires written approval. Valid for 30 days from issue date.
                    </Text>
                </View>
            </Page>
        </Document>
    );
};
