import { describe, expect, it } from 'vitest';
import { Allocation, WeeklyReport, WorklogEntry } from '../types';
import { inMonthEstimates } from './inMonthActual';

const wl = (date: string, hours: number, author = 'Ayşe Kaya', issueKey = 'ALT-1'): WorklogEntry => ({ date, author, issueKey, summary: 'İş', hours, source: 'jira' });
const report = (week: number, worklog: WorklogEntry[], projectId = 'p1'): WeeklyReport =>
    ({ id: `r${week}-${projectId}`, year: 2026, week, kind: 'project', projectId, thisWeek: [], nextWeek: [], abbreviations: [], stage: 'draft', worklog, history: [] } as unknown as WeeklyReport);
const alloc = (plan: Record<number, number>, actual: Record<number, number> = { 9: 1 }): Allocation =>
    ({ id: 'a1', personId: 'x', projectId: 'p1', year: 2026, plan, actual } as Allocation);

describe('ay içi tahmini gerçekleşen (BL-22)', () => {
    const NOW = new Date('2026-10-16T18:00:00');

    it('kapanmamış ayın worklog\'u adam-aya çevrilir; plan worklog\'u olan günlere oranlanır', () => {
        // Ekim 20,5 iş günü; 5 gün × 8 saat = 40 saat → 40 / (8 × 20,5) AA
        const ws = { allocations: [alloc({ 10: 1 })], weeklyReports: [report(41, [5, 6, 7, 8, 9].map(d => wl(`2026-10-0${d}`, 8)))] };
        const [e] = inMonthEstimates(ws, 'p1', NOW);
        expect(e).toMatchObject({ month: 10, coveredDays: 5, hours: 40, lastDate: '2026-10-09' });
        expect(e.estimatedAA).toBeCloseTo(40 / (8 * 20.5), 2);
        expect(e.planToDateAA).toBeCloseTo(5 / 20.5, 2);
        expect(e.ratio).toBe(1);
    });

    it('kapanan ay, başka proje, gelecek tarih ve aynı kayıt iki kez sayılmaz', () => {
        const ws = {
            allocations: [alloc({ 10: 1 })],
            weeklyReports: [
                report(39, [wl('2026-09-24', 8)]),
                report(41, [wl('2026-10-08', 8), wl('2026-10-30', 8)]),
                report(42, [wl('2026-10-08', 8), wl('2026-10-12', 4, 'Mehmet Demir')]),
                report(42, [wl('2026-10-12', 8)], 'p2'),
            ],
        };
        const [e] = inMonthEstimates(ws, 'p1', NOW);
        expect(e).toMatchObject({ month: 10, coveredDays: 2, hours: 12 });
        expect(inMonthEstimates({ ...ws, weeklyReports: [] }, 'p1', NOW)).toEqual([]);
    });

    it('arife yarım gün sayılır; planı olmayan projede oran yok', () => {
        const ws = { allocations: [alloc({})], weeklyReports: [report(44, [wl('2026-10-27', 8), wl('2026-10-28', 4)])] };
        const [e] = inMonthEstimates(ws, 'p1', new Date('2026-10-30T12:00:00'));
        expect(e.coveredDays).toBe(1.5);
        expect(e.ratio).toBeNull();
    });
});
