import { DashboardProgressWeights, Project, ProjectKpi, Task, TaskStatus, WorkspaceData } from '../../types';
import { closedStatusMonth } from '../evm';
import { isHealthScored, projectHealth } from '../executive';
import { currentSprint } from '../projectOverview';
import { riskScore } from '../risks';
import { workflowKey } from '../workflow';
import { buildWorkforce } from '../workforce';
import { DimContext, isDone, taskTotals } from './data';

/**
 * Dashboard'daki tek sayılık göstergeler (metrik kartı). Her metrik süzülmüş
 * kayıtlar üzerinden hesaplanır; proje düzeyindekiler (sağlık, risk, sprint,
 * tahsis) süzgeçten bağımsızdır.
 */

export type MetricTone = 'ok' | 'warn' | 'bad' | 'neutral';

export interface MetricValue {
    value: number | null;
    text: string;
    sub?: string;
    tone?: MetricTone;
    /** 0-1 arası ise ilerleme çubuğu çizilir */
    pct?: number;
}

export interface MetricContext extends DimContext {
    ws: WorkspaceData;
    tasks: Task[];
    now: Date;
    progressWeights?: DashboardProgressWeights;
}

const pct = (v: number) => `%${Math.round(v * 100)}`;
const num = (v: number, d = 1) => v.toLocaleString('tr-TR', { maximumFractionDigits: d });
const tl = (v: number) => v.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

export const defaultProgressPercent = (category: TaskStatus): number => category === TaskStatus.Done ? 100 : 0;
export const isProgressPercent = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

const recordProgress = ({ tasks, progressWeights }: MetricContext): MetricValue => {
    let done = 0, sum = 0, weighted = false;
    for (const task of tasks) {
        if (isDone(task)) done++;
        const specific = task.jiraStatus?.trim() ? progressWeights?.statuses?.[workflowKey(task.jiraStatus)] : undefined;
        const category = progressWeights?.categories?.[task.status];
        const assigned = isProgressPercent(specific) ? specific : category;
        if (isProgressPercent(assigned)) {
            sum += assigned;
            weighted = true;
        } else {
            sum += defaultProgressPercent(task.status);
        }
    }
    const p = tasks.length ? sum / (100 * tasks.length) : 0;
    const count = `${done} / ${tasks.length} kayıt tamamlandı`;
    return { value: p, text: pct(p), sub: weighted ? `Durum yüzdelerine göre · ${count}` : count, pct: p, tone: 'neutral' };
};

export interface MetricDef {
    key: string;
    label: string;
    group: 'İlerleme' | 'Takvim' | 'Efor ve maliyet' | 'Risk ve sağlık' | 'Ekip';
    /** Süzgeç uygulanır mı (kayıt metrikleri) */
    filtered: boolean;
    compute: (c: MetricContext) => MetricValue;
}

export const METRICS: MetricDef[] = [
    {
        key: 'progress', label: 'İlerleme (kayıt)', group: 'İlerleme', filtered: true,
        compute: recordProgress,
    },
    {
        key: 'effortProgress', label: 'İlerleme (efor)', group: 'İlerleme', filtered: true,
        compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); const p = t.effort ? t.effortDone / t.effort : 0; return { value: p, text: pct(p), sub: `${num(t.effortDone)} / ${num(t.effort)} gün efor`, pct: p }; },
    },
    { key: 'total', label: 'Toplam kayıt', group: 'İlerleme', filtered: true, compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); return { value: t.total, text: num(t.total, 0), sub: `${t.open} açık · ${t.inProgress} süreçte` }; } },
    { key: 'open', label: 'Açık kayıt', group: 'İlerleme', filtered: true, compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); return { value: t.open, text: num(t.open, 0), sub: `${t.inProgress} süreçte` }; } },
    { key: 'doneThisMonth', label: 'Bu ay kapanan', group: 'İlerleme', filtered: true, compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); return { value: t.doneThisMonth, text: num(t.doneThisMonth, 0), sub: 'bu ay tamamlanan kayıt', tone: t.doneThisMonth ? 'ok' : 'neutral' }; } },
    {
        key: 'overdue', label: 'Geciken kayıt', group: 'Takvim', filtered: true,
        compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); return { value: t.overdue, text: num(t.overdue, 0), sub: t.open ? `açıkların ${pct(t.overdue / t.open)}'i` : 'açık kayıt yok', tone: t.overdue ? 'bad' : 'ok' }; },
    },
    { key: 'dueSoon', label: '14 günde bitecek', group: 'Takvim', filtered: true, compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); return { value: t.dueSoon, text: num(t.dueSoon, 0), sub: 'termini 14 gün içinde', tone: t.dueSoon ? 'warn' : 'neutral' }; } },
    { key: 'leadTime', label: 'Ortalama kapanma süresi', group: 'Takvim', filtered: true, compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); return t.avgLeadDays === undefined ? { value: null, text: '—', sub: 'kapanış tarihi olan kayıt yok' } : { value: t.avgLeadDays, text: `${num(t.avgLeadDays)} gün`, sub: 'açılıştan kapanışa' }; } },
    {
        key: 'sprint', label: 'Şu anki sprint', group: 'Takvim', filtered: false,
        compute: ({ project, now }) => { const s = currentSprint(project, now); return s ? { value: s.progressPct / 100, text: `%${s.progressPct}`, sub: `${s.label} · ${s.daysLeft >= 0 ? `${s.daysLeft} gün kaldı` : `${-s.daysLeft} gün geçti`}`, pct: s.progressPct / 100, tone: s.daysLeft < 0 && s.done < s.total ? 'bad' : 'neutral' } : { value: null, text: '—', sub: 'sprint planı yok' }; },
    },
    { key: 'effort', label: 'Toplam efor', group: 'Efor ve maliyet', filtered: true, compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); return { value: t.effort, text: `${num(t.effort)} gün`, sub: `kalan ${num(t.effort - t.effortDone)} gün` }; } },
    { key: 'remainingEffort', label: 'Kalan efor', group: 'Efor ve maliyet', filtered: true, compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); return { value: t.effort - t.effortDone, text: `${num(t.effort - t.effortDone)} gün`, sub: `${t.noEstimate} açık kaydın tahmini yok`, tone: t.noEstimate ? 'warn' : 'neutral' }; } },
    { key: 'hours', label: 'Harcanan süre (Jira)', group: 'Efor ve maliyet', filtered: true, compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); return { value: t.hours, text: `${num(t.hours)} sa`, sub: `${num(t.hours / 8)} gün` }; } },
    {
        key: 'worklogCost', label: 'İş gücü maliyeti (worklog)', group: 'Efor ve maliyet', filtered: true,
        compute: ({ ws, project, tasks }) => {
            const r = buildWorkforce(ws, [{ ...project, tasks }]);
            return r.totalHours ? { value: r.totalCost, text: tl(r.totalCost), sub: `${num(r.totalHours)} sa · ${r.people.length} kişi${r.uncostedHours ? ` · ${num(r.uncostedHours)} sa maliyetsiz` : ''}`, tone: r.uncostedHours ? 'warn' : 'neutral' } : { value: null, text: '—', sub: "Jira worklog'u çekilmemiş" };
        },
    },
    {
        key: 'planAA', label: 'Bu yıl plan / gerçekleşen AA', group: 'Efor ve maliyet', filtered: false,
        compute: ({ ws, project, now }) => {
            const rows = ws.allocations.filter(a => a.projectId === project.id && a.year === now.getFullYear());
            const sum = (k: 'plan' | 'actual') => rows.reduce((s, a) => s + Object.values(a[k] || {}).reduce((x: number, v) => x + (Number(v) || 0), 0), 0);
            const plan = sum('plan'), actual = sum('actual');
            return { value: plan, text: `${num(plan)} AA`, sub: `gerçekleşen ${num(actual)} AA`, pct: plan ? Math.min(1, actual / plan) : undefined };
        },
    },
    {
        key: 'health', label: 'Proje sağlığı', group: 'Risk ve sağlık', filtered: false,
        compute: ({ ws, project, now }) => {
            if (!isHealthScored(project)) return { value: null, text: '—', sub: 'sağlık puanlanmıyor' };
            const year = now.getFullYear();
            const h = projectHealth(ws, project, year, closedStatusMonth(ws, year, now), now);
            return { value: h.score, text: String(Math.round(h.score)), sub: h.reasons?.[0] || 'sağlık skoru (0-100)', tone: h.score >= 75 ? 'ok' : h.score >= 50 ? 'warn' : 'bad', pct: h.score / 100 };
        },
    },
    { key: 'openRisks', label: 'Açık risk', group: 'Risk ve sağlık', filtered: false, compute: ({ project }) => { const open = (project.risks || []).filter(r => r.status !== 'closed'); const high = open.filter(r => riskScore(r) >= 15).length; return { value: open.length, text: num(open.length, 0), sub: high ? `${high} yüksek risk` : 'yüksek risk yok', tone: high ? 'bad' : open.length ? 'warn' : 'ok' }; } },
    { key: 'blocked', label: 'Engelli / engelleyici', group: 'Risk ve sağlık', filtered: true, compute: ({ tasks, now, project, workflow }) => { const t = taskTotals(tasks, now, { project, workflow }); return { value: t.blocked, text: num(t.blocked, 0), sub: 'engelleyici öncelik ya da engelli durum', tone: t.blocked ? 'bad' : 'ok' }; } },
    { key: 'unassigned', label: 'Atanmamış açık kayıt', group: 'Ekip', filtered: true, compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); return { value: t.unassigned, text: num(t.unassigned, 0), sub: 'sorumlusu olmayan', tone: t.unassigned ? 'warn' : 'ok' }; } },
    { key: 'noEstimate', label: 'Tahmini olmayan', group: 'Ekip', filtered: true, compute: ({ tasks, now }) => { const t = taskTotals(tasks, now); return { value: t.noEstimate, text: num(t.noEstimate, 0), sub: 'açık kayıtlarda süre tahmini yok', tone: t.noEstimate ? 'warn' : 'ok' }; } },
];

export const METRIC_BY_KEY = new Map(METRICS.map(m => [m.key, m]));

// ------------------------------------------------------------------ projeye özel göstergeler (KPI)
export const KPI_UNIT_LABELS: Record<ProjectKpi['unit'], string> = { percent: 'Yüzde', number: 'Sayı', currency: 'Tutar (TL)', days: 'Gün' };

export const formatKpi = (v: number | undefined, unit: ProjectKpi['unit']): string => {
    if (v === undefined || v === null || !Number.isFinite(v)) return '—';
    if (unit === 'percent') return `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
    if (unit === 'currency') return tl(v);
    if (unit === 'days') return `${num(v)} gün`;
    return num(v, 2);
};

export const latestPoint = (k: ProjectKpi) => k.points[k.points.length - 1];

/** Hedefe ulaşma payı (taban → hedef arası; düşük iyi ise ters) */
export const kpiProgress = (k: ProjectKpi): number | undefined => {
    const cur = latestPoint(k)?.value;
    if (cur === undefined || k.target === undefined) return undefined;
    const base = k.baseline ?? (k.unit === 'percent' && k.higherIsBetter !== false ? 0 : k.points[0]?.value ?? 0);
    if (k.target === base) return cur === k.target ? 1 : 0;
    return Math.max(0, Math.min(1, (cur - base) / (k.target - base)));
};

/** Son iki ölçüm arası değişim */
export const kpiDelta = (k: ProjectKpi): number | undefined => {
    const n = k.points.length;
    return n >= 2 ? k.points[n - 1].value - k.points[n - 2].value : undefined;
};

export { addKpiPoint, newKpiId, upsertKpi } from './kpi';
