import { describe, expect, it } from 'vitest';
import { JiraSyncSettings, Person, Task, TaskStatus } from '../../types';
import { JiraIssueRecord, JiraSyncPage } from '../integrations';
import { decideField, EXCEL_TRACKING_FIELDS, fieldPolicy, markPushed, planPushes } from './jiraFieldSync';
import { ensureJiraPeople } from './jiraPeople';
import { applyJiraSync, linkedSyncKeys, runFullSync } from './jiraSync';

const task = (id: string, jiraId: string, extra: Partial<Task> = {}): Task => ({
    id, name: `${id} · Excel başlığı`, jiraId, status: TaskStatus.ToDo, availability: true, priority: 'Blocker', version: 0, predecessor: null,
    unit: 'EMS', resourceName: 'Atanmamış', time: { best: 2, avg: 2, worst: 2 }, notes: 'Excel notu', labels: ['MS0', 'Rapor 5.1'], ...extra,
});
const issue = (key: string, extra: Partial<JiraIssueRecord> = {}): JiraIssueRecord => ({
    key, summary: `Jira ${key}`, description: 'Jira açıklaması', issueType: 'Task', status: 'Devam Ediyor', statusCategory: 'indeterminate', priority: 'Low',
    created: '2026-10-01T08:00:00.000Z', resolved: null, components: ['Sunucu'], labels: ['jira-etiket'], fixVersions: ['8.1'], originalEstimateSeconds: 8 * 3600,
    timeSpentSeconds: 3 * 3600, storyPoints: null, assignee: 'Ayşe Yılmaz', assigneeEmail: 'ayse@kurum.gov.tr', blockedBy: [], transitions: [], due: '2026-12-15', ...extra,
});
const OPTS = { importedAt: '2026-11-19T08:00:00.000Z', defaultUnit: 'Genel' };
const EXCEL: JiraSyncSettings = { projectKey: 'MPS', discover: false, autoMinutes: 0, fields: { ...EXCEL_TRACKING_FIELDS }, autoPeople: true };
const page = (issues: JiraIssueRecord[], missing: string[] = []): JiraSyncPage => ({ issues, total: issues.length, next: null, missing });

describe('alan bazında Jira eşitleme', () => {
    it('Excel takibi ayarı: durum, atanan, termin, süre, sürüm Jira\'dan; başlık, not, etiket, öncelik, birim Excel\'de kalır', () => {
        const before = [task('gib-I-09', 'MPS-6608')];
        const r = applyJiraSync(before, [issue('MPS-6608')], OPTS, false, [], EXCEL);
        const t = r.tasks[0];
        expect(r.updated).toBe(1);
        expect(t).toMatchObject({
            name: 'gib-I-09 · Excel başlığı', notes: 'Excel notu', labels: ['MS0', 'Rapor 5.1'], priority: 'Blocker', unit: 'EMS',
            status: TaskStatus.InProgress, resourceName: 'Ayşe Yılmaz', dueDate: '2026-12-15', actualHours: 3, fixVersion: '8.1',
        });
        expect(t.jiraBase).toBeUndefined(); // çift yönlü alan yok → taban tutulmaz
    });

    it('ayar yoksa eski davranış: her şey Jira\'dan', () => {
        const r = applyJiraSync([task('a', 'MPS-1')], [issue('MPS-1')], OPTS, false);
        expect(r.tasks[0]).toMatchObject({ name: 'Jira MPS-1', notes: 'Jira açıklaması', priority: 'Low', unit: 'Sunucu' });
    });

    it('aynı durum kategorisi Bekleyen ↔ Yapılacak ayrımını bozmaz; Jira\'da boş termin / atanan uygulamadakini silmez', () => {
        const before = [task('a', 'MPS-1', { status: TaskStatus.Backlog, dueDate: '2026-12-01', resourceName: 'Mehmet' })];
        const r = applyJiraSync(before, [issue('MPS-1', { statusCategory: 'new', status: 'Açık', due: null, assignee: '' })], OPTS, false, [], EXCEL);
        expect(r.tasks[0]).toMatchObject({ status: TaskStatus.Backlog, dueDate: '2026-12-01', resourceName: 'Mehmet' });
    });

    it('kapalı alanlar Excel\'in yönetiminde kalır; push-only alanlar Jira\'dan alınmaz', () => {
        expect(fieldPolicy({ discover: false, autoMinutes: 0, fields: { assignee: 'both' } }).assignee).toBe('pull'); // atanan Jira'ya yazılamaz
        const s: JiraSyncSettings = { discover: false, autoMinutes: 0, fields: { status: 'push', priority: 'push' } };
        const r = applyJiraSync([task('a', 'MPS-1')], [issue('MPS-1')], OPTS, false, [], s);
        expect(r.tasks[0]).toMatchObject({ status: TaskStatus.ToDo, priority: 'Blocker', resourceName: 'Atanmamış' });
        const pushes = planPushes([task('a', 'MPS-1')], [issue('MPS-1')], s);
        expect(pushes).toEqual([{ taskId: 'a', key: 'MPS-1', fields: ['status', 'priority'], changes: { status: 'new', priority: 'Blocker' } }]);
    });

    it('çift yönlü: ilk eşitlemede Jira esas; sonra hangi taraf değiştiyse o kazanır; iki taraf değiştiyse çakışma', () => {
        const s: JiraSyncSettings = { discover: false, autoMinutes: 0, fields: { status: 'both', dueDate: 'both' } };
        // 1) ilk eşitleme: Jira'dan alınır, taban yazılır
        let tasks = applyJiraSync([task('a', 'MPS-1', { dueDate: '2026-11-30' })], [issue('MPS-1')], OPTS, false, [], s).tasks;
        expect(tasks[0]).toMatchObject({ status: TaskStatus.InProgress, dueDate: '2026-12-15', jiraBase: { status: 'indeterminate', dueDate: '2026-12-15' } });

        // 2) uygulamada termin değişti, Jira aynı → Jira'ya yazılır
        tasks = [{ ...tasks[0], dueDate: '2026-12-20' }];
        expect(decideField(tasks[0], issue('MPS-1'), 'dueDate', 'both')).toBe('push');
        const pushes = planPushes(tasks, [issue('MPS-1')], s);
        expect(pushes[0].changes).toEqual({ dueDate: '2026-12-20' });
        // eşitleme sırasında Jira'dan alınmaz (yazılacak)
        expect(applyJiraSync(tasks, [issue('MPS-1')], OPTS, false, [], s).tasks[0].dueDate).toBe('2026-12-20');
        tasks = markPushed(tasks, [{ taskId: 'a', applied: ['dueDate'] }]);
        expect(tasks[0].jiraBase?.dueDate).toBe('2026-12-20');

        // 3) yalnız Jira değişti → alınır
        const jiraMoved = issue('MPS-1', { due: '2027-01-10' });
        expect(decideField(tasks[0], { ...jiraMoved }, 'dueDate', 'both')).toBe('pull');

        // 4) iki taraf da değişti → Jira esas, çakışma bildirilir
        const both = [{ ...tasks[0], dueDate: '2026-12-25' }];
        const r = applyJiraSync(both, [jiraMoved], OPTS, false, [], s);
        expect(r.tasks[0].dueDate).toBe('2027-01-10');
        expect(r.conflicts).toBe(1);
        expect(r.conflictKeys).toEqual(['MPS-1: dueDate']);
    });

    it('Jira\'ya yazan alan varsa kapanmış bağlı kayıtlar da okunur (uygulamada kapatılan Jira\'ya taşınsın)', () => {
        const tasks = [task('a', 'MPS-1', { status: TaskStatus.Done }), task('b', 'MPS-2')];
        expect(linkedSyncKeys(tasks, EXCEL)).toEqual(['MPS-2']);
        expect(linkedSyncKeys(tasks, { ...EXCEL, fields: { ...EXCEL.fields, status: 'both' } })).toEqual(['MPS-1', 'MPS-2']);
    });

    it('tam eşitleme: oku → Jira\'ya yaz → yazılanın güncel hâli uygulanır', async () => {
        const s: JiraSyncSettings = { discover: false, autoMinutes: 0, fields: { status: 'push', assignee: 'pull' } };
        const project = { tasks: [task('a', 'MPS-1', { status: TaskStatus.Done })], resources: [], jiraSync: s };
        const updates: unknown[] = [];
        const r = await runFullSync(project, async () => page([issue('MPS-1')]), async (key, changes) => {
            updates.push({ key, changes });
            return { applied: ['status'], errors: [], issue: issue('MPS-1', { statusCategory: 'done', status: 'Kapandı' }) };
        });
        expect(updates).toEqual([{ key: 'MPS-1', changes: { status: 'done' } }]);
        expect(r.issues[0].statusCategory).toBe('done');
        expect(r.shouldApply).toBe(true);
        expect(r.text).toContain("1 kayıt Jira'ya yazıldı");
        // yazma kapalıysa bekleyen olarak bildirilir
        const off = await runFullSync(project, async () => page([issue('MPS-1')]), null);
        expect(off.text).toContain("1 kayıt Jira'ya yazılmayı bekliyor");
    });
});

describe('Jira\'daki kişiler', () => {
    const people: Person[] = [{ id: 'p1', firstName: 'Mehmet', lastName: 'Kaya', departmentCode: 'U310', availableAA: 1, roles: [] }];

    it('havuzda olmayan atanan açılır (e-postasıyla), ekipte olmayan kaynak eklenir; var olan tekrar açılmaz', () => {
        const tasks = [
            task('a', 'MPS-1', { resourceName: 'Ayşe Yılmaz', unit: 'İstemci' }),
            task('b', 'MPS-2', { resourceName: 'Mehmet Kaya' }),
            task('c', 'MPS-3', { resourceName: 'Atanmamış' }),
            task('d', 'X-9', { resourceName: 'Eşitlenmeyen Kişi' }),
        ];
        const issues = [issue('MPS-1'), issue('MPS-2', { assignee: 'Mehmet Kaya', assigneeEmail: undefined }), issue('MPS-3', { assignee: '' })];
        const now = new Date('2026-11-19T08:00:00Z');
        const r = ensureJiraPeople(people, [{ id: 'r1', name: 'Mehmet Kaya', participation: 50, unit: 'EMS', title: '' }], tasks, issues, now);
        expect(r.addedPeople).toEqual(['Ayşe Yılmaz']);
        expect(r.addedResources).toEqual(['Ayşe Yılmaz']);
        expect(r.people.find(p => p.firstName === 'Ayşe')).toMatchObject({ lastName: 'Yılmaz', email: 'ayse@kurum.gov.tr' });
        expect(r.resources.find(x => x.name === 'Ayşe Yılmaz')).toMatchObject({ unit: 'İstemci', participation: 100 });
        // ikinci kez: değişiklik yok
        const again = ensureJiraPeople(r.people, r.resources, tasks, issues, now);
        expect(again.addedPeople).toEqual([]);
        expect(again.addedResources).toEqual([]);
    });
});

it('kalan süre, Jira boş değeri ve sıfır saat için ayrı çift yönlü değerler kullanır', () => {
    const settings: JiraSyncSettings = { discover: false, autoMinutes: 0, fields: { remaining: 'both' } };
    const remote = issue('MPS-1', { remainingEstimateSeconds: 7200, aggregateRemainingEstimateSeconds: 10800 });
    const initial = applyJiraSync([task('a', 'MPS-1')], [remote], OPTS, false, [], settings).tasks[0];
    expect(initial).toMatchObject({ remainingEstimateHours: 2, aggregateRemainingHours: 3, jiraBase: { remaining: '7200' } });
    expect(planPushes([{ ...initial, remainingEstimateHours: 0 }], [remote], settings)[0]?.changes).toEqual({ remainingEstimateHours: 0 });
    expect(planPushes([{ ...initial, remainingEstimateHours: 0 }], [remote], { ...settings, fields: { remaining: 'push' } })[0]?.changes).toEqual({ remainingEstimateHours: 0 });
    const cleared = applyJiraSync([initial], [{ ...remote, remainingEstimateSeconds: null }], OPTS, false, [], settings).tasks[0];
    expect(cleared.remainingEstimateHours).toBeUndefined();
    expect(cleared.jiraBase?.remaining).toBe('');
});
