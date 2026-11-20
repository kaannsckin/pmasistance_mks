import { Person, Project, ProjectRoleDef, ProjectVersion, SchemeRequiredField, Task, TransitionRule, UserRole, WorkflowConfig } from '../types';
import { isInProjectRole } from './projectRoles';
import { ROLE_LABELS } from './allocations';
import { REQUIRED_FIELD_LABELS, missingRequiredFields } from './projectScheme';
import { WorkflowStatus } from './workflow';

/**
 * Geçiş kuralları — Jira'nın geçiş yapılandırması örnek alındı:
 *   Koşul        : geçişi kim yapabilir (rol, kişi, yalnız atanan)
 *   Doğrulayıcı  : geçişte istenen bilgi (not, harcanan süre, dolu alanlar,
 *                  tamamlanmış alt görevler)
 *   Sonrası işlem: etiket ekle/çıkar, atananı değiştir, atanana bildir
 * Kural bir geçişe ("KAYNAK>HEDEF") ya da bir duruma girişe ("*>HEDEF")
 * bağlanır; ikisi birleştirilir. Kullanıcının menüsü, panosu, formları ve AI
 * önerileri aynı fonksiyonlardan geçer.
 */

export const edgeRuleKey = (from: string, to: string): string => `${from}>${to}`;
export const entryRuleKey = (to: string): string => `*>${to}`;

const union = <T,>(a?: T[], b?: T[]): T[] | undefined => {
    const out = [...new Set([...(a || []), ...(b || [])])];
    return out.length ? out : undefined;
};

/** İki kuralı birleştirir: listeler birleşir, açık seçenekler açık kalır, atama geçişinki öncelikli */
export const mergeRules = (a?: TransitionRule, b?: TransitionRule): TransitionRule => ({
    roles: union(a?.roles, b?.roles),
    people: union(a?.people, b?.people),
    assigneeOnly: !!(a?.assigneeOnly || b?.assigneeOnly) || undefined,
    projectRoles: union(a?.projectRoles, b?.projectRoles),
    requireComment: !!(a?.requireComment || b?.requireComment) || undefined,
    requireHours: !!(a?.requireHours || b?.requireHours) || undefined,
    requireFields: union(a?.requireFields, b?.requireFields),
    requireSubtasksDone: !!(a?.requireSubtasksDone || b?.requireSubtasksDone) || undefined,
    addLabels: union(a?.addLabels, b?.addLabels),
    removeLabels: union(a?.removeLabels, b?.removeLabels),
    assign: b?.assign ?? a?.assign,
    notifyAssignee: !!(a?.notifyAssignee || b?.notifyAssignee) || undefined,
    // Alan güncellemelerinde geçişinki girişinkinin üzerine yazar
    ...(a?.setFields || b?.setFields ? { setFields: { ...(a?.setFields || {}), ...(b?.setFields || {}) } } : {}),
});

/** Geçişin etkin kuralı: hedefe giriş kuralı + o geçişin kuralı */
export const ruleFor = (wf: WorkflowConfig, from: string, to: string): TransitionRule =>
    mergeRules(wf.rules?.[entryRuleKey(to)], wf.rules?.[edgeRuleKey(from, to)]);

export const ruleIsEmpty = (r?: TransitionRule): boolean =>
    !r || !(r.roles?.length || r.people?.length || r.projectRoles?.length || r.assigneeOnly || r.requireComment || r.requireHours || r.requireFields?.length
        || r.requireSubtasksDone || r.addLabels?.length || r.removeLabels?.length || r.assign || r.notifyAssignee
        || (r.setFields && Object.values(r.setFields).some(v => v !== undefined)));

/** Kuralın kısa Türkçe özeti (diyagram ve listelerde) */
export const describeRule = (r: TransitionRule | undefined, people: Pick<Person, 'id' | 'firstName' | 'lastName'>[] = [], roleDefs: ProjectRoleDef[] = []): { conditions: string[]; validators: string[]; post: string[] } => {
    const name = (id: string) => { const p = people.find(x => x.id === id); return p ? `${p.firstName} ${p.lastName}`.trim() : id; };
    const roleName = (id: string) => `${roleDefs.find(d => d.id === id)?.name || id} rolü`;
    return {
        conditions: [
            ...(r?.roles?.length || r?.people?.length || r?.projectRoles?.length
                ? [`yalnız ${[...(r.roles || []).map(x => ROLE_LABELS[x]), ...(r.projectRoles || []).map(roleName), ...(r.people || []).map(name)].join(', ')}`] : []),
            ...(r?.assigneeOnly ? ['yalnız atanan'] : []),
        ],
        validators: [
            ...(r?.requireComment ? ['geçiş notu'] : []),
            ...(r?.requireHours ? ['harcanan süre'] : []),
            ...(r?.requireFields || []).map(f => REQUIRED_FIELD_LABELS[f].toLocaleLowerCase('tr-TR')),
            ...(r?.requireSubtasksDone ? ['alt görevler tamam'] : []),
        ],
        post: [
            ...(r?.addLabels?.length ? [`etiket ekle: ${r.addLabels.join(', ')}`] : []),
            ...(r?.removeLabels?.length ? [`etiket çıkar: ${r.removeLabels.join(', ')}`] : []),
            ...(r?.assign ? [r.assign === 'actor' ? 'geçişi yapana ata' : r.assign === 'none' ? 'atamayı kaldır' : `ata: ${r.assign}`] : []),
            ...(r?.notifyAssignee ? ['atanana bildir'] : []),
            ...(r?.setFields?.priority ? [`öncelik: ${PRIORITY_TR[r.setFields.priority]}`] : []),
            ...(r?.setFields?.dueDate !== undefined ? [r.setFields.dueDate === 'clear' ? 'termini temizle' : `termin: bugün + ${r.setFields.dueDate} gün`] : []),
            ...(r?.setFields?.fixVersion ? [r.setFields.fixVersion === 'clear' ? 'hedef sürümü temizle' : r.setFields.fixVersion === 'next' ? 'hedef sürüm: sıradaki sürüm' : `hedef sürüm: ${r.setFields.fixVersion}`] : []),
            ...(r?.setFields?.resolution ? [r.setFields.resolution === 'clear' ? 'çözümü temizle' : `çözüm: ${r.setFields.resolution}`] : []),
        ],
    };
};

const PRIORITY_TR: Record<Task['priority'], string> = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' };

/** Sıradaki sürüm: yayınlanmamış, yayın tarihi en yakın (tarihsizler sonda, sonra liste sırası) */
export const nextVersionName = (versions: ProjectVersion[] | undefined): string | undefined =>
    (versions || []).map((v, i) => ({ v, i })).filter(x => x.v.status === 'unreleased')
        .sort((a, b) => (a.v.releaseDate || '9999').localeCompare(b.v.releaseDate || '9999') || a.i - b.i)[0]?.v.name;

export interface TransitionActor {
    role: UserRole;
    personId?: string;
    /** Ad soyad (atanan karşılaştırması, yorum yazarı) */
    name?: string;
}

const norm = (s: string) => s.trim().toLocaleLowerCase('tr-TR');

/** Koşul: geçişi bu kişi yapabilir mi (yapamıyorsa gerekçe) */
export const conditionProblem = (
    r: TransitionRule,
    task: Pick<Task, 'resourceName'>,
    actor: TransitionActor,
    people: Pick<Person, 'id' | 'firstName' | 'lastName'>[] = [],
    project?: { roleMembers?: Project['roleMembers']; roleDefs?: ProjectRoleDef[] },
): string | null => {
    if (r.roles?.length || r.people?.length || r.projectRoles?.length) {
        const ok = (r.roles || []).includes(actor.role)
            || (!!actor.personId && (r.people || []).includes(actor.personId))
            || isInProjectRole({ roleMembers: project?.roleMembers }, r.projectRoles, actor.personId);
        if (!ok) return `Bu geçişi ${describeRule({ roles: r.roles, people: r.people, projectRoles: r.projectRoles }, people, project?.roleDefs).conditions[0]} yapabilir.`;
    }
    if (r.assigneeOnly && (!actor.name || !task.resourceName || norm(actor.name) !== norm(task.resourceName))) {
        return task.resourceName ? `Bu geçişi yalnız görevin atananı (${task.resourceName}) yapabilir.` : 'Bu geçiş için görevin bir atananı olmalı ve geçişi o yapmalı.';
    }
    return null;
};

export interface TransitionNeeds {
    comment: boolean;
    hours: boolean;
    /** Boş olan zorunlu alanlar */
    fields: SchemeRequiredField[];
    /** Girdiyle giderilemeyen engel (ör. açık alt görev) */
    blocking: string | null;
}

/** Doğrulayıcılar: geçiş penceresinde istenecekler */
export const transitionNeeds = (r: TransitionRule, task: Task): TransitionNeeds => {
    const open = (task.subtasks || []).filter(s => !s.completed).length;
    const fields = (r.requireFields || []).filter(f => missingRequiredFields({ id: '', name: '', workflow: { statuses: [], initial: '' }, allowProjectBoard: false, requiredFields: [f] }, task).length > 0);
    return {
        comment: !!r.requireComment,
        hours: !!r.requireHours,
        fields,
        blocking: r.requireSubtasksDone && open ? `Bu geçiş için tüm alt görevler tamamlanmalı (${open} açık alt görev var).` : null,
    };
};

export const needsInput = (n: TransitionNeeds): boolean => n.comment || n.hours || n.fields.length > 0;

export interface TransitionInput {
    comment?: string;
    hours?: number;
    /** Penceredeki eksik alanların değerleri */
    fields?: Partial<Task>;
}

/** Girdiyi doğrular (kullanıcıya gösterilecek hatalar) */
export const inputProblems = (r: TransitionRule, task: Task, input: TransitionInput): string[] => {
    const merged = { ...task, ...(input.fields || {}) };
    const n = transitionNeeds(r, merged);
    return [
        ...(n.blocking ? [n.blocking] : []),
        ...(r.requireComment && !input.comment?.trim() ? ['Geçiş notu gerekli.'] : []),
        ...(r.requireHours && !(typeof input.hours === 'number' && input.hours > 0) ? ['Harcanan süre (saat) gerekli.'] : []),
        ...(n.fields.length ? [`Dolu olması gereken alan: ${n.fields.map(f => REQUIRED_FIELD_LABELS[f]).join(', ')}.`] : []),
    ];
};

export interface TransitionEffect {
    kind: 'notify';
    /** Atanan kişinin adı */
    to: string;
    subject: string;
    text: string;
}

/**
 * Geçişi uygular: durum + (istenirse) ayrıntılı durum, girdiler (not → yorum,
 * süre → harcanan süre, alanlar), sonra sonrası işlemler. Bildirim gibi dış
 * etkiler `effects` olarak döner (çağıran gönderir).
 */
export const applyTransition = (
    task: Task,
    target: WorkflowStatus,
    r: TransitionRule,
    input: TransitionInput,
    ctx: { actor: TransitionActor; now?: Date; setKey: boolean; projectName?: string; fromLabel?: string; versions?: ProjectVersion[] },
): { task: Task; effects: TransitionEffect[] } => {
    const now = (ctx.now || new Date()).toISOString();
    let t: Task = { ...task, ...(input.fields || {}), status: target.category, ...(ctx.setKey ? { jiraStatus: target.key } : {}), updatedAt: now };
    if (input.comment?.trim()) {
        t = { ...t, comments: [...(t.comments || []), { author: ctx.actor.name || ROLE_LABELS[ctx.actor.role], text: `[${ctx.fromLabel ? `${ctx.fromLabel} → ` : ''}${target.label}] ${input.comment.trim()}`, date: now }] };
    }
    if (typeof input.hours === 'number' && input.hours > 0) t = { ...t, actualHours: Math.round(((t.actualHours || 0) + input.hours) * 10) / 10 };
    if (r.removeLabels?.length) {
        const drop = new Set(r.removeLabels.map(norm));
        t = { ...t, labels: (t.labels || []).filter(l => !drop.has(norm(l))) };
    }
    if (r.addLabels?.length) {
        const have = new Set((t.labels || []).map(norm));
        t = { ...t, labels: [...(t.labels || []), ...r.addLabels.filter(l => !have.has(norm(l)))] };
    }
    if (r.assign === 'actor' && ctx.actor.name) t = { ...t, resourceName: ctx.actor.name };
    else if (r.assign === 'none') t = { ...t, resourceName: '' };
    else if (r.assign && r.assign !== 'actor') t = { ...t, resourceName: r.assign };
    // Alan güncelle
    const f = r.setFields;
    if (f?.priority) t = { ...t, priority: f.priority };
    if (f?.dueDate === 'clear') t = { ...t, dueDate: undefined };
    else if (typeof f?.dueDate === 'number') {
        const d = new Date(ctx.now || new Date());
        d.setDate(d.getDate() + f.dueDate);
        t = { ...t, dueDate: d.toISOString().slice(0, 10) };
    }
    if (f?.fixVersion === 'clear') t = { ...t, fixVersion: undefined };
    else if (f?.fixVersion === 'next') { const n = nextVersionName(ctx.versions); if (n) t = { ...t, fixVersion: n }; }
    else if (f?.fixVersion) t = { ...t, fixVersion: f.fixVersion };
    if (f?.resolution === 'clear') t = { ...t, resolution: undefined };
    else if (f?.resolution) t = { ...t, resolution: f.resolution };
    const effects: TransitionEffect[] = [];
    if (r.notifyAssignee && t.resourceName) {
        effects.push({
            kind: 'notify',
            to: t.resourceName,
            subject: `${t.jiraId ? `${t.jiraId} · ` : ''}${t.name}: ${target.label}`,
            text: `${ctx.projectName ? `${ctx.projectName} projesinde ` : ''}"${t.name}" ${ctx.fromLabel ? `"${ctx.fromLabel}" durumundan ` : ''}"${target.label}" durumuna geçirildi${ctx.actor.name ? ` (${ctx.actor.name})` : ''}.${input.comment?.trim() ? `\nNot: ${input.comment.trim()}` : ''}`,
        });
    }
    return { task: t, effects };
};

/** Durum yeniden adlandırılınca kural anahtarlarını taşır */
export const renameRuleKeys = (rules: WorkflowConfig['rules'], oldKey: string, newKey: string): WorkflowConfig['rules'] => {
    if (!rules) return rules;
    return Object.fromEntries(Object.entries(rules).map(([k, v]) => {
        const [f, t] = k.split('>');
        return [`${f === oldKey ? newKey : f}>${t === oldKey ? newKey : t}`, v];
    }));
};

/** Durum çıkarılınca ona bağlı kuralları siler */
export const dropRuleKeys = (rules: WorkflowConfig['rules'], key: string): WorkflowConfig['rules'] => {
    if (!rules) return rules;
    return Object.fromEntries(Object.entries(rules).filter(([k]) => { const [f, t] = k.split('>'); return f !== key && t !== key; }));
};

/** Kuralı kaydeder (boşsa siler) */
export const setRule = (rules: WorkflowConfig['rules'], key: string, r: TransitionRule): WorkflowConfig['rules'] => {
    const next = { ...(rules || {}) };
    if (ruleIsEmpty(r)) delete next[key];
    else next[key] = r;
    return Object.keys(next).length ? next : undefined;
};
