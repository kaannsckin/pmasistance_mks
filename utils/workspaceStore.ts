import { Project, WorkspaceData } from '../types';

/**
 * Çalışma alanının tarayıcıdaki kalıcı deposu.
 *
 * localStorage tek bir JSON metni tutar ve tarayıcıya göre ~5 MB'ta dolar;
 * binlerce kayıtlık Jira geçmişi sığmaz. Burada çalışma alanı IndexedDB'de
 * parçalı tutulur: `meta` (projeler dışındaki her şey + proje sırası) ve her
 * proje ayrı kayıt. Değişiklikte yalnız değişen parçalar yazılır; güncellemeler
 * değişmez (immutable) olduğu için değişen parça nesne kimliğinden anlaşılır.
 * IndexedDB yoksa (eski tarayıcı, bazı gizli pencereler) App localStorage'a düşer.
 */

const META = 'meta';
const PROJECT = 'project:';
export const STORE_FORMAT = 1;

export interface StoredMeta {
    format: number;
    workspace: Omit<WorkspaceData, 'projects'>;
    projectIds: string[];
}

/** Anahtar-değer deposu: tek işlemde yazma; IndexedDB ve testteki bellek deposu uygular */
export interface KvStore {
    readAll(): Promise<Map<string, unknown>>;
    write(puts: [string, unknown][], deletes: string[]): Promise<void>;
    clear(): Promise<void>;
}

export const metaOf = (ws: WorkspaceData): StoredMeta => {
    const { projects, ...workspace } = ws;
    return { format: STORE_FORMAT, workspace, projectIds: projects.map(p => p.id) };
};

/** Depodaki kayıtlardan çalışma alanı; biçim tanınmıyorsa null. Yetim proje kayıtları da döner (temizlik için). */
export const joinStored = (records: Map<string, unknown>): { workspace: WorkspaceData; orphans: string[] } | null => {
    const meta = records.get(META) as StoredMeta | undefined;
    if (!meta || meta.format !== STORE_FORMAT || !Array.isArray(meta.projectIds)) return null;
    const projects = meta.projectIds.map(id => records.get(PROJECT + id) as Project | undefined).filter((p): p is Project => !!p);
    const known = new Set(meta.projectIds.map(id => PROJECT + id));
    const orphans = [...records.keys()].filter(k => k.startsWith(PROJECT) && !known.has(k));
    return { workspace: { ...meta.workspace, projects } as WorkspaceData, orphans };
};

const sameOrder = (a: Project[], b: Project[]) => a.length === b.length && a.every((p, i) => p.id === b[i].id);

/** Son yazılandan bu yana değişen parçalar (nesne kimliğiyle); `prev` yoksa hepsi */
export const storageDiff = (prev: WorkspaceData | null, next: WorkspaceData): { puts: [string, unknown][]; deletes: string[] } => {
    const puts: [string, unknown][] = [];
    const deletes: string[] = [];
    const before = new Map((prev?.projects || []).map(p => [p.id, p]));
    next.projects.forEach(p => { if (before.get(p.id) !== p) puts.push([PROJECT + p.id, p]); });
    const ids = new Set(next.projects.map(p => p.id));
    before.forEach((_, id) => { if (!ids.has(id)) deletes.push(PROJECT + id); });
    const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next)]);
    const metaChanged = !prev || !sameOrder(prev.projects, next.projects)
        || [...keys].some(k => k !== 'projects' && (prev as unknown as Record<string, unknown>)[k] !== (next as unknown as Record<string, unknown>)[k]);
    if (metaChanged) puts.push([META, metaOf(next)]);
    return { puts, deletes };
};

/**
 * Sıralı, birleştirerek yazan kaydedici: yazım sürerken gelen değişikliklerden
 * yalnız sonuncusu yazılır. Hata olursa (kota) son başarılı yazım taban kalır;
 * sonraki kayıt farkı ondan hesaplar, yani eksik kalan parçalar yeniden denenir.
 */
export class WorkspacePersister {
    private pending: WorkspaceData | null = null;
    private running: Promise<void> | null = null;
    private stopped = false;

    /**
     * @param saved depodaki hâl (yüklenen çalışma alanı); yoksa ilk kayıt her şeyi yazar
     * @param extraDeletes ilk yazımda silinecek yetim kayıtlar
     */
    constructor(
        private readonly kv: KvStore,
        private saved: WorkspaceData | null,
        private readonly onResult: (ok: boolean, error?: unknown) => void = () => {},
        private extraDeletes: string[] = [],
    ) {}

    save(ws: WorkspaceData): void {
        if (this.stopped) return;
        this.pending = ws;
        if (!this.running) this.running = this.run().finally(() => { this.running = null; });
    }

    /** Bekleyen yazımlar bitince çözülür */
    async flush(): Promise<void> {
        while (this.running) await this.running;
    }

    /** Depoyu boşaltır ve sonraki kayıtları durdurur (verileri sıfırlama) */
    async clear(): Promise<void> {
        this.stopped = true;
        this.pending = null;
        await this.flush();
        await this.kv.clear();
    }

    private async run(): Promise<void> {
        while (this.pending) {
            const ws = this.pending;
            this.pending = null;
            const { puts, deletes } = storageDiff(this.saved, ws);
            const dels = [...deletes, ...this.extraDeletes];
            if (!puts.length && !dels.length) continue;
            try {
                await this.kv.write(puts, dels);
                this.saved = ws;
                this.extraDeletes = [];
                this.onResult(true);
            } catch (e) {
                this.onResult(false, e);
            }
        }
    }
}

// ---------------------------------------------------------------- IndexedDB

const DB_NAME = 'planasistan';
const STORE = 'workspace';

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new DOMException('İşlem iptal edildi', 'AbortError'));
});

/** IndexedDB deposunu açar; kullanılamıyorsa null (App localStorage'a düşer) */
export const openIndexedDbStore = (): Promise<KvStore | null> => new Promise(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let open: IDBOpenDBRequest;
    try { open = indexedDB.open(DB_NAME, 1); } catch { resolve(null); return; }
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE); };
    open.onerror = () => resolve(null);
    open.onblocked = () => resolve(null);
    open.onsuccess = () => {
        const db = open.result;
        resolve({
            async readAll() {
                const tx = db.transaction(STORE, 'readonly');
                const s = tx.objectStore(STORE);
                const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
                return new Map(keys.map((k, i) => [String(k), values[i]]));
            },
            async write(puts, deletes) {
                const tx = db.transaction(STORE, 'readwrite');
                const s = tx.objectStore(STORE);
                deletes.forEach(k => s.delete(k));
                puts.forEach(([k, v]) => s.put(v, k));
                await done(tx);
            },
            async clear() {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).clear();
                await done(tx);
            },
        });
    };
});

/** Tarayıcıdan depoyu kalıcı tutmasını iste (yer azalınca kendiliğinden silinmesin); en iyi çaba */
export const requestPersistentStorage = (): void => {
    try { void navigator.storage?.persist?.(); } catch { /* desteklenmiyor */ }
};

/** Testler için bellek deposu */
export const memoryStore = (failWith?: () => unknown): KvStore & { data: Map<string, unknown>; writes: number } => {
    const data = new Map<string, unknown>();
    const store = {
        data,
        writes: 0,
        async readAll() { return new Map(data); },
        async write(puts: [string, unknown][], deletes: string[]) {
            const err = failWith?.();
            if (err) throw err;
            store.writes++;
            deletes.forEach(k => data.delete(k));
            puts.forEach(([k, v]) => data.set(k, structuredClone(v)));
        },
        async clear() { data.clear(); },
    };
    return store;
};
