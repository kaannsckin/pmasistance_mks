import {
    ExecSectionKey, ProjectSectionKey, ProjectSortKey, ProjectStatus, Risk, RiskSortKey, RoleViewConfig, Task, TaskSortKey, TaskStatus, UserRole, View, ViewConfig, WorkspaceData,
} from '../types';

/**
 * Rol bazlı görünüm ayarları (admin): hangi proje sekmeleri ve yönetim kartları
 * görünür, hangi kayıtlar listelenir (proje durumu, görev önceliği, risk skoru)
 * ve listeler nasıl sıralanır. Ayar yoksa her şey görünür ve ekranların kendi
 * sıralaması geçerlidir.
 *
 * Filtreler yalnız gösterimi daraltır: sağlık skoru, EVM ve sayaçlar tam
 * veriden hesaplanır; düzenlenebilir zaman çizelgesi süzülmez (otomatik
 * planlama gizli görevleri kaybetmesin).
 */

export type TaskPriority = Task['priority'];

export const PROJECT_SECTIONS: { key: ProjectSectionKey; label: string; view?: View; locked?: boolean }[] = [
    { key: 'overview', label: 'Genel bakış', view: View.Overview, locked: true },
    { key: 'board', label: 'Pano', view: View.Roadmap },
    { key: 'list', label: 'Liste', view: View.Tasks },
    { key: 'timeline', label: 'Zaman çizelgesi', view: View.Kanban },
    { key: 'planning', label: 'Planlama', view: View.Planning },
    { key: 'risks', label: 'Riskler', view: View.Risks },
    { key: 'team', label: 'Ekip', view: View.Resources },
    { key: 'goals', label: 'Hedefler', view: View.Goals },
    { key: 'workPackages', label: 'İş paketleri' },
    { key: 'assistant', label: 'Asistan', view: View.AI },
];

export const EXEC_SECTIONS: { key: ExecSectionKey; label: string; hint: string }[] = [
    { key: 'summary', label: 'Özet paragrafı', hint: 'Otomatik yönetim özeti' },
    { key: 'kpis', label: 'Göstergeler', hint: 'Sağlık, takvim, bütçe, doluluk kutuları' },
    { key: 'expectations', label: 'Yönetimden beklentiler', hint: 'Karar ve onay bekleyenler' },
    { key: 'meetings', label: 'Müşteri görüşmeleri', hint: 'Onay bekleyen ve yaklaşan görüşmeler' },
    { key: 'health', label: 'Sağlık dağılımı', hint: 'Sağlıklı / izlemede / sorunlu' },
    { key: 'attention', label: 'Dikkat isteyen projeler', hint: 'En düşük skorlu projeler' },
    { key: 'approvals', label: 'Onay bekleyen planlar', hint: 'Plan kilidi bekleyen projeler' },
    { key: 'risks', label: 'Öne çıkan riskler', hint: 'Portföyün en yüksek skorlu riskleri' },
    { key: 'departments', label: 'Bölüm doluluğu', hint: 'Bölüm kapasite kullanımı' },
    { key: 'changes', label: 'Son 7 gün', hint: 'Denetim günlüğünden değişiklik akışı' },
];

export const PRIORITY_RANK: Record<TaskPriority, number> = { Blocker: 0, High: 1, Medium: 2, Low: 3 };
export const PRIORITY_LABELS: Record<TaskPriority, string> = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' };

export const MIN_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
    { value: 'Low', label: 'Tüm görevler' },
    { value: 'Medium', label: 'Orta ve üstü' },
    { value: 'High', label: 'Yüksek ve engelleyici' },
    { value: 'Blocker', label: 'Yalnız engelleyici' },
];

export const MIN_RISK_OPTIONS: { value: number; label: string }[] = [
    { value: 0, label: 'Tüm riskler' },
    { value: 8, label: 'Orta ve üstü (8+)' },
    { value: 15, label: 'Yalnız yüksek (15+)' },
];

export const TASK_SORT_LABELS: Record<TaskSortKey, string> = { smart: 'Gecikene göre (önerilen)', priority: 'Önceliğe göre', due: 'Bitiş tarihine göre', name: 'Ada göre' };
export const RISK_SORT_LABELS: Record<RiskSortKey, string> = { score: 'Skora göre', recent: 'En yeni önce' };
export const PROJECT_SORT_LABELS: Record<ProjectSortKey, string> = { health: 'Sağlık (en kötü önce)', name: 'Ada göre', progress: 'İlerleme (en az önce)', overdue: 'Geciken görev (en çok önce)' };

export const PROJECT_STATUS_ORDER: ProjectStatus[] = ['devam', 'teklif', 'beklemede', 'tamamlandi'];

/** Çözümlenmiş görünüm (varsayılanlar doldurulmuş) */
export interface RoleView {
    projectSections: Set<ProjectSectionKey>;
    execSections: Set<ExecSectionKey>;
    projectStatuses: ProjectStatus[] | null; // null = tümü
    minTaskPriority: TaskPriority; // 'Low' = tümü
    minRiskScore: number;
    showClosedRisks: boolean;
    taskSort: TaskSortKey;
    riskSort: RiskSortKey;
    projectSort: ProjectSortKey | null; // null = ekranın kendi sıralaması
    customized: boolean;
}

const ALL_PROJECT_SECTIONS = PROJECT_SECTIONS.map(s => s.key);
const ALL_EXEC_SECTIONS = EXEC_SECTIONS.map(s => s.key);

const DEFAULTS: Required<Omit<RoleViewConfig, 'projectStatuses' | 'projectSort'>> = {
    projectSections: ALL_PROJECT_SECTIONS,
    execSections: ALL_EXEC_SECTIONS,
    minTaskPriority: 'Low',
    minRiskScore: 0,
    showClosedRisks: true,
    taskSort: 'smart',
    riskSort: 'score',
};

const sameSet = <T>(a: T[] | undefined, b: T[]): boolean => !!a && a.length === b.length && b.every(x => a.includes(x));

export const viewFor = (cfg: ViewConfig | undefined, role: UserRole): RoleView => {
    const c = cfg?.[role] || {};
    const sections = new Set<ProjectSectionKey>((c.projectSections || ALL_PROJECT_SECTIONS).filter(k => ALL_PROJECT_SECTIONS.includes(k)));
    sections.add('overview'); // genel bakış her zaman açık
    const statuses = c.projectStatuses?.filter(s => PROJECT_STATUS_ORDER.includes(s));
    return {
        projectSections: sections,
        execSections: new Set((c.execSections || ALL_EXEC_SECTIONS).filter(k => ALL_EXEC_SECTIONS.includes(k))),
        projectStatuses: statuses && statuses.length && statuses.length < PROJECT_STATUS_ORDER.length ? statuses : null,
        minTaskPriority: c.minTaskPriority && c.minTaskPriority in PRIORITY_RANK ? c.minTaskPriority : 'Low',
        minRiskScore: typeof c.minRiskScore === 'number' && c.minRiskScore > 0 ? c.minRiskScore : 0,
        showClosedRisks: c.showClosedRisks ?? true,
        taskSort: c.taskSort && c.taskSort in TASK_SORT_LABELS ? c.taskSort : 'smart',
        riskSort: c.riskSort && c.riskSort in RISK_SORT_LABELS ? c.riskSort : 'score',
        projectSort: c.projectSort && c.projectSort in PROJECT_SORT_LABELS ? c.projectSort : null,
        customized: Object.keys(c).length > 0,
    };
};

export const roleViewOf = (ws: Pick<WorkspaceData, 'viewConfig' | 'currentRole'>): RoleView => viewFor(ws.viewConfig, ws.currentRole || 'py');

/** Varsayılana eşit alanları atar; boş kalan rol silinir */
const clean = (c: RoleViewConfig): RoleViewConfig => {
    const out: RoleViewConfig = {};
    if (c.projectSections && !sameSet(c.projectSections.includes('overview') ? c.projectSections : [...c.projectSections, 'overview'], ALL_PROJECT_SECTIONS)) {
        out.projectSections = ALL_PROJECT_SECTIONS.filter(k => k === 'overview' || c.projectSections!.includes(k));
    }
    if (c.execSections && !sameSet(c.execSections, ALL_EXEC_SECTIONS)) out.execSections = ALL_EXEC_SECTIONS.filter(k => c.execSections!.includes(k));
    if (c.projectStatuses && c.projectStatuses.length && !sameSet(c.projectStatuses, PROJECT_STATUS_ORDER)) out.projectStatuses = PROJECT_STATUS_ORDER.filter(s => c.projectStatuses!.includes(s));
    if (c.minTaskPriority && c.minTaskPriority !== DEFAULTS.minTaskPriority) out.minTaskPriority = c.minTaskPriority;
    if (c.minRiskScore && c.minRiskScore !== DEFAULTS.minRiskScore) out.minRiskScore = c.minRiskScore;
    if (c.showClosedRisks === false) out.showClosedRisks = false;
    if (c.taskSort && c.taskSort !== DEFAULTS.taskSort) out.taskSort = c.taskSort;
    if (c.riskSort && c.riskSort !== DEFAULTS.riskSort) out.riskSort = c.riskSort;
    if (c.projectSort) out.projectSort = c.projectSort;
    return out;
};

const withRole = (cfg: ViewConfig | undefined, role: UserRole, next: RoleViewConfig): ViewConfig | undefined => {
    const rest = { ...(cfg || {}) };
    delete rest[role];
    const c = clean(next);
    const merged: ViewConfig = Object.keys(c).length ? { ...rest, [role]: c } : rest;
    return Object.keys(merged).length ? merged : undefined;
};

/** Rolün görünümünde alan(lar)ı değiştirir (undefined alan varsayılana döner) */
export const updateRoleView = (cfg: ViewConfig | undefined, role: UserRole, patch: Partial<RoleViewConfig>): ViewConfig | undefined =>
    withRole(cfg, role, { ...(cfg?.[role] || {}), ...patch });

export const resetRoleView = (cfg: ViewConfig | undefined, role: UserRole): ViewConfig | undefined => withRole(cfg, role, {});

// ---------------------------------------------------------------- hazır ayarlar

export type ViewPresetKey = 'full' | 'summary' | 'critical';

export const VIEW_PRESETS: { key: ViewPresetKey; label: string; description: string; config: RoleViewConfig }[] = [
    { key: 'full', label: 'Tam görünüm', description: 'Tüm sekmeler, kartlar ve kayıtlar; ekranların kendi sıralaması', config: {} },
    {
        key: 'summary',
        label: 'Yönetici özeti',
        description: 'Projede genel bakış, riskler ve hedefler; yönetim ekranında özet, sağlık, dikkat ve riskler; orta ve üstü riskler',
        config: {
            projectSections: ['overview', 'risks', 'goals'],
            execSections: ['summary', 'kpis', 'expectations', 'health', 'attention', 'approvals', 'risks'],
            minRiskScore: 8,
            taskSort: 'priority',
            projectSort: 'health',
        },
    },
    {
        key: 'critical',
        label: 'Yalnız kritikler',
        description: 'Devam eden projeler, yüksek ve engelleyici görevler, 15+ riskler; kapanan riskler gizli',
        config: { projectStatuses: ['devam'], minTaskPriority: 'High', minRiskScore: 15, showClosedRisks: false, taskSort: 'priority', projectSort: 'health' },
    },
];

export const applyPreset = (cfg: ViewConfig | undefined, role: UserRole, key: ViewPresetKey): ViewConfig | undefined =>
    withRole(cfg, role, VIEW_PRESETS.find(p => p.key === key)?.config || {});

/** Rolün ayarı bir hazır ayarla birebir aynıysa onun anahtarı */
export const matchingPreset = (cfg: ViewConfig | undefined, role: UserRole): ViewPresetKey | null => {
    const cur = JSON.stringify(clean(cfg?.[role] || {}));
    return VIEW_PRESETS.find(p => JSON.stringify(clean(p.config)) === cur)?.key ?? null;
};

/** Ayar farklarının kısa özeti (admin listesi ve ekranlardaki bilgi notu için) */
export const viewSummary = (v: RoleView): string[] => {
    const out: string[] = [];
    const hiddenTabs = PROJECT_SECTIONS.filter(s => !v.projectSections.has(s.key)).length;
    const hiddenCards = EXEC_SECTIONS.filter(s => !v.execSections.has(s.key)).length;
    if (hiddenTabs) out.push(`${hiddenTabs} proje sekmesi gizli`);
    if (hiddenCards) out.push(`${hiddenCards} yönetim kartı gizli`);
    if (v.projectStatuses) out.push(`Proje durumu: ${v.projectStatuses.length} durum`);
    if (v.minTaskPriority !== 'Low') out.push(`Görev: ${MIN_PRIORITY_OPTIONS.find(o => o.value === v.minTaskPriority)!.label.toLocaleLowerCase('tr-TR')}`);
    if (v.minRiskScore) out.push(`Risk: ${v.minRiskScore}+`);
    if (!v.showClosedRisks) out.push('Kapanan riskler gizli');
    if (v.taskSort !== 'smart') out.push(`Görev sırası: ${TASK_SORT_LABELS[v.taskSort].toLocaleLowerCase('tr-TR')}`);
    if (v.riskSort !== 'score') out.push(`Risk sırası: ${RISK_SORT_LABELS[v.riskSort].toLocaleLowerCase('tr-TR')}`);
    if (v.projectSort) out.push(`Proje sırası: ${PROJECT_SORT_LABELS[v.projectSort].toLocaleLowerCase('tr-TR')}`);
    return out;
};

// ---------------------------------------------------------------- uygulayıcılar

export const sectionVisible = (v: RoleView, key: ProjectSectionKey): boolean => v.projectSections.has(key);

/** Proje içi görünümün hangi sekmeye ait olduğu (sekme dışı görünümler için undefined) */
export const sectionOfView = (view: View): ProjectSectionKey | undefined => PROJECT_SECTIONS.find(s => s.view === view)?.key;

export const projectPassesView = (v: RoleView, p: { status: ProjectStatus }): boolean => !v.projectStatuses || v.projectStatuses.includes(p.status);

export const taskPassesView = (v: Pick<RoleView, 'minTaskPriority'>, t: Pick<Task, 'priority'>): boolean =>
    (PRIORITY_RANK[t.priority] ?? 3) <= PRIORITY_RANK[v.minTaskPriority];

export const riskPassesView = (v: Pick<RoleView, 'minRiskScore' | 'showClosedRisks'>, r: Pick<Risk, 'status'> & { score: number }): boolean =>
    r.score >= v.minRiskScore && (v.showClosedRisks || r.status !== 'closed');

/** Risk sıralaması: aktifler önce; skor ya da en yeni */
export const sortRisksByView = <T extends Pick<Risk, 'status' | 'createdAt' | 'title'> & { score: number }>(rows: T[], sort: RiskSortKey): T[] =>
    [...rows].sort((a, b) =>
        Number(a.status === 'closed') - Number(b.status === 'closed')
        || (sort === 'recent' ? (b.createdAt || '').localeCompare(a.createdAt || '') || b.score - a.score : b.score - a.score)
        || a.title.localeCompare(b.title, 'tr'));

/** Risk listesine görünüm filtresi ve sıralaması */
export const applyRiskView = <T extends Pick<Risk, 'status' | 'createdAt' | 'title'> & { score: number }>(rows: T[], v: RoleView): T[] =>
    sortRisksByView(rows.filter(r => riskPassesView(v, r)), v.riskSort);

const todayIso = (now: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

/** Görev karşılaştırıcısı (liste ve pano sütunları) */
export const taskComparator = (sort: TaskSortKey, now: Date = new Date()) => {
    const today = todayIso(now);
    const late = (t: Task) => (t.dueDate && t.status !== TaskStatus.Done && t.dueDate.slice(0, 10) < today ? t.dueDate.slice(0, 10) : null);
    const rank = (t: Task) => PRIORITY_RANK[t.priority] ?? 3;
    const byName = (a: Task, b: Task) => a.name.localeCompare(b.name, 'tr');
    const byLate = (a: Task, b: Task) => {
        const la = late(a), lb = late(b);
        if (la && lb) return la.localeCompare(lb); // en eski termin = en çok geciken
        return la ? -1 : lb ? 1 : 0;
    };
    const byDue = (a: Task, b: Task) => {
        const da = a.dueDate?.slice(0, 10), db = b.dueDate?.slice(0, 10);
        if (da && db) return da.localeCompare(db);
        return da ? -1 : db ? 1 : 0;
    };
    switch (sort) {
        case 'priority': return (a: Task, b: Task) => rank(a) - rank(b) || byLate(a, b) || byName(a, b);
        case 'due': return (a: Task, b: Task) => byDue(a, b) || rank(a) - rank(b) || byName(a, b);
        case 'name': return byName;
        default: return (a: Task, b: Task) => byLate(a, b) || rank(a) - rank(b) || byName(a, b);
    }
};

export interface ProjectSortable {
    name: string;
    score?: number;
    progress: number; // 0–100
    overdue: number;
}

export const projectComparator = (sort: ProjectSortKey) => (a: ProjectSortable, b: ProjectSortable): number => {
    switch (sort) {
        case 'health': return (a.score ?? 101) - (b.score ?? 101) || a.name.localeCompare(b.name, 'tr');
        case 'progress': return a.progress - b.progress || a.name.localeCompare(b.name, 'tr');
        case 'overdue': return b.overdue - a.overdue || a.name.localeCompare(b.name, 'tr');
        default: return a.name.localeCompare(b.name, 'tr');
    }
};
