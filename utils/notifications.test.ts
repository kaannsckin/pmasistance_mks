import { describe, expect, it } from 'vitest';
import { Person, Task, TaskStatus } from '../types';
import { buildDeliveries, describeNotificationRule, detectTaskEvents } from './notifications';
import { createScheme } from './projectScheme';
import { DEFAULT_PROJECT_ROLES } from './projectRoles';

const task = (id: string, extra: Partial<Task> = {}): Task => ({
    id, name: `Görev ${id}`, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: '', resourceName: 'Ayşe Kaya',
    time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.InProgress, jiraStatus: 'ANALYSIS', ...extra,
});
const people: Person[] = [
    { id: 'p1', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U310', availableAA: 1, roles: [], email: 'ayse@kurum.gov.tr' },
    { id: 'p2', firstName: 'Veli', lastName: 'Test', departmentCode: 'U310', availableAA: 1, roles: [], email: 'veli@kurum.gov.tr' },
    { id: 'pm', firstName: 'Pınar', lastName: 'Yön', departmentCode: 'U310', availableAA: 1, roles: [] },
];
const project = { id: 'sps', name: 'SPS', pmPersonId: 'pm', roleMembers: { test: ['p2'] } };
const wf = createScheme('support', 'S').workflow;

describe('bildirim şeması', () => {
    it('olaylar: oluşturma, geçiş, tamamlanma, yeniden açılma, atama, yorum', () => {
        const prev = [task('a'), task('b', { status: TaskStatus.Done, jiraStatus: 'CLOSED' }), task('c')];
        const next = [
            task('a', { status: TaskStatus.Done, jiraStatus: 'RESOLVED' }),
            task('b', { status: TaskStatus.ToDo, jiraStatus: 'REOPENED', resourceName: 'Veli Test' }),
            task('c', { comments: [{ author: 'x', text: 'Not', date: '' }] }),
            task('d'),
        ];
        expect(detectTaskEvents(prev, next).map(e => `${e.task.id}:${e.event}`)).toEqual([
            'a:transitioned', 'a:done', 'b:transitioned', 'b:reopened', 'b:assigned', 'c:commented', 'd:created',
        ]);
        expect(detectTaskEvents(prev, prev)).toEqual([]);
    });

    it('alıcılar: atanan, proje yöneticisi, rol üyeleri; değiştiren kişi hariç; durum süzgeci', () => {
        const rules = [
            { id: 'r1', event: 'transitioned' as const, statuses: ['TESTING'], to: { roles: ['test'], assignee: true } },
            { id: 'r2', event: 'done' as const, to: { pm: true, teams: true } },
        ];
        const toTest = detectTaskEvents([task('a')], [task('a', { jiraStatus: 'TESTING' })]);
        const d = buildDeliveries(toTest, rules, { project, people, wf, actorName: 'Ayşe Kaya', roleDefs: DEFAULT_PROJECT_ROLES });
        expect(d).toHaveLength(1);
        expect(d[0].recipients).toEqual([{ name: 'Veli Test', email: 'veli@kurum.gov.tr' }]);
        expect(d[0].subject).toBe('Durum değişti: Görev a');
        expect(d[0].text).toContain('"Analizde" → "Testte"');
        // Başka duruma geçişte r1 tetiklenmez
        expect(buildDeliveries(detectTaskEvents([task('a')], [task('a', { jiraStatus: 'OPEN', status: TaskStatus.ToDo })]), rules, { project, people, wf })).toEqual([]);
        const done = buildDeliveries(detectTaskEvents([task('a')], [task('a', { status: TaskStatus.Done, jiraStatus: 'CLOSED' })]), rules, { project, people, wf });
        expect(done.map(x => [x.recipients.map(r => r.name), x.teams])).toEqual([[['Pınar Yön'], true]]);
        expect(buildDeliveries(toTest, undefined, { project, people, wf })).toEqual([]);
    });

    it('anahtar aynı değişiklik için sabittir (çift gönderim yok) ve özet okunur', () => {
        const rules = [{ id: 'r', event: 'assigned' as const, to: { assignee: true } }];
        const ev = detectTaskEvents([task('a', { resourceName: '' })], [task('a', { resourceName: 'Veli Test', updatedAt: 'x' })]);
        const k1 = buildDeliveries(ev, rules, { project, people, wf })[0].key;
        expect(buildDeliveries(ev, rules, { project, people, wf })[0].key).toBe(k1);
        expect(describeNotificationRule({ id: 'x', event: 'transitioned', statuses: ['TESTING'], to: { roles: ['test'], teams: true } }, people, DEFAULT_PROJECT_ROLES, wf))
            .toBe('Durum değişti (Testte durumuna girince) → Test rolü, Teams kanalı');
    });
});
