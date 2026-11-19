import { BoardConfig, IssueType, Project, ProjectScheme, SchemeRequiredField, Task, TaskStatus, WorkflowConfig, WorkspaceData } from '../types';
import { boardConfigOf } from './board';
import { CATEGORY_LABELS, DEFAULT_WORKFLOW, knownWorkflow, workflowKey } from './workflow';

/**
 * Proje yapılandırma şemaları — Jira'nın "scheme" modeli örnek alındı:
 * Jira'da iş akışı, kayıt türü ve alan yapılandırması projeye doğrudan değil
 * paylaşılan şemalarla verilir; bir şema birçok projede kullanılır, değişiklik
 * hepsine yansır. Burada tek şema bu parçaları birlikte taşır:
 *
 *   İş akışı   — durumlar (Türkçe ad, Jira anahtarı, kategori), başlangıç
 *                durumu ve izin verilen geçişler (serbest ya da tanımlı)
 *   Kayıt türü — projede açılabilecek türler
 *   Alanlar    — zorunlu alanlar (atanan, termin, tahmin, tür, etiket, İP)
 *   Pano       — kolonlar/kurallar/filtreler; proje sahibinin özelleştirip
 *                özelleştiremeyeceği
 *
 * Admin şemaları yönetici konsolunda tanımlar ve projelere atar; atanmamış
 * proje yerleşik "Varsayılan" şemayı kullanır (önceki davranış).
 */

export const DEFAULT_SCHEME_ID = 'default';

export const REQUIRED_FIELD_LABELS: Record<SchemeRequiredField, string> = {
    resourceName: 'Atanan kişi',
    dueDate: 'Bitiş tarihi',
    estimate: 'Süre tahmini',
    issueType: 'Kayıt türü',
    labels: 'En az bir etiket',
    workPackage: 'İş paketi',
};

export const ISSUE_TYPE_OPTIONS: { value: IssueType; label: string }[] = [
    { value: 'bug', label: 'Hata' },
    { value: 'feature', label: 'Yeni özellik' },
    { value: 'improvement', label: 'İyileştirme' },
    { value: 'task', label: 'Görev' },
    { value: 'other', label: 'Diğer' },
];

const st = (key: string, label: string, category: TaskStatus) => ({ key, label, category });
const T = TaskStatus;

export type SchemeTemplateKey = 'basic' | 'software' | 'support' | 'full';

export const SCHEME_TEMPLATES: { key: SchemeTemplateKey; name: string; description: string; build: () => Omit<ProjectScheme, 'id' | 'name'> }[] = [
    {
        key: 'basic',
        name: 'Basit',
        description: 'Yapılacak → Devam Ediyor → Tamamlandı. Küçük ekipler ve iç işler için; geçişler serbest.',
        build: () => ({
            workflow: { statuses: [st('TO DO', 'Yapılacak', T.ToDo), st('IN PROGRESS', 'Devam Ediyor', T.InProgress), st('DONE', 'Tamamlandı', T.Done)], initial: 'TO DO' },
            allowProjectBoard: true,
        }),
    },
    {
        key: 'software',
        name: 'Yazılım geliştirme',
        description: 'Yapılacak → Geliştirmede → Kod İncelemede → Testte → Tamamlandı; testten ve incelemeden geliştirmeye geri dönülebilir.',
        build: () => ({
            workflow: {
                statuses: [
                    st('BACKLOG', 'Bekleyen', T.Backlog), st('TO DO', 'Yapılacak', T.ToDo), st('IN PROGRESS', 'Geliştirmede', T.InProgress),
                    st('IN REVIEW', 'Kod İncelemede', T.InProgress), st('TESTING', 'Testte', T.InProgress), st('DONE', 'Tamamlandı', T.Done),
                ],
                initial: 'TO DO',
                transitions: {
                    'BACKLOG': ['TO DO'],
                    'TO DO': ['BACKLOG', 'IN PROGRESS'],
                    'IN PROGRESS': ['TO DO', 'IN REVIEW'],
                    'IN REVIEW': ['IN PROGRESS', 'TESTING'],
                    'TESTING': ['IN PROGRESS', 'DONE'],
                    'DONE': ['TO DO'],
                },
            },
            issueTypes: ['feature', 'improvement', 'bug', 'task'],
            requiredFields: ['issueType'],
            allowProjectBoard: true,
        }),
    },
    {
        key: 'support',
        name: 'Destek / hata takibi',
        description: 'Açık → Analizde → Testte → Çözüldü → Kapandı; çözülen ya da kapanan kayıt Yeniden Açıldı ile döner (Jira hata takibi akışı).',
        build: () => ({
            workflow: {
                statuses: [
                    st('OPEN', 'Açık', T.ToDo), st('REOPENED', 'Yeniden Açıldı', T.ToDo), st('ANALYSIS', 'Analizde', T.InProgress),
                    st('TESTING', 'Testte', T.InProgress), st('RESOLVED', 'Çözüldü', T.Done), st('CLOSED', 'Kapandı', T.Done),
                ],
                initial: 'OPEN',
                transitions: {
                    'OPEN': ['ANALYSIS', 'CLOSED'],
                    'REOPENED': ['ANALYSIS', 'CLOSED'],
                    'ANALYSIS': ['TESTING', 'RESOLVED', 'OPEN'],
                    'TESTING': ['ANALYSIS', 'RESOLVED'],
                    'RESOLVED': ['CLOSED', 'REOPENED'],
                    'CLOSED': ['REOPENED'],
                },
            },
            issueTypes: ['bug', 'improvement', 'task', 'other'],
            requiredFields: ['resourceName'],
            allowProjectBoard: false,
        }),
    },
    {
        key: 'full',
        name: 'Tam liste',
        description: 'Tüm hazır durumlar (Bekleyen … Reddedildi), geçişler serbest. Varsayılan şema budur.',
        build: () => ({ workflow: { statuses: DEFAULT_WORKFLOW.statuses.map(s => ({ ...s })), initial: DEFAULT_WORKFLOW.initial }, allowProjectBoard: true }),
    },
];

/** Yerleşik varsayılan şema (önceki davranış: tüm durumlar, serbest geçiş, PY panoyu özelleştirebilir) */
export const builtinDefaultScheme = (): ProjectScheme => ({
    id: DEFAULT_SCHEME_ID,
    name: 'Varsayılan',
    description: 'Şema atanmamış projeler bunu kullanır. Tüm hazır durumlar, serbest geçiş.',
    workflow: DEFAULT_WORKFLOW,
    allowProjectBoard: true,
});

/** Tüm şemalar: (admin'in düzenlediği ya da yerleşik) varsayılan önce */
export const schemesOf = (ws: Pick<WorkspaceData, 'projectSchemes'>): ProjectScheme[] => {
    const list = ws.projectSchemes || [];
    const def = list.find(s => s.id === DEFAULT_SCHEME_ID) || builtinDefaultScheme();
    return [def, ...list.filter(s => s.id !== DEFAULT_SCHEME_ID)];
};

export const schemeOf = (ws: Pick<WorkspaceData, 'projectSchemes'>, project?: Pick<Project, 'schemeId'> | null): ProjectScheme => {
    const all = schemesOf(ws);
    return (project?.schemeId && all.find(s => s.id === project.schemeId)) || all[0];
};

/**
 * Projenin ETKİN yapılandırması: atanan şema + (şema izin veriyorsa) projeye
 * özel iş akışı. Özel akış yalnız şemanın durumlarını kullanabilir; şemadan
 * çıkarılmış durumlar özel akıştan da düşer (admin şemayı daraltırsa projeler
 * kendiliğinden uyar). Uygulamanın her yeri (pano, menü, form, AI) bunu kullanır.
 */
export const effectiveScheme = (ws: Pick<WorkspaceData, 'projectSchemes'>, project?: Pick<Project, 'schemeId' | 'workflowOverride'> | null): ProjectScheme & { workflowSource: 'scheme' | 'project' } => {
    const scheme = schemeOf(ws, project);
    const o = project?.workflowOverride;
    if (!scheme.allowProjectWorkflow || !o) return { ...scheme, workflowSource: 'scheme' };
    const pool = new Map(scheme.workflow.statuses.map(s => [s.key, s]));
    const statuses = o.statuses.filter(s => pool.has(s.key)).map(s => pool.get(s.key)!);
    if (!statuses.length) return { ...scheme, workflowSource: 'scheme' };
    const keys = new Set(statuses.map(s => s.key));
    const transitions = o.transitions
        ? Object.fromEntries(Object.entries(o.transitions).filter(([f]) => keys.has(f)).map(([f, tos]) => [f, tos.filter(t => keys.has(t))]))
        : undefined;
    const workflow: WorkflowConfig = { statuses, initial: keys.has(o.initial) ? o.initial : statuses[0].key, ...(transitions ? { transitions } : {}), ...(o.layout ? { layout: o.layout } : {}) };
    return { ...scheme, workflow, workflowSource: 'project' };
};

/** Proje sahibinin özel iş akışı kuralı: yalnız şemanın durumları, şemada yeni durum yok */
export const validateProjectWorkflow = (scheme: ProjectScheme, wf: WorkflowConfig): string[] => {
    const pool = new Set(scheme.workflow.statuses.map(s => s.key));
    const extra = wf.statuses.filter(s => !pool.has(s.key)).map(s => s.label);
    return [
        ...(extra.length ? [`Yalnız yapılandırmanın durumları kullanılabilir: ${extra.join(', ')} yapılandırmada yok (yeni durumu yönetici ekler).`] : []),
        ...validateScheme({ ...scheme, workflow: wf }),
    ];
};

export const schemeUsage = (ws: Pick<WorkspaceData, 'projects' | 'projectSchemes'>, schemeId: string): Project[] =>
    ws.projects.filter(p => schemeOf(ws, p).id === schemeId);

/** Projenin panosu: şema izin veriyor ve projeye özel pano varsa o, yoksa şemanın panosu (o da yoksa iş akışından) */
export const boardForProject = (scheme: ProjectScheme, project: Pick<Project, 'boardConfig'>): { config: BoardConfig; source: 'project' | 'scheme' | 'auto' } => {
    if (scheme.allowProjectBoard && project.boardConfig) return { config: boardConfigOf(project.boardConfig, scheme.workflow), source: 'project' };
    if (scheme.board) return { config: boardConfigOf(scheme.board, scheme.workflow), source: 'scheme' };
    return { config: boardConfigOf(undefined, scheme.workflow), source: 'auto' };
};

export const allowedIssueTypes = (scheme: ProjectScheme): IssueType[] =>
    scheme.issueTypes?.length ? scheme.issueTypes : ISSUE_TYPE_OPTIONS.map(o => o.value);

/** Görevde eksik zorunlu alanlar (kullanıcıya gösterilecek adlar) */
export const missingRequiredFields = (scheme: ProjectScheme, t: Partial<Task>): string[] =>
    (scheme.requiredFields || []).filter(f => {
        switch (f) {
            case 'resourceName': return !t.resourceName?.trim();
            case 'dueDate': return !t.dueDate;
            case 'estimate': return !(t.time && (t.time.avg > 0 || t.time.best > 0 || t.time.worst > 0));
            case 'issueType': return !t.issueType;
            case 'labels': return !t.labels?.length;
            case 'workPackage': return !t.workPackageId;
            default: return false;
        }
    }).map(f => REQUIRED_FIELD_LABELS[f]);

let seq = 0;
export const newSchemeId = (): string => `sema-${Date.now().toString(36)}-${(++seq).toString(36)}`;

export const createScheme = (template: SchemeTemplateKey, name: string): ProjectScheme => {
    const t = SCHEME_TEMPLATES.find(x => x.key === template) || SCHEME_TEMPLATES[0];
    return { id: newSchemeId(), name: name.trim() || t.name, description: t.description, ...t.build() };
};

export const copyScheme = (s: ProjectScheme, name?: string): ProjectScheme => ({
    ...JSON.parse(JSON.stringify(s)),
    id: newSchemeId(),
    name: name || `${s.name} (kopya)`,
});

/** Doğrusal akış: her durum bir sonrakine ve bir öncekine; son durumdan ilk durumun kategorisine (yeniden açma) */
export const linearTransitions = (wf: WorkflowConfig): Record<string, string[]> => {
    const keys = wf.statuses.map(s => s.key);
    const out: Record<string, string[]> = {};
    keys.forEach((k, i) => {
        out[k] = [keys[i + 1], keys[i - 1]].filter((x): x is string => !!x);
    });
    const last = keys[keys.length - 1];
    if (last && !out[last].includes(wf.initial) && last !== wf.initial) out[last].push(wf.initial);
    return out;
};

/** Şemayı doğrular: kaydedilmeden önce gösterilecek sorunlar */
export const validateScheme = (s: ProjectScheme): string[] => {
    const errs: string[] = [];
    if (!s.name.trim()) errs.push('Şema adı boş olamaz.');
    const keys = s.workflow.statuses.map(x => workflowKey(x.key));
    if (!keys.length) errs.push('İş akışında en az bir durum olmalı.');
    if (keys.some(k => !k)) errs.push('Durum anahtarı (Jira adı) boş olamaz.');
    if (s.workflow.statuses.some(x => !x.label.trim())) errs.push('Durum adı boş olamaz.');
    const dup = keys.filter((k, i) => k && keys.indexOf(k) !== i);
    if (dup.length) errs.push(`Aynı anahtar birden çok durumda: ${[...new Set(dup)].join(', ')}.`);
    if (!s.workflow.statuses.some(x => x.category === TaskStatus.ToDo || x.category === TaskStatus.Backlog)) errs.push(`En az bir "${CATEGORY_LABELS[TaskStatus.ToDo]}" kategorisinde durum olmalı.`);
    if (!s.workflow.statuses.some(x => x.category === TaskStatus.Done)) errs.push(`En az bir "${CATEGORY_LABELS[TaskStatus.Done]}" kategorisinde durum olmalı.`);
    if (!keys.includes(workflowKey(s.workflow.initial))) errs.push('Başlangıç durumu iş akışında yok.');
    if (s.workflow.transitions) {
        const reach = new Set([workflowKey(s.workflow.initial)]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const k of [...reach]) for (const to of s.workflow.transitions[k] || []) if (!reach.has(to)) { reach.add(to); grew = true; }
        }
        const unreachable = s.workflow.statuses.filter(x => !reach.has(x.key)).map(x => x.label);
        if (unreachable.length) errs.push(`Başlangıçtan ulaşılamayan durum: ${unreachable.join(', ')} (geçiş ekleyin).`);
        if (!s.workflow.statuses.some(x => x.category === TaskStatus.Done && reach.has(x.key))) errs.push('Başlangıçtan tamamlanma durumuna ulaşılamıyor.');
    }
    if (s.issueTypes && s.issueTypes.length === 0) errs.push('En az bir kayıt türü seçilmeli.');
    return errs;
};

/**
 * İş akışı değişince (şema düzenlendi / projeye başka şema atandı) yeni akışta
 * olmayan duruma sahip YEREL görevler aynı kategorinin ilk durumuna taşınır
 * (Jira'daki "durum eşleme" adımı gibi). Jira'ya bağlı görevler Jira'nın
 * durumunu korur (kaynak Jira'dır). Değişen görev sayısı döner.
 */
export const migrateTasksToWorkflow = (tasks: Task[], wf: WorkflowConfig): { tasks: Task[]; moved: number } => {
    let moved = 0;
    const out = tasks.map(t => {
        if (!t.jiraStatus || t.jiraId) return t;
        const k = workflowKey(t.jiraStatus);
        if (wf.statuses.some(s => s.key === k)) return t;
        const cat = knownWorkflow(t.jiraStatus)?.category ?? t.status;
        const target = wf.statuses.find(s => s.category === cat);
        moved++;
        return target ? { ...t, status: target.category, jiraStatus: target.key } : { ...t, jiraStatus: undefined };
    });
    return { tasks: moved ? out : tasks, moved };
};
