import { describe, expect, it } from 'vitest';
import { BoardConfig, Task, TaskStatus } from '../types';
import {
    appKey, boardConfigOf, buildLanes, columnOfTask, defaultBoardConfig, distribute, filterBoardTasks, jiraKey, moveTaskPatch,
    statusUsage, topLabels, unmappedStatuses, validateBoardConfig, wipState,
} from './board';

const NOW = new Date('2026-11-19T09:00:00Z');
const task = (id: string, extra: Partial<Task> = {}): Task => ({
    id, name: `Görev ${id}`, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'U310', resourceName: 'Ayşe Kaya',
    time: { best: 1, avg: 2, worst: 3 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...extra,
});

/** Jira ekranındaki gibi: To Do (OPEN, REOPENED) · In Progress (ANALYSIS + Test etiketi kolonu) · Resolved · Done */
const jiraLike = (): BoardConfig => ({
    ...defaultBoardConfig(),
    columns: [
        { id: 'todo', name: 'To Do', statuses: [jiraKey('open'), jiraKey('REOPENED'), appKey(TaskStatus.ToDo), appKey(TaskStatus.Backlog)], targetStatus: TaskStatus.ToDo },
        { id: 'prog', name: 'In Progress', statuses: [jiraKey('ANALYSIS'), appKey(TaskStatus.InProgress)], targetStatus: TaskStatus.InProgress, max: 2 },
        { id: 'test', name: 'Test', statuses: [jiraKey('ANALYSIS'), appKey(TaskStatus.InProgress)], labels: ['test'], targetStatus: TaskStatus.InProgress },
        { id: 'res', name: 'Resolved', statuses: [jiraKey('RESOLVED')], targetStatus: TaskStatus.Done },
        { id: 'done', name: 'Done', statuses: [jiraKey('CLOSED'), appKey(TaskStatus.Done)], targetStatus: TaskStatus.Done },
    ],
});

describe('pano kolon kuralları', () => {
    it('varsayılan pano uygulama durumlarını üç kolona dağıtır', () => {
        const cfg = defaultBoardConfig();
        expect(columnOfTask(task('a', { status: TaskStatus.Backlog }), cfg)?.name).toBe('Yapılacak');
        expect(columnOfTask(task('b', { status: TaskStatus.InProgress }), cfg)?.name).toBe('Devam Ediyor');
        expect(boardConfigOf(undefined).columns).toHaveLength(3);
    });

    it('Jira durumu uygulama durumundan önce gelir; eşlenmemiş Jira durumu uygulama durumuna düşer', () => {
        const cfg = jiraLike();
        expect(columnOfTask(task('a', { status: TaskStatus.Done, jiraStatus: 'Resolved' }), cfg)?.id).toBe('res');
        expect(columnOfTask(task('b', { status: TaskStatus.Done, jiraStatus: 'Closed' }), cfg)?.id).toBe('done');
        expect(columnOfTask(task('c', { status: TaskStatus.InProgress, jiraStatus: 'WAFER CLEANING' }), cfg)?.id).toBe('prog');
    });

    it('süreç önce: aynı durumun kolonları arasında etiket seçer; durum uymayan etiket kolonu tutmaz', () => {
        const cfg = jiraLike();
        expect(columnOfTask(task('a', { status: TaskStatus.InProgress, labels: ['Test'] }), cfg)?.id).toBe('test');
        expect(columnOfTask(task('b', { status: TaskStatus.InProgress }), cfg)?.id).toBe('prog');
        expect(columnOfTask(task('c', { status: TaskStatus.ToDo, labels: ['test'] }), cfg)?.id).toBe('todo');
        // Yalnız etiketli kolon, hedef durumunun alt kolonudur
        const sub = { ...cfg, columns: [...cfg.columns.filter(c => c.id !== 'test'), { id: 'qa', name: 'QA', statuses: [], labels: ['qa'], targetStatus: TaskStatus.InProgress }] };
        expect(columnOfTask(task('e', { status: TaskStatus.InProgress, jiraStatus: 'ANALYSIS', labels: ['QA'] }), sub)?.id).toBe('qa');
        expect(columnOfTask(task('f', { status: TaskStatus.ToDo, labels: ['qa'] }), sub)?.id).toBe('todo');
        const t = task('g', { status: TaskStatus.InProgress });
        const moved = { ...t, ...moveTaskPatch(t, sub.columns.find(c => c.id === 'qa')!, sub, NOW) };
        expect([moved.labels, columnOfTask(moved, sub)?.id]).toEqual([['qa'], 'qa']);
        // Etiket önce: durum ne olursa olsun etiket kolonu
        expect(columnOfTask(task('d', { status: TaskStatus.ToDo, labels: ['test'] }), { ...cfg, rulePriority: 'label' })?.id).toBe('test');
    });

    it('hiçbir kurala uymayan görev eşlenmemiş sayılır', () => {
        const cfg = { ...jiraLike(), columns: jiraLike().columns.filter(c => c.id !== 'done') };
        const r = distribute([task('a', { status: TaskStatus.Done })], cfg, NOW);
        expect(r.unmapped.map(t => t.id)).toEqual(['a']);
        expect(unmappedStatuses(cfg, statusUsage([task('a', { status: TaskStatus.Done })]))).toContain(appKey(TaskStatus.Done));
    });
});

describe('kart taşıma', () => {
    it('hedef kolonun durumunu ve Jira durumunu yazar', () => {
        const cfg = jiraLike();
        const t = task('a', { status: TaskStatus.ToDo, jiraStatus: 'OPEN' });
        const p = moveTaskPatch(t, cfg.columns.find(c => c.id === 'res')!, cfg, NOW);
        expect(p).toMatchObject({ status: TaskStatus.Done, jiraStatus: 'RESOLVED', updatedAt: NOW.toISOString() });
        expect(columnOfTask({ ...t, ...p }, cfg)?.id).toBe('res');
    });

    it('etiketle ayrılan kolona taşıma etiketi ekler, geri taşıma kaldırır', () => {
        const cfg = jiraLike();
        const t = task('a', { status: TaskStatus.InProgress, labels: ['ui'] });
        const toTest = { ...t, ...moveTaskPatch(t, cfg.columns.find(c => c.id === 'test')!, cfg, NOW) };
        expect(toTest.labels).toEqual(['ui', 'test']);
        expect(columnOfTask(toTest, cfg)?.id).toBe('test');
        const back = { ...toTest, ...moveTaskPatch(toTest, cfg.columns.find(c => c.id === 'prog')!, cfg, NOW) };
        expect(back.labels).toEqual(['ui']);
        expect(columnOfTask(back, cfg)?.id).toBe('prog');
    });

    it('Jira durumu eşlemeyen kolona taşınınca eski Jira durumu temizlenir', () => {
        const cfg = defaultBoardConfig();
        const t = task('a', { status: TaskStatus.ToDo, jiraStatus: 'OPEN' });
        const p = moveTaskPatch(t, cfg.columns[1], cfg, NOW);
        expect('jiraStatus' in p && p.jiraStatus === undefined).toBe(true);
        expect(p.status).toBe(TaskStatus.InProgress);
    });
});

describe('hızlı filtreler, WIP, kulvarlar', () => {
    const tasks = [
        task('a', { labels: ['gib'], resourceName: 'Ayşe Kaya', priority: 'Blocker', dueDate: '2026-11-01' }),
        task('b', { labels: ['MEB_ticket'], resourceName: 'Mehmet Demir', updatedAt: '2026-11-18T10:00:00Z' }),
        task('c', { resourceName: '', jiraId: 'SPS-96', createdAt: '2026-01-01T00:00:00Z' }),
    ];
    it('seçili filtreler VE ile birleşir; arama anahtar ve etikette de arar', () => {
        const ctx = { me: 'ayşe kaya', now: NOW };
        expect(filterBoardTasks(tasks, [{ id: '1', name: 'Ben', assignee: 'me' }], ctx).map(t => t.id)).toEqual(['a']);
        expect(filterBoardTasks(tasks, [{ id: '1', name: 'Ben', assignee: 'me' }, { id: '2', name: 'gib', labels: ['GIB'] }], ctx).map(t => t.id)).toEqual(['a']);
        expect(filterBoardTasks(tasks, [{ id: '1', name: 'Geciken', overdue: true }], ctx).map(t => t.id)).toEqual(['a']);
        expect(filterBoardTasks(tasks, [{ id: '1', name: 'Son', recentDays: 7 }], ctx).map(t => t.id)).toEqual(['b']);
        expect(filterBoardTasks(tasks, [], { ...ctx, query: 'sps-96' }).map(t => t.id)).toEqual(['c']);
        expect(filterBoardTasks(tasks, [{ id: '1', name: 'Ben', assignee: 'me' }], { now: NOW })).toEqual([]);
    });

    it('WIP durumu ve tamamlanma gün süzgeci', () => {
        expect(wipState(3, { max: 2 })).toBe('over');
        expect(wipState(1, { min: 2 })).toBe('under');
        expect(wipState(2, { min: 1, max: 2 })).toBe('ok');
        const done = [task('x', { status: TaskStatus.Done, resolvedAt: '2026-11-15T00:00:00Z' }), task('y', { status: TaskStatus.Done, resolvedAt: '2026-01-01T00:00:00Z' })];
        const col = distribute(done, { ...defaultBoardConfig(), doneDays: 14 }, NOW).columns[2];
        expect([col.tasks.map(t => t.id), col.total]).toEqual([['x'], 2]);
    });

    it('Expedite, kişi ve öncelik kulvarları', () => {
        const cfg = { ...defaultBoardConfig(), swimlane: 'expedite' as const, expedite: { priorities: ['Blocker' as const], labels: ['MEB_ticket'] } };
        expect(buildLanes(tasks, cfg).map(l => [l.title, l.tasks.length])).toEqual([['Expedite', 2], ['Diğer işler', 1]]);
        expect(buildLanes(tasks, { ...cfg, swimlane: 'assignee' }).map(l => l.title)).toEqual(['Ayşe Kaya', 'Mehmet Demir', 'Atanmamış']);
        expect(buildLanes(tasks, { ...cfg, swimlane: 'priority' }).map(l => l.title)).toEqual(['Engelleyici', 'Orta']);
    });

    it('etiket önerileri ve ayar doğrulaması', () => {
        expect(topLabels(tasks)).toEqual([{ label: 'gib', count: 1 }, { label: 'MEB_ticket', count: 1 }]);
        expect(validateBoardConfig(jiraLike())).toEqual([]);
        const dup = { ...defaultBoardConfig(), columns: [...defaultBoardConfig().columns, { id: 'x', name: 'Kopya', statuses: [appKey(TaskStatus.Done)], targetStatus: TaskStatus.Done }] };
        expect(validateBoardConfig(dup).join(' ')).toMatch(/iki kolona/);
        expect(validateBoardConfig({ ...defaultBoardConfig(), columns: [{ id: 'e', name: 'Boş', statuses: [], targetStatus: TaskStatus.ToDo, min: 5, max: 2 }] })).toHaveLength(2);
    });
});
