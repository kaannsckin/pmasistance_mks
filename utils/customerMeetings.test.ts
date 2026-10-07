import { describe, expect, it } from 'vitest';
import { CustomerMeeting, WorkspaceData } from '../types';
import {
    awaitingOutcome, canEditMeeting, canPlanMeeting, canReviewMeeting, createMeeting, filterMeetings, markHeld, MeetingDraft, meetingsHeldInWeek,
    meetingsPlannedInWeek, meetingToDetails, reviewMeeting, updateMeeting, visibleMeetings,
} from './customerMeetings';
import { meetingSentence } from './weeklyReport';
import { createEmptyWorkspace, createProject } from './workspace';

const NOW = new Date(2026, 9, 6, 12);

const ws = (): WorkspaceData => {
    const a = createProject('Safir Posta'); a.id = 'a'; a.pmPersonId = 'pm1';
    const b = createProject('Portal'); b.id = 'b'; b.pmPersonId = 'pm2';
    return {
        ...createEmptyWorkspace(),
        projects: [a, b],
        people: [
            { id: 'pm1', firstName: 'Ayşe', lastName: 'Yılmaz', departmentCode: 'U310', availableAA: 1, roles: [] },
            { id: 'pm2', firstName: 'Ali', lastName: 'Veli', departmentCode: 'U320', availableAA: 1, roles: [] },
            { id: 'bs1', firstName: 'Zeynep', lastName: 'Kara', departmentCode: 'U310', availableAA: 1, roles: [] },
        ],
        currentRole: 'py',
        currentPersonId: 'pm1',
    };
};

const draft = (over: Partial<MeetingDraft> = {}): MeetingDraft => ({
    title: ' Safir Posta tanıtım demosu ', customer: 'Gebze Belediyesi', projectId: 'a', date: '2026-10-09T10:00', locationType: 'bilgem', location: '',
    ourParticipants: 'Ürün Yönetimi, Proje Yönetimi', customerParticipants: 'Bilgi İşlem Müdürü', agenda: 'Safir Posta tanıtım demosu',
    expectedOutcome: 'Pilot kurulum kararı', managementAttendance: true, ...over,
});

describe('yetki ve akış', () => {
    it('PY/BS planlar, yönetim onaylar', () => {
        expect(canPlanMeeting({ role: 'py', personId: 'pm1' })).toBe(true);
        expect(canPlanMeeting({ role: 'bolum_sorumlu', personId: 'bs1' })).toBe(true);
        expect(canPlanMeeting({ role: 'mudur' })).toBe(false);
        expect(canReviewMeeting({ role: 'mudur' })).toBe(true);
        expect(canReviewMeeting({ role: 'py', personId: 'pm1' })).toBe(false);
    });

    it('oluştur → onay → sonuç; onaylı görüşme değişirse yeniden onaya düşer', () => {
        const w = ws();
        const m = createMeeting(w, draft(), true, NOW);
        expect(m).toMatchObject({ title: 'Safir Posta tanıtım demosu', status: 'pending', departmentCode: 'U310', createdByName: 'Ayşe Yılmaz' });
        const approved = reviewMeeting({ ...w, currentRole: 'mudur', currentPersonId: undefined }, m, true, 'Katılacağım', NOW);
        expect(approved).toMatchObject({ status: 'approved', reviewNote: 'Katılacağım', reviewedByName: 'Müdür' });
        expect(updateMeeting(approved, draft({ date: '2026-10-10T10:00' }), false, NOW).status).toBe('pending');
        expect(updateMeeting(createMeeting(w, draft(), false, NOW), draft(), false, NOW).status).toBe('draft');
        expect(canEditMeeting(approved, { role: 'py', personId: 'pm1' })).toBe(true);
        expect(canEditMeeting(approved, { role: 'py', personId: 'pm2' })).toBe(false);
        expect(awaitingOutcome(approved, new Date(2026, 9, 12))).toBe(true);
        const held = markHeld(approved, 'On-prem 50 kişilik pilot kurulum kararlaştırıldı', NOW);
        expect(held.status).toBe('held');
        expect(canEditMeeting(held, { role: 'py', personId: 'pm1' })).toBe(false);
    });
});

describe('görünürlük ve süzme', () => {
    const w = ws();
    const mk = (id: string, over: Partial<CustomerMeeting>): CustomerMeeting => ({ ...createMeeting(w, draft(), true, NOW), id, ...over });
    const list = [
        mk('own-draft', { status: 'draft' }),
        mk('pm2-b', { projectId: 'b', createdByPersonId: 'pm2', departmentCode: 'U320', date: '2026-10-20T10:00' }),
        mk('bs-dept', { projectId: undefined, createdByRole: 'bolum_sorumlu', createdByPersonId: 'bs1', departmentCode: 'U310', date: '2026-10-08T10:00', status: 'approved' }),
        mk('held', { status: 'held', date: '2026-10-05T14:00', decisions: 'Pilot kararı' }),
        mk('old', { status: 'approved', date: '2026-10-01T10:00' }),
    ];
    const v = { ...w, customerMeetings: list };

    it('taslak yalnız sahibine; yönetim tümünü görür', () => {
        expect(visibleMeetings(v, { role: 'mudur' }).map(m => m.id)).toEqual(['pm2-b', 'bs-dept', 'held', 'old']);
        expect(visibleMeetings(v, { role: 'py', personId: 'pm1' }).map(m => m.id)).toEqual(['own-draft', 'held', 'old']);
        expect(visibleMeetings(v, { role: 'bolum_sorumlu', personId: 'bs1' }).map(m => m.id)).toEqual(['bs-dept', 'held', 'old']);
    });

    it('yaklaşan (sonucu bekleyen dahil), onay bekleyen ve geçmiş', () => {
        expect(filterMeetings(list, 'upcoming', NOW).map(m => m.id)).toEqual(['old', 'bs-dept', 'own-draft', 'pm2-b']);
        expect(filterMeetings(list, 'pending', NOW).map(m => m.id)).toEqual(['pm2-b']);
        expect(filterMeetings(list, 'past', NOW).map(m => m.id)).toEqual(['held']);
    });

    it('haftalık rapora kaynak: o hafta gerçekleşen ve gelecek hafta planlanan', () => {
        const held = meetingsHeldInWeek(list, 'a', 2026, 41);
        expect(held.map(m => m.id)).toEqual(['held']);
        const details = meetingToDetails(held[0]);
        expect(details).toMatchObject({ date: '2026-10-05', place: 'BİLGEM', decisions: 'Pilot kararı' });
        expect(meetingSentence(details)).toContain("BİLGEM'de Safir Posta tanıtım demosu yapıldı");
        expect(meetingsPlannedInWeek(list, 'b', 2026, 43).map(m => m.id)).toEqual(['pm2-b']);
    });
});
