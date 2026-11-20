import { Person, Project, ProjectRoleDef, WorkspaceData } from '../types';

/**
 * Proje rolleri (Jira "project roles"): rol tanımları kurum genelidir
 * (yönetici tanımlar), üyeler her projede ayrı atanır (proje yöneticisi).
 * Geçiş koşulları ve bildirim alıcıları kişi yerine role bağlanabilir;
 * böylece aynı yapılandırma farklı ekiplerin projelerinde çalışır.
 */

export const DEFAULT_PROJECT_ROLES: ProjectRoleDef[] = [
    { id: 'gelistirici', name: 'Geliştirici', description: 'Kodlama ve hata düzeltme' },
    { id: 'test', name: 'Test', description: 'Test ve doğrulama; testten çıkış kararını verir' },
    { id: 'analist', name: 'Analist', description: 'Gereksinim ve analiz' },
    { id: 'urun-sahibi', name: 'Ürün sahibi', description: 'Önceliklendirme ve kabul' },
];

export const projectRolesOf = (ws: Pick<WorkspaceData, 'projectRoles'>): ProjectRoleDef[] =>
    ws.projectRoles && ws.projectRoles.length ? ws.projectRoles : DEFAULT_PROJECT_ROLES;

export const roleMembers = (p: Pick<Project, 'roleMembers'> | undefined, roleId: string): string[] => p?.roleMembers?.[roleId] || [];

export const isInProjectRole = (p: Pick<Project, 'roleMembers'> | undefined, roleIds: string[] | undefined, personId: string | undefined): boolean =>
    !!personId && (roleIds || []).some(r => roleMembers(p, r).includes(personId));

/** Kişinin projedeki rolleri (ad) */
export const rolesOfPerson = (p: Pick<Project, 'roleMembers'>, defs: ProjectRoleDef[], personId: string): string[] =>
    defs.filter(d => roleMembers(p, d.id).includes(personId)).map(d => d.name);

/** Rol üyelerinin kişi kayıtları */
export const roleMemberPeople = (p: Pick<Project, 'roleMembers'> | undefined, roleIds: string[] | undefined, people: Person[]): Person[] => {
    const ids = new Set((roleIds || []).flatMap(r => roleMembers(p, r)));
    return people.filter(x => ids.has(x.id));
};

/** Silinen rolün üyeliklerini temizler; tanımı olmayan rol anahtarlarını atar */
export const cleanRoleMembers = (members: Project['roleMembers'], defs: ProjectRoleDef[]): Project['roleMembers'] => {
    if (!members) return members;
    const ids = new Set(defs.map(d => d.id));
    const out = Object.fromEntries(Object.entries(members).filter(([k, v]) => ids.has(k) && v.length));
    return Object.keys(out).length ? out : undefined;
};

let seq = 0;
export const newRoleId = (name: string): string =>
    `${name.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşıöç]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'rol'}-${Date.now().toString(36)}${(++seq).toString(36)}`;
