import { describe, expect, it } from 'vitest';
import { AutomationRule, Person, Task, TaskStatus } from '../types';
import { createProject } from './workspace';
import { describeRule, previewRule, recordAutomation, ruleProblems, runAutomation, runScheduledAutomation } from './automation';
import { DEFAULT_WORKFLOW } from './workflow';
import { DEFAULT_PROJECT_ROLES } from './projectRoles';

const NOW = new Date('2026-11-26T09:00:00Z');
const people: Person[] = [
    { id: 'p1', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U', availableAA: 1, roles: [] },
    { id: 'p2', firstName: 'Ece', lastName: 'Su', departmentCode: 'U', availableAA: 1, roles: [] },
];
const ctx = { now: NOW, workflow: DEFAULT_WORKFLOW, people, roleDefs: DEFAULT_PROJECT_ROLES };
const t = (id: string, extra: Partial<Task> = {}): Task => ({
    id, name: `İş ${id}`, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'U', resourceName: 'Ayşe Kaya',
    time: { best: 1, avg: 1, worst: 1 }, jiraId: `P-${id}`, notes: '', status: TaskStatus.InProgress, jiraStatus: 'IN PROGRESS', ...extra,
});
const rule = (r: Partial<AutomationRule>): AutomationRule => ({
    id: 'r1', name: 'Kural', enabled: true, mode: 'simple', trigger: { kind: 'status', to: ['RESOLVED'] }, actions: [], createdAt: '', updatedAt: '', ...r,
});
const proj = (rules: AutomationRule[]) => {
    const p = createProject('P');
    p.id = 'p';
    p.automationRules = rules;
    p.roleMembers = { test: ['p2'] };
    p.components = [{ id: 'c', name: 'Ödeme', lead: 'Ece Su' }];
    return p;
};

describe('kural motoru', () => {
    const toTest = rule({
        name: 'Çözülünce teste', trigger: { kind: 'status', to: ['RESOLVED'] },
        conditions: { join: 'and', items: [{ field: 'assignee', op: 'eq', value: 'ayşe kaya' }] },
        actions: [{ kind: 'setStatus', status: 'TESTING' }, { kind: 'assign', to: 'Ece Su' }, { kind: 'notify', to: 'role', roleId: 'test' }],
        writeToJira: true,
    });

    it('basit kural: Çözüldü + kişi X → Testte, Test ekibine ata ve bildir, Jira\'ya yaz', () => {
        const prev = [t('a'), t('b', { resourceName: 'Can Er' })];
        const next = prev.map(x => ({ ...x, status: TaskStatus.Done, jiraStatus: 'RESOLVED' }));
        const p = proj([toTest]);
        const r = runAutomation(p, prev, next, ctx);
        expect(r.tasks[0]).toMatchObject({ status: TaskStatus.InProgress, jiraStatus: 'TESTING', resourceName: 'Ece Su' });
        expect(r.tasks[1]).toBe(next[1]); // koşul tutmadı: dokunulmaz
        expect(r.log).toHaveLength(1);
        expect(r.log[0].summary).toBe('durum → Testte, atanan → Ece Su, bildirim → Ece Su');
        expect(r.effects.map(e => e.kind)).toEqual(['notify', 'jira']);
        expect(r.effects[1]).toMatchObject({ kind: 'jira', jiraId: 'P-a', status: { key: 'TESTING', category: TaskStatus.InProgress } });
        const recorded = recordAutomation(p, r, NOW);
        expect(recorded.automationRules![0]).toMatchObject({ runs: 1, lastRunAt: NOW.toISOString() });
        expect(recorded.automationLog).toHaveLength(1);
    });

    it('zincir: kuralın değişikliği başka kuralı tetikler; aynı kural tekrar çalışmaz (döngü yok)', () => {
        const ping = rule({ id: 'a', name: 'A', trigger: { kind: 'status', to: ['RESOLVED'] }, actions: [{ kind: 'setStatus', status: 'TESTING' }] });
        const pong = rule({ id: 'b', name: 'B', trigger: { kind: 'status', to: ['TESTING'] }, actions: [{ kind: 'setStatus', status: 'RESOLVED' }, { kind: 'addLabels', labels: ['döngü'] }] });
        const prev = [t('a')];
        const next = [{ ...prev[0], status: TaskStatus.Done, jiraStatus: 'RESOLVED' }];
        const r = runAutomation(proj([ping, pong]), prev, next, ctx);
        expect(r.log.map(l => l.ruleName)).toEqual(['A', 'B']);
        expect(r.tasks[0]).toMatchObject({ jiraStatus: 'RESOLVED', labels: ['döngü'] });
    });

    it('ileri kural: VEYA grubu, rol, bileşen, oluşturma tetikleyicisi, bileşen sorumlusuna atama', () => {
        const bug = rule({
            mode: 'advanced', trigger: { kind: 'created' },
            conditions: { join: 'and', items: [{ field: 'issueType', op: 'eq', value: 'bug' }, { join: 'or', items: [{ field: 'priority', op: 'in', value: ['Blocker', 'High'] }, { field: 'component', op: 'eq', value: 'ödeme' }] }] },
            actions: [{ kind: 'assign', to: 'componentLead' }, { kind: 'setSprint', sprint: 'next' }, { kind: 'addLabels', labels: ['acil'] }],
        });
        const created = [t('x', { issueType: 'bug', components: ['Ödeme'], resourceName: '' }), t('y', { issueType: 'bug', priority: 'Low' })];
        const r = runAutomation(proj([bug]), [], created, ctx);
        expect(r.tasks[0]).toMatchObject({ resourceName: 'Ece Su', version: 2, labels: ['acil'] });
        expect(r.tasks[1]).toBe(created[1]);
        const role = rule({ trigger: { kind: 'field', fields: ['assignee'] }, conditions: { join: 'and', items: [{ field: 'role', op: 'eq', value: 'test' }] }, actions: [{ kind: 'comment', text: 'Teste devredildi' }] });
        const r2 = runAutomation(proj([role]), [t('z')], [t('z', { resourceName: 'Ece Su' })], ctx);
        expect(r2.tasks[0].comments?.[0]).toMatchObject({ author: 'Otomasyon · Kural', text: 'Teste devredildi' });
        // Kapalı kural çalışmaz
        expect(runAutomation(proj([{ ...role, enabled: false }]), [t('z')], [t('z', { resourceName: 'Ece Su' })], ctx).log).toHaveLength(0);
    });

    it('günlük kural: koşula uyan görevler bir kez işlenir; aynı gün tekrar çalışmaz', () => {
        const late = rule({ trigger: { kind: 'schedule' }, conditions: { join: 'and', items: [{ field: 'overdue', op: 'eq', value: 'true' }] }, actions: [{ kind: 'addLabels', labels: ['gecikti'] }, { kind: 'setPriority', priority: 'High' }] });
        const p = proj([late]);
        p.tasks = [t('a', { dueDate: '2026-11-20' }), t('b', { dueDate: '2026-12-20' }), t('c', { dueDate: '2026-11-01', status: TaskStatus.Done, jiraStatus: 'DONE' })];
        const r = runScheduledAutomation(p, ctx)!;
        expect(r.tasks.map(x => x.labels)).toEqual([['gecikti'], undefined, undefined]);
        expect(r.rules[0].lastRunDay).toBe('2026-11-26');
        expect(runScheduledAutomation({ ...p, automationRules: r.rules }, ctx)).toBeNull();
        expect(previewRule(late, p, ctx).map(x => x.id)).toEqual(['a']);
    });

    it('açıklama ve doğrulama', () => {
        expect(describeRule(toTest, ctx)).toBe("Durum Çözüldü olduğunda, Atanan = ayşe kaya ise → durumu Testte yap, Ece Su kişisine ata, Test üyelerine bildir (Jira'ya da)");
        expect(ruleProblems(rule({ name: '' }), DEFAULT_WORKFLOW)).toEqual(['Kurala ad verin.', 'En az bir eylem ekleyin.']);
        expect(ruleProblems(rule({ actions: [{ kind: 'setStatus', status: 'RESOLVED' }] }), DEFAULT_WORKFLOW)).toEqual(['Eylem, tetikleyen durumla aynı.']);
        expect(ruleProblems(rule({ actions: [{ kind: 'setStatus', status: 'YOK' }], conditions: { join: 'and', items: [{ field: 'assignee', op: 'eq' }] } }), DEFAULT_WORKFLOW)).toEqual(['"YOK" iş akışında yok.', 'Atanan koşulunun değerini girin.']);
    });
});
