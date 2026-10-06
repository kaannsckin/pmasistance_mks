import { describe, expect, it } from 'vitest';
import { SIDEBAR_PROJECT_LIMIT, sidebarProjects, SidebarProject } from './ModernSidebar';

const mk = (n: number): SidebarProject[] => Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `Proje ${String(i).padStart(2, '0')}`, openTasks: 0,
    rag: i === 20 ? 'red' : i === 15 ? 'amber' : 'green',
}));

describe('sidebarProjects', () => {
    it('az projede hepsini olduğu gibi döndürür', () => {
        expect(sidebarProjects(mk(5), null)).toHaveLength(5);
    });
    it('çok projede sınırlar; kırmızı ve sarı başa gelir', () => {
        const out = sidebarProjects(mk(35), null);
        expect(out).toHaveLength(SIDEBAR_PROJECT_LIMIT);
        expect(out[0].id).toBe('p20');
        expect(out[1].id).toBe('p15');
    });
    it('açık proje listede yoksa her zaman eklenir', () => {
        const out = sidebarProjects(mk(35), 'p33');
        expect(out).toHaveLength(SIDEBAR_PROJECT_LIMIT);
        expect(out[0].id).toBe('p33');
    });
});
