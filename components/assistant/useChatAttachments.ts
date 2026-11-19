import React, { useCallback, useRef, useState } from 'react';
import { ChatAttachment, MAX_ATTACHMENTS, readAttachment } from '../../utils/ai/attachments';

/**
 * Sohbet kutusundaki ekler (klasik ve modern sohbet ortak kullanır): dosya
 * seçme, sürükle-bırak, yapıştırma; metin tarayıcıda çıkarılır.
 */
export const useChatAttachments = () => {
    const [files, setFiles] = useState<ChatAttachment[]>([]);
    const [reading, setReading] = useState(0);
    const [errors, setErrors] = useState<string[]>([]);
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const countRef = useRef(0);
    countRef.current = files.length;

    const add = useCallback(async (list: FileList | File[] | null) => {
        const picked = Array.from(list || []);
        if (!picked.length) return;
        const room = Math.max(0, MAX_ATTACHMENTS - countRef.current);
        const errs: string[] = picked.length > room ? [`En çok ${MAX_ATTACHMENTS} dosya eklenebilir; fazlası alınmadı.`] : [];
        const accepted = picked.slice(0, room);
        countRef.current += accepted.length;
        setReading(n => n + accepted.length);
        for (const file of accepted) {
            try {
                const att = await readAttachment(file);
                setFiles(prev => [...prev, att]);
            } catch (e) {
                countRef.current -= 1;
                errs.push(`${file.name}: ${(e as Error)?.message || 'okunamadı'}`);
            } finally {
                setReading(n => n - 1);
            }
        }
        setErrors(errs);
        if (fileRef.current) fileRef.current.value = '';
    }, []);

    const remove = useCallback((id: string) => setFiles(prev => prev.filter(f => f.id !== id)), []);
    const clear = useCallback(() => { setFiles([]); setErrors([]); }, []);
    const pick = useCallback(() => fileRef.current?.click(), []);

    /** Sohbet alanına yayılacak sürükle-bırak olayları */
    const dropProps = {
        onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } },
        onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); },
        onDrop: (e: React.DragEvent) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); } },
    };
    /** Panodan dosya yapıştırma (metin yapıştırma etkilenmez) */
    const onPaste = (e: React.ClipboardEvent) => { if (e.clipboardData.files.length) { e.preventDefault(); add(e.clipboardData.files); } };

    return { files, reading, errors, dragging, fileRef, add, remove, clear, pick, dropProps, onPaste, full: files.length >= MAX_ATTACHMENTS };
};

export const fmtFileSize = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
