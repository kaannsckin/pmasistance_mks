import { describe, expect, it } from 'vitest';
import { Task, TaskStatus, View } from '../types';
import {
    applyPreset, applyRiskView, matchingPreset, projectComparator, projectPassesView, resetRoleView, sectionOfView, taskComparator, taskPassesView, updateRoleView, viewFor,
    viewSummary,
} from './viewConfig';

const NOW = new Date(2026, 9, 7, 10);
const task = (name: string, priority: Task['priority'], dueDate?: string, status = TaskStatus.ToDo): Task => ({
    id: name, name, availability: true, priority, version: 1, predecessor: null, unit: '', resourceName: '', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status, dueDate,
});

describe('viewFor', () => {
    it('ayar yoksa her şey görünür, ekranların sıralaması geçerli', () => {
        const v = viewFor(undefined, 'mudur');
        expect(v.projectSections.size).toBe(9);
        expect(v.execSections.size).toBe(10);
        expect(v).toMatchObject({ projectStatuses: null, minTaskPriority: 'Low', minRiskScore: 0, showClosedRisks: true, taskSort: 'smart', riskSort: 'score', projectSort: null, customized: false });
        expect(viewSummary(v)).toEqual([]);
    });

    it('genel bakış gizlenemez; tüm durumlar seçiliyse süzgeç yok', () => {
        const v = viewFor({ mudur: { projectSections: ['risks'], projectStatuses: ['devam', 'teklif', 'beklemede', 'tamamlandi'] } }, 'mudur');
        expect([...v.projectSections].sort()).toEqual(['overview', 'risks']);
        expect(v.projectStatuses).toBeNull();
        expect(sectionOfView(View.Kanban)).toBe('timeline');
        expect(sectionOfView(View.Portfolio)).toBeUndefined();
    });
});

describe('updateRoleView / hazır ayarlar', () => {
    it('varsayılana eşit alanlar silinir; boş rol kalmaz', () => {
        let c = updateRoleView(undefined, 'mudur', { minRiskScore: 15, taskSort: 'priority' });
        expect(c).toEqual({ mudur: { minRiskScore: 15, taskSort: 'priority' } });
        c = updateRoleView(c, 'mudur', { minRiskScore: 0 });
        expect(c).toEqual({ mudur: { taskSort: 'priority' } });
        c = updateRoleView(c, 'py', { execSections: ['summary', 'kpis', 'expectations', 'meetings', 'health', 'attention', 'approvals', 'risks', 'departments', 'changes'] });
        expect(c).toEqual({ mudur: { taskSort: 'priority' } }); // tümü seçili = varsayılan
        expect(resetRoleView(c, 'mudur')).toBeUndefined();
    });

    it('hazır ayar uygulanır ve tanınır; değişiklik sonrası "özel" olur', () => {
        let c = applyPreset(undefined, 'mudur', 'critical');
        expect(matchingPreset(c, 'mudur')).toBe('critical');
        expect(viewFor(c, 'mudur')).toMatchObject({ projectStatuses: ['devam'], minTaskPriority: 'High', minRiskScore: 15, showClosedRisks: false });
        expect(viewSummary(viewFor(c, 'mudur'))).toContain('Risk: 15+');
        c = updateRoleView(c, 'mudur', { minRiskScore: 8 });
        expect(matchingPreset(c, 'mudur')).toBeNull();
        expect(matchingPreset(applyPreset(c, 'mudur', 'full'), 'mudur')).toBe('full');
        expect(matchingPreset(undefined, 'py')).toBe('full');
    });
});

describe('uygulayıcılar', () => {
    it('görev önceliği ve proje durumu süzgeci', () => {
        const v = viewFor({ mudur: { minTaskPriority: 'High', projectStatuses: ['devam'] } }, 'mudur');
        expect(['Blocker', 'High', 'Medium', 'Low'].map(p => taskPassesView(v, { priority: p as Task['priority'] }))).toEqual([true, true, false, false]);
        expect(projectPassesView(v, { status: 'devam' })).toBe(true);
        expect(projectPassesView(v, { status: 'tamamlandi' })).toBe(false);
    });

    it('görev sıralamaları', () => {
        const tasks = [task('c', 'Low', '2026-10-01'), task('a', 'High'), task('b', 'Blocker', '2026-10-20'), task('d', 'Medium', '2026-09-01'), task('e', 'High', '2026-10-01', TaskStatus.Done)];
        const names = (sort: Parameters<typeof taskComparator>[0]) => [...tasks].sort(taskComparator(sort, NOW)).map(t => t.name);
        expect(names('smart')).toEqual(['d', 'c', 'b', 'a', 'e']); // en çok geciken, sonra öncelik
        expect(names('priority')).toEqual(['b', 'a', 'e', 'd', 'c']);
        expect(names('due')).toEqual(['d', 'e', 'c', 'b', 'a']);
        expect(names('name')).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('risk süzgeci ve sıralaması: aktifler önce', () => {
        const rows = [
            { title: 'eski-yuksek', status: 'open' as const, createdAt: '2026-01-01', score: 20 },
            { title: 'yeni-orta', status: 'open' as const, createdAt: '2026-09-01', score: 9 },
            { title: 'dusuk', status: 'monitoring' as const, createdAt: '2026-10-01', score: 4 },
            { title: 'kapandi', status: 'closed' as const, createdAt: '2026-10-02', score: 25 },
        ];
        expect(applyRiskView(rows, viewFor(undefined, 'py')).map(r => r.title)).toEqual(['eski-yuksek', 'yeni-orta', 'dusuk', 'kapandi']);
        expect(applyRiskView(rows, viewFor({ py: { riskSort: 'recent' } }, 'py')).map(r => r.title)).toEqual(['dusuk', 'yeni-orta', 'eski-yuksek', 'kapandi']);
        expect(applyRiskView(rows, viewFor({ py: { minRiskScore: 8, showClosedRisks: false } }, 'py')).map(r => r.title)).toEqual(['eski-yuksek', 'yeni-orta']);
    });

    it('proje sıralaması', () => {
        const rows = [{ name: 'B', score: 80, progress: 50, overdue: 1 }, { name: 'A', score: 40, progress: 90, overdue: 0 }, { name: 'C', progress: 10, overdue: 4 }];
        const by = (k: Parameters<typeof projectComparator>[0]) => [...rows].sort(projectComparator(k)).map(r => r.name);
        expect(by('health')).toEqual(['A', 'B', 'C']); // skoru olmayan sona
        expect(by('progress')).toEqual(['C', 'B', 'A']);
        expect(by('overdue')).toEqual(['C', 'B', 'A']);
        expect(by('name')).toEqual(['A', 'B', 'C']);
    });
});
