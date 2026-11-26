import { useCallback, useMemo, useState } from 'react';
import { ageDays, MemoryItem, MemorySection, SECTION_TITLES } from '../../utils/ai/memory';
import { useAssistant } from './AssistantContext';

/**
 * Hafıza paneli mantığı (klasik ve modern arayüz ortak): bölümlere göre liste,
 * elle ekleme, Markdown belgesini düzenleme, .md indirme ve yükleme.
 */

export type EditableSection = Exclude<MemorySection, 'arsiv'>;

export const SECTION_OPTIONS: { value: EditableSection; label: string; hint: string }[] = [
    { value: 'uslup', label: SECTION_TITLES.uslup, hint: 'Hitap, yazım tarzı, yanıt uzunluğu. Ör. "Hitap: Murat Bey", "Yanıt uzunluğu: soruya göre"' },
    { value: 'tercih', label: SECTION_TITLES.tercih, hint: 'Kalıcı tercih. Ör. "Raporlarda süreyi gün olarak ver"' },
    { value: 'not', label: SECTION_TITLES.not, hint: 'Tarihli bağlam; ilgili sorularda okunur, eskir. Ör. "Ana proje: ATLAS #atlas"' },
];

export const memoryAgeLabel = (m: MemoryItem, now = new Date()): string => {
    const d = ageDays(m.createdAt, now);
    if (d === 0) return 'bugün';
    if (d === 1) return 'dün';
    if (d < 14) return `${d} gün`;
    if (d < 60) return `${Math.round(d / 7)} hf`;
    return `${Math.round(d / 30)} ay`;
};

const relativeTime = (iso: string, now = Date.now()): string => {
    const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    if (s < 60) return 'az önce';
    if (s < 3600) return `${Math.round(s / 60)} dk önce`;
    if (s < 86_400) return `${Math.round(s / 3600)} sa önce`;
    return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

export const MEMORY_STORAGE_NOTE = 'Bu tarayıcıda ve bu kimlik için saklanır. Bulut eşitlemesinde yalnız sizin görebildiğiniz bir bulut satırına yazılır (yöneticiler dahil kimse göremez). Asistana her soruda üslup ve tercihler, notlardan ise yalnız soruyla ilgili olanlar gider; notların etkisi yaşla azalır, 6 aydan eski notlar arşive iner.';

export const useMemoryEditor = () => {
    const a = useAssistant();
    const [mode, setMode] = useState<'list' | 'edit'>('list');
    const [draft, setDraft] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [section, setSection] = useState<EditableSection>('not');
    const [text, setText] = useState('');
    const [important, setImportant] = useState(false);

    const groups = useMemo(() => (['uslup', 'tercih', 'not'] as const).map(s => ({
        section: s,
        title: SECTION_TITLES[s],
        items: a.memory.filter(m => m.section === s).sort((x, y) => (s === 'not' ? y.createdAt.localeCompare(x.createdAt) : 0)),
    })), [a.memory]);
    const archived = a.memory.filter(m => m.section === 'arsiv').length;
    const activeCount = a.memory.length - archived;

    const add = useCallback(() => {
        if (!text.trim()) return;
        const err = a.addMemory(text, section, important);
        setError(err);
        if (!err) { setText(''); setImportant(false); }
    }, [a, text, section, important]);

    const startEdit = useCallback(() => { setDraft(a.memoryMarkdown()); setError(null); setMode('edit'); }, [a]);
    const cancelEdit = useCallback(() => { setMode('list'); setError(null); }, []);
    const saveEdit = useCallback(() => {
        const err = a.saveMemoryMarkdown(draft);
        setError(err);
        if (!err) setMode('list');
    }, [a, draft]);

    const download = useCallback(() => {
        const blob = new Blob([a.memoryMarkdown()], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'hafiza.md';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }, [a]);

    const upload = useCallback(async (file: File | undefined) => {
        if (!file) return;
        if (file.size > 200_000) { setError('Dosya çok büyük (en çok 200 KB).'); return; }
        const md = await file.text();
        if (!window.confirm('Yüklenen belge mevcut hafızanın yerini alacak. Devam edilsin mi?')) return;
        setError(a.saveMemoryMarkdown(md));
        setMode('list');
    }, [a]);

    const clear = useCallback(() => {
        if (window.confirm('Asistanın hafızasındaki tüm satırlar (arşiv dahil) silinsin mi?')) a.clearMemory();
    }, [a]);

    const sync = a.memorySync;
    const syncText = !sync.available
        ? 'Bulut bağlı değil (Ayarlar › Bulut eşitleme)'
        : sync.state === 'syncing'
            ? 'Eşitleniyor…'
            : sync.state === 'error'
                ? sync.message || 'Eşitlenemedi'
                : sync.lastAt
                    ? `Son eşitleme ${relativeTime(sync.lastAt)}${sync.message && sync.message !== 'Güncel' ? ` · ${sync.message}` : ''}`
                    : 'Henüz buluta eşitlenmedi';

    return {
        sync, syncText, syncNow: a.syncMemoryNow, setAutoSync: a.setMemoryAutoSync,
        mode, draft, setDraft, error, section, setSection, text, setText, important, setImportant,
        groups, archived, activeCount, add, startEdit, cancelEdit, saveEdit, download, upload, clear, forget: a.forgetMemory,
        hint: SECTION_OPTIONS.find(o => o.value === section)?.hint || '',
    };
};
