import { describe, it, expect } from 'vitest';
import { buildProjectEVM, buildPortfolioEVM, projectPercentComplete, defaultStatusMonth } from './evm';
import { createEmptyWorkspace, createProject } from './workspace';
import { Allocation, Task, TaskStatus, WorkspaceData } from '../types';

const task = (id: string, avg: number, status: TaskStatus): Task => ({
    id, name: id, availability: true, priority: 'Medium', version: 1, predecessor: null,
    unit: '', resourceName: '', time: { best: avg, avg, worst: avg }, jiraId: '', notes: '', status,
});

const buildWs = (): WorkspaceData => {
    const p = createProject('Proje A');
    p.id = 'p1';
    // %50 tamamlanma: iki eşit eforlu görev, biri Done
    p.tasks = [task('t1', 10, TaskStatus.Done), task('t2', 10, TaskStatus.InProgress)];
    const allocs: Allocation[] = [
        // ARŞ ücreti 100 ₺/AA. Yıl planı: her ay 1 AA (12 AA), gerçekleşen Oca-Haz 1 AA + fazladan
        {
            id: 'a', personId: 'k1', projectId: 'p1', year: 2026,
            plan: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1 },
            actual: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2 }, // Haziran 2 AA (maliyet aşımı)
        },
    ];
    return {
        ...createEmptyWorkspace(),
        projects: [p],
        people: [{ id: 'k1', firstName: 'Kaan', lastName: 'T', departmentCode: 'U310', availableAA: 1, roles: [], titleCode: 'ARŞ' }],
        titles: [{ code: 'ARŞ', name: 'Araştırmacı', monthlyCost: 100 }],
        allocations: allocs,
    };
};

describe('projectPercentComplete', () => {
    it('efor-ağırlıklı tamamlanma', () => {
        expect(projectPercentComplete(buildWs().projects[0])).toBe(0.5);
    });
    it('görev yoksa 0', () => {
        const p = createProject('boş');
        expect(projectPercentComplete(p)).toBe(0);
    });
});

describe('buildProjectEVM — durum ayı Haziran (6)', () => {
    it('PV/AC kümülatif, BAC yıl toplamı, EV = BAC × ilerleme', () => {
        const e = buildProjectEVM(buildWs(), 'p1', 2026, 6);
        expect(e.bac).toBe(1200); // 12 AA × 100
        expect(e.pv).toBe(600); // Oca-Haz plan 6×100
        expect(e.ac).toBe(700); // Oca-May 1 + Haz 2 = 7 AA × 100
        expect(e.percentComplete).toBe(0.5);
        expect(e.ev).toBe(600); // 1200 × 0.5
    });

    it('SPI/CPI ve tahminler', () => {
        const e = buildProjectEVM(buildWs(), 'p1', 2026, 6);
        expect(e.spi).toBe(1); // EV/PV = 600/600
        expect(e.cpi).toBeCloseTo(0.86); // 600/700
        expect(e.cv).toBe(-100); // EV-AC (bütçe aşımı)
        expect(e.eac).toBe(1400); // BAC/CPI ≈ 1200/0.857
        expect(e.vac).toBe(-200); // BAC-EAC (aşım)
    });

    it('maliyetsiz proje costed=false', () => {
        const ws = buildWs();
        ws.titles = []; // maliyet yok
        const e = buildProjectEVM(ws, 'p1', 2026, 6);
        expect(e.costed).toBe(false);
        expect(e.bac).toBe(0);
    });
});

describe('buildPortfolioEVM', () => {
    it('maliyetlenen projeleri toplar', () => {
        const port = buildPortfolioEVM(buildWs(), 2026, undefined, 6);
        expect(port.projects).toHaveLength(1);
        expect(port.bac).toBe(1200);
        expect(port.ac).toBe(700);
        expect(port.cpi).toBeCloseTo(0.86);
    });

    it('durum ayı 0 (gelecek) → PV/AC 0, SPI/CPI null', () => {
        const port = buildPortfolioEVM(buildWs(), 2026, undefined, 0);
        expect(port.pv).toBe(0);
        expect(port.ac).toBe(0);
        expect(port.spi).toBeNull();
        expect(port.cpi).toBeNull();
    });
});

describe('defaultStatusMonth', () => {
    it('geçmiş yıl 12, gelecek 0, cari yıl ay', () => {
        const now = new Date('2026-07-15T00:00:00Z');
        expect(defaultStatusMonth(2025, now)).toBe(12);
        expect(defaultStatusMonth(2027, now)).toBe(0);
        expect(defaultStatusMonth(2026, now)).toBe(7);
    });
});
