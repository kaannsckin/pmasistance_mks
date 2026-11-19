import { NotificationEvent, NotificationRule, Person, Project, ProjectRoleDef, Task, TaskStatus, WorkflowConfig } from '../types';
import { roleMemberPeople } from './projectRoles';
import { taskStatusLabel, taskWorkflow } from './workflow';

/**
 * Bildirim şeması (Jira "notification scheme"): görev olayları (oluşturuldu,
 * durum değişti, tamamlandı, yeniden açıldı, atanan değişti, yorum eklendi)
 * alıcılara (atanan, proje yöneticisi, proje rolleri, kişiler, Teams kanalı)
 * eşlenir. Olaylar yerel değişiklikten çıkarılır; Jira/bulut eşitlemesi
 * bildirim üretmez (Jira kendi bildirimini gönderir). Değişikliği yapan kişiye
 * bildirim gitmez.
 */

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
    created: 'Görev oluşturuldu',
    transitioned: 'Durum değişti',
    done: 'Tamamlandı',
    reopened: 'Yeniden açıldı',
    assigned: 'Atanan değişti',
    commented: 'Yorum eklendi',
};

export interface TaskEvent {
    event: NotificationEvent;
    task: Task;
    old?: Task;
}

/** Eski ve yeni görev listesinden olaylar */
export const detectTaskEvents = (prev: Task[], next: Task[]): TaskEvent[] => {
    const before = new Map(prev.map(t => [t.id, t]));
    const out: TaskEvent[] = [];
    for (const t of next) {
        const o = before.get(t.id);
        if (!o) { out.push({ event: 'created', task: t }); continue; }
        if (o.status !== t.status || (o.jiraStatus || '') !== (t.jiraStatus || '')) {
            out.push({ event: 'transitioned', task: t, old: o });
            if (t.status === TaskStatus.Done && o.status !== TaskStatus.Done) out.push({ event: 'done', task: t, old: o });
            if (o.status === TaskStatus.Done && t.status !== TaskStatus.Done) out.push({ event: 'reopened', task: t, old: o });
        }
        if ((o.resourceName || '') !== (t.resourceName || '') && t.resourceName) out.push({ event: 'assigned', task: t, old: o });
        if ((t.comments || []).length > (o.comments || []).length) out.push({ event: 'commented', task: t, old: o });
    }
    return out;
};

export interface NotificationDelivery {
    /** Tekilleştirme anahtarı (aynı olay iki kez gönderilmez) */
    key: string;
    subject: string;
    text: string;
    recipients: { name: string; email?: string }[];
    teams: boolean;
}

const fullName = (p: Pick<Person, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`.trim();
const norm = (s: string) => s.trim().toLocaleLowerCase('tr-TR');

/** Olayları kurallara göre gönderimlere çevirir */
export const buildDeliveries = (
    events: TaskEvent[],
    rules: NotificationRule[] | undefined,
    ctx: { project: Pick<Project, 'id' | 'name' | 'pmPersonId' | 'roleMembers'>; people: Person[]; wf?: WorkflowConfig; actorName?: string; roleDefs?: ProjectRoleDef[] },
): NotificationDelivery[] => {
    if (!rules?.length) return [];
    const out: NotificationDelivery[] = [];
    for (const ev of events) {
        for (const r of rules.filter(x => x.event === ev.event)) {
            if (ev.event === 'transitioned' && r.statuses?.length && !r.statuses.includes(taskWorkflow(ev.task, ctx.wf).key)) continue;
            const people = new Map<string, { name: string; email?: string }>();
            const add = (p?: Person) => { if (p) people.set(p.id, { name: fullName(p), email: p.email }); };
            if (r.to.assignee && ev.task.resourceName) {
                const p = ctx.people.find(x => norm(fullName(x)) === norm(ev.task.resourceName));
                if (p) add(p); else people.set(`n:${ev.task.resourceName}`, { name: ev.task.resourceName });
            }
            if (r.to.pm) add(ctx.people.find(x => x.id === ctx.project.pmPersonId));
            roleMemberPeople(ctx.project, r.to.roles, ctx.people).forEach(add);
            (r.to.people || []).forEach(id => add(ctx.people.find(x => x.id === id)));
            // Değişikliği yapana bildirim gitmez
            const recipients = [...people.values()].filter(x => !ctx.actorName || norm(x.name) !== norm(ctx.actorName));
            if (!recipients.length && !r.to.teams) continue;
            const t = ev.task;
            const head = `${t.jiraId ? `${t.jiraId} · ` : ''}${t.name}`;
            const what = ev.event === 'transitioned' || ev.event === 'done' || ev.event === 'reopened'
                ? `${ev.old ? `"${taskStatusLabel(ev.old, ctx.wf)}" → ` : ''}"${taskStatusLabel(t, ctx.wf)}"`
                : ev.event === 'assigned' ? `atanan: ${t.resourceName}`
                    : ev.event === 'commented' ? `yorum: ${(t.comments || [])[(t.comments || []).length - 1]?.text || ''}`
                        : 'yeni görev';
            out.push({
                key: `${ctx.project.id}|${t.id}|${ev.event}|${r.id}|${t.updatedAt || ''}|${t.status}|${t.jiraStatus || ''}|${t.resourceName}|${(t.comments || []).length}`,
                subject: `${NOTIFICATION_EVENT_LABELS[ev.event]}: ${head}`,
                text: `${ctx.project.name} · ${head}\n${NOTIFICATION_EVENT_LABELS[ev.event]} — ${what}${ctx.actorName ? `\nDeğiştiren: ${ctx.actorName}` : ''}`,
                recipients,
                teams: !!r.to.teams,
            });
        }
    }
    return out;
};

/** Kural özeti (konsolda) */
export const describeNotificationRule = (r: NotificationRule, people: Person[], roleDefs: ProjectRoleDef[], wf?: WorkflowConfig): string => {
    const who = [
        ...(r.to.assignee ? ['atanan'] : []),
        ...(r.to.pm ? ['proje yöneticisi'] : []),
        ...(r.to.roles || []).map(id => `${roleDefs.find(d => d.id === id)?.name || id} rolü`),
        ...(r.to.people || []).map(id => { const p = people.find(x => x.id === id); return p ? fullName(p) : id; }),
        ...(r.to.teams ? ['Teams kanalı'] : []),
    ];
    const when = r.event === 'transitioned' && r.statuses?.length ? ` (${r.statuses.map(k => wf?.statuses.find(s => s.key === k)?.label || k).join(', ')} durumuna girince)` : '';
    return `${NOTIFICATION_EVENT_LABELS[r.event]}${when} → ${who.join(', ') || 'alıcı yok'}`;
};

/** Önerilen başlangıç kuralları */
export const suggestedNotificationRules = (newId: () => string): NotificationRule[] => [
    { id: newId(), event: 'assigned', to: { assignee: true } },
    { id: newId(), event: 'done', to: { pm: true } },
    { id: newId(), event: 'reopened', to: { assignee: true, pm: true } },
    { id: newId(), event: 'commented', to: { assignee: true } },
];
