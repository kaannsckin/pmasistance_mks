import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { TaskStatus } from '../types';
import { applyGibImport, parseGibWorkbook, workbookToMatrices } from './gibFindings';
import { computePocScores, pocCategoryRows, pocDistribution } from './gibPoc';
import { createEmptyWorkspace } from './workspace';

/**
 * Kontrol değerleri (gereksinim analizi, Kasım 2026): gerçek takip Excel'i
 * (GIB_PoC_Bulgu_Takip_lv.xlsx) ile. Dosya depoda değil; yolu verilince çalışır:
 *
 *   GIB_XLSX=/yol/GIB_PoC_Bulgu_Takip_lv.xlsx npx vitest run utils/gibPoc.control.test.ts
 *
 * Tüm görevler "Yapılacak" iken Bugün = Doğrulanmış olmalı.
 */

const file = process.env.GIB_XLSX;

describe.skipIf(!file || !existsSync(file))('GİB kontrol değerleri (gerçek Excel)', () => {
    // skipIf gövdeyi yine de çalıştırır: dosya yalnız testler koşarken okunur
    const load = () => {
        const wb = workbookToMatrices(XLSX.read(readFileSync(file!), { type: 'buffer' }));
        const pkg = parseGibWorkbook(wb, { now: '2026-11-26T09:00:00.000Z' });
        const res = applyGibImport(createEmptyWorkspace(), pkg, { projectName: 'GİB', newPmName: 'MKS', now: new Date('2026-11-26T09:00:00.000Z') });
        const imported = res.workspace.projects.find(p => p.id === res.projectId)!;
        // Jira durumu henüz gelmemiş: hepsi Yapılacak
        const project = { ...imported, tasks: imported.tasks.map(t => ({ ...t, status: TaskStatus.ToDo, jiraStatus: undefined })) };
        const s = computePocScores(project)!;
        return { project, s, by: Object.fromEntries(s.contributions.map(c => [c.name, c])) };
    };
    let ctx: ReturnType<typeof load>;
    beforeAll(() => { ctx = load(); });

    it('skorlar', () => {
        const { s, project } = ctx;
        expect(s.initial).toBeCloseTo(40.51, 1);
        expect(s.verified).toBeCloseTo(45.76, 1);
        expect(s.today).toBeCloseTo(s.verified, 10);
        expect(s.scope).toEqual(['Planlama: Aralık 2026']);
        expect(s.possible).toBeCloseTo(87.06, 1);
        expect(s.possible - s.initial).toBeCloseTo(46.55, 1);
        expect(s.possible - s.verified).toBeCloseTo(41.30, 1);
        expect(computePocScores(project, ['Planlama: Aralık 2026', 'Planlama: GİB netleştirme', 'Planlama: Müşteri sonrası', 'Planlama: Proje ekibi'])!.possible).toBeCloseTo(100, 1);
    });

    it('kategori katkıları (sırasız) ve tek başına katkılar', () => {
        const { by } = ctx;
        expect(by['GİB netleştirme'].value).toBeCloseTo(6.17, 1);
        expect(by['Müşteri sonrası'].value).toBeCloseTo(3.32, 1);
        expect(by['Proje ekibi'].value).toBeCloseTo(3.45, 1);
        expect(by['GİB netleştirme'].alone).toBeCloseTo(6.06, 1);
        expect(by['Müşteri sonrası'].alone).toBeCloseTo(4.40, 1);
        expect(by['Proje ekibi'].alone).toBeCloseTo(3.00, 1);
    });

    it('kategori büyüklükleri ve Aralık önem dağılımı', () => {
        const { project } = ctx;
        const rows = Object.fromEntries(pocCategoryRows(project).map(r => [r.name, r]));
        expect([rows['Aralık 2026'].items, rows['GİB netleştirme'].items, rows['Müşteri sonrası'].items, rows['Proje ekibi'].items]).toEqual([128, 22, 9, 13]);
        expect(rows['Aralık 2026'].byImportance).toMatchObject({ 'Zorunlu': 72, 'Olması beklenen': 53, 'İsteğe bağlı': 3 });
    });

    it('sonuç dağılımları (238 test, 119 zorunlu)', () => {
        const { project } = ctx;
        const d = pocDistribution(project.poc!.tests);
        expect([d.total, d.met, d.partial, d.other]).toEqual([238, 47, 28, 163]);
        expect([d.byClass.unmet, d.byClass.untestable, d.byClass.excluded, d.byClass.askVendor]).toEqual([83, 49, 22, 9]);
        const m = pocDistribution(project.poc!.tests, 'initial', 'Zorunlu');
        expect([m.total, m.met, m.partial, m.other]).toEqual([119, 32, 20, 67]);
    });
});
