import { describe, expect, it } from 'vitest';
import { WorkspaceData } from '../types';
import { addProfile, filterProfiles, initialsOf, profileOptions, removeProfile } from './profiles';
import { createEmptyWorkspace, createProject } from './workspace';

const buildWs = (profiles?: WorkspaceData['profiles']): WorkspaceData => {
    const a = createProject('Alfa'); a.id = 'a'; a.pmPersonId = 'pm1';
    const b = createProject('Beta'); b.id = 'b'; b.pmPersonId = 'pm1';
    const c = createProject('Gama'); c.id = 'c'; c.pmPersonId = 'silinmis';
    return {
        ...createEmptyWorkspace(),
        projects: [a, b, c],
        departments: [{ code: 'U310', name: 'Yazılım', leadPersonId: 'bs1' }, { code: 'U320', name: 'Altyapı' }],
        people: [
            { id: 'pm1', firstName: 'Ayşe', lastName: 'Yılmaz', departmentCode: 'U310', availableAA: 1, roles: [] },
            { id: 'bs1', firstName: 'Zeynep', lastName: 'Kara', departmentCode: 'U310', availableAA: 1, roles: [] },
            { id: 'md', firstName: 'Ömer', lastName: 'Şahin', departmentCode: 'U300', availableAA: 1, roles: [] },
        ],
        profiles,
    };
};

describe('profileOptions', () => {
    it('proje yöneticileri ve bölüm sorumluları kendiliğinden; kişisiz roller her zaman seçilebilir', () => {
        const list = profileOptions(buildWs());
        expect(list.map(o => `${o.role}:${o.personId || '-'}:${o.source}`)).toEqual([
            'py:pm1:auto', 'bolum_sorumlu:bs1:auto', 'pyb_destek:-:role', 'pyb_sorumlu:-:role', 'mudur:-:role', 'admin:-:role',
        ]);
        expect(list[0]).toMatchObject({ name: 'Ayşe Yılmaz', initials: 'AY', detail: '2 projenin yöneticisi · Yazılım' });
        expect(list[1].detail).toBe('Yazılım bölümü');
        expect(list.find(o => o.role === 'mudur')!.name).toBe('Müdür');
    });

    it('tanımlı profil önce gelir, kendiliğindeni tekrar etmez; rolün kişisiz girişini gizler', () => {
        const list = profileOptions(buildWs([
            { id: 'x1', role: 'mudur', personId: 'md' },
            { id: 'x2', role: 'py', personId: 'pm1' },
            { id: 'x3', role: 'py', personId: 'yok' }, // silinmiş kişi
            { id: 'x4', role: 'bolum_sorumlu' }, // kişisiz kapsam rolü geçersiz
        ]));
        expect(list.filter(o => o.role === 'py')).toEqual([expect.objectContaining({ personId: 'pm1', source: 'defined', profileId: 'x2' })]);
        expect(list.filter(o => o.role === 'mudur')).toEqual([expect.objectContaining({ personId: 'md', name: 'Ömer Şahin', source: 'defined', detail: 'U300' })]);
        expect(list.filter(o => o.role === 'bolum_sorumlu').map(o => o.personId)).toEqual(['bs1']);
    });

    it('arama Türkçe aksan duyarsız; ad, rol ve ayrıntıda', () => {
        const list = profileOptions(buildWs([{ id: 'x1', role: 'mudur', personId: 'md' }]));
        expect(filterProfiles(list, 'omer sahin').map(o => o.personId)).toEqual(['md']);
        expect(filterProfiles(list, 'bölüm').map(o => o.role)).toEqual(['bolum_sorumlu']);
        expect(filterProfiles(list, 'yazilim').map(o => o.personId)).toEqual(['pm1', 'bs1']);
        expect(filterProfiles(list, '  ')).toHaveLength(list.length);
    });
});

describe('addProfile / removeProfile', () => {
    it('kapsam rolünde kişi zorunlu, aynı profil iki kez eklenmez', () => {
        expect(addProfile([], 'py')).toBeNull();
        const one = addProfile(undefined, 'mudur', 'md')!;
        expect(one).toEqual([expect.objectContaining({ role: 'mudur', personId: 'md' })]);
        expect(addProfile(one, 'mudur', 'md')).toBeNull();
        const two = addProfile(one, 'mudur')!; // kişisiz ayrı profil
        expect(two).toHaveLength(2);
        expect(two[1].personId).toBeUndefined();
        expect(removeProfile(two, one[0].id)).toEqual([two[1]]);
    });

    it('baş harfler', () => {
        expect(initialsOf('ayşe nur yılmaz')).toBe('AN');
        expect(initialsOf('İlker')).toBe('İ');
        expect(initialsOf('')).toBe('');
    });
});
