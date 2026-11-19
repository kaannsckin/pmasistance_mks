import { JiraSyncDirection, JiraSyncFieldId, JiraSyncSettings, Task, TaskStatus } from '../../types';
import { JiraIssueRecord, JiraUpdateChanges } from '../integrations';
import { mapJiraIssueType, mapJiraPriority } from './jiraFields';

/**
 * Alan bazında Jira eşitlemesi: her alan için yön seçilir.
 *
 *  - off  : alan eşitlenmez (uygulamadaki değer kalır, Jira'ya da yazılmaz)
 *  - pull : Jira → uygulama (Jira'daki değer alınır)
 *  - push : uygulama → Jira (uygulamadaki değer Jira'ya yazılır)
 *  - both : çift yönlü. Son eşitlemede iki tarafta da aynı olan değer
 *           (`task.jiraBase`) tutulur; o günden beri yalnız Jira değiştiyse
 *           Jira'dan alınır, yalnız uygulama değiştiyse Jira'ya yazılır, iki
 *           taraf da değiştiyse Jira esas alınır ve çakışma olarak bildirilir.
 *           İlk eşitlemede (taban yok) Jira esas alınır.
 *
 * Jira'ya yazılabilen alanlar: durum, öncelik, başlık, termin. Diğerleri
 * (atanan, açıklama, etiket, süre, bileşen, sürüm, tür) yalnız Jira'dan alınır.
 *
 * Proje ayarında `fields` yoksa eski davranış sürer (tüm alanlar Jira'dan).
 */

export interface JiraSyncFieldSpec {
    id: JiraSyncFieldId;
    label: string;
    hint: string;
    /** Uygulamadan Jira'ya yazılabilir mi */
    pushable: boolean;
}

export const JIRA_SYNC_FIELDS: JiraSyncFieldSpec[] = [
    { id: 'status', label: 'Durum', hint: 'Yapılacak / Süreçte / Tamamlandı (Jira durum kategorisi); Jira\'ya yazarken iş akışı geçişi yapılır', pushable: true },
    { id: 'assignee', label: 'Atanan kişi', hint: 'Jira\'daki atanan, görevin kaynağı olur; Jira\'da boşsa uygulamadaki kalır', pushable: false },
    { id: 'dueDate', label: 'Termin', hint: 'Jira "Due date"; Jira\'da boşsa uygulamadaki kalır', pushable: true },
    { id: 'priority', label: 'Öncelik', hint: 'Engelleyici / Yüksek / Orta / Düşük', pushable: true },
    { id: 'summary', label: 'Başlık', hint: 'Jira "Summary" ↔ görev adı', pushable: true },
    { id: 'description', label: 'Açıklama → not', hint: 'Jira açıklaması görev notunun yerine geçer', pushable: false },
    { id: 'labels', label: 'Etiketler', hint: 'Jira etiketleri görev etiketlerinin yerine geçer', pushable: false },
    { id: 'estimate', label: 'Tahmin ve harcanan süre', hint: 'Original estimate, time spent, story point', pushable: false },
    { id: 'components', label: 'Bileşen → birim', hint: 'Jira\'daki ilk bileşen görevin birimi olur', pushable: false },
    { id: 'fixVersion', label: 'Düzeltme sürümü', hint: 'Jira "Fix version"', pushable: false },
    { id: 'issueType', label: 'Kayıt türü', hint: 'Bug / Story / Task …', pushable: false },
];

const SPEC = new Map(JIRA_SYNC_FIELDS.map(f => [f.id, f]));

export const DIRECTION_LABEL: Record<JiraSyncDirection, string> = {
    off: 'Eşitleme yok',
    pull: 'Jira → Uygulama',
    push: 'Uygulama → Jira',
    both: 'Çift yönlü',
};

/** Eski (alan seçimi öncesi) davranış: her şey Jira'dan */
const LEGACY: Record<JiraSyncFieldId, JiraSyncDirection> = Object.fromEntries(JIRA_SYNC_FIELDS.map(f => [f.id, 'pull'])) as Record<JiraSyncFieldId, JiraSyncDirection>;

/**
 * Excel'den gelen bulgu takibi için önerilen ayar: Jira'nın sahip olduğu
 * alanlar (durum, atanan, termin, harcanan süre, sürüm) alınır; Excel'in
 * sahip olduğu alanlar (başlık, not, etiket, öncelik puanı, ekip birimi) korunur.
 */
export const EXCEL_TRACKING_FIELDS: Record<JiraSyncFieldId, JiraSyncDirection> = {
    status: 'pull',
    assignee: 'pull',
    dueDate: 'pull',
    priority: 'off',
    summary: 'off',
    description: 'off',
    labels: 'off',
    estimate: 'pull',
    components: 'off',
    fixVersion: 'pull',
    issueType: 'off',
};

export const hasFieldPolicy = (s: JiraSyncSettings | undefined): boolean => !!s?.fields;

/** Geçerli yönler (eksik alanlar: ayar varsa "off", hiç ayar yoksa eski davranış) */
export const fieldPolicy = (s: JiraSyncSettings | undefined): Record<JiraSyncFieldId, JiraSyncDirection> => {
    if (!s?.fields) return { ...LEGACY };
    const out = {} as Record<JiraSyncFieldId, JiraSyncDirection>;
    JIRA_SYNC_FIELDS.forEach(f => {
        let d = s.fields![f.id] || 'off';
        if (!f.pushable && (d === 'push' || d === 'both')) d = 'pull';
        out[f.id] = d;
    });
    return out;
};

/** Uygulamadan Jira'ya yazan en az bir alan var mı */
export const pushesAny = (s: JiraSyncSettings | undefined): boolean =>
    hasFieldPolicy(s) && Object.values(fieldPolicy(s)).some(d => d === 'push' || d === 'both');

// ---------------------------------------------------------------- karşılaştırılabilir değerler

const CATEGORY_OF: Record<TaskStatus, 'new' | 'indeterminate' | 'done'> = {
    [TaskStatus.Backlog]: 'new',
    [TaskStatus.ToDo]: 'new',
    [TaskStatus.InProgress]: 'indeterminate',
    [TaskStatus.Done]: 'done',
};
const day = (v: string | null | undefined) => (v || '').slice(0, 10);

/** Uygulamadaki değer (karşılaştırma biçimi) */
export const localValue = (t: Task, f: JiraSyncFieldId): string => {
    switch (f) {
        case 'status': return CATEGORY_OF[t.status];
        case 'priority': return t.priority;
        case 'summary': return t.name.trim();
        case 'dueDate': return day(t.dueDate);
        case 'assignee': return /^atanmam/i.test(t.resourceName || '') ? '' : (t.resourceName || '').trim();
        default: return '';
    }
};

/** Jira'daki değer (karşılaştırma biçimi) */
export const remoteValue = (i: JiraIssueRecord, f: JiraSyncFieldId): string => {
    switch (f) {
        case 'status': return i.statusCategory || '';
        case 'priority': return i.priority ? mapJiraPriority(i.priority) : '';
        case 'summary': return i.summary.trim();
        case 'dueDate': return day(i.due);
        case 'assignee': return (i.assignee || '').trim();
        default: return '';
    }
};

/** Değerleri karşılaştırılabilen (taban tutulan) alanlar */
const COMPARABLE = new Set<JiraSyncFieldId>(['status', 'priority', 'summary', 'dueDate', 'assignee']);

export type FieldDecision = 'skip' | 'same' | 'pull' | 'push' | 'conflict';

/** Bir alan için bu eşitlemede ne yapılacağı */
export const decideField = (t: Task, issue: JiraIssueRecord, f: JiraSyncFieldId, dir: JiraSyncDirection): FieldDecision => {
    if (dir === 'off') return 'skip';
    if (!COMPARABLE.has(f)) return dir === 'push' ? 'skip' : 'pull';
    const remote = remoteValue(issue, f);
    const local = localValue(t, f);
    if (remote === local) return 'same';
    const pushable = SPEC.get(f)?.pushable;
    // Jira'da boş olan termin / atanan / durum uygulamadakini silmez
    const remoteEmpty = !remote && (f === 'dueDate' || f === 'assignee' || f === 'status' || f === 'priority');
    if (dir === 'pull') return remoteEmpty ? 'skip' : 'pull';
    if (dir === 'push') return pushable && (local || f === 'dueDate') ? 'push' : 'skip';
    // çift yönlü
    const base = t.jiraBase?.[f];
    if (base === undefined) return remoteEmpty ? (pushable && local ? 'push' : 'skip') : 'pull';
    if (local === base) return remoteEmpty ? 'skip' : 'pull';
    if (remote === base) return pushable ? 'push' : 'skip';
    return remoteEmpty ? 'push' : 'conflict';
};

// ---------------------------------------------------------------- Jira → uygulama

const FIELD_PROPS: Record<JiraSyncFieldId, (keyof Task)[]> = {
    status: ['status', 'startedAt', 'resolvedAt', 'statusLog'],
    assignee: ['resourceName'],
    dueDate: ['dueDate'],
    priority: ['priority'],
    summary: ['name'],
    description: ['notes'],
    labels: ['labels'],
    estimate: ['originalEstimateHours', 'actualHours', 'storyPoints', 'time', 'availability', 'estimateSource'],
    components: ['unit'],
    fixVersion: ['fixVersion'],
    issueType: ['issueType'],
};

const copyProps = (out: Task, from: Task, props: (keyof Task)[]) => {
    props.forEach(p => {
        if (from[p] === undefined) delete (out as unknown as Record<string, unknown>)[p];
        else (out as unknown as Record<string, unknown>)[p] = from[p];
    });
};

export interface PolicyResult {
    task: Task;
    pulled: JiraSyncFieldId[];
    conflicts: JiraSyncFieldId[];
}

/**
 * `before`: uygulamadaki görev, `merged`: olağan birleştirmenin (her şey Jira'dan)
 * ürettiği görev. Yalnız seçilen alanlar `merged`den alınır; çift yönlü
 * alanların tabanı güncellenir (Jira'ya yazılacak alanların tabanı, yazma
 * başarılı olunca `markPushed` ile).
 */
export const applyFieldPolicy = (before: Task, merged: Task, issue: JiraIssueRecord, settings: JiraSyncSettings | undefined): PolicyResult => {
    if (!hasFieldPolicy(settings)) return { task: merged, pulled: JIRA_SYNC_FIELDS.map(f => f.id), conflicts: [] };
    const policy = fieldPolicy(settings);
    const out: Task = { ...before };
    const pulled: JiraSyncFieldId[] = [];
    const conflicts: JiraSyncFieldId[] = [];
    const base: Partial<Record<JiraSyncFieldId, string>> = { ...(before.jiraBase || {}) };
    for (const spec of JIRA_SYNC_FIELDS) {
        const f = spec.id;
        const dir = policy[f];
        const d = decideField(before, issue, f, dir);
        if (d === 'pull' || d === 'conflict') {
            if (f === 'dueDate') out.dueDate = issue.due || undefined;
            else if (f === 'priority') out.priority = mapJiraPriority(issue.priority);
            else if (f === 'issueType') { const it = mapJiraIssueType(issue.issueType); if (it) out.issueType = it; }
            else copyProps(out, merged, FIELD_PROPS[f]);
            if (f === 'status') out.includeInSprints = before.includeInSprints;
            if (COMPARABLE.has(f)) pulled.push(f);
            if (d === 'conflict') conflicts.push(f);
        }
        if (dir === 'both' && COMPARABLE.has(f) && d !== 'push' && d !== 'skip') base[f] = remoteValue(issue, f);
    }
    if (!out.dueDate) delete out.dueDate;
    // Jira'daki açılış anı ve engelleyen kayıt (öncül boşsa) her zaman alınır
    if (merged.createdAt) out.createdAt = merged.createdAt;
    if (!before.predecessor && merged.predecessor) out.predecessor = merged.predecessor;
    if (Object.keys(base).length) out.jiraBase = base;
    return { task: out, pulled, conflicts };
};

/** Jira'dan yeni eklenen göreve çift yönlü alanların tabanı yazılır */
export const withBase = (t: Task, issue: JiraIssueRecord, settings: JiraSyncSettings | undefined): Task => {
    if (!hasFieldPolicy(settings)) return t;
    const policy = fieldPolicy(settings);
    const base: Partial<Record<JiraSyncFieldId, string>> = {};
    JIRA_SYNC_FIELDS.forEach(f => { if (policy[f.id] === 'both' && COMPARABLE.has(f.id)) base[f.id] = remoteValue(issue, f.id); });
    return Object.keys(base).length ? { ...t, jiraBase: base } : t;
};

// ---------------------------------------------------------------- uygulama → Jira

export interface JiraPush {
    taskId: string;
    key: string;
    fields: JiraSyncFieldId[];
    changes: JiraUpdateChanges;
}

const keyOf = (s: string | undefined) => (s || '').trim().toUpperCase();

/** Jira'ya yazılacak alanlar (uygulamadaki görevler ve Jira'daki güncel hâlleri) */
export const planPushes = (tasks: Task[], issues: JiraIssueRecord[], settings: JiraSyncSettings | undefined): JiraPush[] => {
    if (!pushesAny(settings)) return [];
    const policy = fieldPolicy(settings);
    const byKey = new Map(issues.map(i => [keyOf(i.key), i]));
    const out: JiraPush[] = [];
    tasks.forEach(t => {
        const issue = byKey.get(keyOf(t.jiraId));
        if (!issue) return;
        const fields = JIRA_SYNC_FIELDS.filter(f => f.pushable && decideField(t, issue, f.id, policy[f.id]) === 'push').map(f => f.id);
        if (!fields.length) return;
        const changes: JiraUpdateChanges = {};
        fields.forEach(f => {
            if (f === 'summary') changes.summary = t.name.trim();
            else if (f === 'priority') changes.priority = t.priority;
            else if (f === 'status') changes.status = CATEGORY_OF[t.status];
            else if (f === 'dueDate') changes.dueDate = day(t.dueDate) || null;
        });
        out.push({ taskId: t.id, key: issue.key, fields, changes });
    });
    return out;
};

const APPLIED_FIELD: Record<string, JiraSyncFieldId> = { summary: 'summary', priority: 'priority', status: 'status', dueDate: 'dueDate' };

/** Jira'ya yazılan alanların tabanı uygulamadaki değer olur (sonraki eşitlemede "değişmedi" sayılır) */
export const markPushed = (tasks: Task[], done: { taskId: string; applied: string[] }[]): Task[] => {
    const byId = new Map(done.map(d => [d.taskId, d.applied.map(a => APPLIED_FIELD[a]).filter(Boolean)]));
    return tasks.map(t => {
        const fields = byId.get(t.id);
        if (!fields?.length) return t;
        const base = { ...(t.jiraBase || {}) };
        fields.forEach(f => { base[f] = localValue(t, f); });
        return { ...t, jiraBase: base };
    });
};
