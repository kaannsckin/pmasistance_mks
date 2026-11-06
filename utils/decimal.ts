/**
 * Ondalık sayı girişi (süre tahmini gibi): virgül ya da nokta, tarayıcının dil ayarından
 * bağımsız. type="number" alanı tarayıcıya göre "1,5"i 15 ya da boş okuyabiliyor ve
 * parseInt yarım günü atıyordu (UI-KRC-05).
 */

/** Yazım sürerken kabul edilen biçim: rakamlar, en çok bir ayraç */
export const DECIMAL_TYPING = /^\d*[.,]?\d*$/;

/** "1,5" / "1.5" → 1.5; boş → 0; geçersiz → null. Negatif değer kabul edilmez. */
export const parseDecimal = (text: string): number | null => {
    const t = text.trim();
    if (t === '' || t === ',' || t === '.') return 0;
    if (!DECIMAL_TYPING.test(t)) return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

/** Gösterim: 1.5 → "1,5"; 0 → "" (yer tutucu görünsün) */
export const formatDecimal = (n: number | undefined): string =>
    n ? String(Math.round(n * 100) / 100).replace('.', ',') : '';
