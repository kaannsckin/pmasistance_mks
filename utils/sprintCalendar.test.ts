import { describe, expect, it } from 'vitest';
import { createProject } from './workspace';
import { calendarLabel, sprintCalendar } from './sprintCalendar';
import { buildSprintWindows } from './taskToAllocation';
import { unitCapacities } from './timelinePlan';

describe('sprint takvimi', () => {
    it('test 0 gün olabilir (sürekli geliştirme); eksik değerler varsayılana düşer', () => {
        expect(sprintCalendar({ sprintDuration: 1, globalTestDays: 0, parallelTest: true })).toMatchObject({ weeks: 1, testDays: 0, parallelTest: false, mode: 'inside', netDays: 5, cycleDays: 5 });
        expect(sprintCalendar({ sprintDuration: 2, globalTestDays: 2, parallelTest: true })).toMatchObject({ mode: 'parallel', netDays: 8, cycleDays: 10 });
        expect(sprintCalendar({ sprintDuration: 3, globalTestDays: 4 })).toMatchObject({ mode: 'separate', netDays: 11, cycleDays: 19 });
        expect(sprintCalendar(undefined)).toMatchObject({ weeks: 3, testDays: 4 });
        expect(calendarLabel(sprintCalendar({ sprintDuration: 1, globalTestDays: 0 }))).toBe('1 hafta · test sprint içinde');
    });

    it('haftalık sprint, test sprint içinde: pencereler art arda haftalar, kapasite 5 gün', () => {
        const p = createProject('ATLAS');
        p.settings = { ...p.settings, projectStartDate: '2026-11-23', sprintDuration: 1, globalTestDays: 0 };
        p.resources = [{ id: 'r', name: 'Ayşe', participation: 100, unit: 'U310', title: 'Uzman' }];
        const w = buildSprintWindows(p, 3);
        const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        expect(w.map(x => [day(x.start), day(x.end), day(x.testEnd)])).toEqual([
            ['2026-11-23', '2026-11-27', '2026-11-27'],
            ['2026-11-30', '2026-12-04', '2026-12-04'],
            ['2026-12-07', '2026-12-11', '2026-12-11'],
        ]);
        expect(unitCapacities(p).get('U310')).toBe(5);
    });
});
