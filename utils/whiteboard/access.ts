import type { WbAccess, WbAccessLevel, Whiteboard } from '../../types';

/**
 * Pano erişimi (istemci tarafı; bulutta aynı kural RLS ile zorlanır,
 * bkz. supabase/schema.sql › whiteboard_access_level):
 *
 *  - yönetir (manage): projenin PY'si (proje içeriğini düzenleyen) ve panonun sahibi
 *  - kişi bazında düzey varsa o, yoksa "herkes" düzeyi
 *  - erişimi tanımlanmamış (eski) panolar: herkes görüntüler, PY yönetir
 *
 * Pano açmak: projeyi gören ve profilinde kişi seçili olan herkes (sahibi olur).
 */

export type WbRole = 'manage' | 'edit' | 'view' | 'none';

export interface WbViewer {
    /** Profildeki kişi (Veri Havuzu kimliği) */
    personId?: string;
    /** Proje içeriğini düzenleyebilir (projenin PY'si) */
    projectEditor: boolean;
}

export const DEFAULT_ACCESS: WbAccess = { everyone: 'view' };

export const LEVEL_LABEL: Record<WbAccessLevel, string> = { none: 'Göremez', view: 'Görüntüler', edit: 'Düzenler' };

export const boardRole = (b: Pick<Whiteboard, 'ownerId' | 'access'>, v: WbViewer): WbRole => {
    if (v.projectEditor) return 'manage';
    if (b.ownerId && v.personId && b.ownerId === v.personId) return 'manage';
    const access = b.access || DEFAULT_ACCESS;
    const level = (v.personId && access.people?.[v.personId]) || access.everyone;
    return level === 'edit' ? 'edit' : level === 'view' ? 'view' : 'none';
};

export const canEditBoard = (r: WbRole): boolean => r === 'manage' || r === 'edit';
export const canViewBoard = (r: WbRole): boolean => r !== 'none';

export const canCreateBoard = (v: WbViewer): boolean => v.projectEditor || !!v.personId;

/** Erişimi temizler: "herkes" düzeyine eşit kişi istisnaları ve sahibin kendisi atılır */
export const cleanAccess = (a: WbAccess, ownerId?: string): WbAccess => {
    const people = Object.fromEntries(Object.entries(a.people || {}).filter(([id, lvl]) => id !== ownerId && lvl !== a.everyone));
    return { everyone: a.everyone, ...(Object.keys(people).length ? { people } : {}) };
};

/** Görünür panolar (erişimi olmayanlar listelenmez) */
export const visibleBoards = <T extends Pick<Whiteboard, 'ownerId' | 'access'>>(boards: T[], v: WbViewer): T[] =>
    boards.filter(b => canViewBoard(boardRole(b, v)));

/** Panoya yeni sahip ve varsayılan erişim */
export const withOwner = (b: Whiteboard, ownerId: string | undefined): Whiteboard =>
    ({ ...b, ...(ownerId ? { ownerId } : {}), access: b.access || DEFAULT_ACCESS });
