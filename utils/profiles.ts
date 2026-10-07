import { Person, UserProfile, UserRole, WorkspaceData } from '../types';
import { ROLE_LABELS } from './allocations';
import { ROLE_DESCRIPTIONS, ROLE_ORDER } from './permissions';
import { foldTr } from './rag/text';

/**
 * Profiller: "kim, hangi rolle çalışıyor". Profil değiştirme penceresi bu
 * listeyi gösterir:
 *  - admin'in tanımladığı profiller (kişi ↔ rol),
 *  - kendiliğinden: projelerin yöneticileri (PY) ve bölüm sorumluları,
 *  - kişi gerektirmeyen roller için o rolde tanımlı profil yoksa kişisiz giriş
 *    (her rol her zaman seçilebilir kalsın).
 * Listede olmayan bir kişi/rol penceredeki "başka bir kişi olarak" ile seçilir.
 */

/** Kapsamı kişiden gelen roller: kişi seçmeden çalışmaz */
export const PERSON_ROLES: UserRole[] = ['py', 'bolum_sorumlu'];
export const roleNeedsPerson = (role: UserRole): boolean => PERSON_ROLES.includes(role);

export type ProfileSource = 'defined' | 'auto' | 'role';

export interface ProfileOption {
    key: string;
    role: UserRole;
    personId?: string;
    name: string; // kişi adı, kişisizse rol adı
    initials: string;
    detail: string;
    source: ProfileSource;
    profileId?: string; // tanımlı profil (silinebilir)
}

type WsLike = Pick<WorkspaceData, 'people' | 'projects' | 'departments'> & Partial<Pick<WorkspaceData, 'profiles'>>;

export const profileKey = (role: UserRole, personId?: string): string => `${role}:${personId || ''}`;
const fullName = (p: Person): string => `${p.firstName} ${p.lastName}`.trim();
export const initialsOf = (name: string): string =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w.charAt(0)).join('').toLocaleUpperCase('tr-TR');

export const profileOptions = (ws: WsLike): ProfileOption[] => {
    const people = new Map(ws.people.map(p => [p.id, p]));
    const deptName = new Map(ws.departments.map(d => [d.code, d.name]));
    const pmCount = new Map<string, number>();
    ws.projects.forEach(p => { if (p.pmPersonId) pmCount.set(p.pmPersonId, (pmCount.get(p.pmPersonId) || 0) + 1); });
    const detailOf = (role: UserRole, person?: Person): string => {
        if (!person) return ROLE_DESCRIPTIONS[role];
        const dept = deptName.get(person.departmentCode) || person.departmentCode;
        if (role === 'py') {
            const n = pmCount.get(person.id) || 0;
            return [n ? `${n} projenin yöneticisi` : 'Yönettiği proje yok', dept].filter(Boolean).join(' · ');
        }
        if (role === 'bolum_sorumlu') return dept ? `${dept} bölümü` : 'Bölümü tanımlı değil';
        return dept || '';
    };
    const out = new Map<string, ProfileOption>();
    const add = (role: UserRole, personId: string | undefined, source: ProfileSource, profileId?: string) => {
        const person = personId ? people.get(personId) : undefined;
        if ((personId && !person) || (roleNeedsPerson(role) && !person)) return; // silinmiş kişi / eksik kapsam
        const key = profileKey(role, personId);
        if (out.has(key)) return;
        const name = person ? fullName(person) : ROLE_LABELS[role];
        out.set(key, { key, role, personId, name, initials: initialsOf(name), detail: detailOf(role, person), source, profileId });
    };
    (ws.profiles || []).forEach(p => add(p.role, p.personId, 'defined', p.id));
    ws.projects.forEach(p => { if (p.pmPersonId) add('py', p.pmPersonId, 'auto'); });
    ws.departments.forEach(d => { if (d.leadPersonId) add('bolum_sorumlu', d.leadPersonId, 'auto'); });
    ROLE_ORDER.filter(r => !roleNeedsPerson(r)).forEach(r => {
        if (![...out.values()].some(o => o.role === r)) add(r, undefined, 'role');
    });
    return [...out.values()].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name, 'tr'));
};

/** Ad, rol ya da ayrıntıda (Türkçe aksan duyarsız) arama */
export const filterProfiles = (options: ProfileOption[], query: string): ProfileOption[] => {
    const q = foldTr(query.trim());
    if (!q) return options;
    return options.filter(o => foldTr(`${o.name} ${ROLE_LABELS[o.role]} ${o.detail}`).includes(q));
};

const newId = () => `prf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Profil ekler; kişi gerektiren rolde kişi yoksa ya da aynı profil varsa null */
export const addProfile = (profiles: UserProfile[] | undefined, role: UserRole, personId?: string): UserProfile[] | null => {
    const list = profiles || [];
    if (roleNeedsPerson(role) && !personId) return null;
    if (list.some(p => p.role === role && (p.personId || '') === (personId || ''))) return null;
    return [...list, { id: newId(), role, ...(personId ? { personId } : {}) }];
};

export const removeProfile = (profiles: UserProfile[] | undefined, id: string): UserProfile[] =>
    (profiles || []).filter(p => p.id !== id);
