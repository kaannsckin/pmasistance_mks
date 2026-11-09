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

/** @param keep okunamayan ama depoda korunan proje kimlikleri (UI-KRC-21): meta onları listeden düşürmez */
export const metaOf = (ws: WorkspaceData, keep: string[] = []): StoredMeta => {
    const { projects, ...workspace } = ws;
    const ids = projects.map(p => p.id);
    return { format: STORE_FORMAT, workspace, projectIds: [...ids, ...keep.filter(id => !ids.includes(id))] };
};

/** Proje dizisi olması gereken alanlar: biri dizi değilse kayıt açılmaz, ekranlar çökerdi (UI-KRC-22) */
const PROJECT_LISTS = ['tasks', 'resources', 'risks', 'notes', 'customerRequests', 'objectives', 'workPackages', 'pestelItems', 'swotItems', 'releasePlans'];

/** Proje kaydı okunabilir mi: nesne, kimliği var, liste alanları dizi */
export const isReadableProject = (v: unknown): v is Project => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const r = v as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id) return false;
    return PROJECT_LISTS.every(k => r[k] === undefined || r[k] === null || Array.isArray(r[k]));
};

/** Okunamayan proje kaydından kullanıcıya gösterilecek ad (yarım JSON metninde de aranır) */
export const damagedProjectName = (v: unknown, id: string): string => {
    if (v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string') return (v as { name: string }).name;
    if (typeof v === 'string') { const m = v.match(/"name"\s*:\s*"([^"]{1,120})"/); if (m) return m[1]; }
    return id;
};

/**
 * Depodaki kayıtlardan çalışma alanı; biçim tanınmıyorsa null. Yetim proje kayıtları da döner (temizlik için).
 * Okunamayan proje kayıtları (bozuk metin, dizi olmayan liste alanı) açılmaz ama silinmez (UI-KRC-21):
 * `damaged` listesi döner, kaydedici bu kimlikleri meta'da tutar; kayıt depoda olduğu gibi kalır.
 */
export const joinStored = (records: Map<string, unknown>): { workspace: WorkspaceData; orphans: string[]; damaged: { id: string; name: string }[] } | null => {
    const meta = records.get(META) as StoredMeta | undefined;
    if (!meta || meta.format !== STORE_FORMAT || !Array.isArray(meta.projectIds)) return null;
    const projects: Project[] = [];
    const damaged: { id: string; name: string }[] = [];
    meta.projectIds.forEach(id => {
        if (!records.has(PROJECT + id)) return; // kaydı hiç olmayan kimlik: korunacak veri yok
        const v = records.get(PROJECT + id);
        if (isReadableProject(v) && v.id === id) projects.push(v);
        else damaged.push({ id, name: damagedProjectName(v, id) });
    });
    const known = new Set(meta.projectIds.map(id => PROJECT + id));
    const orphans = [...records.keys()].filter(k => k.startsWith(PROJECT) && !known.has(k));
    return { workspace: { ...meta.workspace, projects } as WorkspaceData, orphans, damaged };
};

/**
 * Açılışta deponun durumu. "Okunamayan" depo boş sayılmaz: içinde kullanıcının
 * verisi vardır (daha yeni bir sürümün biçimi ya da bozuk bir kayıt). Üzerine
 * örnek çalışma alanı yazılırsa veri geri dönülmez biçimde kaybolur (UI-KRC-01).
 */
export type StoredState =
    | { kind: 'empty' }
    | { kind: 'ok'; workspace: WorkspaceData; orphans: string[]; damaged: { id: string; name: string }[] }
    | { kind: 'unreadable'; reason: 'format' | 'meta'; format?: unknown; keys: number };

export const inspectStored = (records: Map<string, unknown>): StoredState => {
    if (records.size === 0) return { kind: 'empty' };
    const joined = joinStored(records);
    if (joined) return { kind: 'ok', ...joined };
    const meta = records.get(META);
    const format = meta && typeof meta === 'object' ? (meta as { format?: unknown }).format : undefined;
    const reason = format !== undefined && format !== STORE_FORMAT ? 'format' : 'meta';
    return { kind: 'unreadable', reason, format, keys: records.size };
};

/** Okunamayan deponun ham kopyası: kullanıcı indirir, veri kaybolmaz */
export const rawStoreDump = (records: Map<string, unknown>, now: Date = new Date()): string =>
    JSON.stringify({ tur: 'planasistan-ham-depo', disaAktarim: now.toISOString(), kayitlar: Object.fromEntries(records) }, null, 1);

const sameOrder = (a: Project[], b: Project[]) => a.length === b.length && a.every((p, i) => p.id === b[i].id);

/** Son yazılandan bu yana değişen parçalar (nesne kimliğiyle); `prev` yoksa hepsi */
export const storageDiff = (prev: WorkspaceData | null, next: WorkspaceData, keep: string[] = []): { puts: [string, unknown][]; deletes: string[] } => {
    const puts: [string, unknown][] = [];
    const deletes: string[] = [];
    const before = new Map((prev?.projects || []).map(p => [p.id, p]));
    next.projects.forEach(p => { if (before.get(p.id) !== p) puts.push([PROJECT + p.id, p]); });
    const ids = new Set(next.projects.map(p => p.id));
    before.forEach((_, id) => { if (!ids.has(id)) deletes.push(PROJECT + id); });
    const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next)]);
    const metaChanged = !prev || !sameOrder(prev.projects, next.projects)
        || [...keys].some(k => k !== 'projects' && (prev as unknown as Record<string, unknown>)[k] !== (next as unknown as Record<string, unknown>)[k]);
    if (metaChanged) puts.push([META, metaOf(next, keep)]);
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
     * @param keepProjectIds okunamayan, depoda olduğu gibi korunan proje kayıtları (UI-KRC-21)
     */
    constructor(
        private readonly kv: KvStore,
        private saved: WorkspaceData | null,
        private readonly onResult: (ok: boolean, error?: unknown) => void = () => {},
        private extraDeletes: string[] = [],
        private readonly keepProjectIds: string[] = [],
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

    /** Bekleyen yazımları bitirir ve sonraki kayıtları durdurur (sekme devri: başka sekme yazacak) */
    async pause(): Promise<void> {
        await this.flush();
        this.stopped = true;
        this.pending = null;
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
            const { puts, deletes } = storageDiff(this.saved, ws, this.keepProjectIds);
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
