import { IssueType, Task } from '../../../types';
import { foldTr, stem, terms } from '../../rag/text';
import { HistoryRecord } from '../history';
import { ISSUE_TYPE_LABELS } from '../lifecycle';
import { RecordDraft } from '../referenceClass';

/**
 * Model özellikleri: kayıt türü, birim, proje, önem, iş paketi, ilk tahmin
 * (yalnız ekibin kendi tahmini; geçmişten üretilmiş tahmin sızıntı olur),
 * metin uzunluğu ve metindeki sık sözcükler. Kişi adı (sorumlu) kullanılmaz.
 * Sözlük ve kategori listeleri eğitim kayıtlarından kurulur.
 */

export const TYPES: (IssueType | 'none')[] = ['bug', 'feature', 'improvement', 'task', 'other', 'none'];
export const PRIORITY_RANK: Record<Task['priority'], number> = { Low: 0, Medium: 1, High: 2, Blocker: 3 };
const MAX_UNITS = 12;
const MAX_PROJECTS = 10;
const MAX_VOCAB = 120;

export interface FeatureSpace {
    units: string[];
    projects: { id: string; name: string }[];
    vocab: string[];
    /** Her özelliğin açıklaması (etken listesinde gösterilir) */
    labels: string[];
    /** Önem ve tür sınıflandırıcıları için hedefi sızdıran özellikler */
    priorityIndex: number;
    typeRange: [number, number];
}

/** Modelin gördüğü kayıt: geçmiş kayıt ya da yeni kayıt taslağı */
export interface FeatureInput {
    terms: string[];
    issueType?: IssueType;
    unit: string;
    projectId?: string;
    priority?: Task['priority'];
    workPackageId?: string;
    labels: string[];
    /** Ekibin kendi efor tahmini (gün) */
    estimateDays?: number;
    hasNotes: boolean;
}

const fold = (s: string | undefined) => (s || '').trim().toLocaleLowerCase('tr-TR');

export const recordInput = (r: HistoryRecord): FeatureInput => ({
    terms: r.terms,
    issueType: r.issueType,
    unit: r.unit,
    projectId: r.projectId,
    priority: r.priority,
    workPackageId: r.workPackageId,
    labels: r.labels,
    // Geçmişten üretilmiş tahminin (benzer kayıt / AI) oranı yoktur; özellik olarak kullanılmaz
    estimateDays: r.ratio !== null && r.estimateDays ? r.estimateDays : undefined,
    hasNotes: !!r.notes.trim(),
});

export const draftInput = (d: RecordDraft): FeatureInput => ({
    terms: terms(`${d.name} ${d.notes || ''}`),
    issueType: d.issueType,
    unit: d.unit || '',
    projectId: d.projectId,
    priority: d.priority,
    workPackageId: d.workPackageId,
    labels: d.labels || [],
    estimateDays: d.ownEstimateDays,
    hasNotes: !!(d.notes || '').trim(),
});

const topBy = <T,>(items: T[], key: (x: T) => string, max: number, min = 1): string[] => {
    const n = new Map<string, number>();
    items.forEach(x => { const k = key(x); if (k) n.set(k, (n.get(k) || 0) + 1); });
    return [...n].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([k]) => k);
};

export const buildFeatureSpace = (records: HistoryRecord[]): FeatureSpace => {
    const units = topBy(records, r => fold(r.unit), MAX_UNITS, 3);
    const projectIds = topBy(records, r => r.projectId, MAX_PROJECTS, 5);
    const projectName = new Map(records.map(r => [r.projectId, r.projectName]));
    // Sözlük: en az 3 kayıtta (ve %1) geçen, kayıtların yarısından azında bulunan sözcükler
    const df = new Map<string, number>();
    records.forEach(r => new Set(r.terms).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
    const minDf = Math.max(3, Math.ceil(records.length * 0.01));
    const vocab = [...df].filter(([t, c]) => c >= minDf && c <= records.length * 0.5 && t.length > 2)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_VOCAB).map(([t]) => t);

    // Etiketlerde kök yerine kayıtlarda en sık geçen yazılışı göster ("iyile" → "iyileştirme")
    const wanted = new Set(vocab);
    const forms = new Map<string, Map<string, number>>();
    records.forEach(r => `${r.name} ${r.notes.slice(0, 300)}`.toLocaleLowerCase('tr-TR').split(/[^\p{L}\p{N}]+/u).forEach(w => {
        const k = stem(foldTr(w));
        if (!wanted.has(k)) return;
        const m = forms.get(k) || new Map<string, number>();
        m.set(w, (m.get(w) || 0) + 1);
        forms.set(k, m);
    }));
    const formOf = (t: string) => [...(forms.get(t) || [])].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] || t;

    const labels: string[] = [];
    TYPES.forEach(t => labels.push(`Tür: ${t === 'none' ? 'belirtilmemiş' : ISSUE_TYPE_LABELS[t]}`));
    const typeRange: [number, number] = [0, TYPES.length];
    units.forEach(u => labels.push(`Birim: ${records.find(r => fold(r.unit) === u)?.unit.trim() || u}`));
    labels.push('Birim: diğer');
    projectIds.forEach(id => labels.push(`Proje: ${projectName.get(id) || id}`));
    labels.push('Proje: diğer');
    const priorityIndex = labels.length;
    labels.push('Önem');
    labels.push('Ekip tahmini var', 'Ekip tahmini (gün)', 'İş paketi seçili', 'Etiket sayısı', 'Metin uzunluğu', 'Açıklama var');
    vocab.forEach(t => labels.push(`Sözcük: "${formOf(t)}"`));
    return { units, projects: projectIds.map(id => ({ id, name: projectName.get(id) || id })), vocab, labels, priorityIndex, typeRange };
};

export const featureCount = (s: FeatureSpace) => s.labels.length;

/** Kayıt → yoğun özellik vektörü (eksik tahmin −1) */
export const encode = (s: FeatureSpace, x: FeatureInput): Float64Array => {
    const v = new Float64Array(s.labels.length);
    let o = 0;
    v[o + Math.max(0, TYPES.indexOf(x.issueType || 'none'))] = 1;
    o += TYPES.length;
    const u = s.units.indexOf(fold(x.unit));
    v[o + (u >= 0 ? u : s.units.length)] = 1;
    o += s.units.length + 1;
    const p = s.projects.findIndex(q => q.id === x.projectId);
    v[o + (p >= 0 ? p : s.projects.length)] = 1;
    o += s.projects.length + 1;
    v[o++] = x.priority ? PRIORITY_RANK[x.priority] : 1;
    v[o++] = x.estimateDays ? 1 : 0;
    v[o++] = x.estimateDays ? Math.log1p(x.estimateDays) : -1;
    v[o++] = x.workPackageId ? 1 : 0;
    v[o++] = x.labels.length;
    v[o++] = Math.log1p(x.terms.length);
    v[o++] = x.hasNotes ? 1 : 0;
    const have = new Set(x.terms);
    s.vocab.forEach((t, i) => { if (have.has(t)) v[o + i] = 1; });
    return v;
};
