import { describe, expect, it } from 'vitest';
import { ReportCategory, ReportItem, WeeklyReport, WorkspaceData } from '../../types';
import { createReport, newItem } from '../weeklyReport';
import { createEmptyWorkspace, createProject } from '../workspace';
import { correctionPairs, EXAMPLE_BUDGET, EXAMPLE_PER_PROJECT, EXAMPLE_PER_REPORT, examplePriority, PRIORITY, selectStyleExamples, setReportExemplar } from './reportExamples';
import { buildVariantRequest } from './reportVariants';
import { CORRECTIONS_HEADER, EXAMPLES_HEADER } from './weeklyReportPrompt';

const py = { role: 'py' as const, personId: 'pm1' };

const rep = (id: string, o: { project: string; dept: string; week: number; items: [ReportCategory, string][]; patch?: Partial<WeeklyReport> }): WeeklyReport => ({
    ...createReport({ kind: 'project', projectId: o.project, departmentCode: o.dept, year: 2026, week: o.week }, py),
    id, stage: 'approved',
    thisWeek: o.items.map(([c, t]) => newItem(c, t)),
    nextWeek: [],
    ...o.patch,
});

const ws = (reports: WeeklyReport[], golden: string[] = []): WorkspaceData => {
    const mk = (id: string, pm: string) => { const p = createProject(id); p.id = id; p.pmPersonId = pm; return p; };
    return {
        ...createEmptyWorkspace(),
        projects: [mk('a', 'pm1'), mk('b', 'pm1'), mk('c', 'pm2'), mk('d', 'pm3')],
        weeklyReports: reports,
        reportGoldenSet: golden.map(reportId => ({ reportId, addedAt: '' })),
    };
};

const target = { id: 'now', year: 2026, week: 41, projectId: 'a', departmentCode: 'U310' };

describe('üslup örneği seçimi', () => {
    it('zaman ayrımı ve kendini dışlama', () => {
        const w = ws([
            rep('now', { project: 'a', dept: 'U310', week: 41, items: [['delivery', 'Kendisi']] }),
            rep('later', { project: 'a', dept: 'U310', week: 42, items: [['delivery', 'Gelecek hafta']] }),
            rep('same', { project: 'b', dept: 'U310', week: 41, items: [['delivery', 'Aynı hafta başka proje']] }),
            rep('past', { project: 'a', dept: 'U310', week: 40, items: [['delivery', 'Geçmiş teslimat']] }),
            rep('draft', { project: 'a', dept: 'U310', week: 39, items: [['delivery', 'Taslak']], patch: { stage: 'draft' } }),
        ]);
        const ex = selectStyleExamples({ ws: w, report: target, input: 'teslimat' });
        expect(ex.map(e => e.text)).toEqual(['Geçmiş teslimat']);
    });

    it('öncelik: altın set/örnek +3, aynı proje +2, aynı PY +1,5, aynı bölüm +1', () => {
        const w = ws([], ['g']);
        const r = (id: string, project: string, dept: string, patch: Partial<WeeklyReport> = {}) => rep(id, { project, dept, week: 40, items: [], patch });
        expect(examplePriority(w, target, r('x', 'a', 'U310'))).toBe(PRIORITY.project + PRIORITY.pm + PRIORITY.department);
        expect(examplePriority(w, target, r('x', 'b', 'U310'))).toBe(PRIORITY.pm + PRIORITY.department);
        expect(examplePriority(w, target, r('x', 'c', 'U320'))).toBe(0);
        expect(examplePriority(w, target, r('g', 'c', 'U320'))).toBe(PRIORITY.golden);
        expect(examplePriority(w, target, r('x', 'c', 'U320', { exemplar: true }))).toBe(PRIORITY.golden);
    });

    it('yeni PY için bile bölüm ve kurum örnekleri gelir; bölüm önce', () => {
        const w = ws([
            rep('inst', { project: 'd', dept: 'U320', week: 38, items: [['invoice', 'Kurum geneli fatura maddesi']] }),
            rep('dept', { project: 'c', dept: 'U310', week: 38, items: [['meeting', 'Bölümden toplantı maddesi']] }),
        ]);
        const newPm = { ...target, projectId: 'yeni' };
        const ex = selectStyleExamples({ ws: w, report: newPm, input: 'alakasız' });
        expect(ex.map(e => e.reportId)).toEqual(['dept', 'inst']);
    });

    it('çeşitlilik ve sınırlar: rapor başına 3, proje başına 4, türler önce', () => {
        const many: [ReportCategory, string][] = Array.from({ length: 6 }, (_, k) => ['ongoing', `Devam eden iş ${k}`]);
        const w = ws([
            rep('r1', { project: 'a', dept: 'U310', week: 40, items: [...many, ['invoice', 'Fatura kesildi']] }),
            rep('r2', { project: 'a', dept: 'U310', week: 39, items: many.map(([c, t]) => [c, `${t} b`]) }),
        ]);
        const ex = selectStyleExamples({ ws: w, report: target, input: 'devam' });
        const r1 = ex.filter(e => e.reportId === 'r1');
        expect(r1.length).toBeLessThanOrEqual(EXAMPLE_PER_REPORT);
        expect(r1.some(e => e.category === 'invoice')).toBe(true); // tür çeşitliliği
        expect(ex.filter(e => e.projectId === 'a').length).toBeLessThanOrEqual(EXAMPLE_PER_PROJECT);
    });

    it('bütçe aşılmaz', () => {
        const long: [ReportCategory, string][] = Array.from({ length: 3 }, (_, k) => ['ongoing', `${k} ${'uzun madde '.repeat(30)}`]);
        const w = ws(Array.from({ length: 6 }, (_, k) => rep(`r${k}`, { project: ['a', 'b', 'c', 'd'][k % 4], dept: 'U310', week: 30 + k, items: long.map(([c, t]) => [c, `${t}${k}`]) })));
        const ex = selectStyleExamples({ ws: w, report: target, input: 'uzun' });
        expect(ex.reduce((s, e) => s + e.text.length, 0)).toBeLessThanOrEqual(EXAMPLE_BUDGET);
        expect(ex.length).toBeGreaterThan(0);
    });
});

describe('düzeltme örnekleri', () => {
    const ai = (aiText: string, final: string): ReportItem => ({ ...newItem('ongoing', final, { source: 'ai' }), aiOriginal: { text: aiText, category: 'ongoing' } });
    it('belirgin farklı çiftler; önce aynı bölüm; en çok 3; geleceği görmez', () => {
        const w = ws([
            rep('o', { project: 'c', dept: 'U320', week: 39, items: [], patch: { thisWeek: [ai('Bazı çalışmalar yapıldı.', 'Kocaeli Valiliği için kabul testleri 7 Ekim 2026 tarihinde tamamlandı.')] } }),
            rep('d1', { project: 'b', dept: 'U310', week: 38, items: [], patch: { thisWeek: [ai('Geliştirmelere devam edildi.', 'Safir Posta arşiv modülü geliştirmesine devam edildi.'), ai('Aynı kaldı.', 'Aynı kaldı.')] } }),
            rep('d2', { project: 'b', dept: 'U310', week: 40, items: [], patch: { thisWeek: [ai('Toplantı yapıldı.', '6 Ekim 2026 tarihinde Gebze Belediyesi ile pilot toplantısı yapıldı.')] } }),
            rep('fut', { project: 'b', dept: 'U310', week: 43, items: [], patch: { thisWeek: [ai('Gelecek.', 'Gelecekte onaylanan çok farklı bir madde.')] } }),
        ]);
        const pairs = correctionPairs({ ws: w, report: target });
        expect(pairs.map(p => p.reportId)).toEqual(['d2', 'd1', 'o']);
        expect(pairs[0]).toMatchObject({ ai: 'Toplantı yapıldı.', sameDepartment: true });
        expect(correctionPairs({ ws: w, report: target, limit: 1 })).toHaveLength(1);
    });

    it('istemde örnek ve düzeltme bölümleri; temel varyantta yok', () => {
        const w = ws([rep('p', { project: 'a', dept: 'U310', week: 40, items: [], patch: { thisWeek: [ai('Çalışıldı.', 'Pilot kurulum 6 Ekim 2026 tarihinde tamamlandı.')] } })]);
        const full = buildVariantRequest({ variant: 'full', ws: w, report: target, input: 'pilot' }).prompt;
        expect(full).toContain(EXAMPLES_HEADER);
        expect(full).toContain(`${CORRECTIONS_HEADER}\n- AI: Çalışıldı.\n  Onaylanan: Pilot kurulum 6 Ekim 2026 tarihinde tamamlandı.`);
        const base = buildVariantRequest({ variant: 'base', ws: w, report: target, input: 'pilot' }).prompt;
        expect(base).not.toContain(EXAMPLES_HEADER);
        expect(base).not.toContain(CORRECTIONS_HEADER);
    });
});

describe('örnek rapor işareti', () => {
    it('yalnız PYB destek, yalnız onaylı proje raporu; kaldırınca alan silinir', () => {
        const w = ws([rep('a1', { project: 'a', dept: 'U310', week: 40, items: [] }), rep('d1', { project: 'a', dept: 'U310', week: 40, items: [], patch: { stage: 'draft' } })]);
        expect(setReportExemplar(w, { role: 'py' }, 'a1', true)).toBeNull();
        expect(setReportExemplar(w, { role: 'pyb_destek' }, 'd1', true)).toBeNull();
        const on = setReportExemplar(w, { role: 'pyb_destek' }, 'a1', true)!;
        expect(on[0].exemplar).toBe(true);
        const off = setReportExemplar({ weeklyReports: on }, { role: 'pyb_destek' }, 'a1', false)!;
        expect('exemplar' in off[0]).toBe(false);
    });
});
