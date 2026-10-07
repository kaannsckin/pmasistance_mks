import { describe, expect, it } from 'vitest';
import { Person, Task, TaskStatus, WorkspaceData } from '../types';
import { attentionProjects, attentionReasons, buildExecProjectRows, ExecProjectRow, filterExecRows, healthDistribution, sortExecRows } from './execOverview';
import { createEmptyWorkspace, createProject } from './workspace';

const NOW = new Date('2026-07-15T00:00:00Z');
const person = (id: string, first: string, last: string): Person => ({ id, firstName: first, lastName: last, departmentCode: 'U310', availableAA: 1, roles: [] });
const task = (id: string, status: TaskStatus, dueDate?: string): Task => ({
    id, name: id, availability: true, priority: 'High', version: 1, predecessor: null, unit: '',
    resourceName: '', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status, dueDate,
});

const buildWs = (): WorkspaceData => {
    const red = createProject('Kırmızı Proje'); red.id = 'red'; red.rag = 'red'; red.pmPersonId = 'ay';
    red.risks = [
        { id: 'r1', title: 'A', probability: 5, impact: 5, status: 'open', createdAt: '' },
        { id: 'r2', title: 'B', probability: 4, impact: 4, status: 'open', createdAt: '' },
    ];
    red.tasks = [task('t1', TaskStatus.ToDo, '2026-05-01'), task('t2', TaskStatus.Done)];
    const amber = createProject('Sarı Proje'); amber.id = 'amber'; amber.rag = 'amber';
    const late = createProject('Gecikmeli Yeşil'); late.id = 'late'; late.rag = 'green';
    late.tasks = [task('t3', TaskStatus.InProgress, '2026-07-01')];
    const done = createProject('Bitmiş'); done.id = 'done'; done.rag = 'red'; done.status = 'tamamlandi';
    const green = createProject('Yeşil Proje'); green.id = 'green'; green.rag = 'green'; green.code = 'SAP-42';
    return { ...createEmptyWorkspace(), projects: [red, amber, late, done, green], people: [person('ay', 'Ayşe', 'Yılmaz')] };
};

describe('buildExecProjectRows', () => {
    it('sağlık, sahip, geciken görev ve ilerlemeyi tek satırda toplar', () => {
        const rows = buildExecProjectRows(buildWs(), 2026, NOW);
        const red = rows.find(r => r.projectId === 'red')!;
        expect(red.pmName).toBe('Ayşe Yılmaz');
        // RAG 0 (w .08), risk 0,2 (2 yüksek, .13), geciken 0 (.13), beklenti 1 (.05): 100 × .076 / .39 = 19
        expect(red.score).toBe(19);
        expect(red.band).toBe('bad');
        expect(red.overdueTasks).toBe(1);
        expect(red.progressPct).toBe(50);
        expect(red.highRisks).toBe(2);
        expect(rows.find(r => r.projectId === 'green')!.band).toBe('good');
    });
});

describe('dağılım ve dikkat listesi', () => {
    const rows = buildExecProjectRows(buildWs(), 2026, NOW);

    it('sağlık dağılımı toplamı proje sayısına eşit', () => {
        const d = healthDistribution(rows);
        expect(d.total).toBe(5);
        expect(d.bad + d.warn + d.good).toBe(5);
    });

    it('dikkat listesi en kötüden başlar; sarı RAG ve geciken görevi olan yeşil girer; tamamlanan ve sorunsuz girmez', () => {
        const list = attentionProjects(rows, 10).map(r => r.projectId);
        expect(list[0]).toBe('red');
        expect(list).toContain('amber');
        expect(list).toContain('late');
        expect(list).not.toContain('done');
        expect(list).not.toContain('green');
        expect(attentionProjects(rows, 1)).toHaveLength(1);
    });

    it('nedenler geciken görev ve onay bekleyen planı da söyler', () => {
        const late = rows.find(r => r.projectId === 'late')!;
        expect(attentionReasons(late)).toContain('1 geciken görev');
        expect(attentionReasons({ ...late, lockStatus: 'submitted', overdueTasks: 0 })).toContain('Plan onay bekliyor');
    });
});

describe('süzme ve sıralama', () => {
    const rows = buildExecProjectRows(buildWs(), 2026, NOW);

    it('arama ad, kod ve PM adında; bant ve durum süzgeci', () => {
        expect(filterExecRows(rows, { query: 'sap-42' }).map(r => r.projectId)).toEqual(['green']);
        expect(filterExecRows(rows, { query: 'ayşe' }).map(r => r.projectId)).toEqual(['red']);
        expect(filterExecRows(rows, { band: 'good' }).every(r => r.band === 'good')).toBe(true);
        expect(filterExecRows(rows, { status: 'tamamlandi' }).map(r => r.projectId)).toEqual(['done']);
    });

    it('sağlığa göre artan sıralamada en kötü başta; null SPI sona', () => {
        const byHealth = sortExecRows(rows, 'health', 'asc');
        expect(byHealth[0].score).toBeLessThanOrEqual(byHealth[byHealth.length - 1].score);
        const withNull: ExecProjectRow[] = [{ ...rows[0], projectId: 'x', spi: null }, { ...rows[1], projectId: 'y', spi: 0.8 }, { ...rows[2], projectId: 'z', spi: 1.1 }];
        expect(sortExecRows(withNull, 'spi', 'asc').map(r => r.projectId)).toEqual(['y', 'z', 'x']);
        expect(sortExecRows(withNull, 'spi', 'desc').map(r => r.projectId)).toEqual(['z', 'y', 'x']);
        expect(sortExecRows(rows, 'name', 'asc')[0].name).toBe('Bitmiş');
    });
});
