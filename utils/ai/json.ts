import { stripReasoning } from './client';

/**
 * Model yanıtından JSON ayıklar — sağlayıcıdan bağımsız (JSON modu olmayan
 * modellerde de çalışır): ```json bloğu, yanıtın tamamı ya da metinde önce
 * açılan dengeli [...] / {...} parçası denenir; sondaki virgüller tolere edilir.
 */

const balanced = (text: string, open: '[' | '{'): string | undefined => {
    const close = open === '[' ? ']' : '}';
    const start = text.indexOf(open);
    if (start === -1) return undefined;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === open) depth++;
        else if (ch === close && --depth === 0) return text.slice(start, i + 1);
    }
    return undefined;
};

export const extractJson = (text: string): unknown => {
    const t = stripReasoning(text).trim();
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)?.[1];
    // Metinde önce hangisi açılıyorsa o: nesnenin içindeki ilk dizi ("dayanak": [...]) tek başına alınmasın
    const arrayFirst = t.indexOf('[') !== -1 && (t.indexOf('{') === -1 || t.indexOf('[') < t.indexOf('{'));
    const outer = arrayFirst ? [balanced(t, '['), balanced(t, '{')] : [balanced(t, '{'), balanced(t, '[')];
    const candidates = [fence, t, ...outer].filter((c): c is string => !!c && !!c.trim());
    for (const c of candidates) {
        try {
            return JSON.parse(c);
        } catch {
            try {
                return JSON.parse(c.replace(/,\s*([}\]])/g, '$1'));
            } catch {
                /* sıradaki aday */
            }
        }
    }
    throw new Error('Model yanıtı beklenen biçimde (JSON) değil; tekrar deneyin.');
};

/** Dizi bekleniyorsa: doğrudan dizi ya da { "oneriler": [...] } gibi tek alanlı sarmalayıcı */
export const extractJsonArray = (text: string): unknown[] => {
    const v = extractJson(text);
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
        const arr = Object.values(v as Record<string, unknown>).find(Array.isArray);
        if (arr) return arr as unknown[];
    }
    throw new Error('Model yanıtında öneri listesi bulunamadı; tekrar deneyin.');
};
