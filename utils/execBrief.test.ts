import { describe, it, expect } from 'vitest';
import { buildExecutiveBrief } from './execBrief';
import { createEmptyWorkspace, createProject } from './workspace';
import { Allocation, Person, WorkspaceData } from '../types';

const person = (id: string, dept: string, availableAA = 1): Person => ({ id, firstName: id.toUpperCase(), lastName: 'T', departmentCode: dept, availableAA, roles: [] });
const NOW = new Date('2026-07-15T00:00:00Z');

const buildWs = (): WorkspaceData => {
    const red = createProject('Kırmızı'); red.id = 'red'; red.rag = 'red';
    red.risks = [{ id: 'r', title: 'Kritik risk', probability: 5, impact: 5, status: 'open', createdAt: '' }];
    const green = createProject('Yeşil'); green.id = 'green'; green.rag = 'green';
    return {
        ...createEmptyWorkspace(),
        projects: [red, green],
        departments: [{ code: 'U310', name: 'Yazılım' }],
        people: [person('a', 'U310')],
        allocations: [
            { id: 'x', personId: 'a', projectId: 'red', year: 2026, plan: { 1: 1.5 }, actual: {} } as Allocation, // aşırı
        ],
    };
};

describe('buildExecutiveBrief', () => {
    it('tüm bölüm başlıklarını ve temel veriyi içerir', () => {
        const brief = buildExecutiveBrief(buildWs(), 2026, NOW);
        expect(brief).toContain('YÖNETİCİ BRİFİNGİ — 2026');
        expect(brief).toContain('GENEL DURUM');
        expect(brief).toContain('DİKKAT GEREKTİRENLER');
        expect(brief).toContain('DEPARTMAN YÜKÜ');
        expect(brief).toContain('EN KRİTİK RİSKLER');
        expect(brief).toContain('SON DEĞİŞİKLİKLER');
        // Kırmızı proje kritik RAG + yüksek risk brifingte
        expect(brief).toContain('Kritik: Kırmızı');
        expect(brief).toContain('Kritik risk (skor 25)');
        // Departman doluluğu ve aşırı tahsis
        expect(brief).toContain('Yazılım');
        expect(brief).toMatch(/aşırı tahsis/);
    });

    it('risk/uyarı yoksa boş-durum satırları yazar', () => {
        const ws = { ...createEmptyWorkspace(), projects: [createProject('Sakin')] };
        ws.projects[0].rag = 'green';
        const brief = buildExecutiveBrief(ws, 2026, NOW);
        expect(brief).toContain('- Açık risk yok.');
    });
});
