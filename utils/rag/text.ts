/**
 * Türkçe metin işleme — RAG anahtar kelime araması için.
 *
 *  - Katlama: küçük harf (tr-TR) + aksan/şapka kaldırma (ç→c, ş→s, ğ→g, ı/İ→i,
 *    ö→o, ü→u) — kullanıcı "butce" yazsa da "bütçe" bulunur.
 *  - Gövdeleme: Türkçe eklemeli bir dil; ilk 5 harfe kırpma ("F5") Türkçe bilgi
 *    erişiminde basit ve etkili bir gövdeleme yöntemidir:
 *    gecikme / gecikmesi / gecikmeler → "gecik".
 */

export const foldTr = (s: string): string =>
    s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '');

// Katlanmış biçimde yaygın Türkçe dolgu kelimeleri + soru kalıpları
const STOPWORDS = new Set([
    've', 'ile', 'bir', 'bu', 'su', 'o', 'da', 'de', 'ki', 'mi', 'mu', 'icin', 'ama', 'fakat', 'gibi', 'daha', 'cok', 'en',
    'ne', 'neler', 'nedir', 'nasil', 'neden', 'nicin', 'hangi', 'hangisi', 'hangileri', 'kim', 'kimler', 'kimin', 'nerede',
    'ya', 'veya', 'yada', 'hem', 'her', 'olan', 'olarak', 'degil', 'var', 'yok', 'kadar', 'sonra', 'once', 'gore', 'ise',
    'ben', 'sen', 'biz', 'siz', 'onlar', 'bana', 'bize', 'beni', 'icinde', 'uzere', 'ayni', 'tum', 'butun', 'bazi', 'hep',
    'sey', 'seyi', 'oldu', 'olur', 'olsun', 'olmasi', 'olacak', 'edildi', 'yapildi', 'mi?', 'lutfen', 'acaba', 'nelerdir',
    'the', 'and', 'of', 'to', 'in', 'is', 'for', 'on', 'a', 'an',
]);

/** Ham kelimeler (katlanmış, dolgu kelimeleri atılmış) */
export const tokenize = (text: string): string[] =>
    foldTr(text)
        .split(/[^a-z0-9]+/)
        .filter(t => t.length >= 2 && !STOPWORDS.has(t));

/** Dizin terimi: 5 harften uzunsa ilk 5 harf (F5 gövdeleme); sayılar olduğu gibi */
export const stem = (token: string): string => (/^\d+$/.test(token) || token.length <= 5 ? token : token.slice(0, 5));

export const terms = (text: string): string[] => tokenize(text).map(stem);

/** FNV-1a 32 bit — içerik değişimini (artımlı dizinleme) saptamak için */
export const hashText = (s: string): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return `${(h >>> 0).toString(36)}${s.length.toString(36)}`;
};

/**
 * Metni anlamlı parçalara böler: paragraf → cümle → sert kesme sırasıyla;
 * ardışık parçalar arasında bağlam kopmasın diye küçük bir örtüşme bırakır.
 */
export const chunkText = (text: string, maxChars = 900, overlap = 120): string[] => {
    const clean = text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
    if (!clean) return [];
    if (clean.length <= maxChars) return [clean];

    const pieces: string[] = [];
    for (const para of clean.split(/\n\s*\n/)) {
        const p = para.trim();
        if (!p) continue;
        if (p.length <= maxChars) {
            pieces.push(p);
            continue;
        }
        for (const sentence of p.split(/(?<=[.!?…])\s+/)) {
            if (sentence.length <= maxChars) pieces.push(sentence);
            else for (let i = 0; i < sentence.length; i += maxChars - overlap) pieces.push(sentence.slice(i, i + maxChars));
        }
    }

    const chunks: string[] = [];
    let cur = '';
    for (const piece of pieces) {
        if (cur && cur.length + piece.length + 1 > maxChars) {
            chunks.push(cur);
            // Örtüşme: önceki parçanın son kelimeleri
            const tail = cur.slice(-overlap);
            const cut = tail.indexOf(' ');
            cur = (cut >= 0 ? tail.slice(cut + 1) : tail) + ' ' + piece;
        } else {
            cur = cur ? `${cur}\n${piece}` : piece;
        }
    }
    if (cur) chunks.push(cur);
    return chunks;
};
