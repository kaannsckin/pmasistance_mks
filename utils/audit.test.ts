import { describe, it, expect } from 'vitest';
import { appendAudit, createAuditEntry, actorLabel } from './audit';
import { createEmptyWorkspace } from './workspace';
import { WorkspaceData } from '../types';

const ws = (): WorkspaceData => ({
    ...createEmptyWorkspace(),
    currentRole: 'py',
    currentPersonId: 'k1',
    people: [{ id: 'k1', firstName: 'Ali', lastName: 'Veli', departmentCode: 'U310', availableAA: 1, roles: [] }],
});

describe('audit', () => {
    it('createAuditEntry aktif kimliği yakalar', () => {
        const e = createAuditEntry(ws(), 'plan.approve', 'Plan kilitlendi', 'p1');
        expect(e.actorRole).toBe('py');
        expect(e.actorPersonId).toBe('k1');
        expect(e.actorName).toBe('Ali Veli');
        expect(e.action).toBe('plan.approve');
        expect(e.projectId).toBe('p1');
        expect(e.at).toBeTruthy();
    });

    it('appendAudit en yeni kaydı başa ekler', () => {
        let w = ws();
        w = appendAudit(w, 'project.create', 'A oluşturuldu');
        w = appendAudit(w, 'project.delete', 'A silindi');
        expect(w.auditLog).toHaveLength(2);
        expect(w.auditLog![0].summary).toBe('A silindi');
        expect(w.auditLog![1].summary).toBe('A oluşturuldu');
    });

    it('appendAudit 500 kayıtla sınırlar', () => {
        let w = ws();
        for (let i = 0; i < 520; i++) w = appendAudit(w, 'health.fix', `düzeltme ${i}`);
        expect(w.auditLog).toHaveLength(500);
        expect(w.auditLog![0].summary).toBe('düzeltme 519'); // en yeni
    });

    it('actorLabel rol + ad birleştirir; ad yoksa yalnız rol', () => {
        expect(actorLabel({ actorRole: 'mudur', actorName: 'Ayşe D' })).toBe('Müdür · Ayşe D');
        expect(actorLabel({ actorRole: 'mudur', actorName: undefined })).toBe('Müdür');
    });

    it('actorName havuzda kişi yoksa undefined', () => {
        const w = { ...ws(), currentPersonId: 'yok' };
        const e = createAuditEntry(w, 'identity.change', 'rol değişti');
        expect(e.actorName).toBeUndefined();
    });
});
