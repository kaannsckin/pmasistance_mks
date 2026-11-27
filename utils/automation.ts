import {
    AutomationAction, AutomationCondition, AutomationField, AutomationGroup, AutomationLogEntry, AutomationOp, AutomationRule, AutomationTrigger,
    Person, Project, ProjectRoleDef, Task, TaskStatus, WorkflowConfig,
} from '../types';
import { applyTransition, nextVersionName } from './transitions';
import { CATEGORY_LABELS, taskWorkflow, workflowKey } from './workflow';

/**
 * Kural setleri (otomasyon) motoru. Görev değişikliklerinden olay çıkarır
 * (oluşturuldu, durum değişti, alan değişti), etkin kuralların tetikleyici ve
 * koşullarını sınar, eylemleri uygular. Saftır: yan etkiler (bildirim, Jira'ya
 * yazma) sonuçta döner, çağıran gönderir.
 *
 * Döngü koruması: bir kural aynı görevde aynı zincirde bir kez çalışır; zincir
 * (kuralın yaptığı değişikliğin başka kuralı tetiklemesi) en çok 3 adımdır.
 */

export const MAX_CHAIN = 3;
export const MAX_LOG = 200;
const DAY = 86_400_000;
const norm = (s: string) => s.trim().toLocaleLowerCase('tr-TR');

export interface AutomationContext {
    now: Date;
    workflow: WorkflowConfig;
    people: Person[];
    roleDefs: ProjectRoleDef[];
}

export type AutomationEffect =
    | { kind: 'notify'; key: string; to: string[]; teams: boolean; subject: string; text: string }
    | { kind: 'jira'; key: string; projectId: string; jiraId: string; status?: { key: string; label: string; category: TaskStatus }; priority?: Task['priority']; dueDate?: string | null; resolution?: string; comment?: string };

export interface AutomationResult {
    tasks: Task[];
    log: AutomationLogEntry[];
    effects: AutomationEffect[];
    /** Çalışan kuralların sayaçları (kural kimliği → çalışma) */
    fired: Map<string, number>;
}

interface TaskEvent {
    created: boolean;
    from?: string;
    to?: string;
    fields: Set<AutomationField>;
}

// ---------------------------------------------------------------- alan değerleri

const daysUntil = (iso: string | undefined, now: Date): number | undefined => {
    if (!iso) return undefined;
    const d = new Date(iso.slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return undefined;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((d.getTime() - today.getTime()) / DAY);
};

const roleIdsOf = (project: Pick<Project, 'roleMembers'>, name: string, people: Person[]): string[] => {
    const person = people.find(p => norm(`${p.firstName} ${p.lastName}`) === norm(name));
    if (!person) return [];
    return Object.entries(project.roleMembers || {}).filter(([, ids]) => ids.includes(person.id)).map(([id]) => id);
};

/** Koşulda kullanılan alan değeri: tek değer ya da liste (bileşen, etiket, rol) */
export const fieldValue = (t: Task, field: AutomationField, project: Pick<Project, 'roleMembers'>, ctx: AutomationContext, ev?: TaskEvent): string | number | string[] | undefined => {
    switch (field) {
        case 'status': return taskWorkflow(t, ctx.workflow).key;
        case 'fromStatus': return ev?.from;
        case 'category': return t.status;
        case 'assignee': return t.resourceName?.trim() || undefined;
        case 'role': return t.resourceName?.trim() ? roleIdsOf(project, t.resourceName, ctx.people) : [];
        case 'unit': return t.unit?.trim() || undefined;
        case 'component': return t.components || [];
        case 'issueType': return t.issueType;
        case 'priority': return t.priority;
        case 'label': return t.labels || [];
        case 'fixVersion': return t.fixVersion?.trim() || undefined;
        case 'sprint': return t.version || 0;
        case 'effort': return t.time?.avg || 0;
        case 'dueInDays': return daysUntil(t.dueDate, ctx.now);
        case 'overdue': { const d = daysUntil(t.dueDate, ctx.now); return t.status !== TaskStatus.Done && d !== undefined && d < 0 ? 'true' : 'false'; }
        case 'resolution': return t.resolution?.trim() || undefined;
        case 'name': return t.name;
    }
};

const asList = (v: AutomationCondition['value']): string[] => (Array.isArray(v) ? v : v === undefined || v === '' ? [] : [String(v)]).map(x => String(x));
const eqVal = (field: AutomationField, a: string, b: string) => (field === 'status' || field === 'fromStatus' ? workflowKey(a) === workflowKey(b) : norm(a) === norm(b));

export const testCondition = (c: AutomationCondition, t: Task, project: Pick<Project, 'roleMembers'>, ctx: AutomationContext, ev?: TaskEvent): boolean => {
    const v = fieldValue(t, c.field, project, ctx, ev);
    const want = asList(c.value);
    const isList = Array.isArray(v);
    const vals = isList ? (v as string[]) : v === undefined ? [] : [String(v)];
    const any = (xs: string[]) => vals.some(x => xs.some(w => eqVal(c.field, x, w)));
    switch (c.op as AutomationOp) {
        case 'empty': return vals.length === 0;
        case 'notEmpty': return vals.length > 0;
        case 'eq': return want.length > 0 && (isList ? any(want) : vals.length > 0 && eqVal(c.field, vals[0], want[0]));
        case 'neq': return !(want.length > 0 && (isList ? any(want) : vals.length > 0 && eqVal(c.field, vals[0], want[0])));
        case 'in': return any(want);
        case 'notIn': return !any(want);
        case 'contains': return want.length > 0 && vals.some(x => want.some(w => norm(x).includes(norm(w))));
        case 'notContains': return !(want.length > 0 && vals.some(x => want.some(w => norm(x).includes(norm(w)))));
        case 'gt': case 'lt': {
            const n = typeof v === 'number' ? v : Number(vals[0]);
            const w = Number(want[0]);
            if (!Number.isFinite(n) || !Number.isFinite(w) || vals.length === 0) return false;
            return c.op === 'gt' ? n > w : n < w;
        }
    }
    return false;
};

const isGroup = (x: AutomationCondition | AutomationGroup): x is AutomationGroup => 'items' in x;

export const testGroup = (g: AutomationGroup | undefined, t: Task, project: Pick<Project, 'roleMembers'>, ctx: AutomationContext, ev?: TaskEvent): boolean => {
    if (!g || !g.items.length) return true;
    const r = (x: AutomationCondition | AutomationGroup) => (isGroup(x) ? testGroup(x, t, project, ctx, ev) : testCondition(x, t, project, ctx, ev));
    return g.join === 'or' ? g.items.some(r) : g.items.every(r);
};

const triggerMatches = (tr: AutomationTrigger, ev: TaskEvent): boolean => {
    switch (tr.kind) {
        case 'created': return ev.created;
        case 'status':
            if (!ev.to || ev.created) return false;
            if (tr.to?.length && !tr.to.some(k => workflowKey(k) === ev.to)) return false;
            if (tr.from?.length && !tr.from.some(k => workflowKey(k) === ev.from)) return false;
            return true;
        case 'field': return !ev.created && tr.fields.some(f => ev.fields.has(f));
        case 'schedule': case 'manual': return false;
    }
};

// ---------------------------------------------------------------- olaylar

const sameList = (a?: string[], b?: string[]) => JSON.stringify([...(a || [])].map(norm).sort()) === JSON.stringify([...(b || [])].map(norm).sort());

export const taskEvent = (prev: Task | undefined, next: Task, wf: WorkflowConfig): TaskEvent | null => {
    if (!prev) return { created: true, fields: new Set() };
    if (prev === next) return null;
    const fields = new Set<AutomationField>();
    const from = taskWorkflow(prev, wf).key, to = taskWorkflow(next, wf).key;
    if (from !== to || prev.status !== next.status) { fields.add('status'); fields.add('category'); }
    if ((prev.resourceName || '') !== (next.resourceName || '')) { fields.add('assignee'); fields.add('role'); }
    if ((prev.unit || '') !== (next.unit || '')) fields.add('unit');
    if (!sameList(prev.components, next.components)) fields.add('component');
    if (prev.issueType !== next.issueType) fields.add('issueType');
    if (prev.priority !== next.priority) fields.add('priority');
    if (!sameList(prev.labels, next.labels)) fields.add('label');
    if ((prev.fixVersion || '') !== (next.fixVersion || '')) fields.add('fixVersion');
    if (prev.version !== next.version) fields.add('sprint');
    if ((prev.time?.avg || 0) !== (next.time?.avg || 0)) fields.add('effort');
    if ((prev.dueDate || '') !== (next.dueDate || '')) { fields.add('dueInDays'); fields.add('overdue'); }
    if ((prev.resolution || '') !== (next.resolution || '')) fields.add('resolution');
    if (prev.name !== next.name) fields.add('name');
    if (!fields.size) return null;
    return { created: false, fields, ...(fields.has('status') ? { from, to } : {}) };
};

// ---------------------------------------------------------------- eylemler

interface Applied {
    task: Task;
    notes: string[];
    effects: AutomationEffect[];
    jira: Omit<Extract<AutomationEffect, { kind: 'jira' }>, 'kind' | 'key' | 'projectId' | 'jiraId'>;
}

const personNames = (ids: string[], people: Person[]) => ids.map(id => people.find(p => p.id === id)).filter((p): p is Person => !!p).map(p => `${p.firstName} ${p.lastName}`.trim());

const applyAction = (a: AutomationAction, acc: Applied, rule: AutomationRule, project: Project, ctx: AutomationContext): void => {
    let t = acc.task;
    const stamp = ctx.now.toISOString();
    switch (a.kind) {
        case 'setStatus': {
            const target = ctx.workflow.statuses.find(s => s.key === workflowKey(a.status));
            if (!target || taskWorkflow(t, ctx.workflow).key === target.key) return;
            t = applyTransition(t, target, {}, {}, { actor: { role: 'admin', name: `Otomasyon` }, now: ctx.now, setKey: true }).task;
            acc.notes.push(`durum → ${target.label}`);
            acc.jira.status = { key: target.key, label: target.label, category: target.category };
            break;
        }
        case 'assign': {
            let to = a.to;
            if (to === 'componentLead') {
                const lead = (project.components || []).find(c => (t.components || []).some(x => norm(x) === norm(c.name)) && c.lead)?.lead;
                if (!lead) return;
                to = lead;
            }
            const name = to === 'none' ? '' : to;
            if ((t.resourceName || '') === name) return;
            t = { ...t, resourceName: name };
            acc.notes.push(name ? `atanan → ${name}` : 'atama kaldırıldı');
            break;
        }
        case 'setPriority':
            if (t.priority === a.priority) return;
            t = { ...t, priority: a.priority };
            acc.notes.push(`öncelik → ${a.priority}`);
            acc.jira.priority = a.priority;
            break;
        case 'setFixVersion': {
            const v = a.version === 'clear' ? undefined : a.version === 'next' ? nextVersionName(project.versions) : a.version;
            if ((t.fixVersion || '') === (v || '')) return;
            t = { ...t, fixVersion: v };
            acc.notes.push(v ? `sürüm → ${v}` : 'sürüm temizlendi');
            break;
        }
        case 'setSprint': {
            const v = a.sprint === 'next' ? (t.version || 0) + 1 : Math.max(0, Math.round(a.sprint));
            if (t.version === v) return;
            t = { ...t, version: v };
            acc.notes.push(v ? `sprint → ${v}` : 'Havuz');
            break;
        }
        case 'setDueDate': {
            let due: string | undefined;
            if (a.days !== 'clear') { const d = new Date(ctx.now); d.setDate(d.getDate() + a.days); due = d.toISOString().slice(0, 10); }
            if ((t.dueDate || '') === (due || '')) return;
            t = { ...t, dueDate: due };
            acc.notes.push(due ? `termin → ${due}` : 'termin temizlendi');
            acc.jira.dueDate = due ?? null;
            break;
        }
        case 'addLabels': {
            const have = new Set((t.labels || []).map(norm));
            const add = a.labels.map(l => l.trim()).filter(l => l && !have.has(norm(l)));
            if (!add.length) return;
            t = { ...t, labels: [...(t.labels || []), ...add] };
            acc.notes.push(`etiket + ${add.join(', ')}`);
            break;
        }
        case 'removeLabels': {
            const drop = new Set(a.labels.map(norm));
            const rest = (t.labels || []).filter(l => !drop.has(norm(l)));
            if (rest.length === (t.labels || []).length) return;
            t = { ...t, labels: rest };
            acc.notes.push(`etiket − ${a.labels.join(', ')}`);
            break;
        }
        case 'setResolution': {
            const r = a.resolution === 'clear' ? undefined : a.resolution;
            if ((t.resolution || '') === (r || '')) return;
            t = { ...t, resolution: r };
            acc.notes.push(r ? `çözüm → ${r}` : 'çözüm temizlendi');
            if (r) acc.jira.resolution = r;
            break;
        }
        case 'comment': {
            const text = a.text.trim();
            if (!text) return;
            t = { ...t, comments: [...(t.comments || []), { author: `Otomasyon · ${rule.name}`, text, date: stamp }] };
            acc.notes.push('yorum eklendi');
            acc.jira.comment = `[PlanAsistan otomasyon · ${rule.name}] ${text}`;
            break;
        }
        case 'notify': {
            const to = a.to === 'assignee' ? (t.resourceName?.trim() ? [t.resourceName.trim()] : [])
                : a.to === 'role' && a.roleId ? personNames(project.roleMembers?.[a.roleId] || [], ctx.people) : [];
            if (a.to !== 'teams' && !to.length) return;
            const status = taskWorkflow(t, ctx.workflow).label;
            acc.effects.push({
                kind: 'notify', key: `${rule.id}:${t.id}:${stamp.slice(0, 16)}:${a.to}:${a.roleId || ''}`, to, teams: a.to === 'teams',
                subject: `${t.jiraId ? `${t.jiraId} · ` : ''}${t.name}: ${rule.name}`,
                text: `${project.name} projesinde "${t.name}" (${status}${t.resourceName ? `, ${t.resourceName}` : ''}) "${rule.name}" kuralıyla işlendi.${a.text?.trim() ? `\n${a.text.trim()}` : ''}`,
            });
            acc.notes.push(a.to === 'teams' ? 'Teams bildirimi' : `bildirim → ${to.join(', ')}`);
            return;
        }
    }
    acc.task = { ...t, updatedAt: stamp };
};

const describeTask = (t: Task) => t.jiraId?.trim() || t.name;

/**
 * Önceki ve sonraki görev listesine göre olay kurallarını çalıştırır.
 * Zamanlanmış kurallar burada çalışmaz (bkz. runScheduledAutomation).
 */
export const runAutomation = (project: Project, prev: Task[], next: Task[], ctx: AutomationContext): AutomationResult => {
    const rules = (project.automationRules || []).filter(r => r.enabled && r.trigger.kind !== 'schedule' && r.actions.length);
    const empty: AutomationResult = { tasks: next, log: [], effects: [], fired: new Map() };
    if (!rules.length || prev === next) return empty;
    const before = new Map(prev.map(t => [t.id, t]));
    let changed = false;
    const log: AutomationLogEntry[] = [];
    const effects: AutomationEffect[] = [];
    const fired = new Map<string, number>();
    const out = next.map(task => {
        let ev = taskEvent(before.get(task.id), task, ctx.workflow);
        if (!ev) return task;
        let cur = task;
        const done = new Set<string>();
        for (let depth = 0; depth < MAX_CHAIN && ev; depth++) {
            const start = cur;
            for (const rule of rules) {
                if (done.has(rule.id) || !triggerMatches(rule.trigger, ev) || !testGroup(rule.conditions, cur, project, ctx, ev)) continue;
                done.add(rule.id);
                const acc: Applied = { task: cur, notes: [], effects: [], jira: {} };
                for (const a of rule.actions) applyAction(a, acc, rule, project, ctx);
                if (!acc.notes.length) continue;
                cur = acc.task;
                effects.push(...acc.effects);
                if (rule.writeToJira && cur.jiraId?.trim() && Object.keys(acc.jira).length) {
                    effects.push({ kind: 'jira', key: `${rule.id}:${cur.id}:${ctx.now.toISOString().slice(0, 16)}:${JSON.stringify(acc.jira)}`, projectId: project.id, jiraId: cur.jiraId.trim(), ...acc.jira });
                }
                fired.set(rule.id, (fired.get(rule.id) || 0) + 1);
                log.push({ at: ctx.now.toISOString(), ruleId: rule.id, ruleName: rule.name, taskId: cur.id, taskKey: describeTask(cur), summary: acc.notes.join(', ') });
            }
            // Kuralın yaptığı değişiklik yeni olay mı? (zincir)
            ev = start === cur ? null : taskEvent(start, cur, ctx.workflow);
        }
        if (cur !== task) changed = true;
        return cur;
    });
    return { tasks: changed ? out : next, log, effects, fired };
};

/** Kuralları seçilen görevlere bir kez uygular (günlük ve elle çalıştırma) */
const applyRulesOnce = (project: Project, rules: AutomationRule[], ctx: AutomationContext, pick: (rule: AutomationRule, t: Task) => boolean, keyTag: string): AutomationResult => {
    const log: AutomationLogEntry[] = [];
    const effects: AutomationEffect[] = [];
    const fired = new Map<string, number>();
    let changed = false;
    const tasks = project.tasks.map(task => {
        let cur = task;
        for (const rule of rules) {
            if (!pick(rule, cur)) continue;
            const acc: Applied = { task: cur, notes: [], effects: [], jira: {} };
            for (const a of rule.actions) applyAction(a, acc, rule, project, ctx);
            if (!acc.notes.length) continue;
            cur = acc.task;
            effects.push(...acc.effects);
            if (rule.writeToJira && cur.jiraId?.trim() && Object.keys(acc.jira).length) effects.push({ kind: 'jira', key: `${rule.id}:${cur.id}:${keyTag}`, projectId: project.id, jiraId: cur.jiraId.trim(), ...acc.jira });
            fired.set(rule.id, (fired.get(rule.id) || 0) + 1);
            log.push({ at: ctx.now.toISOString(), ruleId: rule.id, ruleName: rule.name, taskId: cur.id, taskKey: describeTask(cur), summary: acc.notes.join(', ') });
        }
        if (cur !== task) changed = true;
        return cur;
    });
    return { tasks: changed ? tasks : project.tasks, log, effects, fired };
};

/** Günlük kurallar: bugün çalışmamış zamanlanmış kurallar koşula uyan görevlere uygulanır */
export const runScheduledAutomation = (project: Project, ctx: AutomationContext): (AutomationResult & { rules: AutomationRule[] }) | null => {
    const day = ctx.now.toISOString().slice(0, 10);
    const due = (project.automationRules || []).filter(r => r.enabled && r.trigger.kind === 'schedule' && r.actions.length && r.lastRunDay !== day);
    if (!due.length) return null;
    const r = applyRulesOnce(project, due, ctx, (rule, t) => testGroup(rule.conditions, t, project, ctx), day);
    const ids = new Set(due.map(x => x.id));
    const rules = (project.automationRules || []).map(x => (ids.has(x.id) ? { ...x, lastRunDay: day } : x));
    return { ...r, rules };
};

/**
 * Kuralı şimdi çalıştırır (elle): önizlemedeki görevlere — koşula uyan, durum
 * tetikleyicisinde hedef durumdaki görevler — bir kez uygulanır. Kural
 * kapalı olsa da çalışır (kullanıcı açıkça istedi).
 */
export const runRuleNow = (project: Project, ruleId: string, ctx: AutomationContext): AutomationResult & { matched: number } | null => {
    const rule = (project.automationRules || []).find(r => r.id === ruleId);
    if (!rule || !rule.actions.length) return null;
    const ids = new Set(previewRule(rule, project, ctx).map(t => t.id));
    const r = applyRulesOnce(project, [rule], ctx, (_, t) => ids.has(t.id), `elle:${ctx.now.toISOString().slice(0, 16)}`);
    return { ...r, matched: ids.size };
};

/** Kural sayaçlarını ve günlüğü projeye yazar */
export const recordAutomation = (project: Project, r: Pick<AutomationResult, 'log' | 'fired'>, now: Date, rules = project.automationRules): Project => {
    if (!r.log.length) return rules === project.automationRules ? project : { ...project, automationRules: rules };
    const at = now.toISOString();
    return {
        ...project,
        automationRules: (rules || []).map(x => (r.fired.has(x.id) ? { ...x, runs: (x.runs || 0) + r.fired.get(x.id)!, lastRunAt: at } : x)),
        automationLog: [...(project.automationLog || []), ...r.log].slice(-MAX_LOG),
    };
};

// ---------------------------------------------------------------- önizleme ve açıklama

/** Kural şu an kaç görevi etkilerdi: koşula uyan (durum tetikleyicisinde hedef durumdaki) görevler */
export const previewRule = (rule: Pick<AutomationRule, 'trigger' | 'conditions'>, project: Project, ctx: AutomationContext): Task[] =>
    project.tasks.filter(t => {
        if (rule.trigger.kind === 'status' && rule.trigger.to?.length && !rule.trigger.to.some(k => workflowKey(k) === taskWorkflow(t, ctx.workflow).key)) return false;
        if ((rule.trigger.kind === 'schedule' || rule.trigger.kind === 'manual') && t.status === TaskStatus.Done && !JSON.stringify(rule.conditions || {}).includes('"category"')) return false;
        return testGroup(rule.conditions, t, project, ctx);
    });

export const FIELD_LABELS: Record<AutomationField, string> = {
    status: 'Durum', fromStatus: 'Önceki durum', category: 'Kategori', assignee: 'Atanan', role: 'Atananın rolü (takım)', unit: 'Birim', component: 'Bileşen',
    issueType: 'Tür', priority: 'Öncelik', label: 'Etiket', fixVersion: 'Hedef sürüm', sprint: 'Sprint', effort: 'Efor (gün)', dueInDays: 'Termine kalan gün',
    overdue: 'Gecikmiş', resolution: 'Çözüm', name: 'Başlık',
};

export const OP_LABELS: Record<AutomationOp, string> = {
    eq: '=', neq: '≠', in: 'şunlardan biri', notIn: 'şunlardan biri değil', contains: 'içerir', notContains: 'içermez', empty: 'boş', notEmpty: 'dolu', gt: '>', lt: '<',
};

const ISSUE_TR: Record<string, string> = { bug: 'Hata', feature: 'Özellik', improvement: 'İyileştirme', task: 'Görev', other: 'Diğer' };

export const valueLabel = (field: AutomationField, v: string, ctx: Pick<AutomationContext, 'workflow' | 'roleDefs'>): string => {
    if (field === 'status' || field === 'fromStatus') return ctx.workflow.statuses.find(s => s.key === workflowKey(v))?.label || v;
    if (field === 'category') return CATEGORY_LABELS[v as TaskStatus] || v;
    if (field === 'role') return ctx.roleDefs.find(r => r.id === v)?.name || v;
    if (field === 'issueType') return ISSUE_TR[v] || v;
    if (field === 'overdue') return v === 'true' ? 'evet' : 'hayır';
    return v;
};

const describeCond = (c: AutomationCondition, ctx: Pick<AutomationContext, 'workflow' | 'roleDefs'>): string => {
    const vals = asList(c.value).map(v => valueLabel(c.field, v, ctx));
    if (c.op === 'empty' || c.op === 'notEmpty') return `${FIELD_LABELS[c.field]} ${OP_LABELS[c.op]}`;
    return `${FIELD_LABELS[c.field]} ${OP_LABELS[c.op]} ${vals.join(' / ') || '…'}`;
};

export const describeGroup = (g: AutomationGroup | undefined, ctx: Pick<AutomationContext, 'workflow' | 'roleDefs'>): string => {
    if (!g || !g.items.length) return '';
    const parts = g.items.map(x => (isGroup(x) ? `(${describeGroup(x, ctx)})` : describeCond(x, ctx)));
    return parts.join(g.join === 'or' ? ' veya ' : ' ve ');
};

export const describeTrigger = (tr: AutomationTrigger, ctx: Pick<AutomationContext, 'workflow' | 'roleDefs'>): string => {
    const st = (ks?: string[]) => (ks || []).map(k => valueLabel('status', k, ctx)).join(' / ');
    switch (tr.kind) {
        case 'status': return tr.to?.length ? `Durum ${st(tr.to)} olduğunda${tr.from?.length ? ` (${st(tr.from)} durumundan)` : ''}` : `Durum değiştiğinde${tr.from?.length ? ` (${st(tr.from)} durumundan)` : ''}`;
        case 'created': return 'Görev oluşturulduğunda';
        case 'field': return `${tr.fields.map(f => FIELD_LABELS[f]).join(' / ')} değiştiğinde`;
        case 'schedule': return 'Her gün';
        case 'manual': return 'Elle çalıştırıldığında';
    }
};

export const describeAction = (a: AutomationAction, ctx: Pick<AutomationContext, 'workflow' | 'roleDefs'>): string => {
    switch (a.kind) {
        case 'setStatus': return `durumu ${valueLabel('status', a.status, ctx)} yap`;
        case 'assign': return a.to === 'none' ? 'atamayı kaldır' : a.to === 'componentLead' ? 'bileşen sorumlusuna ata' : `${a.to} kişisine ata`;
        case 'setPriority': return `önceliği ${a.priority} yap`;
        case 'setFixVersion': return a.version === 'clear' ? 'hedef sürümü temizle' : a.version === 'next' ? 'sıradaki sürüme al' : `hedef sürümü ${a.version} yap`;
        case 'setSprint': return a.sprint === 'next' ? 'sonraki sprinte al' : a.sprint ? `Sprint ${a.sprint}'e al` : 'Havuza al';
        case 'setDueDate': return a.days === 'clear' ? 'termini temizle' : `termini ${a.days} gün sonraya koy`;
        case 'addLabels': return `etiket ekle: ${a.labels.join(', ')}`;
        case 'removeLabels': return `etiket çıkar: ${a.labels.join(', ')}`;
        case 'setResolution': return a.resolution === 'clear' ? 'çözümü temizle' : `çözümü ${a.resolution} yap`;
        case 'comment': return 'yorum ekle';
        case 'notify': return a.to === 'assignee' ? 'atanana bildir' : a.to === 'teams' ? 'Teams kanalına bildir' : `${ctx.roleDefs.find(r => r.id === a.roleId)?.name || 'rol'} üyelerine bildir`;
    }
};

export const describeRule = (r: Pick<AutomationRule, 'trigger' | 'conditions' | 'actions' | 'writeToJira'>, ctx: Pick<AutomationContext, 'workflow' | 'roleDefs'>): string => {
    const cond = describeGroup(r.conditions, ctx);
    return `${describeTrigger(r.trigger, ctx)}${cond ? `, ${cond} ise` : ''} → ${r.actions.map(a => describeAction(a, ctx)).join(', ') || '…'}${r.writeToJira ? ' (Jira\'ya da)' : ''}`;
};

/** Eylemlerden hangileri Jira'ya yazılabilir */
export const JIRA_ACTIONS: AutomationAction['kind'][] = ['setStatus', 'setPriority', 'setDueDate', 'setResolution', 'comment'];

export const ruleProblems = (r: Pick<AutomationRule, 'name' | 'trigger' | 'actions' | 'conditions'>, wf: WorkflowConfig): string[] => {
    const out: string[] = [];
    if (!r.name.trim()) out.push('Kurala ad verin.');
    if (!r.actions.length) out.push('En az bir eylem ekleyin.');
    if (r.trigger.kind === 'field' && !r.trigger.fields.length) out.push('Hangi alan değişince çalışacağını seçin.');
    const known = new Set(wf.statuses.map(s => s.key));
    for (const a of r.actions) {
        if (a.kind === 'setStatus' && !known.has(workflowKey(a.status))) out.push(`"${a.status}" iş akışında yok.`);
        if ((a.kind === 'addLabels' || a.kind === 'removeLabels') && !a.labels.some(l => l.trim())) out.push('Etiket girin.');
        if (a.kind === 'assign' && !a.to.trim()) out.push('Atanacak kişiyi seçin.');
        if (a.kind === 'comment' && !a.text.trim()) out.push('Yorum metnini girin.');
        if (a.kind === 'notify' && a.to === 'role' && !a.roleId) out.push('Bildirilecek rolü seçin.');
    }
    // Kendini tetikleyen kural: "Durum X olduğunda → durumu X yap" anlamsız
    if (r.trigger.kind === 'status' && r.trigger.to?.length === 1 && r.actions.some(a => a.kind === 'setStatus' && workflowKey(a.status) === workflowKey(r.trigger.kind === 'status' ? r.trigger.to![0] : ''))) out.push('Eylem, tetikleyen durumla aynı.');
    const walk = (g?: AutomationGroup) => g?.items.forEach(x => {
        if (isGroup(x)) return walk(x);
        if (x.op !== 'empty' && x.op !== 'notEmpty' && !asList(x.value).length) out.push(`${FIELD_LABELS[x.field]} koşulunun değerini girin.`);
    });
    walk(r.conditions);
    return [...new Set(out)];
};

export const newRuleId = () => `kural-${Math.random().toString(36).slice(2, 9)}`;
