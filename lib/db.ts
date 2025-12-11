import { openDB, DBSchema } from 'idb';

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
}

const DB_NAME = 'snapquote-db';
const DB_VERSION = 1;

export async function initDB() {
    return openDB<SnapQuoteDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('estimates')) {
                const store = db.createObjectStore('estimates', { keyPath: 'id' });
                store.createIndex('by-date', 'createdAt');
            }
            if (!db.objectStoreNames.contains('photos')) {
                const store = db.createObjectStore('photos', { keyPath: 'id' });
                store.createIndex('by-estimate', 'estimateId');
            }
        },
    });
}

export async function saveEstimateToDB(estimate: any) {
    const db = await initDB();
    return db.put('estimates', { ...estimate, synced: false });
}

export async function getEstimatesFromDB() {
    const db = await initDB();
    return db.getAllFromIndex('estimates', 'by-date');
}

export async function savePhotoToDB(photo: { id: string; estimateId: string; blob: Blob }) {
    const db = await initDB();
    return db.put('photos', { ...photo, createdAt: new Date().toISOString() });
}

export async function getPhotosForEstimate(estimateId: string) {
    const db = await initDB();
    return db.getAllFromIndex('photos', 'by-estimate', estimateId);
}
