import { useCallback, useEffect, useRef, useState } from 'react';
import { getClient, loadCloudConfig } from '../../utils/cloudSync';
import { MEMORY_CHANGE_EVENT } from '../../utils/ai/memory';
import {
    identityKeyOf, loadMemorySyncSettings, loadSyncState, saveMemorySyncSettings, supabaseMemoryRemote, syncMemory,
} from '../../utils/ai/memorySync';

/**
 * Hafızanın bulut eşitlemesini yönetir.
 *  - Elle: syncNow ("Şimdi eşitle").
 *  - Otomatik (cihaz ayarı, varsayılan kapalı): asistan açılınca, hafıza
 *    değişince (3 sn sonra, toplu) ve sekmeye dönülünce (2 dk'dan eskiyse).
 * Bulut bağlı değilse (Ayarlar › Bulut) eşitleme sunulmaz.
 */

export interface MemorySyncStatus {
    /** Bulut yapılandırılmış ve bir çalışma alanına bağlı mı */
    available: boolean;
    auto: boolean;
    state: 'idle' | 'syncing' | 'ok' | 'error';
    lastAt?: string;
    message?: string;
}

const CHANGE_DEBOUNCE_MS = 3_000;
const OPEN_MIN_GAP_MS = 60_000;
const FOCUS_MIN_GAP_MS = 120_000;

const cloudTarget = (): { workspaceId: string } | null => {
    const cfg = loadCloudConfig();
    return cfg?.workspaceId ? { workspaceId: cfg.workspaceId } : null;
};

const summary = (pulled: number, removed: number, pushed: boolean): string => {
    const parts: string[] = [];
    if (pulled) parts.push(`${pulled} satır buluttan geldi`);
    if (removed) parts.push(`${removed} satır başka cihazda silinmişti`);
    if (pushed) parts.push('buluta yazıldı');
    return parts.length ? parts.join(', ') : 'Güncel';
};

export const useMemorySync = (getMemoryKey: () => string | null, onSynced: () => void, isOpen: boolean) => {
    const [status, setStatus] = useState<MemorySyncStatus>(() => ({ available: !!cloudTarget(), auto: loadMemorySyncSettings().auto, state: 'idle' }));
    const inflight = useRef(false);
    const again = useRef(false);
    const lastRun = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoRef = useRef(status.auto);
    autoRef.current = status.auto;

    /** Bulut ve son eşitleme bilgisini yeniler (kimlik ya da bulut ayarı değişmiş olabilir) */
    const refresh = useCallback(() => {
        const target = cloudTarget();
        const key = getMemoryKey();
        const last = target && key ? loadSyncState(key, target.workspaceId)?.at : undefined;
        setStatus(s => ({ ...s, available: !!target, lastAt: last ?? (target ? s.lastAt : undefined) }));
    }, [getMemoryKey]);

    const syncNow = useCallback(async (): Promise<void> => {
        if (inflight.current) { again.current = true; return; }
        const target = cloudTarget();
        const key = getMemoryKey();
        const client = getClient();
        if (!target || !key || !client) {
            setStatus(s => ({ ...s, available: false, state: 'error', message: 'Bulut bağlı değil. Ayarlar › Bulut eşitleme bölümünden bağlanın.' }));
            return;
        }
        inflight.current = true;
        lastRun.current = Date.now();
        setStatus(s => ({ ...s, available: true, state: 'syncing', message: undefined }));
        try {
            const { data } = await client.auth.getSession();
            const userId = data.session?.user?.id;
            if (!userId) {
                setStatus(s => ({ ...s, state: 'error', message: 'Buluta giriş yapılmamış. Ayarlar › Bulut eşitleme bölümünden giriş yapın.' }));
                return;
            }
            const r = await syncMemory(key, target.workspaceId, supabaseMemoryRemote(client, target.workspaceId, userId, identityKeyOf(key)));
            if (r.ok) {
                setStatus(s => ({ ...s, state: 'ok', lastAt: r.at, message: summary(r.pulled, r.removed, r.pushed) }));
                if (r.pulled || r.removed) onSynced();
            } else {
                setStatus(s => ({ ...s, state: 'error', message: r.error }));
            }
        } finally {
            inflight.current = false;
            if (again.current) { again.current = false; void syncNow(); }
        }
    }, [getMemoryKey, onSynced]);

    const setAuto = useCallback((auto: boolean) => {
        saveMemorySyncSettings({ auto });
        setStatus(s => ({ ...s, auto }));
        if (auto) void syncNow();
    }, [syncNow]);

    // Asistan açılınca: durumu yenile; otomatikse (son dakikada yapılmadıysa) eşitle
    useEffect(() => {
        if (!isOpen) return;
        refresh();
        if (autoRef.current && cloudTarget() && Date.now() - lastRun.current > OPEN_MIN_GAP_MS) void syncNow();
    }, [isOpen, refresh, syncNow]);

    // Hafıza değişince (asistan, panel ya da elle düzenleme): 3 sn içindeki değişiklikler tek eşitlemede
    useEffect(() => {
        const onChange = (e: Event) => {
            if (!autoRef.current || !cloudTarget()) return;
            const key = (e as CustomEvent<{ key?: string }>).detail?.key;
            if (key && key !== getMemoryKey()) return;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => { timer.current = null; void syncNow(); }, CHANGE_DEBOUNCE_MS);
        };
        window.addEventListener(MEMORY_CHANGE_EVENT, onChange);
        return () => {
            window.removeEventListener(MEMORY_CHANGE_EVENT, onChange);
            if (timer.current) clearTimeout(timer.current);
        };
    }, [getMemoryKey, syncNow]);

    // Sekmeye dönülünce: başka cihazdaki değişiklikleri al
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible' || !autoRef.current || !cloudTarget()) return;
            if (Date.now() - lastRun.current > FOCUS_MIN_GAP_MS) void syncNow();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [syncNow]);

    return { status, syncNow, setAuto, refresh };
};
