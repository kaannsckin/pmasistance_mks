import { describe, expect, it } from 'vitest';
import { Project, Task, TaskStatus } from '../types';
import { buildLanes, currentLaneVersion, laneRange, positionPct, segmentPct, unitCapacities } from './timelinePlan';
import { createProject } from './workspace';

const task = (id: string, version: number, unit: string, res: string, avg: number, extra: Partial<Task> = {}): Task => ({
    id, name: id, availability: true, priority: 'Medium', version, predecessor: null, unit, resourceName: res,
    time: { best: avg, avg, worst: avg }, jiraId: '', notes: '', status: TaskStatus.ToDo, includeInSprints: true, ...extra,
});

const buildProject = (): Project => {
    const p = createProject('Plan');
    p.settings = { ...p.settings, projectStartDate: '2026-07-06', sprintDuration: 3, globalTestDays: 4 };
    p.resources = [
        { id: 'r1', name: 'Ayşe', participation: 100, unit: 'U310', title: '' },
        { id: 'r2', name: 'Ali', participation: 50, unit: 'U310', title: '' },
        { id: 'r3', name: 'Kaan', participation: 100, unit: 'U320', title: '' },
    ];
    p.tasks = [
        task('havuz', 0, 'U310', 'Ayşe', 3),
        task('a', 1, 'U310', 'Ayşe', 10),
        task('b', 1, 'U310', 'Ali', 6, { status: TaskStatus.Done }), // %50 katılım: yük yine 6 gün (efor)
        task('e', 1, 'U310', 'Ali', 2),
        task('c', 1, 'U320', 'Kaan', 5),
        task('d', 2, 'U320', 'Kaan', 20),
        task('dis', 2, 'U320', 'Kaan', 50, { includeInSprints: false }),
    ];
    return p;
};

describe('unitCapacities', () => {
    it('net iş günü (hafta×5 − test) × katılım, birim bazında', () => {
        const caps = unitCapacities(buildProject());
        expect(caps.get('U310')).toBe(16.5); // 11 × (1 + 0.5)
        expect(caps.get('U320')).toBe(11);
    });
});

describe('buildLanes', () => {
    const lanes = buildLanes(buildProject());

    it('havuz + sürümler; plana dahil olmayan görev gösterilmez', () => {
        expect(lanes.map(l => l.version)).toEqual([0, 1, 2]);
        expect(lanes[2].tasks.map(t => t.id)).toEqual(['d']);
        expect(lanes[0].start).toBeUndefined();
        expect(lanes[0].overloaded).toEqual([]);
    });

    it('yük efordur, katılım yalnız kapasitede sayılır; aşan birimler işaretlenir', () => {
        const s1 = lanes[1];
        // 10 + 6 + 2 = 18 gün efor > 11 × (1 + 0,5) = 16,5 gün kapasite
        expect(s1.units.find(u => u.unit === 'U310')).toEqual({ unit: 'U310', load: 18, capacity: 16.5 });
        expect(s1.overloaded).toEqual(['U310']);
        expect(s1.done).toBe(1);
        expect(lanes[2].overloaded).toEqual(['U320']); // 20 > 11
    });

    it('katılım iki kez sayılmaz: %50 kişinin kapasitesine sığan iş aşım göstermez', () => {
        const p = buildProject();
        p.tasks = [task('x', 1, 'U310', 'Ali', 5)];
        p.resources = p.resources.filter(r => r.name === 'Ali');
        const u = buildLanes(p)[1].units.find(x => x.unit === 'U310')!;
        expect(u).toEqual({ unit: 'U310', load: 5, capacity: 5.5 }); // eskiden 10 > 5,5 aşım görünürdü
        expect(buildLanes(p)[1].overloaded).toEqual([]);
    });

    it('takvim panoyla aynı: sürüm 1 6–24 Temmuz, test 27–30 Temmuz', () => {
        const s1 = lanes[1];
        expect([s1.start!.getDate(), s1.end!.getDate(), s1.testStart!.getDate(), s1.testEnd!.getDate()]).toEqual([6, 24, 27, 30]);
        expect(lanes[2].start!.getDate()).toBe(31);
    });

    it('boş sürüm eklenebilir', () => {
        const more = buildLanes(buildProject(), 2);
        expect(more).toHaveLength(5);
        expect(more[4].tasks).toHaveLength(0);
        expect(more[4].capacity).toBe(27.5);
    });
});

describe('aralık ve konum', () => {
    const lanes = buildLanes(buildProject());
    const range = laneRange(lanes)!;

    it('ilk sürüm başından son test bitişine', () => {
        expect(range.start.getDate()).toBe(6);
        expect(range.end.getMonth()).toBe(7); // Ağustos
    });

    it('parça yüzdesi ve bugün', () => {
        const seg = segmentPct(lanes[1].start!, lanes[1].end!, range);
        expect(seg.left).toBe(0);
        expect(seg.width).toBeGreaterThan(0);
        expect(positionPct(new Date(2026, 6, 6), range)).toBe(0);
        expect(positionPct(new Date(2026, 5, 1), range)).toBeNull();
        expect(currentLaneVersion(lanes, new Date(2026, 6, 28))).toBe(1); // test dönemi
        expect(currentLaneVersion(lanes, new Date(2026, 7, 3))).toBe(2);
        expect(currentLaneVersion(lanes, new Date(2027, 0, 1))).toBeNull();
    });
});
