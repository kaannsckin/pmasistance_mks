import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../../types';
import { TR_WORKDAYS_2026 } from '../billedHours';
import { parseJiraCsv } from '../importer';
import { mapJiraIssueType, mapJiraPriority, mapJiraStatus, parseJiraDate, secondsToHours } from './jiraFields';
import { pertDays, stampLifecycle, taskDurations, withStatus } from './lifecycle';
import { analyzeRecords, recordsToCsv } from './recordQuality';
import { addWorkdays, isWorkday, trHolidays, workdaysBetween, workdaysInMonth } from './workdays';

const task = (id: string, extra: Partial<Task> = {}): Task => ({
    id, name: `${id} kaydı için yeterli açıklama metni`, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'Yazılım', resourceName: '',
    time: { best: 2, avg: 3, worst: 6 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...extra,
});

describe('iş günü takvimi', () => {
    it('2026 aylık iş günleri resmi tabloyla uyumlu (arife yarım günleri iş günü sayılır)', () => {
        // Tablo Mart ve Mayıs arifelerini yarım gün düşer, 28 Ekim'i düşmez
        const expected = { ...TR_WORKDAYS_2026, 3: 21, 5: 16 };
        for (let m = 1; m <= 12; m++) expect([m, workdaysInMonth(2026, m)]).toEqual([m, expected[m]]);
    });

    it('tatil, hafta sonu ve uçlar dahil sayım', () => {
        expect(trHolidays(2026).has('2026-05-28')).toBe(true); // Kurban Bayramı
        expect(isWorkday(new Date(2026, 9, 29))).toBe(false); // Cumhuriyet Bayramı
        expect(isWorkday(new Date(2026, 9, 30))).toBe(true);
        expect(workdaysBetween('2026-10-05T09:00:00', '2026-10-05T17:00:00')).toBe(1); // aynı gün
        expect(workdaysBetween('2026-10-05', '2026-10-09')).toBe(5);
        expect(workdaysBetween('2026-10-26', '2026-10-30')).toBe(4); // 29 Ekim düşer
        expect(workdaysBetween('2026-10-09', '2026-10-05')).toBeNull();
        expect(addWorkdays(new Date(2026, 9, 28), 2)).toEqual(new Date(2026, 9, 30)); // 28 → (29 tatil) → 30
    });
});

describe('kayıt yaşam döngüsü', () => {
    const NOW = new Date('2026-10-05T09:00:00');
    const LATER = new Date('2026-10-09T15:00:00');

    it('durum geçişi: ilk başlama, kapanış, yeniden açılış ve günlük', () => {
        let t = withStatus(task('a'), TaskStatus.InProgress, NOW);
        expect(t).toMatchObject({ status: TaskStatus.InProgress, startedAt: NOW.toISOString() });
        t = withStatus(t, TaskStatus.Done, LATER);
        expect(t.resolvedAt).toBe(LATER.toISOString());
        const reopened = withStatus(t, TaskStatus.InProgress, LATER);
        expect(reopened).toMatchObject({ resolvedAt: undefined, startedAt: NOW.toISOString() }); // ilk başlama korunur
        expect(reopened.statusLog!.map(c => `${c.from}>${c.to}`)).toEqual(['ToDo>InProgress', 'InProgress>Done', 'Done>InProgress']);
        expect(withStatus(t, TaskStatus.Done, LATER)).toBe(t); // değişmedi
    });

    it('stampLifecycle: yeni kayda açılış, durumu değişene geçiş; içe aktarılan ve değişmeyen dokunulmaz', () => {
        const a = task('a');
        const imported = task('i', { importedAt: NOW.toISOString(), status: TaskStatus.Done });
        const out = stampLifecycle([a], [{ ...a, status: TaskStatus.InProgress }, task('b'), imported], NOW);
        expect(out[0]).toMatchObject({ startedAt: NOW.toISOString(), statusLog: [{ from: 'ToDo', to: 'InProgress' }] });
        expect(out[1].createdAt).toBe(NOW.toISOString());
        expect(out[2]).toBe(imported);
        const same = [a];
        expect(stampLifecycle(same, same, NOW)).toBe(same);
    });

    it('süreler iş günü cinsinden; PERT beklenen süre', () => {
        const t = { ...withStatus(withStatus(task('a', { createdAt: '2026-10-01T09:00:00' }), TaskStatus.InProgress, NOW), TaskStatus.Done, LATER) };
        expect(taskDurations(t)).toEqual({ leadDays: 7, cycleDays: 5, reopened: 0, estimateDays: 3.3 });
        expect(pertDays(task('x', { time: { best: 0, avg: 0, worst: 0 } }))).toBeNull();
    });
});

describe('Jira alanları', () => {
    it('tarih biçimleri', () => {
        const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo, d, h, mi).toISOString();
        expect(parseJiraDate('2026-10-07 10:15')).toBe(local(2026, 9, 7, 10, 15));
        expect(parseJiraDate('07/Oct/26 2:30 PM')).toBe(local(2026, 9, 7, 14, 30));
        expect(parseJiraDate('07/Eki/26 10:15 ÖÖ')).toBe(local(2026, 9, 7, 10, 15));
        expect(parseJiraDate('07.10.2026 09:05')).toBe(local(2026, 9, 7, 9, 5));
        expect(parseJiraDate('31/02/2026')).toBeUndefined();
        expect(parseJiraDate('dün')).toBeUndefined();
    });

    it('durum, tür, öncelik ve süre eşleme', () => {
        expect([mapJiraStatus('Done'), mapJiraStatus('Kapalı'), mapJiraStatus('In Review'), mapJiraStatus('Open'), mapJiraStatus('', '2026-01-01')]).toEqual([TaskStatus.Done, TaskStatus.Done, TaskStatus.InProgress, TaskStatus.ToDo, TaskStatus.Done]);
        expect([mapJiraIssueType('Bug'), mapJiraIssueType('Story'), mapJiraIssueType('Improvement'), mapJiraIssueType('Sub-task'), mapJiraIssueType('Epic'), mapJiraIssueType('')]).toEqual(['bug', 'feature', 'improvement', 'task', 'other', undefined]);
        expect([mapJiraPriority('Highest'), mapJiraPriority('Blocker'), mapJiraPriority('Lowest'), mapJiraPriority('Medium')]).toEqual(['High', 'Blocker', 'Low', 'Medium']);
        expect(secondsToHours('28800')).toBe(8);
        expect(secondsToHours('')).toBeUndefined();
    });

    it('CSV içe aktarma yaşam döngüsü alanlarını alır', () => {
        // Uygulamada PapaParse CDN'den gelir; testte virgülle ayrılmış basit satırlar yeterli
        (globalThis as unknown as { Papa: unknown }).Papa = { parse: (text: string) => ({ data: text.split('\n').map(l => l.split(',')) }) };
        const csv = [
            'Issue key,Summary,Issue Type,Status,Priority,Created,Resolved,Original Estimate,Time Spent,Custom field (Story Points),Fix Version/s',
            'MKS-1,Giriş hatası,Bug,Done,High,2026-10-01 09:00,2026-10-05 16:00,57600,72000,3,v2.1',
            'MKS-2,Rapor ekranı,Story,In Progress,Medium,2026-10-02 10:00,,,,,',
        ].join('\n');
        const { tasks } = parseJiraCsv(csv);
        expect(tasks[0]).toMatchObject({
            jiraId: 'MKS-1', issueType: 'bug', status: TaskStatus.Done, priority: 'High', time: { best: 2, avg: 2, worst: 2 }, estimateSource: 'jira',
            originalEstimateHours: 16, actualHours: 20, storyPoints: 3, fixVersion: 'v2.1', includeInSprints: false,
        });
        expect(taskDurations(tasks[0]).leadDays).toBe(3);
        expect(tasks[0].importedAt).toBeTruthy();
        expect(tasks[1]).toMatchObject({ issueType: 'feature', status: TaskStatus.InProgress, includeInSprints: true });
        expect(tasks[1].resolvedAt).toBeUndefined();
    });
});

describe('kayıt verisi kalitesi', () => {
    const closed = (id: string, created: string, resolved: string, extra: Partial<Task> = {}) =>
        task(id, { status: TaskStatus.Done, createdAt: created, resolvedAt: resolved, issueType: 'bug', ...extra });

    it('eğitime uygun kayıtlar, tutarsızlık, toplu kapatma ve aykırı süre', () => {
        const normal = Array.from({ length: 8 }, (_, i) => closed(`n${i}`, '2026-09-01T09:00:00', `2026-09-0${i + 1}T09:00:00`));
        const bulk = Array.from({ length: 10 }, (_, i) => closed(`b${i}`, '2026-06-01T09:00:00', '2026-09-30T17:00:00', { issueType: 'task' }));
        const report = analyzeRecords([{
            id: 'p', name: 'Safir', tasks: [
                ...normal,
                ...bulk,
                closed('neg', '2026-09-10T09:00:00', '2026-09-01T09:00:00'),
                closed('old', '2025-01-01T09:00:00', '2026-09-15T09:00:00'), // ~420 iş günü
                task('nodate', { status: TaskStatus.Done }),
                task('legacy', { status: TaskStatus.Done, issueType: 'bug', startedAt: '2026-09-01T09:00:00', resolvedAt: '2026-09-03T09:00:00' }), // açılışı bilinmeyen eski kayıt: cycle ölçülür
                task('open'),
            ],
        }]);
        expect(report).toMatchObject({ total: 23, closed: 22, usable: 9 });
        expect(report.byIssue).toMatchObject({ bulk_closed: 10, negative_duration: 1, outlier: 1, missing_dates: 1 });
        expect(report.rows.find(r => r.task.id === 'n0')!.issues).toEqual(['same_day']);
        expect(report.medianByType[0]).toMatchObject({ type: 'bug', n: 9 });
        expect(report.estimateRatio!.n).toBe(9);
        const csv = recordsToCsv(report);
        expect(csv.split('\n')).toHaveLength(10); // başlık + 9 uygun kayıt
        expect(csv).not.toContain('resourceName');
    });

    it('süreleri aynı ya da birbirine çok yakın kayıtlar aykırı sayılmaz', () => {
        const same = Array.from({ length: 8 }, (_, i) => closed(`s${i}`, '2026-09-01T09:00:00', '2026-09-03T09:00:00'));
        const report = analyzeRecords([{ id: 'p', name: 'Safir', tasks: [...same, closed('biraz', '2026-09-01T09:00:00', '2026-09-08T09:00:00')] }]);
        expect(report.byIssue.outlier).toBeUndefined();
        expect(report.usable).toBe(9);
    });
});
