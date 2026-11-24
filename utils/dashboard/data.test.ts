import { describe, expect, it } from 'vitest';
import { Project, ProjectKpi, Task, TaskStatus } from '../../types';
import { createEmptyWorkspace, createProject } from '../workspace';
import { DEFAULT_WORKFLOW } from '../workflow';
import { applyFilter, breakdown, burnup, dimValues, labelFamilies, labelMatchesPrefix, milestonePlan, pivot, plannedDue, taskTotals } from './data';
import { addKpiPoint, formatKpi, kpiDelta, kpiProgress, METRIC_BY_KEY, METRICS } from './metrics';
import { addWidget, createWidget, defaultLayout, duplicateWidget, moveWidget, moveWidgetTo, removeWidget, sanitizeLayout, TEMPLATES, updateWidget } from './model';

const NOW = new Date('2026-11-20T09:00:00');

let n = 0;
const task = (labels: string[], extra: Partial<Task> = {}): Task => ({
    id: `t${++n}`, name: `Madde ${n}`, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'EMS', resourceName: 'Ayşe Kaya',
    time: { best: 2, avg: 2, worst: 2 }, jiraId: '', notes: '', status: TaskStatus.Backlog, labels, ...extra,
});

const project = (): Project => {
    n = 0;
    const p = createProject('Safir Posta', { code: 'SP' });
    p.workPackages = [{ id: 'ep1', name: 'EP-01 · Kimlik ve Oturum', color: '#000' } as unknown as Project['workPackages'][number], { id: 'ep2', name: 'EP-02 · Temel Mesajlaşma', color: '#000' } as unknown as Project['workPackages'][number]];
    p.tasks = [
        task(['MS0', 'Zorunlu', 'Rapor 5.1', 'PoC: Karşılanmadı'], { status: TaskStatus.Done, workPackageId: 'ep1', dueDate: '2026-11-10', resolvedAt: '2026-11-09T10:00:00Z', createdAt: '2026-11-01T10:00:00Z' }),
        task(['MS0', 'Zorunlu', 'PoC: Kısmen karşılandı'], { status: TaskStatus.InProgress, workPackageId: 'ep1', dueDate: '2026-11-12', unit: 'İstemci', resourceName: 'Ali Can' }),
        task(['MS1', 'Olması beklenen', 'PoC: Karşılanmadı'], { workPackageId: 'ep2', dueDate: '2026-12-15', time: { best: 4, avg: 4, worst: 4 } }),
        task(['MS1', 'İsteğe bağlı'], { workPackageId: 'ep2', dueDate: '2026-12-20' }),
        task(['MS10', 'Zorunlu'], { dueDate: '2027-01-15', priority: 'Blocker' }),
        task(['Diğer'], { status: TaskStatus.Done, resolvedAt: '2026-10-01T00:00:00Z' }),
    ];
    return p;
};
const ctx = (p: Project) => ({ project: p, workflow: DEFAULT_WORKFLOW });

describe('dashboard verisi', () => {
    it('etiket aileleri ve önek eşleşmesi', () => {
        const fams = labelFamilies(project().tasks);
        expect(fams.map(f => [f.prefix, f.values])).toEqual([
            ['MS', ['MS0', 'MS1', 'MS10']],
            ['PoC:', ['PoC: Karşılanmadı', 'PoC: Kısmen karşılandı']],
        ]);
        expect(labelMatchesPrefix('MS 2', 'MS')).toBe(true);
        expect(labelMatchesPrefix('MSX', 'MS')).toBe(false);
        expect(labelMatchesPrefix('MS', 'MS')).toBe(false);
    });

    it('süzgeç: etiket, hariç etiket, iş paketi, açık', () => {
        const t = project().tasks;
        expect(applyFilter(t, { labels: ['rapor 5.1'] }).map(x => x.id)).toEqual(['t1']);
        expect(applyFilter(t, { excludeLabels: ['Zorunlu'], openOnly: true }).map(x => x.id)).toEqual(['t3', 't4']);
        expect(applyFilter(t, { workPackageId: 'ep2' })).toHaveLength(2);
    });

    it('kırılım: doğal sıra (MS2 < MS10), "yok" sona, tamamlanma ve gecikme', () => {
        const p = project();
        const rows = breakdown(p.tasks, { kind: 'labels', prefix: 'MS' }, ctx(p), 'count', NOW);
        expect(rows.map(r => [r.key, r.total, r.done, r.overdue])).toEqual([['MS0', 2, 1, 1], ['MS1', 2, 0, 0], ['MS10', 1, 0, 0], ['MS yok', 1, 1, 0]]);
        expect(rows[0].pct).toBe(0.5);
        const eff = breakdown(p.tasks, { kind: 'workPackage' }, ctx(p), 'effort', NOW);
        expect(eff.map(r => [r.key, r.measure])).toEqual([['EP-02 · Temel Mesajlaşma', 6], ['EP-01 · Kimlik ve Oturum', 4], ['İş paketi yok', 4]]);
        expect(dimValues(p.tasks[0], { kind: 'labels', values: ['Zorunlu', 'Olması beklenen'] }, ctx(p))).toEqual(['Zorunlu']);
    });

    it('çapraz tablo: önem × durum kategorisi', () => {
        const p = project();
        const pv = pivot(p.tasks, { kind: 'labels', values: ['Zorunlu', 'Olması beklenen', 'İsteğe bağlı'] }, { kind: 'category' }, ctx(p));
        expect(pv.rows).toEqual(['Zorunlu', 'Olması beklenen', 'İsteğe bağlı', 'Etiket yok']);
        expect(pv.cols).toEqual(['Bekleyen', 'Süreçte', 'Tamamlandı']);
        expect(pv.cells[0]).toEqual([1, 1, 1]);
        expect(pv.total).toBe(6);
    });

    it('kilometre taşı planı: tarih aralığı, kümülatif plan, durum', () => {
        const p = project();
        const ms = milestonePlan(p.tasks.filter(t => t.labels?.some(l => /^MS/.test(l))), { kind: 'labels', prefix: 'MS' }, ctx(p), 'count', NOW);
        expect(ms.map(r => [r.key, r.end, r.state, Math.round(r.cumulativePlanned * 100)])).toEqual([
            ['MS0', '2026-11-12', 'late', 40], ['MS1', '2026-12-20', 'planned', 80], ['MS10', '2027-01-15', 'planned', 100],
        ]);
        expect(ms[0].start).toBe('2026-11-01');
        expect(ms[1].daysLeft).toBe(30);
    });

    it('termin yoksa etiketle eşleşen sürümün (MS) tarihi plan olur; taş tarihleri sürümden', () => {
        const p = project();
        p.versions = [{ id: 'm1', name: 'MS1', status: 'unreleased', startDate: '2026-12-01', releaseDate: '2026-12-31' }];
        const noDue = { ...p.tasks[2], dueDate: undefined };
        expect(plannedDue(noDue, p)).toBe('2026-12-31');
        expect(plannedDue(p.tasks[0], p)).toBe('2026-11-10');
        const ms = milestonePlan(p.tasks, { kind: 'labels', prefix: 'MS' }, ctx(p), 'count', NOW);
        expect(ms.find(r => r.key === 'MS1')).toMatchObject({ start: '2026-12-01', end: '2026-12-31' });
        expect(breakdown(p.tasks, { kind: 'labels', prefix: 'PoC:' }, ctx(p)).map(r => r.key)).toEqual(['Karşılanmadı', 'Kısmen karşılandı', 'PoC yok']);
    });

    it('plan / gerçekleşen eğrisi haftalık ve kümülatif', () => {
        const p = project();
        const b = burnup(p.tasks, 'count', NOW);
        expect(b[0].date).toBe('2026-09-28');
        expect(b.at(-1)).toMatchObject({ planned: 5, done: 2, scope: 6 });
        expect(b.every((x, i) => i === 0 || x.planned >= b[i - 1].planned)).toBe(true);
    });

    it('özet sayılar ve hazır göstergeler', () => {
        const p = project();
        const t = taskTotals(p.tasks, NOW, ctx(p));
        expect([t.total, t.done, t.overdue, t.blocked, t.effort]).toEqual([6, 2, 1, 1, 14]);
        const mctx = { ...ctx(p), ws: { ...createEmptyWorkspace(), projects: [p] }, tasks: p.tasks, now: NOW };
        expect(METRIC_BY_KEY.get('progress')!.compute(mctx)).toMatchObject({ text: '%33', sub: '2 / 6 kayıt tamamlandı' });
        expect(METRIC_BY_KEY.get('overdue')!.compute(mctx)).toMatchObject({ value: 1, tone: 'bad' });
        // Her hazır gösterge boş projede de hata vermeden hesaplanır
        const empty = createProject('Boş');
        for (const m of METRICS) expect(() => m.compute({ ...ctx(empty), ws: { ...createEmptyWorkspace(), projects: [empty] }, tasks: [], now: NOW })).not.toThrow();
    });

    it('kayıt ilerlemesinde ayrıntılı durum kategoriyi geçersiz kılar ve kapanan kayıt adedi korunur', () => {
        const p = project();
        const tasks = [
            task([], { status: TaskStatus.InProgress, jiraStatus: ' testing ' }),
            task([], { status: TaskStatus.InProgress }),
            task([], { status: TaskStatus.Done }),
            task([], { status: TaskStatus.ToDo }),
        ];
        const compute = METRIC_BY_KEY.get('progress')!.compute;
        const progressWeights = { categories: { [TaskStatus.InProgress]: 25 }, statuses: { TESTING: 50 } };
        const mctx = { ...ctx(p), ws: createEmptyWorkspace(), tasks, now: NOW, progressWeights };
        expect(compute(mctx)).toMatchObject({ text: '%44', value: 0.4375, sub: 'Durum yüzdelerine göre · 1 / 4 kayıt tamamlandı' });
        expect(compute({ ...mctx, tasks: tasks.slice(0, 2) })).toMatchObject({ text: '%38', value: 0.375 });
        expect(compute({ ...mctx, progressWeights: { ...progressWeights, statuses: { TESTING: 0 } } }).value).toBe(0.3125);
        expect(compute({ ...mctx, progressWeights: { ...progressWeights, statuses: { TESTING: 120 } } }).value).toBe(0.375);
        expect(compute({ ...mctx, progressWeights: undefined })).toMatchObject({ value: 0.25, sub: '1 / 4 kayıt tamamlandı' });
    });
});

describe('projeye özel göstergeler', () => {
    it('ölçüm ekleme, hedefe ilerleme, değişim, biçim', () => {
        let k: ProjectKpi = { id: 'k1', name: 'PoC skoru', unit: 'percent', target: 87.2, points: [] };
        k = addKpiPoint(k, { date: '2026-11-01', value: 40.8 });
        k = addKpiPoint(k, { date: '2026-11-20', value: 45.8 });
        k = addKpiPoint(k, { date: '2026-11-20', value: 45.76 }); // aynı gün: yerine geçer
        expect(k.points.map(p => p.value)).toEqual([40.8, 45.76]);
        expect(kpiDelta(k)).toBeCloseTo(4.96, 5);
        expect(kpiProgress(k)).toBeCloseTo(45.76 / 87.2, 5);
        expect(formatKpi(45.76, 'percent')).toBe('%45,8');
        expect(formatKpi(undefined, 'number')).toBe('—');
    });
});

describe('düzen', () => {
    it('ekle, taşı, sürükle, çoğalt, güncelle, sil', () => {
        let l = { widgets: [createWidget('metric'), createWidget('note')] };
        const [a, b] = l.widgets;
        l = addWidget(l, createWidget('pivot'), 1);
        expect(l.widgets.map(x => x.type)).toEqual(['metric', 'pivot', 'note']);
        l = moveWidget(l, b.id, -1);
        expect(l.widgets.map(x => x.type)).toEqual(['metric', 'note', 'pivot']);
        l = moveWidgetTo(l, a.id, l.widgets[2].id);
        expect(l.widgets.map(x => x.type)).toEqual(['note', 'pivot', 'metric']);
        l = duplicateWidget(l, a.id);
        expect(l.widgets).toHaveLength(4);
        expect(new Set(l.widgets.map(x => x.id)).size).toBe(4);
        l = updateWidget(l, a.id, { size: 4, title: 'İlerleme' });
        expect(l.widgets.find(x => x.id === a.id)).toMatchObject({ size: 4, title: 'İlerleme' });
        expect(removeWidget(l, a.id).widgets).toHaveLength(3);
    });

    it('şablonlar her projede kurulur; MS etiketli projede PoC şablonu seçilir; bozuk kayıt ayıklanır', () => {
        const p = project();
        for (const t of TEMPLATES) expect(t.build(p).length).toBeGreaterThan(3);
        expect(defaultLayout(p).widgets.find(x => x.type === 'milestones')?.config?.dim).toEqual({ kind: 'labels', prefix: 'MS' });
        expect(defaultLayout(createProject('Yeni')).widgets[0]).toMatchObject({ type: 'metric', config: { metric: 'progress' } });
        expect(sanitizeLayout({ widgets: [{ id: 'x', type: 'yok', size: 2 }, { id: 'y', type: 'note', size: 9 }] })).toEqual({ widgets: [{ id: 'y', type: 'note', size: 2 }] });
        expect(sanitizeLayout('bozuk')).toBeNull();
    });
});
