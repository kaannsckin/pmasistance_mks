import { describe, it, expect } from 'vitest';
import { recentChanges, recentChangeCount, relativeTime } from './recentChanges';
import { createEmptyWorkspace } from './workspace';
import { AuditEntry, WorkspaceData } from '../types';

const NOW = new Date('2026-07-15T12:00:00Z');
const iso = (daysAgo: number): string => new Date(NOW.getTime() - daysAgo * 86400000).toISOString();

const entry = (id: string, action: AuditEntry['action'], at: string, projectId?: string): AuditEntry => ({
    id, at, actorRole: 'mudur', action, summary: `${action} ${id}`, projectId,
});

const buildWs = (): WorkspaceData => ({
    ...createEmptyWorkspace(),
    projects: [{ ...createEmptyWorkspace().projects[0], id: 'p1', name: 'Alfa' } as WorkspaceData['projects'][number]],
    auditLog: [
        entry('e1', 'project.rag', iso(1), 'p1'),
        entry('e2', 'risk.add', iso(3), 'p1'),
        entry('e3', 'snapshot.create', iso(2)), // elenir
        entry('e4', 'identity.change', iso(1)),  // elenir
        entry('e5', 'plan.approve', iso(10), 'p1'), // 7 gün dışında
    ],
});

describe('recentChanges', () => {
    it('son N günde, değişim aksiyonlarını en yeni başta, proje adıyla döner', () => {
        const list = recentChanges(buildWs(), NOW, 7);
        expect(list.map(e => e.id)).toEqual(['e1', 'e2']); // e3/e4 elendi, e5 pencere dışı
        expect(list[0].action).toBe('project.rag');
        expect(list[0].projectName).toBe('Alfa');
    });

    it('pencere genişleyince eski kayıtları da alır', () => {
        expect(recentChangeCount(buildWs(), NOW, 30)).toBe(3); // e1, e2, e5
    });

    it('boş günlükte 0 döner', () => {
        expect(recentChangeCount(createEmptyWorkspace(), NOW, 7)).toBe(0);
    });
});

describe('relativeTime', () => {
    it('göreli zaman etiketleri', () => {
        expect(relativeTime(new Date(NOW.getTime() - 30 * 1000).toISOString(), NOW)).toBe('az önce');
        expect(relativeTime(new Date(NOW.getTime() - 5 * 60000).toISOString(), NOW)).toBe('5 dk önce');
        expect(relativeTime(new Date(NOW.getTime() - 3 * 3600000).toISOString(), NOW)).toBe('3 sa önce');
        expect(relativeTime(new Date(NOW.getTime() - 2 * 86400000).toISOString(), NOW)).toBe('2 gün önce');
    });
});
