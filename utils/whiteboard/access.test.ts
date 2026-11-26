import { describe, expect, it } from 'vitest';
import { boardRole, canCreateBoard, cleanAccess, visibleBoards } from './access';

describe('whiteboard erişimi', () => {
    const board = { ownerId: 'k1', access: { everyone: 'view' as const, people: { k2: 'edit' as const, k3: 'none' as const } } };
    it('PY ve sahip yönetir; kişi istisnası varsayılandan önce gelir', () => {
        expect(boardRole(board, { projectEditor: true })).toBe('manage');
        expect(boardRole(board, { personId: 'k1', projectEditor: false })).toBe('manage');
        expect(boardRole(board, { personId: 'k2', projectEditor: false })).toBe('edit');
        expect(boardRole(board, { personId: 'k3', projectEditor: false })).toBe('none');
        expect(boardRole(board, { personId: 'k9', projectEditor: false })).toBe('view');
        expect(boardRole(board, { projectEditor: false })).toBe('view');
    });
    it('özel pano listede görünmez; eski pano (erişimsiz) herkese görünür', () => {
        const priv = { id: 'a', ownerId: 'k1', access: { everyone: 'none' as const, people: { k2: 'view' as const } } };
        const legacy = { id: 'b', access: undefined };
        expect(visibleBoards([priv, legacy], { personId: 'k5', projectEditor: false }).map(b => b.id)).toEqual(['b']);
        expect(visibleBoards([priv, legacy], { personId: 'k2', projectEditor: false }).map(b => b.id)).toEqual(['a', 'b']);
        expect(boardRole(legacy, { personId: 'k5', projectEditor: false })).toBe('view');
    });
    it('pano açmak: PY ya da profilinde kişi seçili olan', () => {
        expect(canCreateBoard({ projectEditor: false })).toBe(false);
        expect(canCreateBoard({ personId: 'k5', projectEditor: false })).toBe(true);
        expect(canCreateBoard({ projectEditor: true })).toBe(true);
    });
    it('erişim temizliği: varsayılana eşit istisna ve sahibin kendisi atılır', () => {
        expect(cleanAccess({ everyone: 'view', people: { k1: 'edit', k2: 'view', k3: 'edit' } }, 'k1')).toEqual({ everyone: 'view', people: { k3: 'edit' } });
        expect(cleanAccess({ everyone: 'edit', people: { k2: 'edit' } })).toEqual({ everyone: 'edit' });
    });
});

describe('pano değişikliği yetkisi', async () => {
    const { commitDenied } = await import('../../components/modern/whiteboard/useWhiteboardCollab');
    const b = { id: 'b', name: 'P', nodes: [], edges: [], createdAt: 'x', updatedAt: 'x', ownerId: 'k1', access: { everyone: 'view' as const, people: { k2: 'edit' as const } } };
    it('düzenleyen içerik değiştirir ama erişimi değiştiremez ve silemez; görüntüleyen hiçbirini yapamaz', () => {
        const editor = { personId: 'k2', projectEditor: false };
        expect(commitDenied(b, { ...b, name: 'Yeni' }, editor)).toBeNull();
        expect(commitDenied(b, { ...b, access: { everyone: 'edit' } }, editor)).toContain('Erişimi');
        expect(commitDenied(b, { ...b, ownerId: 'k2' }, editor)).toContain('Erişimi');
        expect(commitDenied(b, undefined, editor)).toContain('silebilir');
        expect(commitDenied(b, { ...b, name: 'x' }, { personId: 'k9', projectEditor: false })).toContain('görüntüleyebilirsiniz');
    });
    it('sahip ve PY erişimi değiştirir ve siler; kişisi olmayan pano açamaz', () => {
        expect(commitDenied(b, { ...b, access: { everyone: 'none' } }, { personId: 'k1', projectEditor: false })).toBeNull();
        expect(commitDenied(b, undefined, { projectEditor: true })).toBeNull();
        expect(commitDenied(undefined, b, { projectEditor: false })).toContain('kişi seçili');
        expect(commitDenied(undefined, b, { personId: 'k5', projectEditor: false })).toBeNull();
    });
});
