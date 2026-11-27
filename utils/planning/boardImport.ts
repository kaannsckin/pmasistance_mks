import { Resource, Task, TaskStatus } from '../../types';
import { isProgressPercent } from '../progress';

/**
 * Ekip panosu Excel'i (ör. "EMS Board" dışa aktarımı) → proje görevleri.
 * Görev Jira anahtarıyla ("Task No") eşleşir. Alınanlar: sorumlu, etiketler,
 * ilerleme yüzdesi ve tahmin. Alınmayanlar: puan, zorluk, eklenme / bitiş
 * tarihleri. Durum değiştirilmez; ilerleme yüzdesi görevde elle girilmiş
 * yüzde olarak saklanır (PoC katsayısı ve plan kalan eforu bunu kullanır).
 */

export type SheetMatrix = unknown[][];

export interface BoardRow {
    key: string;
    title: string;
    status: string;
    /** 0–100; panoda girilmemişse (0 ya da boş) yok */
    progress?: number;
    estimate?: string;
    assignee?: string;
    labels: string[];
}

export interface BoardChange {
    taskId: string;
    key: string;
    assignee?: { from: string; to: string };
    /** Yeni sorumlunun birimi görevin biriminden farklıysa (sorumluyla birlikte uygulanır) */
    unit?: { from: string; to: string };
    labelsAdded: string[];
    progress?: { from?: number; to: number };
    estimate?: { text: string; days?: { best: number; avg: number; worst: number } };
}

export interface BoardImportPlan {
    rows: number;
    changes: BoardChange[];
    /** Projede karşılığı olmayan anahtarlar */
    unmatched: BoardRow[];
    /** Proje ekibinde bulunamayan ya da birden çok kişiye uyan sorumlu adları */
    unknownPeople: string[];
    ambiguousPeople: string[];
    /** Panoda birden çok satırda geçen anahtarlar (ilk satır esas alınır, boşlar sonrakilerden, etiketler birleşir) */
    duplicateKeys: string[];
}

export type BoardField = 'assignee' | 'labels' | 'progress' | 'estimate';

const foldTr = (v: unknown): string => String(v ?? '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown): number | undefined => {
    const n = typeof v === 'number' ? v : Number(text(v).replace('%', '').replace(',', '.'));
    return text(v) !== '' && Number.isFinite(n) ? n : undefined;
};

/** "Görevler" benzeri sayfa: "Task No" ve pano sütunlarını taşıyan ilk sayfa */
export const parseBoardWorkbook = (sheets: Record<string, SheetMatrix>): { rows: BoardRow[]; problem?: string } => {
    for (const matrix of Object.values(sheets)) {
        const headerAt = matrix.findIndex(r => (r || []).some(c => foldTr(c) === 'task no'));
        if (headerAt < 0) continue;
        const header = (matrix[headerAt] || []).map(foldTr);
        const col = (...names: string[]) => names.map(n => header.indexOf(foldTr(n))).find(i => i >= 0) ?? -1;
        const c = {
            key: col('Task No'), title: col('Başlık', 'Board: Başlık'), status: col('Board: Durum', 'Durum'),
            progress: col('Board: İlerleme %', 'İlerleme %', 'Son Durum'), estimate: col('Board: Tahmin', 'Tahmin'),
            assignee: col('Board: Sorumlu', 'Sorumlu', 'Kişi'), labels: col('Board: Etiketler', 'Etiketler'),
        };
        const at = (r: unknown[], i: number) => (i >= 0 ? r[i] : undefined);
        const rows: BoardRow[] = [];
        for (const r of matrix.slice(headerAt + 1)) {
            const key = text(at(r || [], c.key)).toUpperCase();
            if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) continue;
            const progress = num(at(r, c.progress));
            rows.push({
                key,
                title: text(at(r, c.title)),
                status: text(at(r, c.status)),
                progress: progress !== undefined && progress > 0 ? Math.max(0, Math.min(100, Math.round(progress))) : undefined,
                estimate: text(at(r, c.estimate)) || undefined,
                assignee: text(at(r, c.assignee)) || undefined,
                labels: text(at(r, c.labels)).split(/[,;]/).map(cleanLabel).filter(Boolean),
            });
        }
        return rows.length ? { rows } : { rows, problem: 'Pano sayfasında Jira anahtarı (Task No) olan satır yok.' };
    }
    return { rows: [], problem: '"Task No" sütunu olan bir sayfa bulunamadı.' };
};

/**
 * Pano etiketleri Türkçe küçük harfe çevrilirken bozulmuş olabilir
 * ("shared-maılbox", "ımap", "lısans"). Başka Türkçe harf taşımayan etikette
 * noktasız ı → i düzeltilir; "evrak-çantası" gibi Türkçe etiket olduğu gibi kalır.
 */
export const cleanLabel = (raw: string): string => {
    const l = raw.trim();
    if (!l.includes('ı') || /[çğöşüÇĞÖŞÜİ]/.test(l)) return l;
    return l.replace(/ı/g, 'i');
};

/** Serbest tahmin → gün (en iyi / olası / en kötü). Tanınmazsa undefined. */
export const estimateToDays = (raw: string | undefined): { best: number; avg: number; worst: number } | undefined => {
    const f = foldTr(raw);
    if (!f) return undefined;
    if (/birkac saat|bir kac saat/.test(f)) return { best: 0.25, avg: 0.5, worst: 0.75 };
    const m = /(\d+(?:[.,]\d+)?)\s*(?:-|–|ile)?\s*(\d+(?:[.,]\d+)?)?\s*(saat|gun|hafta|ay)/.exec(f);
    if (!m) return undefined;
    const unit = m[3] === 'saat' ? 1 / 8 : m[3] === 'hafta' ? 5 : m[3] === 'ay' ? 20 : 1;
    const a = Number(m[1].replace(',', '.')) * unit;
    const b = m[2] ? Number(m[2].replace(',', '.')) * unit : a;
    const r = (x: number) => Math.round(x * 100) / 100;
    return { best: r(Math.min(a, b)), avg: r((a + b) / 2), worst: r(Math.max(a, b)) };
};

/**
 * Panodaki kısa ad ("Arda", "İlker Ba.") → proje ekibindeki kişi. Ad tam eşleşir;
 * soyadın ilk harfleri verilmişse soyadı o harflerle başlamalıdır.
 */
export const matchPerson = (short: string, team: string[]): { name?: string; ambiguous?: boolean } => {
    const parts = foldTr(short).replace(/\./g, ' ').split(' ').filter(Boolean);
    if (!parts.length) return {};
    const full = team.filter(n => foldTr(n) === parts.join(' '));
    if (full.length === 1) return { name: full[0] };
    const hits = team.filter(n => {
        const t = foldTr(n).split(' ');
        if (t[0] !== parts[0]) return false;
        return parts.slice(1).every((p, i) => (t[i + 1] || '').startsWith(p));
    });
    return hits.length === 1 ? { name: hits[0] } : hits.length > 1 ? { ambiguous: true } : {};
};

const pertZero = (t: Task) => !(t.time?.best > 0 || t.time?.avg > 0 || t.time?.worst > 0);

export const planBoardImport = (rows: BoardRow[], tasks: Task[], resources: Pick<Resource, 'name' | 'unit'>[]): BoardImportPlan => {
    const byKey = new Map(tasks.filter(t => t.jiraId?.trim()).map(t => [t.jiraId.trim().toUpperCase(), t]));
    const team = resources.map(r => r.name);
    const unknown = new Set<string>(), ambiguous = new Set<string>();
    const changes: BoardChange[] = [];
    const unmatched: BoardRow[] = [];
    const merged = new Map<string, BoardRow>();
    const duplicateKeys: string[] = [];
    for (const r of rows) {
        const prev = merged.get(r.key);
        if (!prev) { merged.set(r.key, { ...r, labels: [...r.labels] }); continue; }
        if (!duplicateKeys.includes(r.key)) duplicateKeys.push(r.key);
        prev.assignee ||= r.assignee;
        prev.progress ??= r.progress;
        prev.estimate ||= r.estimate;
        prev.labels = [...new Set([...prev.labels, ...r.labels])];
    }
    for (const row of merged.values()) {
        const task = byKey.get(row.key);
        if (!task) { unmatched.push(row); continue; }
        const ch: BoardChange = { taskId: task.id, key: row.key, labelsAdded: [] };
        if (row.assignee) {
            const m = matchPerson(row.assignee, team);
            if (m.name && m.name !== task.resourceName) {
                ch.assignee = { from: task.resourceName, to: m.name };
                const unit = resources.find(r => r.name === m.name)?.unit;
                if (unit && unit !== task.unit) ch.unit = { from: task.unit, to: unit };
            }
            if (!m.name) (m.ambiguous ? ambiguous : unknown).add(row.assignee);
        }
        const have = new Set((task.labels || []).map(foldTr));
        ch.labelsAdded = [...new Set(row.labels)].filter(l => !have.has(foldTr(l)));
        if (row.progress !== undefined && task.status !== TaskStatus.Done && row.progress !== task.progressPct) ch.progress = { from: task.progressPct, to: row.progress };
        if (row.estimate && row.estimate !== task.estimateText) ch.estimate = { text: row.estimate, days: pertZero(task) ? estimateToDays(row.estimate) : undefined };
        if (ch.assignee || ch.labelsAdded.length || ch.progress || ch.estimate) changes.push(ch);
    }
    return { rows: rows.length, changes, unmatched, unknownPeople: [...unknown], ambiguousPeople: [...ambiguous], duplicateKeys };
};

/** Seçilen alanları uygular; değişmeyen görev aynı nesne kalır */
export const applyBoardImport = (tasks: Task[], changes: BoardChange[], fields: ReadonlySet<BoardField>): { tasks: Task[]; changed: number } => {
    const byId = new Map(changes.map(c => [c.taskId, c]));
    const now = new Date().toISOString();
    let changed = 0;
    const next = tasks.map(t => {
        const c = byId.get(t.id);
        if (!c) return t;
        const out: Task = { ...t };
        let touched = false;
        if (fields.has('assignee') && c.assignee) { out.resourceName = c.assignee.to; if (c.unit) out.unit = c.unit.to; touched = true; }
        if (fields.has('labels') && c.labelsAdded.length) { out.labels = [...(t.labels || []), ...c.labelsAdded]; touched = true; }
        if (fields.has('progress') && c.progress && isProgressPercent(c.progress.to)) { out.progressPct = c.progress.to; touched = true; }
        if (fields.has('estimate') && c.estimate) {
            out.estimateText = c.estimate.text;
            if (c.estimate.days) out.time = c.estimate.days;
            touched = true;
        }
        if (!touched) return t;
        changed++;
        out.updatedAt = now;
        return out;
    });
    return { tasks: next, changed };
};
