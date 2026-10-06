/**
 * Cihaz içi kalıcı depo (IndexedDB) — embedding önbelleği ve Bilgi Bankası
 * dokümanları. IndexedDB yoksa ya da açılamazsa (özel pencere, test ortamı)
 * oturum boyunca bellekte tutulur.
 *
 * Önbellekte YALNIZCA "içerik özeti → vektör" çiftleri tutulur; metin
 * saklanmaz. Böylece rol değişince eski kapsamın metni aramaya sızmaz (arama
 * her zaman güncel kapsamdan üretilen parçalar üzerinde yapılır).
 */

export interface KvStore<T> {
    getMany: (keys: string[]) => Promise<Map<string, T>>;
    putMany: (entries: [string, T][]) => Promise<void>;
    getAll: () => Promise<T[]>;
    remove: (key: string) => Promise<void>;
    clear: () => Promise<void>;
}

const DB_NAME = 'planasistan-rag';
const DB_VERSION = 1;
export const STORE_VECTORS = 'vectors';
export const STORE_DOCUMENTS = 'documents';

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
        try {
            if (typeof indexedDB === 'undefined') return resolve(null);
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_VECTORS)) db.createObjectStore(STORE_VECTORS);
                if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) db.createObjectStore(STORE_DOCUMENTS);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
            req.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    return dbPromise;
};

const done = (tx: IDBTransaction): Promise<void> =>
    new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });

export const createStore = <T,>(name: string): KvStore<T> => {
    const mem = new Map<string, T>();
    const withDb = async <R,>(fn: (db: IDBDatabase) => Promise<R>, fallback: () => R): Promise<R> => {
        const db = await openDb();
        if (!db) return fallback();
        try {
            return await fn(db);
        } catch {
            return fallback(); // kota dolu vb. → bellek
        }
    };
    return {
        getMany: keys => withDb(async db => {
            const tx = db.transaction(name, 'readonly');
            const os = tx.objectStore(name);
            const out = new Map<string, T>();
            await Promise.all(keys.map(k => new Promise<void>(res => {
                const r = os.get(k);
                r.onsuccess = () => {
                    if (r.result !== undefined) out.set(k, r.result as T);
                    res();
                };
                r.onerror = () => res();
            })));
            keys.forEach(k => { if (!out.has(k) && mem.has(k)) out.set(k, mem.get(k)!); });
            return out;
        }, () => new Map(keys.filter(k => mem.has(k)).map(k => [k, mem.get(k)!]))),
        putMany: entries => withDb(async db => {
            const tx = db.transaction(name, 'readwrite');
            const os = tx.objectStore(name);
            entries.forEach(([k, v]) => os.put(v, k));
            await done(tx);
        }, () => { entries.forEach(([k, v]) => mem.set(k, v)); }),
        getAll: () => withDb(async db => {
            const tx = db.transaction(name, 'readonly');
            const r = tx.objectStore(name).getAll();
            return await new Promise<T[]>((res, rej) => {
                r.onsuccess = () => res([...(r.result as T[]), ...mem.values()]);
                r.onerror = () => rej(r.error);
            });
        }, () => Array.from(mem.values())),
        remove: key => withDb(async db => {
            mem.delete(key);
            const tx = db.transaction(name, 'readwrite');
            tx.objectStore(name).delete(key);
            await done(tx);
        }, () => { mem.delete(key); }),
        clear: () => withDb(async db => {
            mem.clear();
            const tx = db.transaction(name, 'readwrite');
            tx.objectStore(name).clear();
            await done(tx);
        }, () => { mem.clear(); }),
    };
};
