import { useCallback, useMemo, useState } from 'react';
import { ageDays, MemoryItem, MemorySection, SECTION_TITLES } from '../../utils/ai/memory';
import { useAssistant } from './AssistantContext';

/**
 * Hafıza paneli mantığı (klasik ve modern arayüz ortak): bölümlere göre liste,
 * elle ekleme, Markdown belgesini düzenleme, .md indirme ve yükleme.
 */

export type EditableSection = Exclude<MemorySection, 'arsiv'>;

export const SECTION_OPTIONS: { value: EditableSection; label: string; hint: string }[] = [
    { value: 'uslup', label: SECTION_TITLES.uslup, hint: 'Hitap, yazım tarzı, yanıt uzunluğu. Ör. "Hitap: Murat Bey", "Yanıt uzunluğu: kısa"' },
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

    return {
        mode, draft, setDraft, error, section, setSection, text, setText, important, setImportant,
        groups, archived, activeCount, add, startEdit, cancelEdit, saveEdit, download, upload, clear, forget: a.forgetMemory,
        hint: SECTION_OPTIONS.find(o => o.value === section)?.hint || '',
    };
};
