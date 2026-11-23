/**
 * Asistan sohbet geçmişi: kimlik (rol + kişi) başına, yalnız bu tarayıcıda
 * (IndexedDB) saklanır; buluta ve çalışma alanı yedeğine girmez. Sayfa
 * yenilenince son sohbet geri gelir; eski sohbetler listelenir.
 *
 * Güvenlik: yeniden açılan sohbetteki onay bekleyen öneri kartları
 * uygulanamaz (veri o arada değişmiş olabilir); kullanıcı yeniden ister.
 */

/** Saklanan mesaj: arayüz mesajının kalıcı alt kümesi (akış durumu yok) */
export interface StoredMessage {
    id: number;
    role: 'user' | 'assistant' | 'system_alert';
    content: string;
    [key: string]: unknown;
}

export interface StoredChat {
    id: string;
    owner: string;
    title: string;
    updatedAt: string;
    messages: StoredMessage[];
}

export interface ChatSummary { id: string; title: string; updatedAt: string; count: number }

export const MAX_CHATS_PER_OWNER = 30;
export const MAX_MESSAGES_PER_CHAT = 200;
export const EXPIRED_PROPOSAL_NOTE = 'Sohbet yeniden açıldı; bu öneri artık uygulanamaz. Gerekirse yeniden isteyin.';

export const chatOwner = (role: string, personId?: string): string => `${role}:${personId || '-'}`;

/** Başlık: ilk kullanıcı mesajından, en çok 60 karakter */
export const chatTitle = (messages: Pick<StoredMessage, 'role' | 'content'>[]): string => {
    const first = messages.find(m => m.role === 'user' && m.content.trim());
    const t = (first?.content || 'Yeni sohbet').replace(/\s+/g, ' ').trim();
    return t.length > 60 ? `${t.slice(0, 57)}…` : t;
};

/** Kaydetmeye hazırlar: akış alanları atılır, en son 200 mesaj tutulur */
export const toStored = <M extends StoredMessage>(messages: M[]): StoredMessage[] =>
    messages.slice(-MAX_MESSAGES_PER_CHAT).map(m => {
        const { streaming: _s, ...rest } = m as M & { streaming?: boolean };
        return rest as unknown as StoredMessage;
    });

/** Geri yüklerken: bekleyen/çalışan öneriler süresi dolmuş sayılır */
export const restoreMessages = (messages: StoredMessage[]): StoredMessage[] =>
    messages.map(m => {
        const proposals = m.proposals as { status: string; message?: string }[] | undefined;
        if (!proposals?.some(p => p.status === 'pending' || p.status === 'running')) return m;
        return {
            ...m,
            proposals: proposals.map(p => (p.status === 'pending' || p.status === 'running' ? { ...p, status: 'rejected', message: EXPIRED_PROPOSAL_NOTE } : p)),
        };
    });

export const summarize = (chats: StoredChat[]): ChatSummary[] =>
    chats.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, count: c.messages.length }));

// ---------------------------------------------------------------- IndexedDB
const DB = 'planasistan-ai';
const STORE = 'chats';

const openDb = (): Promise<IDBDatabase | null> => new Promise(resolve => {
    try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
            const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
            s.createIndex('owner', 'owner');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
    } catch {
        resolve(null);
    }
});

const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
    const db = await openDb();
    if (!db) return undefined;
    return new Promise(resolve => {
        try {
            const t = db.transaction(STORE, mode);
            const req = fn(t.objectStore(STORE));
            t.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
            t.onerror = () => { db.close(); resolve(undefined); };
            t.onabort = () => { db.close(); resolve(undefined); };
        } catch {
            db.close();
            resolve(undefined);
        }
    });
};

export const listChats = async (owner: string): Promise<StoredChat[]> =>
    (await tx<StoredChat[]>('readonly', s => s.index('owner').getAll(owner))) || [];

export const loadChat = async (id: string): Promise<StoredChat | undefined> => {
    const c = await tx<StoredChat>('readonly', s => s.get(id));
    return c ? { ...c, messages: restoreMessages(c.messages) } : undefined;
};

/** Kaydeder; sahibin 30'dan fazla sohbeti varsa en eskileri silinir */
export const saveChat = async (chat: StoredChat): Promise<void> => {
    await tx('readwrite', s => s.put(chat));
    const all = summarize(await listChats(chat.owner));
    const extra = all.slice(MAX_CHATS_PER_OWNER);
    if (extra.length) await tx('readwrite', s => { extra.forEach(c => s.delete(c.id)); });
};

export const deleteChat = async (id: string): Promise<void> => { await tx('readwrite', s => s.delete(id)); };

export const newChatId = (): string => `sohbet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
