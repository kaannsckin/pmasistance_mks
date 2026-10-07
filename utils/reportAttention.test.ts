import { describe, expect, it } from 'vitest';
import { CustomerMeeting, View, WeeklyReport, WorkspaceData } from '../types';
import { reportAttention } from './reportAttention';
import { createReport } from './weeklyReport';
import { createEmptyWorkspace, createProject } from './workspace';

const THU = new Date(2026, 9, 8, 12); // 41. hafta Perşembe (varsayılan son gün)
const MON = new Date(2026, 9, 5, 12);

const ws = (over: Partial<WorkspaceData> = {}): WorkspaceData => {
    const a = createProject('Safir Posta'); a.id = 'a'; a.pmPersonId = 'pm1';
    const b = createProject('Portal'); b.id = 'b'; b.pmPersonId = 'pm1';
    return {
        ...createEmptyWorkspace(),
        projects: [a, b],
        people: [
            { id: 'pm1', firstName: 'Ayşe', lastName: 'Yılmaz', departmentCode: 'U310', availableAA: 1, roles: [] },
            { id: 'bs1', firstName: 'Zeynep', lastName: 'Kara', departmentCode: 'U310', availableAA: 1, roles: [] },
        ],
        ...over,
    };
};

const rep = (projectId: string, stage: WeeklyReport['stage'], extra: Partial<WeeklyReport> = {}): WeeklyReport => ({
    ...createReport({ kind: 'project', projectId, departmentCode: 'U310', year: 2026, week: 41 }, { role: 'py', personId: 'pm1' }, MON), stage, ...extra,
});

const meeting = (over: Partial<CustomerMeeting>): CustomerMeeting => ({
    id: 'm1', title: 'Demo', customer: 'Gebze Belediyesi', date: '2026-10-06T10:00', locationType: 'bilgem', location: '', ourParticipants: 'PY', customerParticipants: '',
    agenda: 'Demo', expectedOutcome: '', managementAttendance: true, status: 'pending', createdByRole: 'py', createdByPersonId: 'pm1', createdAt: '', updatedAt: '', ...over,
});

describe('rapor ve görüşme hatırlatmaları', () => {
    it('PY: son günden önce sessiz; son gün gönderilmeyenler ve iadeler', () => {
        const base = ws({ currentRole: 'py', currentPersonId: 'pm1', weeklyReports: [rep('a', 'bs_review')] });
        expect(reportAttention(base, MON).items).toEqual([]);
        const due = reportAttention(base, THU);
        expect(due.reportBadge).toBe(1);
        expect(due.items[0]).toMatchObject({ severity: 'warn', view: View.WeeklyReport });
        const returned = reportAttention({ ...base, weeklyReports: [rep('a', 'draft', { returnNote: 'Tutar eksik' }), rep('b', 'bs_review')] }, MON);
        expect(returned.items.map(i => i.severity)).toEqual(['danger']);
        expect(returned.reportBadge).toBe(1);
    });

    it('BS ve PYB destek: kendi aşamasındaki raporlar; yayınlanan haftalar sayılmaz', () => {
        const reports = [rep('a', 'bs_review'), rep('b', 'pyds_review')];
        expect(reportAttention(ws({ currentRole: 'bolum_sorumlu', currentPersonId: 'bs1', weeklyReports: reports }), MON).reportBadge).toBe(1);
        expect(reportAttention(ws({ currentRole: 'pyb_destek', weeklyReports: reports }), MON).reportBadge).toBe(1);
        const pub = ws({ currentRole: 'pyb_destek', weeklyReports: reports, weeklyPublications: [{ year: 2026, week: 41, publishedAt: '' }] });
        expect(reportAttention(pub, MON).reportBadge).toBe(0);
    });

    it('yönetim: onay bekleyen görüşmeler; sahibi: sonucu yazılmamış görüşmeler', () => {
        const meetings = [meeting({}), meeting({ id: 'm2', status: 'approved', date: '2026-10-05T10:00' })];
        const mudur = reportAttention(ws({ currentRole: 'mudur', customerMeetings: meetings }), THU);
        expect(mudur.meetingBadge).toBe(1);
        expect(mudur.items[0].text).toContain('katılımınız isteniyor');
        const py = reportAttention(ws({ currentRole: 'py', currentPersonId: 'pm1', customerMeetings: meetings, weeklyReports: [rep('a', 'bs_review'), rep('b', 'bs_review')] }), THU);
        expect(py.meetingBadge).toBe(1);
        expect(py.items.find(i => i.id === 'mt-outcome')?.view).toBe(View.Meetings);
    });
});
