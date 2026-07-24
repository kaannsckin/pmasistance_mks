import { describe, it, expect } from 'vitest';
import {
    applyBilledHoursActuals,
    parseBilledHoursPivot,
    suggestBilledHoursActuals,
    TR_WORKDAYS_2026,
} from './billedHours';
import { createEmptyWorkspace, createProject } from './workspace';
import { Person, WorkspaceData } from '../types';

const person = (id: string, first: string, last: string): Person => ({
    id, firstName: first, lastName: last, departmentCode: 'U310', availableAA: 1, roles: [],
});

// Sayfa1 tipi pivot (Ocak-Şubat-Mart). Proje adı yalnızca grubun ilk satırında.
const PIVOT: unknown[][] = [
    ['Toplam Billed Hours', null, null, 'Period'],
    ['Project Name', 'Full name', 'Issue summary', 'Ocak', 'Şubat', 'Mart', 'Genel Toplam'],
    ['MEB Posta Sistemi - 100654', 'Kadir KORKMAZ', null, 172, 152, 160.5, 484.5],
    [null, 'Fatma AKARSU (BILGEM)', null, 92, 96, 100, 288],
    [null, 'Zerda GÜL', null, 27, 135, 144, 306],
    ['Toplam MEB Posta Sistemi - 100654', null, null, 291, 383, 404.5, 1078.5],
    ['T.Mesajlaşma - T100341', 'Kadir KORKMAZ', null, null, 8, 12, 20],
    ['Toplam T.Mesajlaşma - T100341', null, null, null, 8, 12, 20],
    ['Genel Toplam', null, null, 291, 391, 416.5, 1098.5],
];

const buildWorkspace = (): WorkspaceData => {
    const ws = createEmptyWorkspace();
    // Adı pivottan farklı ama kodu eşleşen proje → kod eşleştirmesini test eder
    ws.projects = [
        createProject('E-Posta Platformu', { code: '100654' }),
        createProject('T.Mesajlaşma - T100341', { code: 'T100341' }),
    ];
    // Zerda GÜL bilerek havuzda yok → eşleşmeyen kişi
    ws.people = [person('p-kadir', 'Kadir', 'KORKMAZ'), person('p-fatma', 'Fatma', 'AKARSU')];
    return ws;
};

describe('parseBilledHoursPivot', () => {
    it('proje adını aşağı taşır, alt toplam/genel toplam satırlarını atlar', () => {
        const recs = parseBilledHoursPivot(PIVOT);
        // Kadir(MEB) 3 + Fatma(MEB) 3 + Zerda(MEB) 3 + Kadir(T.Mesaj) 2 = 11
        expect(recs).toHaveLength(11);
        const kadirMeb = recs.filter(r => r.personName === 'Kadir KORKMAZ' && r.projectName.startsWith('MEB'));
        expect(kadirMeb.map(r => r.hours)).toEqual([172, 152, 160.5]);
        // "Toplam …" ve "Genel Toplam" satırları kayıt üretmemeli
        expect(recs.some(r => /toplam/i.test(r.personName))).toBe(false);
    });

    it('yapıştırılan TSV metnini de ayrıştırır', () => {
        const tsv = PIVOT.map(r => r.map(c => (c == null ? '' : c)).join('\t')).join('\n');
        // parseBilledHoursText tsvToMatrix + parseBilledHoursPivot
        // (aynı sonucu vermeli)
        const recs = parseBilledHoursPivot(tsv.split('\n').map(l => l.split('\t')));
        expect(recs.length).toBe(11);
    });
});

describe('suggestBilledHoursActuals', () => {
    it('saati AA’ya çevirir (Saat ÷ 8 ÷ ayın iş günü)', () => {
        const ws = buildWorkspace();
        const recs = parseBilledHoursPivot(PIVOT);
        const res = suggestBilledHoursActuals(ws, recs, { year: 2026, hoursPerDay: 8 });

        const kadirMeb = res.rows.find(r => r.personId === 'p-kadir' && r.projectName === 'E-Posta Platformu');
        expect(kadirMeb).toBeDefined();
        // Ocak: 172/8/21 = 1.0238 → 1.02
        expect(kadirMeb!.months[1]).toBeCloseTo(1.02, 2);
        // Şubat: 152/8/20 = 0.95
        expect(kadirMeb!.months[2]).toBeCloseTo(0.95, 2);
        // Mart: 160.5/8/20.5 = 0.9787 → 0.98
        expect(kadirMeb!.months[3]).toBeCloseTo(0.98, 2);
    });

    it('projeyi koda göre, kişiyi (BILGEM) ekini yok sayarak eşler', () => {
        const ws = buildWorkspace();
        const res = suggestBilledHoursActuals(ws, parseBilledHoursPivot(PIVOT), { year: 2026 });
        // Kod 100654 → E-Posta Platformu; "Fatma AKARSU (BILGEM)" → Fatma AKARSU
        expect(res.rows.some(r => r.personId === 'p-fatma' && r.projectName === 'E-Posta Platformu')).toBe(true);
        // Zerda GÜL havuzda yok
        expect(res.unmatchedPeople).toContain('Zerda GÜL');
        expect(res.unmatchedProjects).toHaveLength(0);
        expect(res.matchedProjectCount).toBe(2);
    });

    it('workday takvimi TR_WORKDAYS_2026 ile tutarlı', () => {
        expect(TR_WORKDAYS_2026[3]).toBe(20.5);
        expect(TR_WORKDAYS_2026[5]).toBe(15.5);
    });
});

describe('applyBilledHoursActuals', () => {
    it('overwrite modu gerçekleşen (actual) hücrelerini yazar', () => {
        const ws = buildWorkspace();
        const res = suggestBilledHoursActuals(ws, parseBilledHoursPivot(PIVOT), { year: 2026 });
        const { workspace, summary } = applyBilledHoursActuals(ws, res, 'overwrite');

        expect(summary.rowsApplied).toBe(3); // Kadir×2 proje + Fatma×1
        const alloc = workspace.allocations.find(a => a.personId === 'p-kadir' && a.year === 2026 &&
            workspace.projects.find(p => p.id === a.projectId)?.code === '100654');
        expect(alloc).toBeDefined();
        expect(alloc!.actual[1]).toBeCloseTo(1.02, 2);
        expect(alloc!.plan[1] ?? 0).toBe(0); // plan'a dokunmaz
    });

    it('fill modu dolu gerçekleşen ayı korur, boşları doldurur', () => {
        const ws = buildWorkspace();
        // Kadir × E-Posta için Ocak gerçekleşen zaten dolu (elle girilmiş 0.5)
        const proj = ws.projects.find(p => p.code === '100654')!;
        ws.allocations = [{
            id: 'a1', personId: 'p-kadir', projectId: proj.id, year: 2026,
            plan: {}, actual: { 1: 0.5 },
        }];
        const res = suggestBilledHoursActuals(ws, parseBilledHoursPivot(PIVOT), { year: 2026 });
        const { workspace, summary } = applyBilledHoursActuals(ws, res, 'fill');

        const alloc = workspace.allocations.find(a => a.id === 'a1')!;
        expect(alloc.actual[1]).toBe(0.5); // korundu
        expect(alloc.actual[2]).toBeCloseTo(0.95, 2); // boş ay dolduruldu
        expect(summary.cellsSkipped).toBeGreaterThanOrEqual(1);
    });
});
