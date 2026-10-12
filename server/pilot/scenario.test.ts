import { describe, expect, it } from 'vitest';
import { buildRoleAnalysis, summarizeGaps } from '../../utils/roleAnalysis';
import { addScenario, createState, createWorld, DayEvents, runUntil, SCENARIO_LEAVE, SimState } from './sim';
import type { WorkspaceData } from '../../types';

const START = '2026-06-01';

/** Ajanlı dönem Temmuz'da; senaryolar Temmuz–Ağustos'a eklenir */
const base = (): { state: SimState; ws: WorkspaceData } => {
    const state = createState(2026, START, '2026-07-01');
    const ws = runUntil(state, createWorld(2026, START), '2026-06-30', undefined, { importAll: true });
    return { state, ws };
};

const hoursOf = (state: SimState, key: string, personId: string, from: string, to: string) =>
    state.jira[key].issues.flatMap(x => x.logs).filter(([d, , p]) => p === personId && d >= from && d <= to).reduce((s, [, h]) => s + h, 0);

describe('pilot senaryoları', () => {
    it('kritik hata: o gün Highest yeni Jira kaydı açılır, ilgili kayda bağlanır, olaylarda görünür', () => {
        const { state, ws } = base();
        const next = addScenario(state, ws, { id: 's1', tur: 'kritik-hata', proje: 'NHR', tarih: '2026-07-16', baslik: 'Toplu yüklemede veri kaybı (müşteri ortamı)', bagli: 'NHR-3', hazirlikGun: 5, atanan: 'p19' });
        const events: DayEvents[] = [];
        runUntil(state, next, '2026-07-17', e => events.push(e));
        const issue = state.jira.NHR.issues.find(x => x.rec.summary.startsWith('Toplu yüklemede veri kaybı'))!;
        expect(issue.rec.priority).toBe('Highest');
        expect(issue.rec.created!.slice(0, 10)).toBe('2026-07-16');
        expect(issue.rec.description).toContain('NHR-3');
        expect(issue.assigneeId).toBe('p19');
        expect(events.find(e => e.gun === '2026-07-16')!.projeler.NHR.yeni.some(y => y.oncelik === 'Highest' && y.ozet.startsWith('Toplu'))).toBe(true);
    });

    it('izin: kişi aralıkta worklog girmez, uygulamaya aylık izin kaydı hemen yazılır, başlangıç ve dönüş olaylarda görünür', () => {
        const { state, ws } = base();
        const next = addScenario(state, ws, { id: 's3', tur: 'izin', kisi: 'p04', baslangic: '2026-07-13', bitis: '2026-07-24' });
        const leaves = next.leaves!.filter(l => l.id.startsWith(SCENARIO_LEAVE));
        expect(leaves).toEqual([expect.objectContaining({ personId: 'p04', year: 2026, month: 7, aa: expect.any(Number) })]);
        expect(leaves[0].aa).toBeGreaterThan(0.4);
        const events: DayEvents[] = [];
        runUntil(state, next, '2026-07-31', e => events.push(e));
        expect(hoursOf(state, 'ATL', 'p04', '2026-07-13', '2026-07-24')).toBe(0);
        expect(hoursOf(state, 'ATL', 'p04', '2026-07-01', '2026-07-10')).toBeGreaterThan(20);
        expect(hoursOf(state, 'ATL', 'p04', '2026-07-27', '2026-07-31')).toBeGreaterThan(5);
        expect(events.find(e => e.gun === '2026-07-13')!.genel.join(' ')).toContain('İzin başladı: Onur Çelik');
        expect(events.find(e => e.gun === '2026-07-25')!.genel.join(' ')).toContain('İzinden döndü: Onur Çelik');
    });

    it('fazla mesai: projenin saati artar ama iş daha hızlı kapanmaz (yeniden çalışma); ay kapanışında gerçekleşen plana göre yükselir', () => {
        const run = (withOvertime: boolean) => {
            const { state, ws } = base();
            const next = withOvertime ? addScenario(state, ws, { id: 's6', tur: 'fazla-mesai', proje: 'NHR', baslangic: '2026-07-01', bitis: '2026-07-31', carpan: 1.5 }) : ws;
            const out = runUntil(state, next, '2026-08-01');
            const closed = state.jira.NHR.issues.filter(x => x.rec.statusCategory === 'done').length;
            const row = out.allocations.find(a => a.personId === 'p19' && a.projectId === 'prj-nehir')!;
            return { closed, actual: row.actual[7], plan: row.plan[7] };
        };
        const normal = run(false), overtime = run(true);
        expect(overtime.actual).toBeGreaterThan(normal.actual * 1.3);
        expect(overtime.actual).toBeGreaterThan(overtime.plan * 1.2);
        expect(overtime.closed).toBeLessThanOrEqual(normal.closed + 2);
    });

    it('teklif kazanıldı: proje Devam olur, bölümün en boş kişilerine plan yazılır, kapasite açığı büyür', () => {
        const { state, ws } = base();
        const gap = (w: WorkspaceData) => summarizeGaps(buildRoleAnalysis(w.allocations, w.people, w.projects, 2026, w.leaves)).totalGapAA;
        const next = addScenario(state, ws, { id: 's8', tur: 'teklif-kazanildi', proje: 'YLD', tarih: '2026-07-15', baslangic: '2026-11-01', ihtiyac: [{ bolum: 'U320', kisi: 2, aa: 1 }] });
        const events: DayEvents[] = [];
        const out = runUntil(state, next, '2026-07-16', e => events.push(e));
        const yld = out.projects.find(p => p.id === 'prj-yildiz')!;
        expect(yld.status).toBe('devam');
        expect(yld.settings.projectStartDate).toBe('2026-11-01');
        const rows = out.allocations.filter(a => a.projectId === 'prj-yildiz' && a.plan[11] === 1);
        expect(rows).toHaveLength(2);
        expect(gap(out)).toBeGreaterThan(gap(ws));
        expect(events.find(e => e.gun === '2026-07-15')!.genel.join(' ')).toContain('teklif kabul edildi');
    });

    it('geçmişe etki eden ya da hatalı senaryo reddedilir', () => {
        const { state, ws } = base();
        expect(() => addScenario(state, ws, { id: 'x', tur: 'izin', kisi: 'p04', baslangic: '2026-06-20', bitis: '2026-07-05' })).toThrow(/geçmiş/);
        expect(() => addScenario(state, ws, { id: 'x', tur: 'kritik-hata', proje: 'NHR', tarih: '2026-07-18', baslik: 'x' })).toThrow(/iş günü değil/);
        expect(() => addScenario(state, ws, { id: 'x', tur: 'fazla-mesai', proje: 'NHR', baslangic: '2026-07-01', bitis: '2026-07-10', carpan: 3 })).toThrow(/çarpanı/);
        expect(() => addScenario(state, ws, { id: 'x', tur: 'teklif-kazanildi', proje: 'ATL', tarih: '2026-07-15', baslangic: '2026-11-01', ihtiyac: [{ bolum: 'U320', kisi: 1, aa: 1 }] })).toThrow(/teklif aşamasında değil/);
        expect(state.senaryolar).toEqual([]);
    });
});
