import { describe, expect, it } from 'vitest';
import { ManagementExpectation, TaskStatus, WorkspaceData } from '../types';
import {
    canEditExpectation, canRaiseExpectation, canRespondExpectation, createExpectation, daysUntilNeed, filterExpectations,
    resolveLink, respondExpectation, safeUrl, setExpectationStatus, sortExpectations, urgencyCounts, visibleExpectations, waitingDays, waitingLabel,
} from './expectations';
import { createEmptyWorkspace, createProject } from './workspace';

const NOW = new Date(2026, 9, 6, 12); // 6 Ekim 2026

const buildWs = (): WorkspaceData => {
    const a = createProject('Alfa'); a.id = 'a'; a.pmPersonId = 'pm1';
    a.tasks = [{ id: 't1', name: 'Kimlik servisi', availability: true, priority: 'High', version: 1, predecessor: null, unit: '', resourceName: '', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo }];
    a.risks = [{ id: 'r1', title: 'Tedarikçi gecikmesi', probability: 4, impact: 5, status: 'open', createdAt: '' }];
    const b = createProject('Beta'); b.id = 'b'; b.pmPersonId = 'pm2';
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

const exp = (id: string, extra: Partial<ManagementExpectation>): ManagementExpectation => ({
    id, title: id, category: 'budget', urgency: 'normal', status: 'open',
    createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', createdByRole: 'py', createdByPersonId: 'pm1', ...extra,
});

describe('yetkiler', () => {
    it('PM ve bölüm sorumlusu açar (kişi seçiliyse); yönetim yanıtlar', () => {
        expect(canRaiseExpectation({ role: 'py', personId: 'pm1' })).toBe(true);
        expect(canRaiseExpectation({ role: 'bolum_sorumlu', personId: 'bs1' })).toBe(true);
        expect(canRaiseExpectation({ role: 'py' })).toBe(false);
        expect(canRaiseExpectation({ role: 'mudur' })).toBe(false);
        expect(canRespondExpectation({ role: 'mudur' })).toBe(true);
        expect(canRespondExpectation({ role: 'pyb_sorumlu' })).toBe(true);
        expect(canRespondExpectation({ role: 'py', personId: 'pm1' })).toBe(false);
    });

    it('yalnız sahibi ve yalnız aktifken düzenler', () => {
        const e = exp('e', {});
        expect(canEditExpectation(e, { role: 'py', personId: 'pm1' })).toBe(true);
        expect(canEditExpectation(e, { role: 'py', personId: 'pm2' })).toBe(false);
        expect(canEditExpectation(e, { role: 'bolum_sorumlu', personId: 'pm1' })).toBe(false);
        expect(canEditExpectation({ ...e, status: 'resolved' }, { role: 'py', personId: 'pm1' })).toBe(false);
    });
});

describe('oluşturma ve yanıt', () => {
    it('aktif kimlikle oluşturur; bölüm kodu ve ad sabitlenir; boş alanlar atılır', () => {
        const e = createExpectation(buildWs(), { title: '  Ek bütçe onayı ', description: ' ', category: 'budget', urgency: 'critical', projectId: 'a', links: [] }, NOW);
        expect(e).toMatchObject({ title: 'Ek bütçe onayı', status: 'open', createdByRole: 'py', createdByPersonId: 'pm1', createdByName: 'Ayşe Yılmaz', departmentCode: 'U310', projectId: 'a' });
        expect(e.description).toBeUndefined();
        expect(e.links).toBeUndefined();
    });

    it('yanıt durum, metin ve yanıtlayanı yazar; boş yanıt öncekini korur', () => {
        const ws = { ...buildWs(), currentRole: 'mudur' as const, currentPersonId: undefined };
        const r = respondExpectation(ws, exp('e', { response: 'önceki' }), 'acknowledged', '  ', NOW);
        expect(r).toMatchObject({ status: 'acknowledged', response: 'önceki', respondedByRole: 'mudur' });
        expect(respondExpectation(ws, r, 'resolved', 'Onaylandı', NOW).response).toBe('Onaylandı');
        expect(setExpectationStatus(r, 'withdrawn', NOW).status).toBe('withdrawn');
    });
});

describe('görünürlük', () => {
    const ws = {
        ...buildWs(),
        expectations: [
            exp('pm1-a', { projectId: 'a', departmentCode: 'U310' }),
            exp('pm2-b', { projectId: 'b', createdByPersonId: 'pm2', departmentCode: 'U320' }),
            exp('bs-a', { projectId: 'a', createdByRole: 'bolum_sorumlu', createdByPersonId: 'bs1', departmentCode: 'U310' }),
            exp('bs-genel', { createdByRole: 'bolum_sorumlu', createdByPersonId: 'bs1', departmentCode: 'U310' }),
        ],
    };
    const ids = (role: WorkspaceData['currentRole'], personId?: string) => visibleExpectations(ws, { role: role!, personId }).map(e => e.id);

    it('yönetim ve PYB hepsini görür', () => {
        expect(ids('mudur')).toHaveLength(4);
        expect(ids('pyb_destek')).toHaveLength(4);
    });
    it('PM kendi açtığını ve kendi projesine açılanı görür', () => {
        expect(ids('py', 'pm1')).toEqual(['pm1-a', 'bs-a']);
        expect(ids('py', 'pm2')).toEqual(['pm2-b']);
    });
    it('bölüm sorumlusu kendi bölümününkileri görür', () => {
        expect(ids('bolum_sorumlu', 'bs1')).toEqual(['pm1-a', 'bs-a', 'bs-genel']);
    });
});

describe('sayım, sıralama ve süzme', () => {
    const list = [
        exp('normal-eski', { urgency: 'normal', createdAt: '2026-09-01T00:00:00.000Z' }),
        exp('kritik-terminsiz', { urgency: 'critical', status: 'acknowledged' }),
        exp('kritik-gecikmis', { urgency: 'critical', needBy: '2026-10-02' }),
        exp('onemli', { urgency: 'important', needBy: '2026-10-20', category: 'schedule', projectId: 'a' }),
        exp('kapandi', { urgency: 'critical', status: 'resolved', updatedAt: '2026-10-05T00:00:00.000Z' }),
        exp('geri', { urgency: 'normal', status: 'withdrawn', updatedAt: '2026-10-03T00:00:00.000Z' }),
    ];

    it('aktifleri aciliyete göre sayar; yanıtsızları ayrıca', () => {
        expect(urgencyCounts(list)).toEqual({ critical: 2, important: 1, normal: 1, total: 4, unanswered: 3 });
    });

    it('aciliyet → gecikmiş termin → termin → bekleme; kapananlar sonda', () => {
        expect(sortExpectations(list, NOW).map(e => e.id)).toEqual(['kritik-gecikmis', 'kritik-terminsiz', 'onemli', 'normal-eski', 'kapandi', 'geri']);
    });

    it('süzgeçler', () => {
        expect(filterExpectations(list, {}).map(e => e.id)).not.toContain('kapandi');
        expect(filterExpectations(list, { scope: 'closed' }).map(e => e.id)).toEqual(['kapandi', 'geri']);
        expect(filterExpectations(list, { urgency: 'critical', scope: 'all' })).toHaveLength(3);
        expect(filterExpectations(list, { category: 'schedule' }).map(e => e.id)).toEqual(['onemli']);
        expect(filterExpectations(list, { query: 'alfa' }, id => (id === 'a' ? 'Alfa' : undefined)).map(e => e.id)).toEqual(['onemli']);
    });

    it('termin ve bekleme günleri', () => {
        expect(daysUntilNeed({ needBy: '2026-10-02' }, NOW)).toBe(-4);
        expect(daysUntilNeed({}, NOW)).toBeNull();
        expect(waitingDays({ createdAt: '2026-10-01T09:00:00.000Z' }, NOW)).toBe(5);
        expect(waitingLabel({ createdAt: '2026-10-01T09:00:00.000Z' }, NOW)).toBe('5 gündür bekliyor');
        expect(waitingLabel({ createdAt: NOW.toISOString() }, NOW)).toBe('bugün açıldı');
    });
});

describe('eklentiler', () => {
    it('görev/risk kaydını bulur; silinmişse missing', () => {
        const ws = buildWs();
        expect(resolveLink(ws, { kind: 'task', projectId: 'a', refId: 't1', label: 'x' }).task?.name).toBe('Kimlik servisi');
        expect(resolveLink(ws, { kind: 'risk', projectId: 'a', refId: 'r1', label: 'x' }).risk?.title).toBe('Tedarikçi gecikmesi');
        expect(resolveLink(ws, { kind: 'task', projectId: 'a', refId: 'yok', label: 'x' }).missing).toBe(true);
    });

    it('bağlantı yalnız http(s)', () => {
        expect(safeUrl('intranet.tubitak.gov.tr/belge')).toBe('https://intranet.tubitak.gov.tr/belge');
        expect(safeUrl('http://ornek.com')).toBe('http://ornek.com/');
        expect(safeUrl('javascript:alert(1)')).toBeNull();
        expect(safeUrl('  ')).toBeNull();
    });
});
