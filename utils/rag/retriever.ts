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

export interface RetrieverStatus {
    chunks: number;
    byType: Partial<Record<RagSourceType, number>>;
    vectors: number;
    model?: string;
    embedding: boolean; // arka planda embedding sürüyor mu
    semanticError?: string;
    lastSync?: string;
}

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

    constructor(private opts: { cache?: KvStore<Float32Array>; batchSize?: number; maxEmbedChunks?: number } = {}) {}

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
        }
        if (this.embedJob || this.semanticError) return this.embedJob || Promise.resolve();
        this.embedJob = this.fillVectors(embedder).finally(() => {
            this.embedJob = null;
            this.emit();
        });
        this.emit();
        return this.embedJob;
    }

    private async fillVectors(embedder: Embedder): Promise<void> {
        const batch = this.opts.batchSize || 32;
        const limit = this.opts.maxEmbedChunks || 3000;
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
                let vecs: number[][];
                try {
                    vecs = await embedder.embed(part.map(c => `${c.title}\n${c.text}`), 'document');
                } catch (e) {
                    this.semanticError = (e as Error)?.message || 'Embedding alınamadı.';
                    return;
                }
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
        };
    }

    resetSemanticError(): void {
        this.semanticError = undefined;
    }

    async search(query: string, o: SearchOptions = {}): Promise<RagHit[]> {
        const k = o.k ?? 6;
        const allow = (i: number) => {
            const c = this.chunks[i];
            return (!o.types?.length || o.types.includes(c.type)) && (!o.projectId || c.projectId === o.projectId);
        };
        const lex = searchBm25(this.bm25, query, 50, allow);

        let sem: { index: number; score: number }[] = [];
        const canSemantic = !!o.embedder && this.vectorModel === o.embedder.model && !this.semanticError &&
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
