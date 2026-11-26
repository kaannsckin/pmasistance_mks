import { describe, expect, it } from 'vitest';
import { ReportSchedule, Task, TaskStatus } from '../types';
import { createProject } from './workspace';
import { buildReport, describeSchedule, isReportDue, previousSnapshot, progressSnapshot, reportText, scheduleProblems, trClock, withSnapshot } from './reportAutomation';

// 26 Kas 2026 Perşembe, 09:30 TR (06:30 UTC)
const NOW = new Date('2026-11-26T06:30:00Z');
const ago = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const t = (id: string, extra: Partial<Task> = {}): Task => ({
    id, name: `İş ${id}`, availability: true, priority: 'Medium', version: 2, predecessor: null, unit: 'U310', resourceName: 'Ayşe Kaya',
    time: { best: 1, avg: 1, worst: 1 }, jiraId: `MKS-${id}`, notes: '', status: TaskStatus.ToDo, ...extra,
});
const sched = (x: Partial<ReportSchedule> = {}): ReportSchedule => ({
    id: 's', name: 'Günlük ilerleme', enabled: true, cadence: 'daily', hour: 9, channels: { teams: true }, blocks: ['progress', 'activity', 'bugs', 'overdue', 'sprint', 'milestones', 'teams', 'blockers'],
    createdAt: '', updatedAt: '', ...x,
});

const project = () => {
    const p = createProject('ATLAS');
    p.settings = { ...p.settings, projectStartDate: '2026-11-16', sprintDuration: 1 };
    p.progressModel = { weights: { statuses: { TESTTE: 75 } } };
    p.tasks = [
        t('1', { status: TaskStatus.Done, resolvedAt: ago(5) }),
        t('2', { status: TaskStatus.InProgress, jiraStatus: 'Testte', statusLog: [{ at: ago(3), from: TaskStatus.ToDo, to: TaskStatus.InProgress }] }),
        t('3', { issueType: 'bug', createdAt: ago(2), priority: 'Blocker', dueDate: '2026-11-20' }),
        t('4', { issueType: 'bug', status: TaskStatus.Done, createdAt: ago(100), resolvedAt: ago(10) }),
    ];
    p.releasePlans = [{ id: 'rp', name: 'R1', summary: '', mode: 'manual', testDays: 0, workPackageIds: [], step: 1, status: 'draft', createdAt: '', updatedAt: '',
        items: [{ id: 'i1', name: '1', sourceTaskId: '1' }, { id: 'i3', name: '3', sourceTaskId: '3' }], milestones: [{ id: 'm', name: 'MS1', targetDate: '2026-11-25', itemIds: ['i1', 'i3'] }] }];
    return p;
};

describe('rapor otomasyonu', () => {
    it('Türkiye saatiyle zamanlama: gün, saat, hafta içi/haftalık, bugün gönderildiyse tekrar yok', () => {
        expect(trClock(NOW)).toEqual({ day: '2026-11-26', hour: 9, weekday: 4 });
        expect(isReportDue(sched(), NOW)).toBe(true);
        expect(isReportDue(sched({ hour: 10 }), NOW)).toBe(false);
        expect(isReportDue(sched({ hour: 10 }), NOW, { ignoreHour: true })).toBe(true);
        expect(isReportDue(sched({ lastSentDay: '2026-11-26' }), NOW)).toBe(false);
        expect(isReportDue(sched({ cadence: 'weekly', weekday: 1 }), NOW)).toBe(false);
        expect(isReportDue(sched({ cadence: 'weekly', weekday: 4 }), NOW)).toBe(true);
        expect(isReportDue(sched({ cadence: 'weekdays' }), new Date('2026-11-28T08:00:00Z'))).toBe(false); // Cumartesi
        expect(isReportDue(sched({ channels: {} }), NOW)).toBe(false);
        expect(describeSchedule(sched({ cadence: 'weekly', weekday: 1, channels: { slack: true, email: ['a@b.c'] } }))).toBe('Her Pazartesi 09:00 · Slack, e-posta (1)');
    });

    it('rapor: ilerleme farkı, dönem, hata oranı, gecikme, sprint, taş, birim', () => {
        const p = project();
        const prev = { day: '2026-11-25', pct: 30, done: 1, total: 4, open: 3, bugsOpen: 0 };
        const r = buildReport(p, sched(), { now: NOW, previous: prev });
        const by = Object.fromEntries(r.sections.map(s => [s.title.split(':')[0].split(' (')[0], s]));
        // (100 + 75 + 0 + 100) / 4 = 68.75
        expect(r.snapshot).toMatchObject({ pct: 69, done: 2, total: 4, open: 2, bugsOpen: 1 });
        expect(by['İlerleme'].summary).toBe('%69 (önceki ölçüm %30, +39 puan)');
        expect(by['Dönemde olanlar'].summary).toBe('2 iş tamamlandı, 1 yeni kayıt, 1 işte durum değişti');
        expect(by['Hatalar'].summary).toBe('1 açık hata (+1 açıldı, −1 kapandı) · önceki ölçüm 0');
        expect(by['Hatalar'].lines[0]).toBe("Açık işlerin %50'i hata · tüm kayıtların %50'i hata");
        expect(by['Geciken işler'].lines).toEqual(['! MKS-3 İş 3 — Ayşe Kaya, 6 gün']);
        expect(by['Şu anki sprint'].summary).toBe('%69 · 2/4 bitti · 1 süreçte · 3 gün kaldı');
        expect(by['Kilometre taşları'].lines).toEqual(['! MS1 (hedef 25 Kas): %50, 1/2 bitti — hedef geçti']);
        expect(by['Birim bazında'].lines[0]).toBe('• U310: %69 · 2 biten · 2 açık · 1 geciken');
        expect(by['Blocker işler'].summary).toBe('1 açık Blocker');
        expect(r.subject).toBe('ATLAS · Günlük ilerleme · 26 Kas · %69');
        expect(reportText(r.sections.slice(0, 1), 'slack', 'https://app')).toBe("*İlerleme*: %69 (önceki ölçüm %30, +39 puan)\n2 / 4 kayıt tamamlandı (+1)\nAçık iş: 2 (-1)\nYöntem: durum yüzdeleri\n\n<https://app|PlanAsistan'da aç>");
    });

    it('kapsam (hedef sürüm), ölçüm geçmişi ve doğrulama', () => {
        const p = project();
        p.tasks[0].fixVersion = 'R1';
        expect(progressSnapshot(p, NOW, 'r1')).toMatchObject({ total: 1, pct: 100 });
        const list = withSnapshot([{ day: '2026-11-24', pct: 10, done: 0, total: 1, open: 1, bugsOpen: 0 }], progressSnapshot(p, NOW));
        expect(list.map(x => x.day)).toEqual(['2026-11-24', '2026-11-26']);
        expect(previousSnapshot(list, NOW)?.day).toBe('2026-11-24');
        expect(scheduleProblems(sched({ name: ' ', channels: { email: ['yanlış'] }, blocks: [] }))).toEqual(['Rapora ad verin.', 'En az bir bölüm seçin.', 'Geçersiz e-posta: yanlış']);
    });
});
