import { DashboardLayout, DashboardWidget, DashboardWidgetConfig, DashboardWidgetType, Project, Task } from '../../types';
import { labelFamilies } from './data';

/**
 * Dashboard bileşen kataloğu, hazır şablonlar ve düzen işlemleri.
 *
 * Düzen önceliği: kişinin kendi düzeni (bu tarayıcıda) → projenin varsayılan
 * düzeni (PY kaydeder, herkes görür) → projenin verisine göre seçilen şablon.
 */

export interface WidgetDef {
    type: DashboardWidgetType;
    label: string;
    description: string;
    icon: string;
    group: 'Göstergeler' | 'Grafikler' | 'Tablolar' | 'Listeler' | 'Diğer';
    size: DashboardWidget['size'];
    config?: DashboardWidgetConfig;
}

export const WIDGETS: WidgetDef[] = [
    { type: 'metric', label: 'Gösterge kartı', description: 'Tek sayı: ilerleme, geciken, efor, maliyet, sağlık, risk, sprint…', icon: 'gauge', group: 'Göstergeler', size: 1, config: { metric: 'progress' } },
    { type: 'kpi', label: 'Projeye özel gösterge', description: 'Elle girilen ya da aktarımla gelen ölçüm (ör. PoC skoru): güncel değer, hedef, geçmiş eğrisi', icon: 'target', group: 'Göstergeler', size: 2 },
    { type: 'progress', label: 'İlerleme halkası', description: 'Tamamlanan / süreçte / bekleyen payı; kayıt ya da efora göre', icon: 'activity', group: 'Grafikler', size: 1, config: { measure: 'count' } },
    { type: 'statusMix', label: 'Durum dağılımı', description: 'Kayıtların iş akışı durumlarına dağılımı', icon: 'columns', group: 'Grafikler', size: 2, config: { dim: { kind: 'status' } } },
    { type: 'breakdown', label: 'Kırılım', description: 'Seçtiğiniz boyuta göre adet, tamamlanma ve gecikme: etiket ailesi (MS, önem, PoC sonucu…), iş paketi, kişi, birim, öncelik…', icon: 'list', group: 'Grafikler', size: 2, config: { dim: { kind: 'workPackage' }, measure: 'count', chart: 'bar' } },
    { type: 'milestones', label: 'Kilometre taşı planı', description: 'Her taşın kapsamı, efor, tarih aralığı, tamamlanma ve kümülatif plan (MS, sprint ya da sürüm)', icon: 'flag', group: 'Tablolar', size: 4, config: { dim: { kind: 'sprint' }, measure: 'count' } },
    { type: 'workPackages', label: 'İş paketi (epic) durumu', description: 'İş paketi başına kayıt, efor, ilerleme, geciken ve son termin', icon: 'briefcase', group: 'Tablolar', size: 4, config: { measure: 'effort' } },
    { type: 'pivot', label: 'Çapraz tablo', description: 'İki boyutu karşılaştırın (ör. önem × durum, MS × iş paketi); ısı haritası', icon: 'grid', group: 'Tablolar', size: 4, config: { dim: { kind: 'priority' }, dim2: { kind: 'category' }, measure: 'count' } },
    { type: 'burnup', label: 'Plan / gerçekleşen eğrisi', description: 'Haftalık kümülatif: termine göre planlanan ve kapanan', icon: 'timeline', group: 'Grafikler', size: 2, config: { measure: 'count' } },
    { type: 'team', label: 'Ekip yükü', description: 'Kişi ya da birim başına açık iş, geciken ve kalan efor', icon: 'users', group: 'Tablolar', size: 2, config: { dim: { kind: 'assignee' }, limit: 8 } },
    { type: 'deadlines', label: 'Geciken ve yaklaşan', description: 'Termini geçmiş ve 14 gün içinde bitecek kayıtlar', icon: 'clock', group: 'Listeler', size: 2, config: { limit: 8 } },
    { type: 'risks', label: 'Riskler', description: 'Açık riskler skoruna göre; bant dağılımı', icon: 'shield', group: 'Listeler', size: 2, config: { limit: 6 } },
    { type: 'sprint', label: 'Şu anki sprint', description: 'Sprint ilerlemesi, kalan gün ve sonraki sprintler', icon: 'rocket', group: 'Göstergeler', size: 2 },
    { type: 'worklog', label: 'Kim ne kadar çalıştı', description: "Jira worklog'larından kişi bazında saat ve maliyet", icon: 'clock', group: 'Tablolar', size: 2, config: { limit: 8 } },
    { type: 'jiraBottlenecks', label: 'Jira darboğazları', description: 'Durumda ortanca ve ortalama çalışma saati, yeniden açılan ve değişen kayıtlar', icon: 'clock', group: 'Göstergeler', size: 2 },
    { type: 'effortStatus', label: 'Efor durumu', description: 'Jira tahmini, tamamlanma tahmini (EAC) ve en çok aşan kayıtlar', icon: 'gauge', group: 'Göstergeler', size: 2 },
    { type: 'activity', label: 'Son değişiklikler', description: 'Durum geçişleri ve kapanışlar', icon: 'history', group: 'Listeler', size: 2, config: { limit: 8 } },
    { type: 'pocScore', label: 'PoC skoru ve katkılar', description: 'İlk, Doğrulanmış, Bugün (son Jira eşitlemesi) ve Olası skor; kalan açığın planlama kategorilerine dağılımı', icon: 'target', group: 'Göstergeler', size: 4 },
    { type: 'note', label: 'Not', description: 'Serbest metin: karar, uyarı, bağlantı, açıklama', icon: 'pen', group: 'Diğer', size: 2, config: { text: '' } },
];

export const WIDGET_BY_TYPE = new Map(WIDGETS.map(w => [w.type, w]));

export const newWidgetId = (): string => `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const w = (type: DashboardWidgetType, size: DashboardWidget['size'], config?: DashboardWidgetConfig, title?: string): DashboardWidget =>
    ({ id: newWidgetId(), type, size, ...(config ? { config } : {}), ...(title ? { title } : {}) });

export const createWidget = (type: DashboardWidgetType, over: Partial<DashboardWidget> = {}): DashboardWidget => {
    const def = WIDGET_BY_TYPE.get(type)!;
    return { id: newWidgetId(), type, size: def.size, ...(def.config ? { config: structuredClone(def.config) } : {}), ...over };
};

// ------------------------------------------------------------------ şablonlar
export interface Template {
    key: string;
    label: string;
    description: string;
    build: (project: Project) => DashboardWidget[];
}

const familyPrefix = (tasks: Task[], re: RegExp): string | undefined => labelFamilies(tasks).find(f => re.test(f.prefix))?.prefix;
const IMPORTANCE = ['Zorunlu', 'Olması beklenen', 'İsteğe bağlı'];
const hasLabels = (tasks: Task[], values: string[]) => tasks.some(t => (t.labels || []).some(l => values.includes(l)));

export const TEMPLATES: Template[] = [
    {
        key: 'genel',
        label: 'Genel bakış',
        description: 'İlerleme, takvim, durum, kilometre taşları, ekip ve iş paketleri',
        build: project => {
            const ms = familyPrefix(project.tasks, /^ms$/i);
            return [
                w('metric', 1, { metric: 'progress' }),
                w('metric', 1, { metric: 'overdue' }),
                w('metric', 1, { metric: 'remainingEffort' }),
                w('metric', 1, { metric: 'openRisks' }),
                w('statusMix', 2, { dim: { kind: 'status' } }),
                w('burnup', 2, { measure: 'count' }),
                w('milestones', 4, { dim: ms ? { kind: 'labels', prefix: ms } : { kind: 'sprint' }, measure: 'count' }),
                w('workPackages', 4, { measure: 'effort' }),
                w('team', 2, { dim: { kind: 'assignee' }, limit: 8 }),
                w('deadlines', 2, { limit: 8 }),
            ];
        },
    },
    {
        key: 'poc',
        label: 'Müşteri PoC / bulgu takibi',
        description: 'GİB PoC Bulgu Takip Excel\'indeki gibi: PoC skoru, MS planı ve kümülatif tamamlanma, önem × durum, epic durumu, PoC sonucu, ekip',
        build: project => {
            const ms = familyPrefix(project.tasks, /^ms$/i) || 'MS';
            const poc = familyPrefix(project.tasks, /^poc:$/i);
            const planning = familyPrefix(project.tasks, /^planlama:$/i);
            const scope = planning ? labelFamilies(project.tasks).find(f => f.prefix === planning)?.values.find(v => /aral[ıi]k/i.test(v)) : undefined;
            const kpis = project.kpis || [];
            const score = kpis.find(k => /poc/i.test(k.name)) || kpis[0];
            const mandatory = kpis.find(k => /zorunlu/i.test(k.name));
            return [
                ...(project.poc?.tests?.length ? [w('pocScore', 4, undefined, 'PoC skoru · Bugün ve Olası')] : []),
                ...(score ? [w('kpi', 2, { kpiId: score.id })] : [w('metric', 1, { metric: 'progress' }), w('metric', 1, { metric: 'effortProgress' })]),
                ...(mandatory ? [w('kpi', 1, { kpiId: mandatory.id })] : [w('metric', 1, { metric: 'overdue' })]),
                w('metric', 1, { metric: 'progress' }, 'Sonuçlanan madde'),
                w('milestones', 4, { dim: { kind: 'labels', prefix: ms }, measure: 'count' }, 'Milestone planı'),
                ...(hasLabels(project.tasks, IMPORTANCE) ? [w('pivot', 4, { dim: { kind: 'labels', values: IMPORTANCE }, dim2: { kind: 'status' }, measure: 'count' }, 'Önem × durum')] : []),
                // Planlama kategorileri yalnız etiket: büyüklük ve önem dağılımı, Aralık kapsamı başlık bazında
                ...(planning ? [w('pivot', 4, { dim: { kind: 'labels', prefix: planning }, dim2: { kind: 'labels', values: IMPORTANCE }, measure: 'count' }, 'Planlama kategorisi × önem')] : []),
                ...(scope ? [w('breakdown', 2, { dim: { kind: 'workPackage' }, filter: { labels: [scope] }, measure: 'count', chart: 'bar' }, `${scope.replace(/^[^:]*:\s*/, '')} maddeleri – başlık bazında`)] : []),
                w('workPackages', 4, { measure: 'effort' }, 'Epic durumu ve planı'),
                ...(poc ? [w('breakdown', 2, { dim: { kind: 'labels', prefix: poc }, measure: 'count', chart: 'bar' }, 'PoC sonucuna göre')] : []),
                ...(hasLabels(project.tasks, ['Rapor 5.1']) ? [w('breakdown', 2, { dim: { kind: 'labels', prefix: ms }, filter: { labels: ['Rapor 5.1'] }, measure: 'count', chart: 'bar' }, 'Rapor 5.1 bulguları – MS')] : []),
                w('team', 2, { dim: { kind: 'unit' }, limit: 8 }, 'Ekip ve efor'),
                w('burnup', 2, { measure: 'count' }),
                w('deadlines', 2, { limit: 8 }),
            ];
        },
    },
    {
        key: 'sprint',
        label: 'Sprint odaklı',
        description: 'Şu anki sprint, plan eğrisi, durumlar, kişi yükü ve terminler',
        build: () => [
            w('sprint', 2),
            w('metric', 1, { metric: 'dueSoon' }),
            w('metric', 1, { metric: 'overdue' }),
            w('burnup', 2, { measure: 'effort' }),
            w('statusMix', 2, { dim: { kind: 'status' } }),
            w('milestones', 4, { dim: { kind: 'sprint' }, measure: 'effort' }, 'Sprintler'),
            w('team', 2, { dim: { kind: 'assignee' }, limit: 8 }),
            w('deadlines', 2, { limit: 8 }),
        ],
    },
    {
        key: 'yonetici',
        label: 'Yönetici özeti',
        description: 'Sağlık, ilerleme, maliyet, riskler, kilometre taşları ve son değişiklikler',
        build: project => [
            w('metric', 1, { metric: 'health' }),
            w('metric', 1, { metric: 'progress' }),
            w('metric', 1, { metric: 'overdue' }),
            w('metric', 1, { metric: 'worklogCost' }),
            ...(project.kpis || []).slice(0, 2).map(k => w('kpi', 2, { kpiId: k.id })),
            w('milestones', 4, { dim: familyPrefix(project.tasks, /^ms$/i) ? { kind: 'labels', prefix: familyPrefix(project.tasks, /^ms$/i) } : { kind: 'sprint' }, measure: 'count' }),
            w('risks', 2, { limit: 6 }),
            w('activity', 2, { limit: 8 }),
        ],
    },
];

export const TEMPLATE_BY_KEY = new Map(TEMPLATES.map(t => [t.key, t]));

/** Kayıtlı düzen yoksa: MS etiketleri ya da projeye özel gösterge varsa PoC şablonu, yoksa genel */
export const defaultLayout = (project: Project): DashboardLayout => {
    const poc = (project.kpis?.length || 0) > 0 || !!project.poc?.tests?.length || labelFamilies(project.tasks).some(f => /^ms$/i.test(f.prefix));
    return { widgets: TEMPLATE_BY_KEY.get(poc ? 'poc' : 'genel')!.build(project) };
};

// ------------------------------------------------------------------ düzen işlemleri (saf)
export const addWidget = (l: DashboardLayout, wd: DashboardWidget, at?: number): DashboardLayout => {
    const widgets = [...l.widgets];
    widgets.splice(at === undefined ? widgets.length : Math.max(0, Math.min(at, widgets.length)), 0, wd);
    return { ...l, widgets };
};
export const removeWidget = (l: DashboardLayout, id: string): DashboardLayout => ({ ...l, widgets: l.widgets.filter(x => x.id !== id) });
export const updateWidget = (l: DashboardLayout, id: string, patch: Partial<DashboardWidget>): DashboardLayout =>
    ({ ...l, widgets: l.widgets.map(x => (x.id === id ? { ...x, ...patch } : x)) });
export const moveWidget = (l: DashboardLayout, id: string, delta: number): DashboardLayout => {
    const i = l.widgets.findIndex(x => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= l.widgets.length) return l;
    const widgets = [...l.widgets];
    const [x] = widgets.splice(i, 1);
    widgets.splice(j, 0, x);
    return { ...l, widgets };
};
/** Sürükle-bırak: id'yi hedefin yerine taşır */
export const moveWidgetTo = (l: DashboardLayout, id: string, targetId: string): DashboardLayout => {
    const from = l.widgets.findIndex(x => x.id === id), to = l.widgets.findIndex(x => x.id === targetId);
    if (from < 0 || to < 0 || from === to) return l;
    const widgets = [...l.widgets];
    const [x] = widgets.splice(from, 1);
    widgets.splice(to, 0, x);
    return { ...l, widgets };
};
export const duplicateWidget = (l: DashboardLayout, id: string): DashboardLayout => {
    const i = l.widgets.findIndex(x => x.id === id);
    if (i < 0) return l;
    return addWidget(l, { ...structuredClone(l.widgets[i]), id: newWidgetId() }, i + 1);
};

/** Bozuk / eski kayıtları ayıklar (bilinmeyen tür, geçersiz boyut) */
export const sanitizeLayout = (raw: unknown): DashboardLayout | null => {
    const v = raw as DashboardLayout | null;
    if (!v || !Array.isArray(v.widgets)) return null;
    const widgets = v.widgets
        .filter(x => x && typeof x.id === 'string' && WIDGET_BY_TYPE.has(x.type))
        .map(x => ({ ...x, size: ([1, 2, 3, 4].includes(x.size) ? x.size : WIDGET_BY_TYPE.get(x.type)!.size) as DashboardWidget['size'] }))
        .slice(0, 60);
    return { widgets, ...(v.updatedAt ? { updatedAt: v.updatedAt } : {}) };
};

// ------------------------------------------------------------------ kişisel düzen (bu tarayıcıda)
const KEY = 'PLANASISTAN_DASHBOARD_V1';
export const personalKey = (projectId: string, role: string, personId?: string) => `${KEY}:${projectId}:${role}:${personId || '-'}`;

export const loadPersonal = (key: string): DashboardLayout | null => {
    try { const raw = localStorage.getItem(key); return raw ? sanitizeLayout(JSON.parse(raw)) : null; } catch { return null; }
};
export const savePersonal = (key: string, l: DashboardLayout | null): void => {
    try { if (l) localStorage.setItem(key, JSON.stringify({ ...l, updatedAt: new Date().toISOString() })); else localStorage.removeItem(key); } catch { /* özel pencere */ }
};
