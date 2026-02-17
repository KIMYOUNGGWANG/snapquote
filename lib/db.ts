import { openDB, DBSchema } from 'idb';
import type { PriceListItem, PriceCategory, PriceUnit } from '@/types';

interface SnapQuoteDB extends DBSchema {
    estimates: {
        key: string;
        value: {
            id: string;
            estimateNumber: string;
            items: any[];
            summary_note: string;
            clientName: string;
            clientAddress: string;
            taxRate: number;
            taxAmount: number;
            totalAmount: number;
            createdAt: string;
            synced: boolean;
            status: 'draft' | 'sent' | 'paid';  // NEW: Capture-First status
        };
        indexes: { 'by-date': string; 'by-status': string };  // Added by-status
    };
    photos: {
        key: string;
        value: {
            id: string;
            estimateId: string;
            blob: Blob;
            createdAt: string;
        };
        indexes: { 'by-estimate': string };
    };
    pendingAudio: {
        key: string;
        value: {
            id: string;
            blob: Blob;
            mimeType: string;
            createdAt: string;
            processed: boolean;
            transcription?: string;
        };
        indexes: { 'by-date': string; 'by-processed': string };
    };
    // NEW: Price List for consistent pricing
    priceList: {
        key: string;
        value: PriceListItem;
        indexes: { 'by-category': PriceCategory; 'by-name': string };
    };
    // NEW: Receipt Storage for daily use
    receipts: {
        key: string;
        value: {
            id: string;
            photoUrl: string;      // base64
            amount?: number;
            vendor?: string;
            note?: string;
            date: string;          // ISO date
            createdAt: string;
        };
        indexes: { 'by-date': string };
    };
    // NEW: Time Tracking for daily use
    timeEntries: {
        key: string;
        value: {
            id: string;
            projectName?: string;
            startTime: string;     // ISO datetime
            endTime?: string;
            duration?: number;     // minutes
            date: string;          // ISO date
        };
        indexes: { 'by-date': string };
    };
    // NEW: Client Management for Phase 6
    clients: {
        key: string;
        value: {
            id: string;
            name: string;
            email?: string;
            phone?: string;
            address?: string;
            notes?: string;
            createdAt: string;
        };
        indexes: { 'by-name': string };
    };
}

const DB_NAME = 'snapquote-db';
const DB_VERSION = 6; // Upgraded to 6 for clients

export async function initDB() {
    return openDB<SnapQuoteDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, _newVersion, transaction) {
            // Version 1: estimates and photos
            if (oldVersion < 1) {
                if (!db.objectStoreNames.contains('estimates')) {
                    const store = db.createObjectStore('estimates', { keyPath: 'id' });
                    store.createIndex('by-date', 'createdAt');
                }
                if (!db.objectStoreNames.contains('photos')) {
                    const store = db.createObjectStore('photos', { keyPath: 'id' });
                    store.createIndex('by-estimate', 'estimateId');
                }
            }
            // Version 2: pendingAudio
            if (oldVersion < 2) {
                if (!db.objectStoreNames.contains('pendingAudio')) {
                    const audioStore = db.createObjectStore('pendingAudio', { keyPath: 'id' });
                    audioStore.createIndex('by-date', 'createdAt');
                    audioStore.createIndex('by-processed', 'processed');
                }
            }
            // Version 3: priceList
            if (oldVersion < 3) {
                if (!db.objectStoreNames.contains('priceList')) {
                    const priceStore = db.createObjectStore('priceList', { keyPath: 'id' });
                    priceStore.createIndex('by-category', 'category');
                    priceStore.createIndex('by-name', 'name');
                }
            }
            // Version 4: Add status field and index to estimates
            if (oldVersion < 4) {
                const estimatesStore = transaction.objectStore('estimates');
                // Add by-status index if not exists
                if (!estimatesStore.indexNames.contains('by-status')) {
                    estimatesStore.createIndex('by-status', 'status');
                }
            }
            // Version 5: receipts and timeEntries for daily use
            if (oldVersion < 5) {
                if (!db.objectStoreNames.contains('receipts')) {
                    const receiptsStore = db.createObjectStore('receipts', { keyPath: 'id' });
                    receiptsStore.createIndex('by-date', 'date');
                }
                if (!db.objectStoreNames.contains('timeEntries')) {
                    const timeStore = db.createObjectStore('timeEntries', { keyPath: 'id' });
                    timeStore.createIndex('by-date', 'date');
                }
            }
            // Version 6: clients for CRM
            if (oldVersion < 6) {
                if (!db.objectStoreNames.contains('clients')) {
                    const clientStore = db.createObjectStore('clients', { keyPath: 'id' });
                    clientStore.createIndex('by-name', 'name');
                }
            }
        },
    });
}

// ============ ESTIMATES ============
export async function saveEstimateToDB(estimate: any) {
    const db = await initDB();
    // Default status to 'draft' if not set
    const estimateWithStatus = {
        ...estimate,
        synced: false,
        status: estimate.status || 'draft',
    };
    return db.put('estimates', estimateWithStatus);
}

export async function getEstimatesFromDB() {
    const db = await initDB();
    return db.getAllFromIndex('estimates', 'by-date');
}

// ============ PHOTOS ============
export async function savePhotoToDB(photo: { id: string; estimateId: string; blob: Blob }) {
    const db = await initDB();
    return db.put('photos', { ...photo, createdAt: new Date().toISOString() });
}

export async function getPhotosForEstimate(estimateId: string) {
    const db = await initDB();
    return db.getAllFromIndex('photos', 'by-estimate', estimateId);
}

// ============ PENDING AUDIO (NEW) ============
export interface PendingAudio {
    id: string;
    blob: Blob;
    mimeType: string;
    createdAt: string;
    processed: boolean;
    transcription?: string;
}

export async function savePendingAudio(audio: { id: string; blob: Blob; mimeType: string }): Promise<string> {
    const db = await initDB();
    const pendingAudio: PendingAudio = {
        ...audio,
        createdAt: new Date().toISOString(),
        processed: false,
    };
    await db.put('pendingAudio', pendingAudio);
    return audio.id;
}

export async function getPendingAudio(id: string): Promise<PendingAudio | undefined> {
    const db = await initDB();
    return db.get('pendingAudio', id);
}

export async function getAllPendingAudio(): Promise<PendingAudio[]> {
    const db = await initDB();
    return db.getAllFromIndex('pendingAudio', 'by-date');
}

export async function getUnprocessedAudio(): Promise<PendingAudio[]> {
    const db = await initDB();
    const all = await db.getAllFromIndex('pendingAudio', 'by-processed', IDBKeyRange.only(false));
    return all;
}

export async function markAudioProcessed(id: string, transcription: string): Promise<void> {
    const db = await initDB();
    const audio = await db.get('pendingAudio', id);
    if (audio) {
        await db.put('pendingAudio', { ...audio, processed: true, transcription });
    }
}

export async function deletePendingAudio(id: string): Promise<void> {
    const db = await initDB();
    await db.delete('pendingAudio', id);
}

export async function clearProcessedAudio(): Promise<void> {
    const db = await initDB();
    const processed = await db.getAllFromIndex('pendingAudio', 'by-processed', IDBKeyRange.only(true));
    for (const audio of processed) {
        await db.delete('pendingAudio', audio.id);
    }
}

// ============ PRICE LIST ============
// Bulk save price list (for Restore)
export async function savePriceList(items: PriceListItem[]): Promise<void> {
    const db = await initDB()
    const tx = db.transaction('priceList', 'readwrite')
    const store = tx.objectStore('priceList')
    await store.clear()
    for (const item of items) {
        await store.put(item)
    }
    await tx.done
}

export async function savePriceListItem(item: Omit<PriceListItem, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> & { id?: string }): Promise<string> {
    const db = await initDB();
    const now = new Date().toISOString();
    const id = item.id || crypto.randomUUID();

    // Check if updating existing item
    const existing = item.id ? await db.get('priceList', item.id) : null;

    const priceItem: PriceListItem = {
        ...item,
        id,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        usageCount: existing?.usageCount || 0,
        keywords: item.keywords || [],
    };

    await db.put('priceList', priceItem);
    return id;
}

export async function getPriceList(): Promise<PriceListItem[]> {
    const db = await initDB();
    return db.getAll('priceList');
}

export async function getPriceListByCategory(category: PriceCategory): Promise<PriceListItem[]> {
    const db = await initDB();
    return db.getAllFromIndex('priceList', 'by-category', category);
}

export async function getPriceListItem(id: string): Promise<PriceListItem | undefined> {
    const db = await initDB();
    return db.get('priceList', id);
}

export async function deletePriceListItem(id: string): Promise<void> {
    const db = await initDB();
    await db.delete('priceList', id);
}

export async function incrementPriceItemUsage(id: string): Promise<void> {
    const db = await initDB();
    const item = await db.get('priceList', id);
    if (item) {
        await db.put('priceList', { ...item, usageCount: item.usageCount + 1, updatedAt: new Date().toISOString() });
    }
}

// Get price list formatted for AI prompt
export async function getPriceListForAI(): Promise<string> {
    const items = await getPriceList();
    if (items.length === 0) return '';

    return items.map(item =>
        `- "${item.name}": $${item.price}/${item.unit} [${item.category}] (keywords: ${item.keywords.join(', ')})`
    ).join('\n');
}

// ============ RECEIPTS ============
export interface Receipt {
    id: string;
    photoUrl: string;
    amount?: number;
    vendor?: string;
    note?: string;
    date: string;
    createdAt: string;
}

export async function saveReceipt(receipt: Omit<Receipt, 'id' | 'createdAt'>): Promise<string> {
    const db = await initDB();
    const id = crypto.randomUUID();
    await db.put('receipts', {
        ...receipt,
        id,
        createdAt: new Date().toISOString(),
    });
    return id;
}

export async function getReceipts(): Promise<Receipt[]> {
    const db = await initDB();
    return db.getAllFromIndex('receipts', 'by-date');
}

export async function deleteReceipt(id: string): Promise<void> {
    const db = await initDB();
    await db.delete('receipts', id);
}

// ============ TIME ENTRIES ============
export interface TimeEntry {
    id: string;
    projectName?: string;
    startTime: string;
    endTime?: string;
    duration?: number; // minutes
    date: string;
}

export async function saveTimeEntry(entry: Omit<TimeEntry, 'id'>): Promise<string> {
    const db = await initDB();
    const id = crypto.randomUUID();
    await db.put('timeEntries', { ...entry, id });
    return id;
}

export async function updateTimeEntry(entry: TimeEntry): Promise<void> {
    const db = await initDB();
    await db.put('timeEntries', entry);
}

export async function getTimeEntries(): Promise<TimeEntry[]> {
    const db = await initDB();
    return db.getAllFromIndex('timeEntries', 'by-date');
}

export async function getTimeEntriesByDate(date: string): Promise<TimeEntry[]> {
    const db = await initDB();
    return db.getAllFromIndex('timeEntries', 'by-date', date);
}

export async function deleteTimeEntry(id: string): Promise<void> {
    const db = await initDB();
    await db.delete('timeEntries', id);
}

// ============ CLIENTS (CRM) ============
export interface Client {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
    createdAt: string;
}

export async function saveClient(client: Omit<Client, 'id' | 'createdAt'> & { id?: string }): Promise<string> {
    const db = await initDB();
    const id = client.id || crypto.randomUUID();
    const now = new Date().toISOString();

    // Check existing to preserve createdAt if updating
    const existing = client.id ? await db.get('clients', client.id) : null;

    await db.put('clients', {
        ...client,
        id,
        createdAt: existing?.createdAt || now,
    });
    return id;
}

export async function getClients(): Promise<Client[]> {
    const db = await initDB();
    return db.getAllFromIndex('clients', 'by-name');
}

export async function getClient(id: string): Promise<Client | undefined> {
    const db = await initDB();
    return db.get('clients', id);
}

export async function deleteClient(id: string): Promise<void> {
    const db = await initDB();
    await db.delete('clients', id);
}
