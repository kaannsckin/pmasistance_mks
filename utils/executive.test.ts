import { describe, it, expect } from 'vitest';
import { attentionItems, executiveSummary, portfolioHealth, projectHealth } from './executive';
import { createEmptyWorkspace, createProject } from './workspace';
import { Allocation, Person, Task, TaskStatus, WorkspaceData } from '../types';

const NOW = new Date('2026-07-15T00:00:00Z');
const person = (id: string, availableAA = 1): Person => ({ id, firstName: id, lastName: 'T', departmentCode: 'U310', availableAA, roles: [] });
const overdueTask = (id: string): Task => ({
    id, name: id, availability: true, priority: 'High', version: 1, predecessor: null, unit: '',
    resourceName: '', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo, dueDate: '2026-05-01',
});

const buildWs = (): WorkspaceData => {
    const red = createProject('Kırmızı'); red.id = 'red'; red.rag = 'red';
    red.risks = [{ id: 'r', title: 'Kritik risk', probability: 5, impact: 5, status: 'open', createdAt: '' }]; // skor 25
    red.tasks = [overdueTask('t1')];
    const green = createProject('Yeşil'); green.id = 'green'; green.rag = 'green';
    return {
        ...createEmptyWorkspace(),
        projects: [red, green],
        people: [person('a')],
        allocations: [
            { id: 'x', personId: 'a', projectId: 'red', year: 2026, plan: { 1: 1.5 }, actual: {} } as Allocation, // aşırı
            { id: 'orphan', personId: 'ghost', projectId: 'red', year: 2026, plan: { 2: 0.5 }, actual: {} } as Allocation, // veri hatası
        ],
    };
};

describe('projectHealth', () => {
    it('kırmızı RAG + yüksek risk skoru düşürür; yeşil 100', () => {
        const ws = buildWs();
        const red = projectHealth(ws, ws.projects[0], 2026, 7);
        expect(red.score).toBe(57); // 100 - 35 (kırmızı) - 8 (1 yüksek risk)
        expect(red.band).toBe('warn');
        expect(red.reasons).toContain('Kritik RAG');
        expect(red.highRisks).toBe(1);
        const green = projectHealth(ws, ws.projects[1], 2026, 7);
        expect(green.score).toBe(100);
        expect(green.band).toBe('good');
    });
});

describe('portfolioHealth', () => {
    it('org skoru proje ortalaması, en düşük önce sıralı', () => {
        const h = portfolioHealth(buildWs(), 2026, 7);
        expect(h.projects[0].projectId).toBe('red'); // en düşük başta
        expect(h.orgScore).toBe(79); // (57+100)/2 = 78.5 → 79
    });
});

describe('attentionItems', () => {
    it('kritik RAG, geciken görev, yüksek risk, aşırı tahsis, veri hatası bir listede', () => {
        const items = attentionItems(buildWs(), 2026, NOW, 7);
        const cats = items.map(i => i.category);
        expect(cats).toContain('rag');
        expect(cats).toContain('overdue');
        expect(cats).toContain('risk');
        expect(cats).toContain('overalloc');
        expect(cats).toContain('data');
        // hatalar önce
        expect(items[0].severity).toBe('error');
        // kırmızı RAG error ve projeye bağlı
        const rag = items.find(i => i.category === 'rag')!;
        expect(rag.severity).toBe('error');
        expect(rag.projectId).toBe('red');
    });

    it('yeşil proje için uyarı üretmez', () => {
        const items = attentionItems(buildWs(), 2026, NOW, 7);
        expect(items.some(i => i.projectId === 'green')).toBe(false);
    });
});

describe('executiveSummary', () => {
    it('proje sayısı, kritik ve sağlık yüzdesi içerir', () => {
        const s = executiveSummary(buildWs(), 2026, NOW);
        expect(s).toContain('2 proje');
        expect(s).toContain('1 kritik');
        expect(s).toContain('Portföy sağlığı %');
        expect(s).toContain('aşırı tahsis');
    });
});
