import { IssueType, Task, TaskStatus } from '../../types';
import { foldTr } from '../rag/text';

/**
 * Jira dışa aktarımlarının alanlarını uygulamanın kayıt modeline çevirir:
 * tarih (çeşitli yerel biçimler), durum, kayıt türü, öncelik ve süre (saniye).
 */

const MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    oca: 0, sub: 1, nis: 3, haz: 5, tem: 6, agu: 7, eyl: 8, eki: 9, kas: 10, ara: 11,
};

const build = (y: number, mo: number, d: number, h = 0, mi = 0): string | undefined => {
    const year = y < 100 ? 2000 + y : y;
    const dt = new Date(year, mo, d, h, mi);
    return isNaN(dt.getTime()) || dt.getMonth() !== mo ? undefined : dt.toISOString();
};

const hour12 = (h: number, ampm?: string): number => {
    const a = (ampm || '').toLocaleUpperCase('tr-TR');
    if (a === 'PM' || a === 'ÖS') return h % 12 + 12;
    if (a === 'AM' || a === 'ÖÖ') return h % 12;
    return h;
};

/**
 * Jira CSV tarihi → ISO. Desteklenen: "2026-10-07 10:15", "07/Oct/26 10:15 AM",
 * "07/Eki/26 10:15 ÖS", "07.10.2026 10:15", "07/10/2026 10:15". Tanınmazsa undefined.
 */
export const parseJiraDate = (raw: string | undefined): string | undefined => {
    const s = (raw || '').trim();
    if (!s) return undefined;
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
    if (m) return build(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    m = /^(\d{1,2})\/([A-Za-zÇĞİÖŞÜçğıöşü]{3,})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM|ÖÖ|ÖS)?)?/i.exec(s);
    if (m) {
        const mo = MONTHS[foldTr(m[2]).slice(0, 3)];
        return mo === undefined ? undefined : build(+m[3], mo, +m[1], hour12(+(m[4] || 0), m[6]), +(m[5] || 0));
    }
    m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
    if (m) return build(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
    return undefined;
};

// Türkçe büyük İ/I tuzağına düşmeden (Improvement → "ımprovement") katlanmış karşılaştırma
const fold = (s: string) => foldTr(s).trim();

export const mapJiraStatus = (raw: string | undefined, resolved?: string): TaskStatus => {
    const s = fold(raw || '');
    if (/done|closed|resolved|complete|tamam|kapal|kapandi|cozul|bitti|yayin/.test(s)) return TaskStatus.Done;
    if (/progress|review|test|develop|devam|surec|inceleme|gelistir/.test(s)) return TaskStatus.InProgress;
    if (/backlog|bekleme/.test(s)) return TaskStatus.Backlog;
    if (!s && resolved) return TaskStatus.Done;
    return s ? TaskStatus.ToDo : TaskStatus.Backlog;
};

export const mapJiraIssueType = (raw: string | undefined): IssueType | undefined => {
    const s = fold(raw || '');
    if (!s) return undefined;
    if (/bug|defect|hata|incident|ariza/.test(s)) return 'bug';
    if (/story|feature|ozellik|hikaye|requirement|gereksinim/.test(s)) return 'feature';
    if (/improvement|enhancement|iyilestir|gelistirme/.test(s)) return 'improvement';
    if (/task|gorev/.test(s)) return 'task';
    return 'other';
};

export const mapJiraPriority = (raw: string | undefined): Task['priority'] => {
    const s = fold(raw || '');
    if (/blocker|engel|acil/.test(s)) return 'Blocker';
    if (/highest|critical|high|kritik|yuksek/.test(s)) return 'High';
    if (/lowest|low|dusuk|trivial|minor/.test(s)) return 'Low';
    return 'Medium';
};

/** Jira süre alanı (saniye) → saat; boş ya da geçersizse undefined */
export const secondsToHours = (raw: string | undefined): number | undefined => {
    const n = Number(String(raw ?? '').replace(',', '.').trim());
    return Number.isFinite(n) && n > 0 ? Math.round((n / 3600) * 10) / 10 : undefined;
};
