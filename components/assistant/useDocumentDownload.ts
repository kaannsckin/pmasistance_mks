import { useCallback, useState } from 'react';
import { AiDocument, DOC_FORMATS, DocFormat } from '../../utils/export/aiDocument';

/** Kartta gösterilecek biçimler: önce asistanın seçtiği, sonra diğerleri */
export const formatsFor = (doc: AiDocument): DocFormat[] => [doc.format, ...DOC_FORMATS.filter(f => f !== doc.format)];

/**
 * Dosya kartının indirme durumu. Dönüştürücü (ve ağır kütüphaneler) ilk
 * tıklamada yüklenir; hata kartta gösterilir.
 */
export const useDocumentDownload = () => {
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<Record<string, string>>({});
    const [done, setDone] = useState<Record<string, string>>({});
    const download = useCallback(async (doc: AiDocument, format: DocFormat) => {
        const key = `${doc.id}:${format}`;
        setBusy(key);
        setError(e => ({ ...e, [doc.id]: '' }));
        try {
            const { downloadDocument } = await import('../../utils/export/renderAiDocument');
            const name = await downloadDocument(doc, format);
            setDone(d => ({ ...d, [doc.id]: name }));
        } catch (e) {
            setError(x => ({ ...x, [doc.id]: `Dosya üretilemedi: ${(e as Error)?.message || 'bilinmeyen hata'}` }));
        } finally {
            setBusy(null);
        }
    }, []);
    return { busy, error, done, download };
};
