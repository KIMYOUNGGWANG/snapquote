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
        };
        indexes: { 'by-date': string };
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
}

const DB_NAME = 'snapquote-db';
const DB_VERSION = 3; // Upgraded from 2 to 3

export async function initDB() {
    return openDB<SnapQuoteDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
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
        },
    });
}

// ============ ESTIMATES ============
export async function saveEstimateToDB(estimate: any) {
    const db = await initDB();
    return db.put('estimates', { ...estimate, synced: false });
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

