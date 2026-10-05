import { ToolContext } from '../ai/scope';
import { Embedder, Retriever, RetrieverStatus, SearchOptions } from './retriever';
import { guideDocs, RagDoc, uploadedDocsToRag, UploadedDoc, workspaceDocs } from './sources';
import { createStore, STORE_DOCUMENTS, STORE_VECTORS } from './store';

/**
 * Uygulama genelindeki RAG çalışma zamanı (tekil): bilgi tabanı dizini,
 * Bilgi Bankası dokümanları ve embedding yapılandırması.
 *
 * Akış (pipeline): kaynaklar (rol kapsamlı uygulama verisi + kılavuz +
 * dokümanlar) → parçalama → BM25 dizini (anında) → embedding (arka planda,
 * yalnızca değişen parçalar, IndexedDB önbellekli) → hibrit arama.
 */

const vectorStore = createStore<Float32Array>(STORE_VECTORS);
const docStore = createStore<UploadedDoc>(STORE_DOCUMENTS);

export const retriever = new Retriever({ cache: vectorStore });

let embedder: Embedder | null = null;
let uploaded: UploadedDoc[] | null = null;
const docListeners = new Set<() => void>();

/** Sunucuda embedding modeli varsa anlamsal arama açılır; yoksa null → yalnızca BM25 */
export const configureEmbedder = (e: Embedder | null): void => {
    if (embedder?.model === e?.model) return;
    embedder = e;
};

export const getEmbedder = (): Embedder | null => embedder;

export const listUploadedDocs = async (): Promise<UploadedDoc[]> => {
    if (!uploaded) uploaded = (await docStore.getAll()).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    return uploaded;
};

export const onDocsChange = (fn: () => void): (() => void) => {
    docListeners.add(fn);
    return () => docListeners.delete(fn);
};

const docsChanged = () => {
    uploaded = null;
    docListeners.forEach(fn => fn());
};

export const addUploadedDoc = async (doc: Omit<UploadedDoc, 'id' | 'addedAt'>): Promise<UploadedDoc> => {
    const full: UploadedDoc = { ...doc, id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, addedAt: new Date().toISOString() };
    await docStore.putMany([[full.id, full]]);
    docsChanged();
    return full;
};

export const removeUploadedDoc = async (id: string): Promise<void> => {
    await docStore.remove(id);
    docsChanged();
};

export const getUploadedDoc = async (id: string): Promise<UploadedDoc | undefined> =>
    (await listUploadedDocs()).find(d => d.id === id);

/** Bu kullanıcının kapsamındaki tüm bilgi tabanı belgeleri */
export const collectDocs = async (ctx: ToolContext): Promise<RagDoc[]> => [
    ...workspaceDocs(ctx),
    ...guideDocs(),
    ...uploadedDocsToRag(await listUploadedDocs()),
];

/** Dizini güncel kapsama getirir; embedding'i arka planda başlatır */
export const syncIndex = async (ctx: ToolContext): Promise<void> => {
    retriever.sync(await collectDocs(ctx), embedder);
};

export const searchKnowledge = async (ctx: ToolContext, query: string, o: Omit<SearchOptions, 'embedder'> = {}) => {
    await syncIndex(ctx);
    return retriever.search(query, { ...o, embedder });
};

export const searchMode = (): 'hibrit (anlamsal + anahtar kelime)' | 'anahtar kelime' => {
    const s = retriever.status();
    return embedder && s.vectors > 0 && !s.semanticError ? 'hibrit (anlamsal + anahtar kelime)' : 'anahtar kelime';
};

export const indexStatus = (): RetrieverStatus & { semanticEnabled: boolean } => ({
    ...retriever.status(),
    semanticEnabled: !!embedder,
});

/** "Dizini yenile": hata durumunu sıfırlar, dizini kurar ve embedding'i baştan dener */
export const rebuildIndex = async (ctx: ToolContext): Promise<void> => {
    retriever.resetSemanticError();
    await syncIndex(ctx);
};
