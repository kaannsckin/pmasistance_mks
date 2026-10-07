import { IssueType, Project, Task, TaskStatus } from '../../types';
import { ISSUE_TYPE_LABELS, taskDurations } from './lifecycle';

/**
 * Kayıt verisi kalitesi: geçmiş (kapanmış) kayıtları planlama simülasyonu ve
 * AI tahmini için "eğitime uygun" olup olmadığına göre ayıklar. Kapanma
 * süresi ölçüldükten sonra şu testlerden geçer:
 *  - tarih eksik / tutarsız (kapanış açılıştan önce)
 *  - toplu kapatma: aynı gün aynı projede çok sayıda kapanış ("temizlik günü")
 *  - aykırı süre: tür × birim grubunda log ölçekte Q3 + 3·IQR üstü ya da
 *    mutlak sınırın (250 iş günü) üstü (askıda kalmış kayıt)
 * Yeniden açılan, aynı gün kapanan ve tahmini/türü olmayan kayıtlar elenmez,
 * bilgi olarak işaretlenir (ağırlıklandırma tahmin katmanının işi).
 */

export type QualityIssue = 'missing_dates' | 'negative_duration' | 'bulk_closed' | 'outlier' | 'reopened' | 'same_day' | 'missing_type' | 'missing_estimate' | 'thin_text';

export const QUALITY_LABELS: Record<QualityIssue, string> = {
    missing_dates: 'Açılış/kapanış tarihi yok',
    negative_duration: 'Kapanış açılıştan önce',
    bulk_closed: 'Toplu kapatma',
    outlier: 'Aykırı süre',
    reopened: 'Yeniden açılmış',
    same_day: 'Aynı gün kapanmış',
    missing_type: 'Kayıt türü yok',
    missing_estimate: 'Tahmin yok',
    thin_text: 'Açıklama yetersiz',
};

/** Bu sorunlardan biri olan kayıt eğitim verisine girmez */
export const EXCLUDING: QualityIssue[] = ['missing_dates', 'negative_duration', 'bulk_closed', 'outlier'];

export const BULK_MIN = 10; // aynı gün en az bu kadar kapanış
export const BULK_SHARE = 0.3; // ve projenin kapanışlarının en az bu payı
export const MAX_REASONABLE_DAYS = 250;
const MIN_GROUP_FOR_IQR = 8;

export interface RecordRow {
    projectId: string;
    projectName: string;
    task: Task;
    leadDays: number | null;
    cycleDays: number | null;
    /** Modelin öğreneceği süre: cycle varsa o, yoksa lead */
    days: number | null;
    estimateDays: number | null;
    issues: QualityIssue[];
    usable: boolean;
}

export interface RecordQualityReport {
    total: number; // tüm kayıtlar
    closed: number;
    usable: number;
    byIssue: Partial<Record<QualityIssue, number>>;
    /** Eğitime uygun kayıtlarda türe göre medyan süre (iş günü) */
    medianByType: { type: IssueType | 'none'; label: string; n: number; median: number }[];
    /** Tahmini olan eğitime uygun kayıtlarda medyan gerçek ÷ tahmin oranı (1 = isabetli, 2 = iki kat uzun) */
    estimateRatio: { n: number; median: number } | null;
    byProject: { projectId: string; name: string; closed: number; usable: number; medianDays: number | null }[];
    rows: RecordRow[];
}

const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (sorted: number[], q: number): number => {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const round1 = (v: number) => Math.round(v * 10) / 10;
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export const analyzeRecords = (projects: Pick<Project, 'id' | 'name' | 'tasks'>[]): RecordQualityReport => {
    const rows: RecordRow[] = [];
    let total = 0;
    projects.forEach(p => {
        total += p.tasks.length;
        const closed = p.tasks.filter(t => t.status === TaskStatus.Done);
        // Toplu kapatma günleri
        const perDay = new Map<string, number>();
        closed.forEach(t => { if (t.resolvedAt) perDay.set(dayKey(t.resolvedAt), (perDay.get(dayKey(t.resolvedAt)) || 0) + 1); });
        const bulkDays = new Set([...perDay.entries()].filter(([, n]) => n >= BULK_MIN && n / closed.length >= BULK_SHARE).map(([k]) => k));
        closed.forEach(t => {
            const d = taskDurations(t);
            const issues: QualityIssue[] = [];
            // Süre için kapanış ve (açılış ya da ilk başlama) gerekir; bu sürümden önce açılıp sonra başlayan kayıtlar da ölçülür
            if (!t.resolvedAt || (!t.createdAt && !t.startedAt)) issues.push('missing_dates');
            else if ((t.createdAt && d.leadDays === null) || (t.startedAt && d.cycleDays === null)) issues.push('negative_duration');
            if (t.resolvedAt && bulkDays.has(dayKey(t.resolvedAt))) issues.push('bulk_closed');
            if (d.reopened > 0) issues.push('reopened');
            const days = d.cycleDays ?? d.leadDays;
            if (days !== null && days <= 1) issues.push('same_day');
            if (!t.issueType) issues.push('missing_type');
            if (d.estimateDays === null) issues.push('missing_estimate');
            if (`${t.name} ${t.notes || ''}`.trim().split(/\s+/).length < 4) issues.push('thin_text');
            rows.push({ projectId: p.id, projectName: p.name, task: t, leadDays: d.leadDays, cycleDays: d.cycleDays, days, estimateDays: d.estimateDays, issues, usable: false });
        });
    });

    // Aykırı süre: tür × birim grubunda log ölçekte IQR
    const groups = new Map<string, RecordRow[]>();
    rows.forEach(r => {
        if (r.days === null || r.days <= 0) return;
        const k = `${r.task.issueType || 'none'}|${r.task.unit || ''}`;
        groups.set(k, [...(groups.get(k) || []), r]);
    });
    groups.forEach(g => {
        let limit = MAX_REASONABLE_DAYS;
        if (g.length >= MIN_GROUP_FOR_IQR) {
            const logs = g.map(r => Math.log(r.days!)).sort((a, b) => a - b);
            const q1 = quantile(logs, 0.25), q3 = quantile(logs, 0.75);
            limit = Math.min(limit, Math.exp(q3 + 3 * (q3 - q1)));
        }
        g.forEach(r => { if (r.days! > limit && !r.issues.includes('outlier')) r.issues.push('outlier'); });
    });
    rows.forEach(r => { r.usable = r.days !== null && !r.issues.some(i => EXCLUDING.includes(i)); });

    const usable = rows.filter(r => r.usable);
    const byIssue: Partial<Record<QualityIssue, number>> = {};
    rows.forEach(r => r.issues.forEach(i => { byIssue[i] = (byIssue[i] || 0) + 1; }));
    const types = new Map<IssueType | 'none', number[]>();
    usable.forEach(r => { const k = r.task.issueType || 'none'; types.set(k, [...(types.get(k) || []), r.days!]); });
    const ratios = usable.filter(r => r.estimateDays).map(r => r.days! / r.estimateDays!);

    return {
        total,
        closed: rows.length,
        usable: usable.length,
        byIssue,
        medianByType: [...types.entries()]
            .map(([type, xs]) => ({ type, label: type === 'none' ? 'Türü belirtilmemiş' : ISSUE_TYPE_LABELS[type], n: xs.length, median: round1(median(xs)) }))
            .sort((a, b) => b.n - a.n),
        estimateRatio: ratios.length ? { n: ratios.length, median: round1(median(ratios)) } : null,
        byProject: projects.map(p => {
            const pr = rows.filter(r => r.projectId === p.id);
            const ok = pr.filter(r => r.usable).map(r => r.days!);
            return { projectId: p.id, name: p.name, closed: pr.length, usable: ok.length, medianDays: ok.length ? round1(median(ok)) : null };
        }).filter(x => x.closed > 0),
        rows,
    };
};

const csvCell = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dayOf = (iso?: string) => (iso ? iso.slice(0, 10) : '');

/**
 * Eğitim/analiz veri kümesi (CSV, ; ayraçlı, UTF-8 BOM). Kişi adları yer
 * almaz; birim, tür, öncelik, tarih ve süreler bulunur.
 */
export const recordsToCsv = (report: RecordQualityReport, onlyUsable = true): string => {
    const head = ['Proje', 'Kayıt', 'Ad', 'Tür', 'Öncelik', 'Birim', 'Açılış', 'Başlama', 'Kapanış', 'Lead (iş günü)', 'Cycle (iş günü)', 'Süre (iş günü)', 'Tahmin (gün, PERT)', 'Story point', 'Harcanan (saat)', 'Hedef sürüm', 'Eğitime uygun', 'Notlar'];
    const lines = report.rows.filter(r => !onlyUsable || r.usable).map(r => [
        r.projectName, r.task.jiraId || r.task.id, r.task.name, r.task.issueType ? ISSUE_TYPE_LABELS[r.task.issueType] : '', r.task.priority, r.task.unit,
        dayOf(r.task.createdAt), dayOf(r.task.startedAt), dayOf(r.task.resolvedAt), r.leadDays, r.cycleDays, r.days, r.estimateDays,
        r.task.storyPoints, r.task.actualHours, r.task.fixVersion, r.usable ? 'evet' : 'hayır', r.issues.map(i => QUALITY_LABELS[i]).join(', '),
    ].map(csvCell).join(';'));
    return `﻿${[head.join(';'), ...lines].join('\n')}`;
};
