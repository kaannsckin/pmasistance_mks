import { describe, expect, it } from 'vitest';
import { WorkspaceData } from '../types';
import { canApprovePlan, canEditPool } from './allocations';
import { canReviewMeeting } from './customerMeetings';
import { canRespondExpectation, visibleExpectations } from './expectations';
import { setPmoRating } from './healthModel';
import {
    can, canFor, customizedRoles, defaultPermissions, isEditable, isManagementRole, permissionDiff, PERMISSIONS, permissionsFor, resetRolePermissions, ROLE_ORDER,
    setRolePermission,
} from './permissions';
import { canCreateProject, identityFor, identityOf, visibleProjectIds } from './rbac';
import { isReportSteward, publishWeek, visibleReports } from './weeklyReport';
import { createEmptyWorkspace, createProject } from './workspace';

describe('varsayılan yetkiler (önceki sabit kurallarla aynı)', () => {
    it('rol başına beklenen yetkiler', () => {
        expect(defaultPermissions('py').sort()).toEqual(['ai.use', 'notes.private', 'project.create']);
        expect(defaultPermissions('bolum_sorumlu').sort()).toEqual(['ai.use', 'notes.private']);
        expect(defaultPermissions('pyb_destek').sort()).toEqual(['ai.use', 'datapool.edit', 'health.rate', 'notes.private', 'portfolio.viewAll', 'project.assignOwner', 'project.create', 'report.review']);
        expect(defaultPermissions('pyb_sorumlu').sort()).toEqual(['ai.use', 'expectation.respond', 'health.rate', 'meeting.review', 'plan.approve', 'portfolio.viewAll', 'screen.executive']);
        expect(defaultPermissions('mudur').sort()).toEqual(['ai.use', 'expectation.respond', 'meeting.review', 'plan.approve', 'portfolio.viewAll', 'screen.executive']);
        expect(defaultPermissions('admin').sort()).toEqual(['app.audit', 'app.backup', 'app.dataHealth', 'screen.admin']);
    });

    it('her yetkinin anahtarı tekil, her rol sırada', () => {
        expect(new Set(PERMISSIONS.map(p => p.key)).size).toBe(PERMISSIONS.length);
        expect(ROLE_ORDER).toHaveLength(6);
    });

    it('yönetim rolleri not gizliliği kuralından gelir ve değişmez', () => {
        expect(ROLE_ORDER.filter(isManagementRole)).toEqual(['pyb_sorumlu', 'mudur', 'admin']);
    });
});

describe('setRolePermission', () => {
    it('yetki verir/kaldırır; varsayılana dönünce değişiklik silinir', () => {
        let o = setRolePermission(undefined, 'py', 'health.rate', true)!;
        expect(o.py).toEqual(['ai.use', 'project.create', 'health.rate']);
        expect(permissionsFor('py', o).has('health.rate')).toBe(true);
        expect(customizedRoles(o)).toEqual(['py']);
        expect(permissionDiff('py', o)).toEqual({ added: ['health.rate'], removed: [] });
        o = setRolePermission(o, 'mudur', 'plan.approve', false)!;
        expect(permissionsFor('mudur', o).has('plan.approve')).toBe(false);
        expect(permissionDiff('mudur', o)).toEqual({ added: [], removed: ['plan.approve'] });
        o = setRolePermission(o, 'py', 'health.rate', false)!;
        expect(o.py).toBeUndefined(); // varsayılana döndü
        expect(customizedRoles(resetRolePermissions(o, 'mudur'))).toEqual([]);
    });

    it('kilitli ve "her zaman" yetkiler değiştirilemez', () => {
        expect(isEditable('notes.private', 'mudur')).toBe(false);
        expect(setRolePermission(undefined, 'mudur', 'notes.private', true)).toBeNull();
        expect(setRolePermission(undefined, 'admin', 'screen.admin', false)).toBeNull();
        expect(isEditable('screen.admin', 'pyb_destek')).toBe(true); // başkasına verilebilir
        // Elle bozulmuş kayıt da kilitli kuralı aşamaz
        const tampered = { mudur: ['notes.private' as const], admin: [] };
        expect(permissionsFor('mudur', tampered).has('notes.private')).toBe(false);
        expect(permissionsFor('admin', tampered).has('screen.admin')).toBe(true);
    });

    it('can: kimlikte yetki yoksa rolün varsayılanı; canFor rol adını da kabul eder', () => {
        expect(can({ role: 'pyb_destek' }, 'datapool.edit')).toBe(true);
        expect(can({ role: 'pyb_destek', perms: new Set() }, 'datapool.edit')).toBe(false);
        expect(canFor('mudur', 'screen.executive')).toBe(true);
        expect(canFor(undefined, 'screen.executive')).toBe(false);
    });
});

describe('admin değişiklikleri kontrol noktalarına yansır', () => {
    const buildWs = (rolePermissions?: WorkspaceData['rolePermissions']): WorkspaceData => {
        const a = createProject('Alfa'); a.id = 'a'; a.pmPersonId = 'pm1';
        const b = createProject('Beta'); b.id = 'b'; b.pmPersonId = 'pm2';
        return {
            ...createEmptyWorkspace(),
            projects: [a, b],
            people: [
                { id: 'pm1', firstName: 'Ayşe', lastName: 'Yılmaz', departmentCode: 'U310', availableAA: 1, roles: [] },
                { id: 'pm2', firstName: 'Ali', lastName: 'Veli', departmentCode: 'U320', availableAA: 1, roles: [] },
            ],
            expectations: [{ id: 'e', title: 'Karar', category: 'approval', urgency: 'critical', status: 'open', projectId: 'b', createdAt: '', updatedAt: '', createdByRole: 'py', createdByPersonId: 'pm2' }],
            weeklyReports: [{ id: 'r', year: 2026, week: 41, kind: 'project', projectId: 'b', departmentCode: 'U320', thisWeek: [], nextWeek: [], abbreviations: [], stage: 'approved', createdAt: '', updatedAt: '', history: [] }],
            currentRole: 'py',
            currentPersonId: 'pm1',
            rolePermissions,
        };
    };

    it('varsayılanda PY yalnız kendi projesini görür; yetki verilince tüm portföy, beklentiler ve raporlar', () => {
        const base = buildWs();
        const id = identityOf(base);
        expect([...visibleProjectIds(base, id)]).toEqual(['a']);
        expect(visibleExpectations(base, id)).toHaveLength(0);
        const ws = buildWs({ py: ['project.create', 'portfolio.viewAll', 'expectation.respond', 'report.review'] });
        const granted = identityOf(ws);
        expect([...visibleProjectIds(ws, granted)].sort()).toEqual(['a', 'b']);
        expect(canRespondExpectation(granted)).toBe(true);
        expect(visibleExpectations(ws, granted)).toHaveLength(1);
        expect(isReportSteward(granted)).toBe(true);
        expect(visibleReports(ws, granted)).toHaveLength(1);
        expect(publishWeek(ws, granted, 2026, 41, 'Ayşe')).toHaveLength(1);
    });

    it('müdürden plan onayı ve görüşme onayı alınır; PYB destekten veri havuzu ve proje açma', () => {
        const ws = buildWs({ mudur: ['screen.executive', 'portfolio.viewAll', 'expectation.respond'], pyb_destek: ['portfolio.viewAll', 'report.review'] });
        const mudur = identityFor(ws, 'mudur');
        expect(canApprovePlan(mudur)).toBe(false);
        expect(canApprovePlan('mudur')).toBe(true); // rol adı → varsayılan
        expect(canReviewMeeting(mudur)).toBe(false);
        const destek = identityFor(ws, 'pyb_destek');
        expect(canEditPool(destek)).toBe(false);
        expect(canCreateProject(destek)).toBe(false);
        expect(setPmoRating([], { ...destek, name: 'Destek' }, { projectId: 'a', year: 2026, week: 41, score: 7 })).toBeNull();
    });
});
