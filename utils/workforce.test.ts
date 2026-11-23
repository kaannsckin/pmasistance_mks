import { describe, expect, it } from 'vitest';
import { Person, Project, TitleDef } from '../types';
import { createProject } from './workspace';
import { applyIssueWorklogs, buildWorkforce, hourlyRate, hoursByMonth, matchWorklogPerson, needsWorklogRefresh, pendingWorklogKeys } from './workforce';

const person = (id: string, first: string, last: string, extra: Partial<Person> = {}): Person =>
    ({ id, firstName: first, lastName: last, departmentCode: 'U310', availableAA: 1, roles: [], ...extra });

const ayse = person('p1', 'Ayşe', 'Kaya', { titleCode: 'ARŞ', email: 'ayse.kaya@kurum.gov.tr' });
const mehmet = person('p2', 'Mehmet', 'Demir', { titleCode: 'UZM' }); // ünvan maliyeti yok
const titles: TitleDef[] = [{ code: 'ARŞ', name: 'Araştırmacı', monthlyCost: 164_000 }, { code: 'UZM', name: 'Uzman' }];
const ws = { people: [ayse, mehmet], titles };

const project = (): Project => createProject('ATLAS', {
    tasks: [
        {
            id: 't1', name: 'Giriş ekranı', jiraId: 'ATL-1', actualHours: 7, status: 'Yapılacak',
            jiraWorklog: {
                at: '2026-11-01T00:00:00Z', forHours: 7,
                entries: [
                    { author: 'Ayşe Kaya (BILGEM)', date: '2026-10-06', hours: 4 },
                    { author: 'mehmet.demir', email: 'x@y', date: '2026-10-07', hours: 2 },
                    { author: 'Dış Danışman', date: '2026-11-03', hours: 1 },
                ],
            },
        },
        {
            id: 't2', name: 'Arama servisi', jiraId: 'ATL-2', actualHours: 3, status: 'Yapılacak',
            jiraWorklog: { at: '2026-11-01T00:00:00Z', forHours: 3, entries: [{ author: 'A. Kaya', email: 'Ayse.Kaya@kurum.gov.tr', date: '2026-11-04', hours: 3 }] },
        },
        { id: 't3', name: 'Yeni kayıt', jiraId: 'ATL-3', actualHours: 5, status: 'Yapılacak' },
        { id: 't4', name: 'Jira dışı', status: 'Yapılacak' },
    ] as unknown as Project['tasks'],
});

describe('iş güçleri', () => {
    it('kişi eşleştirme: önce e-posta, sonra parantezsiz ad soyad', () => {
        expect(matchWorklogPerson(ws.people, 'Başka Ad', 'AYSE.KAYA@kurum.gov.tr')?.id).toBe('p1');
        expect(matchWorklogPerson(ws.people, 'ayşe  kaya (BILGEM)')?.id).toBe('p1');
        expect(matchWorklogPerson(ws.people, 'Bilinmeyen')).toBeUndefined();
    });

    it('saatlik maliyet ayın iş gününe göre (Ekim 2026: 20,5 gün)', () => {
        expect(hourlyRate(ayse, titles, '2026-10-06')).toBeCloseTo(164_000 / (20.5 * 8), 6);
        expect(hourlyRate(mehmet, titles, '2026-10-06')).toBeNull();
        expect(hourlyRate(undefined, titles, '2026-10-06')).toBeNull();
    });

    it('kişi ve kayıt kırılımı, maliyetlenemeyen saat ve havuzda olmayan kullanıcı', () => {
        const r = buildWorkforce(ws, [project()]);
        expect(r.totalHours).toBe(10);
        const rateOct = 164_000 / (20.5 * 8), rateNov = 164_000 / (21 * 8);
        expect(r.totalCost).toBe(Math.round(4 * rateOct + 3 * rateNov));
        expect(r.uncostedHours).toBe(3); // havuzda eşleşmeyen mehmet.demir 2 + Dış Danışman 1
        // Havuzda eşleşen ama ünvanına maliyet girilmemiş kişinin saati de maliyetlenemez
        const named = { ...project(), tasks: [{ ...project().tasks[0], jiraWorklog: { at: '', forHours: 7, entries: [{ author: 'Mehmet Demir', date: '2026-10-07', hours: 2 }] } }] };
        const m = buildWorkforce(ws, [named]);
        expect(m.people[0].person?.id).toBe('p2');
        expect([m.uncostedHours, m.totalCost, m.unmatchedAuthors]).toEqual([2, 0, []]);
        expect(r.people.map(p => [p.name, p.hours, p.records])).toEqual([['Ayşe Kaya', 7, 2], ['mehmet.demir', 2, 1], ['Dış Danışman', 1, 1]]);
        expect(r.unmatchedAuthors).toEqual(['Dış Danışman', 'mehmet.demir']);
        const atl1 = r.records.find(x => x.issueKey === 'ATL-1')!;
        expect(atl1.people.map(p => [p.name, p.hours])).toEqual([['Ayşe Kaya', 4], ['mehmet.demir', 2], ['Dış Danışman', 1]]);
        expect(atl1.people[1].cost).toBeNull();
        expect(r.syncedTasks).toBe(2);
        expect(r.pendingTasks).toBe(1); // ATL-3: harcanan süresi var, worklog'u çekilmemiş
    });

    it('tarih ve metin süzgeci (kişi adı, anahtar, özet)', () => {
        expect(buildWorkforce(ws, [project()], { from: '2026-11-01', to: '2026-11-30' }).totalHours).toBe(4);
        expect(buildWorkforce(ws, [project()], { query: 'ayşe' }).people.map(p => p.name)).toEqual(['Ayşe Kaya']);
        expect(buildWorkforce(ws, [project()], { query: 'atl-2' }).records.map(x => x.issueKey)).toEqual(['ATL-2']);
        expect(buildWorkforce(ws, [project()], { query: 'arama' }).totalHours).toBe(3);
    });

    it('aylık kırılım', () => {
        const r = buildWorkforce(ws, [project()]);
        expect(hoursByMonth(r.people[0].entries)).toEqual([{ month: '2026-10', hours: 4 }, { month: '2026-11', hours: 3 }]);
    });
});

describe('worklog yenileme', () => {
    it('harcanan süre değişince ya da hiç çekilmemişse yenilenir', () => {
        expect(needsWorklogRefresh({ jiraId: 'A-1', actualHours: 5 })).toBe(true);
        expect(needsWorklogRefresh({ jiraId: 'A-1', actualHours: 5, jiraWorklog: { at: '', forHours: 5, entries: [] } })).toBe(false);
        expect(needsWorklogRefresh({ jiraId: 'A-1', actualHours: 6, jiraWorklog: { at: '', forHours: 5, entries: [] } })).toBe(true);
        expect(needsWorklogRefresh({ jiraId: 'A-1' })).toBe(false); // harcanan süre yok, hiç çekilmemiş
        expect(needsWorklogRefresh({ jiraId: 'A-1', jiraWorklog: { at: '', forHours: 2, entries: [] } })).toBe(true); // Jira'da silinmiş
        expect(needsWorklogRefresh({ jiraId: '', actualHours: 5 })).toBe(false);
    });

    it('bekleyen anahtarlar sınırlı; force tüm bağlı kayıtları ister', () => {
        expect(pendingWorklogKeys([project()], 10)).toEqual(['ATL-3']);
        expect(pendingWorklogKeys([project()], 2, true)).toEqual(['ATL-1', 'ATL-2']);
    });

    it('çekilen worklog görevlere yazılır; boş sonuç da yazılır, bulunamayan dokunulmaz', () => {
        const p = project();
        const now = new Date('2026-11-20T08:00:00Z');
        const out = applyIssueWorklogs(p, ['ATL-3', 'atl-1', 'ATL-9'], [{ issueKey: 'ATL-3', date: '2026-11-18', author: 'Ayşe Kaya', authorEmail: 'ayse.kaya@kurum.gov.tr', hours: 5 }], ['ATL-1'], now);
        const t3 = out.tasks.find(t => t.id === 't3')!;
        expect(t3.jiraWorklog).toEqual({ at: now.toISOString(), forHours: 5, entries: [{ author: 'Ayşe Kaya', email: 'ayse.kaya@kurum.gov.tr', date: '2026-11-18', hours: 5 }] });
        expect(out.tasks.find(t => t.id === 't1')).toBe(p.tasks[0]); // bulunamadı → aynı nesne
        expect(needsWorklogRefresh(t3)).toBe(false);
        expect(applyIssueWorklogs(p, ['ATL-9'], [], [])).toBe(p); // projede olmayan anahtar
    });
});
