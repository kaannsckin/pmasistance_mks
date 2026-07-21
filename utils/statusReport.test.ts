import { describe, it, expect } from 'vitest';
import { buildStatusReport, getIsoWeek } from './statusReport';
import { createEmptyWorkspace, createProject } from './workspace';
import { Note, Risk, TaskStatus, WorkspaceData } from '../types';

// 2026-06-15 Pazartesi → ISO hafta 25
const NOW = new Date('2026-06-15T09:00:00Z');
const WEEK = getIsoWeek(NOW);

const note = (content: string, week: number, year = 2026): Note => ({
    id: `n-${Math.random()}`, content, createdAt: '2026-06-15T00:00:00Z', weekNumber: week, year, tags: [], mentions: [],
});

const buildWs = (): WorkspaceData => {
    const p = createProject('Milgem', { rag: 'amber', ragNote: 'Tedarik riski' });
    p.tasks = [
        { id: 't1', name: 'Bitmiş İş', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'Kaan', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.Done },
        { id: 't2', name: 'Süregelen İş', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'Ayşe', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.InProgress },
        { id: 't3', name: 'Geciken İş', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'Ali', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo, dueDate: '2026-06-01' },
        { id: 't4', name: 'Yaklaşan İş', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'Veli', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo, dueDate: '2026-06-18' },
    ];
    p.notes = [note('Bu hafta toplantı yapıldı', WEEK), note('Geçen hafta notu', WEEK - 2)];
    const highRisk: Risk = { id: 'r1', title: 'Kritik risk', probability: 5, impact: 5, status: 'open', createdAt: '', owner: 'Kaan', mitigation: 'B planı' };
    const lowRisk: Risk = { id: 'r2', title: 'Küçük risk', probability: 1, impact: 1, status: 'open', createdAt: '' };
    p.risks = [highRisk, lowRisk];
    return {
        ...createEmptyWorkspace(),
        projects: [p],
        allocations: [{ id: 'a1', personId: 'k1', projectId: p.id, year: 2026, plan: { 6: 0.5 }, actual: { 6: 0.4 } }],
    };
};

describe('getIsoWeek', () => {
    it('NotesView ile aynı ISO haftayı verir', () => {
        expect(getIsoWeek(new Date('2026-01-01T00:00:00Z'))).toBe(1);
        expect(getIsoWeek(NOW)).toBe(25);
    });
});

describe('buildStatusReport', () => {
    it('ilerleme, RAG, geciken/yaklaşan, tahsis, risk ve haftalık notu içerir', () => {
        const r = buildStatusReport(buildWs(), buildWs().projects[0].id, NOW);
        // buildWs() iki kez çağrıldığı için id farklı olur; tek instance kullanalım
        const ws = buildWs();
        const rep = buildStatusReport(ws, ws.projects[0].id, NOW)!;
        expect(rep.projectName).toBe('Milgem');
        expect(rep.week).toBe(25);
        expect(rep.text).toContain('%25'); // 1/4 done
        expect(rep.text).toContain('Sarı (Riskli)');
        expect(rep.text).toContain('Tedarik riski');
        expect(rep.text).toContain('Süregelen İş');
        expect(rep.text).toContain('Termini geçen');
        expect(rep.text).toContain('Geciken İş');
        expect(rep.text).toContain('Önümüzdeki 7 gün');
        expect(rep.text).toContain('Yaklaşan İş');
        expect(rep.text).toContain('plan 0,5 / gerçekleşen 0,4');
        expect(rep.text).toContain('Kritik risk');
        expect(rep.text).not.toContain('Küçük risk'); // düşük risk raporda yok
        expect(rep.text).toContain('Bu hafta toplantı yapıldı');
        expect(rep.text).not.toContain('Geçen hafta notu'); // farklı hafta
        expect(rep.hasContent).toBe(true);
    });

    it('boş projede hasContent false', () => {
        const ws = { ...createEmptyWorkspace(), projects: [createProject('Boş')] };
        const rep = buildStatusReport(ws, ws.projects[0].id, NOW)!;
        expect(rep.hasContent).toBe(false);
        expect(rep.text).toContain('Boş');
    });

    it('bulunmayan projede null', () => {
        expect(buildStatusReport(buildWs(), 'yok', NOW)).toBeNull();
    });
});
