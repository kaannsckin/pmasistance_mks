/**
 * Takip önerileri: asistan yanıtının sonuna kullanıcının bir sonraki adımda
 * isteyebileceği en çok üç kısa öneriyi ">> " ile başlayan satırlar olarak
 * yazar. Arayüz bu satırları metinden ayırır ve tıklanabilir çip olarak
 * gösterir; geçmişe (modele) gönderilmez.
 */

export const MAX_FOLLOW_UPS = 3;
const LINE = /^\s*(?:>>|»)\s+(.+?)\s*$/;

/** Yanıt metnini gövde ve takip önerilerine ayırır (yalnız sondaki ">> " satırları) */
export const splitFollowUps = (text: string): { body: string; followUps: string[] } => {
    const lines = text.replace(/\s+$/, '').split('\n');
    const found: string[] = [];
    let i = lines.length - 1;
    for (; i >= 0; i--) {
        const l = lines[i];
        const m = LINE.exec(l);
        if (m) { found.unshift(m[1].replace(/^["“]|["”]$/g, '').trim()); continue; }
        if (!l.trim() && found.length) continue; // öneriler arasındaki boş satır
        // Akış sürerken yarım kalmış ">" satırı da gizlenir
        if (/^\s*>{1,2}\s*$/.test(l)) continue;
        break;
    }
    const followUps = [...new Set(found.filter(f => f.length >= 3 && f.length <= 120))].slice(0, MAX_FOLLOW_UPS);
    return { body: lines.slice(0, i + 1).join('\n').replace(/\s+$/, ''), followUps };
};

export const FOLLOW_UP_RULE = `Takip önerileri: Yanıtın EN SONUNA, kullanıcının bir sonraki adımda isteyebileceği en çok 3 kısa öneriyi her biri ayrı satırda ">> " ile başlayarak yaz (ör. ">> Geciken görevlere yeni termin öner", ">> Bunu Excel olarak ver"). Öneriler bu konuşmanın verisine özgü ve yapılabilir olsun; genel geçer öneri yazma. Yanıt bir hata ya da soru ise öneri yazma.`;
