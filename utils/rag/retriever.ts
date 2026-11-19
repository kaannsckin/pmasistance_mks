import { buildBm25, Bm25Index, searchBm25 } from './bm25';
import { RagDoc, RagRef, RagSourceType } from './sources';
import { KvStore } from './store';
import { chunkText, hashText } from './text';

/**
 * Hibrit arama: BM25 (her zaman) + embedding benzerliği (yapılandırılmışsa),
 * Reciprocal Rank Fusion ile birleştirilir.
 *
 * Dizinleme artımlıdır: parça içeriğinin özeti değişmedikçe embedding yeniden
 * hesaplanmaz (önbellek: "model:özet" → vektör). Embedding arka planda,
 * aramayı bekletmeden doldurulur; o sırada sonuçlar anahtar kelimeye dayanır.
 */

export interface RagChunk {
    id: string;
    docId: string;
    type: RagSourceType;
    title: string;
    text: string;
    projectId?: string;
    projectName?: string;
    date?: string;
    ref: RagRef;
    hash: string;
}

export interface RagHit {
    chunk: RagChunk;
    score: number;
    lexical: boolean;
    semantic: boolean;
}

export interface Embedder {
    model: string;
    embed: (texts: string[], kind: 'document' | 'query') => Promise<number[][]>;
}

export interface SearchOptions {
    k?: number;
    types?: RagSourceType[];
    projectId?: string;
    embedder?: Embedder | null;
}

/** Embedding neden bekliyor: dakikalık hız sınırı, günlük kota, kota/bakiye bitti, bağlantı */
export type EmbeddingWaitKind = 'rate' | 'daily' | 'exhausted' | 'transient';

export interface RetrieverStatus {
    chunks: number;
    byType: Partial<Record<RagSourceType, number>>;
    vectors: number;
    model?: string;
    embedding: boolean; // arka planda embedding sürüyor mu
    semanticError?: string;
    lastSync?: string;
    /** Embedding sınıra takıldı ve bekliyor: bu saatte kaldığı yerden sürer (ISO) */
    waitUntil?: string;
    waitKind?: EmbeddingWaitKind;
    /** Sağlayıcının hata metni */
    waitDetail?: string;
}

export interface RetrieverOptions {
    cache?: KvStore<Float32Array>;
    batchSize?: number;
    maxEmbedChunks?: number;
    /** İki embedding isteği arasındaki en kısa süre (ms); hız sınırına takıldıkça iki katına çıkar */
    minIntervalMs?: number;
    /** Aralığın üst sınırı (ms) */
    maxIntervalMs?: number;
    /** Sağlayıcı süre bildirmediğinde ilk bekleme (ms); ardışık her sınırda iki katına çıkar */
    backoffMs?: number;
    /** Dakikalık sınırda tek beklemenin üst sınırı (ms) */
    maxWaitMs?: number;
    /** Günlük kota / bakiye bittiğinde yeniden deneme aralığı (ms) */
    longWaitMs?: number;
    /** Bağlantı / zaman aşımı hatasında en çok kaç kez yeniden denenir */
    maxTransientRetries?: number;
    /** Testler için saat ve bekleme */
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

/** Embedding hatasının türü: beklenip yeniden denenebilir mi? (AiError alanları; ördek tipleme) */
const classifyEmbedError = (e: unknown): { kind: 'rate' | 'transient' | 'fatal'; message: string; retryAfterMs?: number; quota?: 'daily' | 'exhausted' } => {
    const x = (e || {}) as { message?: string; code?: string; status?: number; retryAfterSec?: number; quota?: 'daily' | 'exhausted' };
    const message = x.message || 'Embedding alınamadı.';
    const retryAfterMs = x.retryAfterSec && x.retryAfterSec > 0 ? x.retryAfterSec * 1000 : undefined;
    if (x.code === 'rate_limited' || x.status === 429) return { kind: 'rate', message, retryAfterMs, quota: x.quota };
    if (x.code === 'timeout' || x.code === 'network') return { kind: 'transient', message, retryAfterMs };
    return { kind: 'fatal', message };
};

/** Bilgi Bankası'nda gösterilen bekleme metni; beklenmiyorsa null */
export const embeddingWaitText = (s: RetrieverStatus, now = Date.now()): string | null => {
    if (!s.waitUntil) return null;
    const until = Date.parse(s.waitUntil);
    const when = until - now <= 90_000
        ? 'birazdan'
        : `${new Date(until).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} civarında`;
    const why = s.waitKind === 'daily' ? 'AI sağlayıcısının günlük kotası doldu'
        : s.waitKind === 'exhausted' ? 'AI sağlayıcısının kotası tükendi (faturalandırmayı kontrol edin)'
            : s.waitKind === 'transient' ? 'AI sunucusuna ulaşılamadı'
                : 'AI sağlayıcısı hız sınırına ulaştı';
    return `${why}; anlamsal dizin ${when} kaldığı yerden devam edecek (${s.vectors}/${s.chunks} parça hazır). Bu sırada anahtar kelime araması kullanılıyor.`;
};

const RRF_K = 60;
const MAX_PER_DOC = 2;

export const chunkDocs = (docs: RagDoc[]): RagChunk[] =>
    docs.flatMap(d => chunkText(d.text).map((text, i) => ({
        id: `${d.id}#${i}`,
        docId: d.id,
        type: d.type,
        title: d.title,
        text,
        projectId: d.projectId,
        projectName: d.projectName,
        date: d.date,
        ref: d.ref,
        hash: hashText(`${d.title}\n${text}`),
    })));

const cosine = (a: Float32Array, b: Float32Array): number => {
    let dot = 0, na = 0, nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

export class Retriever {
    private chunks: RagChunk[] = [];
    private bm25: Bm25Index = buildBm25([]);
    private signature = '';
    private vectors = new Map<string, Float32Array>(); // parça özeti → vektör (geçerli model)
    private vectorModel?: string;
    private embedJob: Promise<void> | null = null;
    private semanticError?: string;
    private lastSync?: string;
    private listeners = new Set<() => void>();
    /** Sınıra takılan embedding'in beklemesi (bitince kaldığı yerden sürer) */
    private wait?: { until: number; kind: EmbeddingWaitKind; detail: string };
    /** Süren beklemeyi hemen bitirir ("Dizini yenile", model değişimi) */
    private wake: (() => void) | null = null;

    constructor(private opts: RetrieverOptions = {}) {}

    private now(): number {
        return this.opts.now ? this.opts.now() : Date.now();
    }

    /** Uyandırılabilir bekleme */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const done = () => {
                if (this.wake === done) this.wake = null;
                if (timer !== undefined) clearTimeout(timer);
                resolve();
            };
            this.wake = done;
            if (this.opts.sleep) this.opts.sleep(ms).then(done);
            else timer = setTimeout(done, ms);
        });
    }

    private async waitFor(ms: number, kind: EmbeddingWaitKind, detail: string): Promise<void> {
        this.wait = { until: this.now() + ms, kind, detail };
        this.emit();
        try {
            await this.sleep(ms);
        } finally {
            this.wait = undefined;
            this.emit();
        }
    }

    onChange(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private emit() {
        this.listeners.forEach(fn => fn());
    }

    /** Belgeleri dizine yansıtır (değişmediyse hiçbir şey yapmaz); embedding'i arka planda başlatır */
    sync(docs: RagDoc[], embedder?: Embedder | null): void {
        const chunks = chunkDocs(docs);
        const signature = hashText(chunks.map(c => `${c.id}:${c.hash}`).join('|'));
        if (signature !== this.signature) {
            this.chunks = chunks;
            this.bm25 = buildBm25(chunks);
            this.signature = signature;
            this.lastSync = new Date().toISOString();
            this.emit();
        }
        if (embedder) this.startEmbedding(embedder);
    }

    /** Eksik vektörleri tamamlar (aynı anda tek iş) */
    startEmbedding(embedder: Embedder): Promise<void> {
        if (this.vectorModel !== embedder.model) {
            this.vectors.clear();
            this.vectorModel = embedder.model;
            this.semanticError = undefined;
            // Eski modelin işi beklemedeyse uyandırılır; o iş bitince yeni modelle başlanır
            if (this.embedJob) {
                this.wake?.();
                return this.embedJob.then(() => this.startEmbedding(embedder));
            }
        }
        if (this.embedJob || this.semanticError) return this.embedJob || Promise.resolve();
        this.embedJob = this.fillVectors(embedder).finally(() => {
            this.embedJob = null;
            this.emit();
        });
        this.emit();
        return this.embedJob;
    }

    /**
     * Eksik vektörleri parti parti alır. İstekler aralıklı gider; hız/kota
     * sınırında sağlayıcının bildirdiği süre (yoksa artan süre) beklenip aynı
     * partiden devam edilir, aralık da uzatılır. Her parti önbelleğe yazıldığı
     * için sayfa yenilense de iş kaldığı yerden sürer.
     */
    private async fillVectors(embedder: Embedder): Promise<void> {
        const batch = this.opts.batchSize || 32;
        const limit = this.opts.maxEmbedChunks || 3000;
        const minInterval = this.opts.minIntervalMs ?? 1000;
        const maxInterval = Math.max(minInterval, this.opts.maxIntervalMs ?? 60_000);
        const backoff = this.opts.backoffMs ?? 15_000;
        const maxWait = this.opts.maxWaitMs ?? 5 * 60_000;
        const longWait = this.opts.longWaitMs ?? 60 * 60_000;
        const maxTransient = this.opts.maxTransientRetries ?? 3;
        const stale = () => this.vectorModel !== embedder.model;
        let interval = minInterval;
        let lastAt = -Infinity;
        // Döngü: dizin embedding sırasında değişirse yeni parçalar da tamamlanır
        for (let round = 0; round < 3; round++) {
            const wanted = Array.from(new Map(this.chunks.slice(0, limit).map(c => [c.hash, c])).values())
                .filter(c => !this.vectors.has(c.hash));
            if (wanted.length === 0) return;
            const key = (h: string) => `${embedder.model}:${h}`;
            const cached = this.opts.cache ? await this.opts.cache.getMany(wanted.map(c => key(c.hash))) : new Map();
            cached.forEach((v, k) => this.vectors.set(k.slice(embedder.model.length + 1), v));
            const missing = wanted.filter(c => !this.vectors.has(c.hash));
            for (let i = 0; i < missing.length; i += batch) {
                const part = missing.slice(i, i + batch);
                let vecs: number[][] | null = null;
                let rateStrikes = 0;
                let transientStrikes = 0;
                while (!vecs) {
                    const gap = lastAt + interval - this.now();
                    if (gap > 0) await this.sleep(gap);
                    if (stale()) return;
                    lastAt = this.now();
                    try {
                        vecs = await embedder.embed(part.map(c => `${c.title}\n${c.text}`), 'document');
                    } catch (e) {
                        const f = classifyEmbedError(e);
                        if (f.kind === 'fatal') {
                            if (!stale()) this.semanticError = f.message;
                            return;
                        }
                        let ms: number;
                        if (f.kind === 'transient') {
                            if (++transientStrikes > maxTransient) {
                                if (!stale()) this.semanticError = f.message;
                                return;
                            }
                            ms = Math.min(maxWait, f.retryAfterMs ?? backoff * 2 ** (transientStrikes - 1));
                        } else if (f.quota) {
                            // Günlük kota / bakiye: dakikalar içinde açılmaz; seyrek yeniden denenir
                            ms = Math.max(longWait, Math.min(f.retryAfterMs ?? 0, 24 * 3600_000));
                        } else {
                            rateStrikes++;
                            ms = f.retryAfterMs !== undefined
                                ? Math.min(f.retryAfterMs, longWait)
                                : Math.min(maxWait, backoff * 2 ** (rateStrikes - 1));
                            interval = Math.min(maxInterval, Math.max(interval * 2, 1000));
                        }
                        if (stale()) return;
                        await this.waitFor(ms, f.kind === 'transient' ? 'transient' : f.quota || 'rate', f.message);
                        if (stale()) return;
                        lastAt = -Infinity; // bekleme aralığı zaten karşıladı
                    }
                }
                if (stale()) return; // model değişti: eski modelin vektörleri yazılmaz
                const entries: [string, Float32Array][] = [];
                part.forEach((c, j) => {
                    if (!vecs[j]?.length) return;
                    const v = Float32Array.from(vecs[j]);
                    this.vectors.set(c.hash, v);
                    entries.push([key(c.hash), v]);
                });
                if (this.opts.cache && entries.length) await this.opts.cache.putMany(entries).catch(() => undefined);
                this.emit();
            }
        }
    }

    /** Arka plandaki embedding işinin bitmesini bekler (testler / "dizini yenile") */
    async whenIdle(): Promise<void> {
        while (this.embedJob) await this.embedJob;
    }

    status(): RetrieverStatus {
        const byType: Partial<Record<RagSourceType, number>> = {};
        this.chunks.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1; });
        const vectors = this.chunks.filter(c => this.vectors.has(c.hash)).length;
        return {
            chunks: this.chunks.length, byType, vectors, model: this.vectorModel,
            embedding: !!this.embedJob, semanticError: this.semanticError, lastSync: this.lastSync,
            ...(this.wait ? { waitUntil: new Date(this.wait.until).toISOString(), waitKind: this.wait.kind, waitDetail: this.wait.detail } : {}),
        };
    }

    /** Hatayı sıfırlar; sınır yüzünden bekleyen embedding varsa hemen yeniden dener */
    resetSemanticError(): void {
        this.semanticError = undefined;
        this.wake?.();
    }

    async search(query: string, o: SearchOptions = {}): Promise<RagHit[]> {
        const k = o.k ?? 6;
        const allow = (i: number) => {
            const c = this.chunks[i];
            return (!o.types?.length || o.types.includes(c.type)) && (!o.projectId || c.projectId === o.projectId);
        };
        const lex = searchBm25(this.bm25, query, 50, allow);

        let sem: { index: number; score: number }[] = [];
        // Sınır yüzünden beklenirken sorgu embedding'i de istenmez (kotayı harcar, gecikir)
        const canSemantic = !!o.embedder && this.vectorModel === o.embedder.model && !this.semanticError && !this.wait &&
            this.chunks.some(c => this.vectors.has(c.hash));
        if (canSemantic) {
            try {
                const [qv] = await o.embedder!.embed([query], 'query');
                const q = Float32Array.from(qv);
                sem = this.chunks
                    .map((c, index) => ({ index, v: this.vectors.get(c.hash) }))
                    .filter((x): x is { index: number; v: Float32Array } => !!x.v && allow(x.index))
                    .map(x => ({ index: x.index, score: cosine(q, x.v) }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 50);
            } catch {
                sem = []; // sorgu embedding'i alınamazsa anahtar kelimeyle devam
            }
        }

        const fused = new Map<number, { score: number; lexical: boolean; semantic: boolean }>();
        lex.forEach((h, rank) => fused.set(h.index, { score: 1 / (RRF_K + rank + 1), lexical: true, semantic: false }));
        sem.forEach((h, rank) => {
            const cur = fused.get(h.index) || { score: 0, lexical: false, semantic: false };
            fused.set(h.index, { score: cur.score + 1 / (RRF_K + rank + 1), lexical: cur.lexical, semantic: true });
        });

        const perDoc = new Map<string, number>();
        const out: RagHit[] = [];
        for (const [index, f] of Array.from(fused.entries()).sort((a, b) => b[1].score - a[1].score)) {
            const chunk = this.chunks[index];
            const n = perDoc.get(chunk.docId) || 0;
            if (n >= MAX_PER_DOC) continue;
            perDoc.set(chunk.docId, n + 1);
            out.push({ chunk, score: f.score, lexical: f.lexical, semantic: f.semantic });
            if (out.length >= k) break;
        }
        return out;
    }
}
