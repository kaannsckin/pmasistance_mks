import { describe, expect, it } from 'vitest';
import { Risk, WorkspaceData } from '../types';
import { cellKey, filterRisks, groupByProject, matrixCounts, projectSummarySheet, reportRisks, riskKpis, riskReportSheet } from './riskReport';
import { createEmptyWorkspace, createProject } from './workspace';

const risk = (id: string, p: number, i: number, extra: Partial<Risk> = {}): Risk => ({
    id, title: id, probability: p as Risk['probability'], impact: i as Risk['impact'], status: 'open', createdAt: '', ...extra,
});

const buildWs = (): WorkspaceData => {
    const a = createProject('Alfa'); a.id = 'a'; a.code = 'P-1';
    a.risks = [
        risk('a-yuksek', 5, 4, { ownerPersonId: 'ay', mitigation: 'Yedek tedarikçi' }),
        risk('a-orta', 3, 3, { status: 'monitoring' }),
        risk('a-kapali', 5, 5, { status: 'closed' }),
    ];
    const b = createProject('Beta'); b.id = 'b';
    b.risks = [risk('b-yuksek', 4, 4, { owner: 'Dış Danışman' }), risk('b-yuksek2', 5, 3), risk('b-dusuk', 1, 2, { description: 'lisans yenileme' })];
    const c = createProject('Gama'); c.id = 'c';
    c.risks = [risk('c-orta', 2, 4)];
    const d = createProject('Riskisiz'); d.id = 'd';
    return { ...createEmptyWorkspace(), projects: [a, b, c, d], people: [{ id: 'ay', firstName: 'Ayşe', lastName: 'Yılmaz', departmentCode: 'U310', availableAA: 1, roles: [] }] };
};

describe('reportRisks', () => {
    it('aktifler önce, skor azalan; sahip adı havuzdan ya da serbest metinden', () => {
        const rows = reportRisks(buildWs());
        expect(rows.map(r => r.id)).toEqual(['a-yuksek', 'b-yuksek', 'b-yuksek2', 'a-orta', 'c-orta', 'b-dusuk', 'a-kapali']);
        expect(rows[0].ownerName).toBe('Ayşe Yılmaz');
        expect(rows[1].ownerName).toBe('Dış Danışman');
        expect(rows[0]).toMatchObject({ projectName: 'Alfa', projectCode: 'P-1', score: 20, band: 'high' });
    });

    it('kapsam verilirse yalnız o projeler', () => {
        expect(reportRisks(buildWs(), new Set(['c'])).map(r => r.id)).toEqual(['c-orta']);
    });
});

describe('matris ve göstergeler', () => {
    const rows = reportRisks(buildWs());

    it('matris yalnız aktif riskleri sayar', () => {
        const m = matrixCounts(rows);
        expect(m[cellKey(5, 4)]).toBe(1);
        expect(m[cellKey(5, 5)]).toBeUndefined(); // kapalı
        expect(Object.values(m).reduce((s, n) => s + n, 0)).toBe(6);
    });

    it('göstergeler: yüksek risk, projeler, aksiyonsuz ve sahipsiz', () => {
        expect(riskKpis(rows)).toEqual({
            active: 6, high: 3, medium: 2, low: 1, monitoring: 1, closed: 1,
            highProjects: 2, highWithoutAction: 2, withoutOwner: 4,
        });
    });
});

describe('groupByProject', () => {
    it('en riskli proje başta; kapanan ayrı sayılır; aktif riski olmayan sona', () => {
        const groups = groupByProject(reportRisks(buildWs()));
        expect(groups.map(g => g.projectId)).toEqual(['a', 'b', 'c']); // a: 20, b: 16, c: 8
        expect(groups[0]).toMatchObject({ high: 1, medium: 1, low: 0, maxScore: 20, closed: 1 });
        expect(groups[1].risks.map(r => r.id)).toEqual(['b-yuksek', 'b-yuksek2', 'b-dusuk']);
    });
});

describe('filterRisks', () => {
    const rows = reportRisks(buildWs());

    it('varsayılan aktif; bant, durum, hücre ve arama', () => {
        expect(filterRisks(rows, {})).toHaveLength(6);
        expect(filterRisks(rows, { status: 'all' })).toHaveLength(7);
        expect(filterRisks(rows, { status: 'closed' }).map(r => r.id)).toEqual(['a-kapali']);
        expect(filterRisks(rows, { band: 'high' }).map(r => r.id)).toEqual(['a-yuksek', 'b-yuksek', 'b-yuksek2']);
        expect(filterRisks(rows, { cell: cellKey(4, 4) }).map(r => r.id)).toEqual(['b-yuksek']);
        expect(filterRisks(rows, { query: 'LİSANS' }).map(r => r.id)).toEqual(['b-dusuk']);
        expect(filterRisks(rows, { query: 'ayşe' }).map(r => r.id)).toEqual(['a-yuksek']);
        expect(filterRisks(rows, { query: 'p-1' }).map(r => r.projectId)).toEqual(['a', 'a']);
    });
});

describe('Excel sayfaları', () => {
    it('başlık + satırlar', () => {
        const rows = reportRisks(buildWs());
        const sheet = riskReportSheet(rows);
        expect(sheet).toHaveLength(8);
        expect(sheet[1]).toEqual(['Alfa', 'P-1', 'a-yuksek', '', 5, 4, 20, 'Yüksek', 'Ayşe Yılmaz', 'Yedek tedarikçi', 'Açık']);
        expect(projectSummarySheet(groupByProject(rows))[1]).toEqual(['Alfa', 'P-1', 1, 1, 0, 20, 'a-yuksek', 1]);
    });
});
