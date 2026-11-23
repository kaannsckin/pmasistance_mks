import { DashboardDim, DashboardFilter, DashboardMeasure, Project, Task, TaskStatus, WorkflowConfig } from '../../types';
import { taskStatusLabel, taskWorkflow } from '../workflow';
import { ISSUE_TYPE_LABELS } from '../planning/lifecycle';
import { sprintLabel } from '../../components/modern/taskMeta';

/**
 * Proje dashboard'unun hesapları: süzgeç, gruplama boyutları, kırılım, çapraz
 * tablo, kilometre taşı planı, kümülatif eğri ve etiket aileleri. Saf
 * fonksiyonlar; bileşenler yalnız gösterir.
 */

const DAY = 86_400_000;
const PRIORITY_TR: Record<Task['priority'], string> = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' };
const PRIORITY_ORDER: Task['priority'][] = ['Blocker', 'High', 'Medium', 'Low'];
const CATEGORY_TR: Record<TaskStatus, string> = { [TaskStatus.Backlog]: 'Bekleyen', [TaskStatus.ToDo]: 'Yapılacak', [TaskStatus.InProgress]: 'Süreçte', [TaskStatus.Done]: 'Tamamlandı' };
const CATEGORY_ORDER = [TaskStatus.Backlog, TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.Done];
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const NONE = '—';

export const dayIso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fold = (s: string) => s.toLocaleLowerCase('tr-TR').trim();

export const isDone = (t: Task) => t.status === TaskStatus.Done;
export const isOverdue = (t: Task, now: Date) => !isDone(t) && !!t.dueDate && t.dueDate.slice(0, 10) < dayIso(now);
/** Efor (gün): olası süre */
export const effortOf = (t: Task) => Math.max(0, t.time?.avg || 0);

/** Ada göre proje sürümü (ör. "MS1" etiketi → MS1 sürümü ve tarihleri) */
export const versionNamed = (project: Pick<Project, 'versions'> | undefined, name: string) =>
    project?.versions?.find(v => fold(v.name) === fold(name));

/**
 * Planlanan bitiş: görevin termini; yoksa hedef sürümünün ya da etiketiyle
 * eşleşen sürümün (MS0…) bitiş tarihi.
 */
export const plannedDue = (t: Task, project?: Pick<Project, 'versions'>): string | undefined =>
    t.dueDate?.slice(0, 10)
    || (t.fixVersion ? versionNamed(project, t.fixVersion)?.releaseDate : undefined)
    || (t.labels || []).map(l => versionNamed(project, l)?.releaseDate).find(Boolean);

export const measureOf = (t: Task, m: DashboardMeasure = 'count'): number =>
    m === 'effort' ? effortOf(t) : m === 'hours' ? Math.max(0, t.actualHours || 0) : 1;

export const MEASURE_LABELS: Record<DashboardMeasure, string> = { count: 'Kayıt sayısı', effort: 'Efor (gün)', hours: 'Harcanan saat' };

// ------------------------------------------------------------------ süzgeç
export const applyFilter = (tasks: Task[], f: DashboardFilter | undefined): Task[] => {
    if (!f) return tasks;
    const inc = (f.labels || []).map(fold);
    const exc = (f.excludeLabels || []).map(fold);
    const who = f.assignee ? fold(f.assignee) : '';
    return tasks.filter(t => {
        const labels = (t.labels || []).map(fold);
        if (inc.length && !inc.some(l => labels.includes(l))) return false;
        if (exc.length && exc.some(l => labels.includes(l))) return false;
        if (f.workPackageId && t.workPackageId !== f.workPackageId) return false;
        if (who && fold(t.resourceName || '') !== who) return false;
        if (f.openOnly && isDone(t)) return false;
        return true;
    });
};

export const filterLabel = (f: DashboardFilter | undefined, wpName?: (id: string) => string): string => {
    if (!f) return '';
    return [
        f.labels?.length ? f.labels.join(' / ') : '',
        f.excludeLabels?.length ? `${f.excludeLabels.join(', ')} hariç` : '',
        f.workPackageId ? (wpName?.(f.workPackageId) || 'iş paketi') : '',
        f.assignee || '',
        f.openOnly ? 'açık kayıtlar' : '',
    ].filter(Boolean).join(' · ');
};

// ------------------------------------------------------------------ boyutlar
export interface DimContext {
    project: Project;
    workflow: WorkflowConfig;
}

/** "MS" öneki "MS0", "MS 1", "MS-2" ile eşleşir; "MSX" ile eşleşmez (önekten sonra rakam ya da ayırıcı gelmeli) */
export const labelMatchesPrefix = (label: string, prefix: string): boolean => {
    const l = fold(label), p = fold(prefix);
    if (!p || !l.startsWith(p) || l === p) return false;
    if (/[:\-–·]$/.test(p)) return true;
    return /^[\s:\-–·]*\d/.test(l.slice(p.length)) || /^[\s]*[:\-–·]/.test(l.slice(p.length));
};

/** Kaydın boyuttaki değer(ler)i; etikette birden çok değer olabilir */
export const dimValues = (t: Task, dim: DashboardDim, c: DimContext): string[] => {
    switch (dim.kind) {
        case 'status': return [taskStatusLabel(t, c.workflow)];
        case 'category': return [CATEGORY_TR[t.status]];
        case 'priority': return [PRIORITY_TR[t.priority] || t.priority];
        case 'assignee': return [t.resourceName?.trim() || 'Atanmamış'];
        case 'unit': return [t.unit?.trim() || NONE];
        case 'workPackage': return [c.project.workPackages.find(w => w.id === t.workPackageId)?.name || 'İş paketi yok'];
        case 'issueType': return [t.issueType ? ISSUE_TYPE_LABELS[t.issueType] : 'Tür yok'];
        case 'sprint': return [sprintLabel(t.version || 0, c.project.settings.sprintNames)];
        case 'fixVersion': return [t.fixVersion?.trim() || 'Sürüm yok'];
        case 'component': return t.components?.length ? t.components : ['Bileşen yok'];
        case 'dueMonth': {
            if (!t.dueDate) return ['Termin yok'];
            const [y, m] = t.dueDate.slice(0, 7).split('-').map(Number);
            return [`${MONTHS[m - 1]} ${y}`];
        }
        case 'labels': {
            const labels = t.labels || [];
            const hits = dim.values?.length
                ? labels.filter(l => dim.values!.some(v => fold(v) === fold(l)))
                : dim.prefix ? labels.filter(l => labelMatchesPrefix(l, dim.prefix!)) : labels;
            // "PoC: Karşılandı" ailesinde değer "Karşılandı" olarak gösterilir
            const shown = dim.prefix && /:$/.test(dim.prefix.trim()) ? hits.map(l => l.slice(l.indexOf(':') + 1).trim() || l) : hits;
            return shown.length ? [...new Set(shown)] : [dim.prefix ? `${dim.prefix.replace(/:$/, '')} yok` : 'Etiket yok'];
        }
    }
};

export const DIM_LABELS: Record<Exclude<DashboardDim['kind'], 'labels'>, string> = {
    status: 'İş akışı durumu', category: 'Durum kategorisi', priority: 'Öncelik', assignee: 'Atanan kişi', unit: 'Birim',
    workPackage: 'İş paketi (epic)', issueType: 'Kayıt türü', sprint: 'Sprint', fixVersion: 'Hedef sürüm', component: 'Bileşen', dueMonth: 'Termin ayı',
};

export const dimLabel = (d: DashboardDim): string =>
    d.kind === 'labels'
        ? (d.prefix ? `Etiket: ${d.prefix.replace(/:$/, '')}` : d.values?.length ? `Etiket: ${d.values.length <= 2 ? d.values.join(' / ') : `${d.values[0]} / … (${d.values.length})`}` : 'Etiketler')
        : DIM_LABELS[d.kind];

/** Doğal sıralama: MS2 < MS10; "yok" değerleri sona */
const natural = (a: string, b: string) => {
    const na = /(yok|—|Atanmamış)$/.test(a), nb = /(yok|—|Atanmamış)$/.test(b);
    if (na !== nb) return na ? 1 : -1;
    return a.localeCompare(b, 'tr', { numeric: true, sensitivity: 'base' });
};

const MONTH_INDEX = Object.fromEntries(MONTHS.map((m, i) => [m, i]));
const monthKey = (s: string) => { const [m, y] = s.split(' '); return Number(y) * 12 + (MONTH_INDEX[m] ?? 0); };

/** Boyutun doğal sırası (durumlar iş akışı sırasında, öncelik önemine göre…) */
export const orderKeys = (keys: string[], dim: DashboardDim, c: DimContext, totals?: Map<string, number>): string[] => {
    const uniq = [...new Set(keys)];
    const byList = (list: string[]) => uniq.sort((a, b) => (list.indexOf(a) + 1 || 999) - (list.indexOf(b) + 1 || 999) || natural(a, b));
    switch (dim.kind) {
        case 'status': return byList(c.workflow.statuses.map(s => s.label));
        case 'category': return byList(CATEGORY_ORDER.map(s => CATEGORY_TR[s]));
        case 'priority': return byList(PRIORITY_ORDER.map(p => PRIORITY_TR[p]));
        case 'labels': return dim.values?.length ? byList(dim.values) : uniq.sort(natural);
        case 'sprint': case 'fixVersion': return uniq.sort(natural);
        case 'dueMonth': return uniq.sort((a, b) => (a === 'Termin yok' ? 1 : b === 'Termin yok' ? -1 : monthKey(a) - monthKey(b)));
        default: return totals ? uniq.sort((a, b) => (totals.get(b) || 0) - (totals.get(a) || 0) || natural(a, b)) : uniq.sort(natural);
    }
};

// ------------------------------------------------------------------ kırılım
export interface BreakdownRow {
    key: string;
    total: number;
    done: number;
    inProgress: number;
    open: number;
    overdue: number;
    /** Seçilen ölçüde toplam ve tamamlanan */
    measure: number;
    measureDone: number;
    /** Tamamlanma (ölçüye göre, 0-1) */
    pct: number;
    tasks: Task[];
}

export const breakdown = (tasks: Task[], dim: DashboardDim, c: DimContext, m: DashboardMeasure = 'count', now = new Date()): BreakdownRow[] => {
    const rows = new Map<string, BreakdownRow>();
    for (const t of tasks) {
        for (const key of dimValues(t, dim, c)) {
            const r = rows.get(key) || { key, total: 0, done: 0, inProgress: 0, open: 0, overdue: 0, measure: 0, measureDone: 0, pct: 0, tasks: [] };
            const v = measureOf(t, m);
            r.total++;
            r.tasks.push(t);
            r.measure += v;
            if (isDone(t)) { r.done++; r.measureDone += v; } else r.open++;
            if (t.status === TaskStatus.InProgress) r.inProgress++;
            if (isOverdue(t, now)) r.overdue++;
            rows.set(key, r);
        }
    }
    const totals = new Map([...rows.values()].map(r => [r.key, r.measure]));
    return orderKeys([...rows.keys()], dim, c, totals).map(k => {
        const r = rows.get(k)!;
        return { ...r, measure: round1(r.measure), measureDone: round1(r.measureDone), pct: r.measure ? r.measureDone / r.measure : 0 };
    });
};

const round1 = (v: number) => Math.round(v * 10) / 10;

// ------------------------------------------------------------------ çapraz tablo
export interface Pivot {
    rows: string[];
    cols: string[];
    cells: number[][];
    rowTotals: number[];
    colTotals: number[];
    total: number;
    max: number;
}

export const pivot = (tasks: Task[], a: DashboardDim, b: DashboardDim, c: DimContext, m: DashboardMeasure = 'count'): Pivot => {
    const cell = new Map<string, number>();
    const rowSum = new Map<string, number>(), colSum = new Map<string, number>();
    for (const t of tasks) {
        const v = measureOf(t, m);
        for (const r of dimValues(t, a, c)) for (const k of dimValues(t, b, c)) {
            cell.set(`${r}\u0000${k}`, (cell.get(`${r}\u0000${k}`) || 0) + v);
            rowSum.set(r, (rowSum.get(r) || 0) + v);
            colSum.set(k, (colSum.get(k) || 0) + v);
        }
    }
    const rows = orderKeys([...rowSum.keys()], a, c, rowSum);
    const cols = orderKeys([...colSum.keys()], b, c, colSum);
    const cells = rows.map(r => cols.map(k => round1(cell.get(`${r}\u0000${k}`) || 0)));
    return {
        rows, cols, cells,
        rowTotals: rows.map(r => round1(rowSum.get(r) || 0)),
        colTotals: cols.map(k => round1(colSum.get(k) || 0)),
        total: round1(tasks.reduce((s, t) => s + measureOf(t, m), 0)),
        max: Math.max(0, ...cells.flat()),
    };
};

// ------------------------------------------------------------------ kilometre taşları
export interface MilestoneRow extends BreakdownRow {
    /** En erken başlangıç / en geç termin (kayıtlardan) */
    start?: string;
    end?: string;
    /** Bu taşa kadar (dahil) planlanan kümülatif kapsam payı */
    cumulativePlanned: number;
    /** Bu taşa kadar gerçekleşen kümülatif tamamlanma payı (tüm kapsama göre) */
    cumulativeDone: number;
    state: 'done' | 'late' | 'active' | 'planned';
    daysLeft?: number;
}

export const milestonePlan = (tasks: Task[], dim: DashboardDim, c: DimContext, m: DashboardMeasure = 'count', now = new Date()): MilestoneRow[] => {
    const rows = breakdown(tasks, dim, c, m, now);
    const scope = rows.reduce((s, r) => s + r.measure, 0) || 1;
    let cumPlan = 0, cumDone = 0;
    const today = dayIso(now);
    return rows.map(r => {
        // Taşın planı proje sürümünde varsa (aktarılan MS tarihleri) o esas alınır; yoksa kayıtlardan
        const v = versionNamed(c.project, r.key);
        const dues = r.tasks.map(t => t.dueDate?.slice(0, 10)).filter((d): d is string => !!d).sort();
        const starts = r.tasks.map(t => (t.startedAt || t.createdAt || '').slice(0, 10)).filter(Boolean).sort();
        const end = v?.releaseDate || dues[dues.length - 1];
        const start = v?.startDate || (starts[0] && (!dues[0] || starts[0] < dues[0]) ? starts[0] : dues[0]);
        cumPlan += r.measure;
        cumDone += r.measureDone;
        const state: MilestoneRow['state'] = r.open === 0 ? 'done' : end && end < today ? 'late' : r.inProgress > 0 || r.done > 0 || (start && start <= today) ? 'active' : 'planned';
        return {
            ...r, start, end, state,
            cumulativePlanned: cumPlan / scope,
            cumulativeDone: cumDone / scope,
            ...(end ? { daysLeft: Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / DAY) } : {}),
        };
    });
};

// ------------------------------------------------------------------ kümülatif eğri (burn-up)
export interface BurnupPoint { date: string; planned: number; done: number; scope: number }

/**
 * Haftalık: planlanan (termini o haftaya kadar olanların kümülatif ölçüsü) ve
 * gerçekleşen (o haftaya kadar kapananlar). Kapanış tarihi yoksa son
 * güncelleme ya da termin kullanılır.
 */
export const burnup = (tasks: Task[], m: DashboardMeasure = 'count', now = new Date(), maxWeeks = 52, project?: Pick<Project, 'versions'>): BurnupPoint[] => {
    if (!tasks.length) return [];
    const due = (t: Task) => plannedDue(t, project);
    const doneAt = (t: Task) => (t.resolvedAt || t.updatedAt || t.dueDate || '').slice(0, 10);
    const dates = [
        ...tasks.map(due),
        ...tasks.filter(isDone).map(doneAt),
        dayIso(now),
    ].filter((d): d is string => !!d).sort();
    const monday = (iso: string) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
    let cur = monday(dates[0]);
    const last = monday(dates[dates.length - 1]);
    const weeks: Date[] = [];
    while (cur <= last) { weeks.push(new Date(cur)); cur = new Date(cur.getTime() + 7 * DAY); }
    const step = Math.max(1, Math.ceil(weeks.length / maxWeeks));
    const scope = round1(tasks.reduce((s, t) => s + measureOf(t, m), 0));
    return weeks.filter((_, i) => i % step === 0 || i === weeks.length - 1).map(w => {
        const end = dayIso(new Date(w.getTime() + 6 * DAY));
        return {
            date: dayIso(w),
            planned: round1(tasks.filter(t => { const d = due(t); return !!d && d <= end; }).reduce((s, t) => s + measureOf(t, m), 0)),
            done: round1(tasks.filter(t => isDone(t) && doneAt(t) && doneAt(t) <= end).reduce((s, t) => s + measureOf(t, m), 0)),
            scope,
        };
    });
};

// ------------------------------------------------------------------ etiket aileleri
export interface LabelFamily {
    /** Önek (ör. "MS", "PoC:") */
    prefix: string;
    values: string[];
    /** Ailede en az bir etiketi olan kayıt sayısı */
    tasks: number;
}

/**
 * Etiketlerden aileler: "MS0…MS5" → "MS", "PoC: Karşılanmadı" → "PoC:".
 * En az iki farklı değeri olan aileler, kapsadığı kayıt sayısına göre.
 */
export const labelFamilies = (tasks: Task[]): LabelFamily[] => {
    const fam = new Map<string, { values: Set<string>; tasks: Set<string> }>();
    for (const t of tasks) for (const l of t.labels || []) {
        const colon = /^([^:]{1,30}:)\s*\S/.exec(l);
        const num = /^([A-Za-zÇĞİÖŞÜçğıöşü]{1,12})[\s\-–]*\d+$/.exec(l.trim());
        const prefix = colon ? colon[1] : num ? num[1] : '';
        if (!prefix) continue;
        const f = fam.get(prefix) || { values: new Set(), tasks: new Set() };
        f.values.add(l);
        f.tasks.add(t.id);
        fam.set(prefix, f);
    }
    return [...fam.entries()]
        .filter(([, f]) => f.values.size >= 2)
        .map(([prefix, f]) => ({ prefix, values: [...f.values].sort(natural), tasks: f.tasks.size }))
        .sort((a, b) => b.tasks - a.tasks);
};

/** Projedeki tüm etiketler (çoktan aza) */
export const labelCounts = (tasks: Task[]): { label: string; count: number }[] => {
    const m = new Map<string, number>();
    tasks.forEach(t => (t.labels || []).forEach(l => m.set(l, (m.get(l) || 0) + 1)));
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || natural(a.label, b.label));
};

// ------------------------------------------------------------------ özet sayılar
export interface TaskTotals {
    total: number;
    done: number;
    open: number;
    inProgress: number;
    overdue: number;
    dueSoon: number;
    blocked: number;
    effort: number;
    effortDone: number;
    hours: number;
    unassigned: number;
    noEstimate: number;
    doneThisMonth: number;
    /** Ortalama kapanma süresi (gün; açılış → kapanış) */
    avgLeadDays?: number;
}

export const taskTotals = (tasks: Task[], now = new Date(), c?: DimContext): TaskTotals => {
    const today = dayIso(now);
    const in14 = dayIso(new Date(now.getTime() + 14 * DAY));
    const month = today.slice(0, 7);
    const leads = tasks
        .filter(t => isDone(t) && t.resolvedAt && t.createdAt)
        .map(t => (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt!).getTime()) / DAY)
        .filter(d => d >= 0);
    return {
        total: tasks.length,
        done: tasks.filter(isDone).length,
        open: tasks.filter(t => !isDone(t)).length,
        inProgress: tasks.filter(t => t.status === TaskStatus.InProgress).length,
        overdue: tasks.filter(t => isOverdue(t, now)).length,
        dueSoon: tasks.filter(t => !isDone(t) && t.dueDate && t.dueDate.slice(0, 10) >= today && t.dueDate.slice(0, 10) <= in14).length,
        blocked: tasks.filter(t => !isDone(t) && (t.priority === 'Blocker' || (c ? /engel|blok/i.test(taskWorkflow(t, c.workflow).label) : false))).length,
        effort: round1(tasks.reduce((s, t) => s + effortOf(t), 0)),
        effortDone: round1(tasks.filter(isDone).reduce((s, t) => s + effortOf(t), 0)),
        hours: round1(tasks.reduce((s, t) => s + (t.actualHours || 0), 0)),
        unassigned: tasks.filter(t => !isDone(t) && (!t.resourceName?.trim() || /^atanmamış$/i.test(t.resourceName.trim()))).length,
        noEstimate: tasks.filter(t => !isDone(t) && !(t.time?.avg > 0)).length,
        doneThisMonth: tasks.filter(t => isDone(t) && (t.resolvedAt || '').slice(0, 7) === month).length,
        ...(leads.length ? { avgLeadDays: round1(leads.reduce((s, d) => s + d, 0) / leads.length) } : {}),
    };
};
