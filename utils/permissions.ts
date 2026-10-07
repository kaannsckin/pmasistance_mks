import { PermissionKey, RolePermissions, UserRole } from '../types';

/**
 * Rol bazlı özellik yetkileri. Katalogdaki varsayılanlar uygulamanın önceden
 * sabit kodlu davranışıyla aynıdır; admin "Yönetici" ekranından bir rolün
 * yetkilerini değiştirebilir (WorkspaceData.rolePermissions). Değişiklik
 * olmayan rol varsayılanı kullanır.
 *
 *  - Kilitli yetkiler değiştirilemez (ör. not gizliliği bulutta veritabanı
 *    politikasıyla da korunur; burada açmak koruma sağlamaz, yanıltır).
 *  - "Her zaman" yetkileri o rolden alınamaz (admin kendini kilitleyemez).
 *  - Sahiplik ve kapsam kuralları (PY yalnız kendi projesini, bölüm sorumlusu
 *    yalnız kendi bölümünü düzenler) yetki değil kimlik kuralıdır; rbac.ts'te.
 *
 * Saf/test edilebilir; kontrol noktaları can(kimlik, yetki) çağırır.
 */

export type PermissionGroup = 'screens' | 'portfolio' | 'report' | 'decisions' | 'privacy';

export interface PermissionDef {
    key: PermissionKey;
    group: PermissionGroup;
    label: string;
    description: string;
    defaults: UserRole[];
    locked?: string; // değiştirilemez; nedeni
    alwaysFor?: UserRole[]; // bu rollerden alınamaz
}

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
    screens: 'Ekranlar',
    portfolio: 'Portföy ve veri',
    report: 'Haftalık rapor ve sağlık',
    decisions: 'Yönetim kararları',
    privacy: 'Gizlilik',
};

export const PERMISSIONS: PermissionDef[] = [
    { key: 'screen.executive', group: 'screens', label: 'Yönetim ekranı', description: 'Portföy sağlığı, EVM, dikkat isteyenler, brifing ve yönetici paketleri', defaults: ['mudur', 'pyb_sorumlu', 'admin'] },
    { key: 'screen.admin', group: 'screens', label: 'Yönetici (admin) ekranı', description: 'Rol yetkilerini ve kişi profillerini yönetir', defaults: ['admin'], alwaysFor: ['admin'] },
    { key: 'portfolio.viewAll', group: 'portfolio', label: 'Tüm projeleri görür', description: 'Kapsamı dışındaki projeler dahil tüm portföy (salt okunur)', defaults: ['mudur', 'pyb_sorumlu', 'pyb_destek', 'admin'] },
    { key: 'project.create', group: 'portfolio', label: 'Proje oluşturur', description: 'Yeni proje açar', defaults: ['py', 'pyb_destek'] },
    { key: 'project.assignOwner', group: 'portfolio', label: 'Proje sahibini atar', description: 'Tüm projelerde proje yöneticisini ve durumu değiştirir (PY kendi projesinde her zaman yapabilir)', defaults: ['pyb_destek'] },
    { key: 'datapool.edit', group: 'portfolio', label: 'Veri havuzunu düzenler', description: 'Personel, bölüm, rol kataloğu, ünvan, izinler ve Excel içe aktarma', defaults: ['pyb_destek'] },
    { key: 'plan.approve', group: 'decisions', label: 'Tahsis planını onaylar', description: 'Onaya gelen planı onaylar / reddeder, kilidi açar', defaults: ['mudur', 'pyb_sorumlu'] },
    { key: 'expectation.respond', group: 'decisions', label: 'Yönetimden beklentileri yanıtlar', description: 'Proje yöneticisi ve bölüm sorumlularının beklentilerine yanıt verir', defaults: ['mudur', 'pyb_sorumlu'] },
    { key: 'meeting.review', group: 'decisions', label: 'Müşteri görüşmelerini onaylar', description: 'Onaya sunulan görüşmeleri onaylar ya da reddeder', defaults: ['mudur', 'pyb_sorumlu'] },
    { key: 'report.review', group: 'report', label: 'Haftalık raporu denetler ve yayınlar', description: 'Format denetimi, haftayı yayınlama, müdürlere gönderim, rapor ayarları ve AI metin puanı', defaults: ['pyb_destek'] },
    { key: 'health.rate', group: 'report', label: 'PMO sağlık puanı verir', description: 'Birleşik raporda projelere haftalık 1–10 puan (sağlık modelinin hedef değişkeni)', defaults: ['pyb_sorumlu', 'pyb_destek'] },
    { key: 'notes.private', group: 'privacy', label: 'Günlük ve müşteri isteklerini görür', description: "PY'ye özel notlar ve müşteri istekleri", defaults: ['py', 'bolum_sorumlu', 'pyb_destek'], locked: 'Gizlilik kuralı: bulutta veritabanı politikasıyla (RLS) da korunur; buradan değiştirilemez.' },
];

export const PERMISSION_BY_KEY = new Map(PERMISSIONS.map(p => [p.key, p]));

/** Ekranlardaki rol sırası (en kapsamlı girdi yapandan yönetime) */
export const ROLE_ORDER: UserRole[] = ['py', 'bolum_sorumlu', 'pyb_destek', 'pyb_sorumlu', 'mudur', 'admin'];

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
    py: 'Kendi projelerinin görev, plan, risk ve haftalık raporu',
    bolum_sorumlu: 'Bölüm personelinin tahsisi ve bölüm raporlarının onayı',
    pyb_destek: 'Veri havuzu, rapor denetimi ve yayını',
    pyb_sorumlu: 'Portföy izleme, plan onayı ve PMO değerlendirmesi',
    mudur: 'Yönetim ekranı, onaylar ve kararlar',
    admin: 'Rol yetkileri ve kişi profilleri',
};

export const defaultPermissions = (role: UserRole): PermissionKey[] =>
    PERMISSIONS.filter(p => p.defaults.includes(role)).map(p => p.key);

/** Bu rolde bu yetki admin tarafından değiştirilebilir mi? */
export const isEditable = (key: PermissionKey, role: UserRole): boolean => {
    const def = PERMISSION_BY_KEY.get(key);
    return !!def && !def.locked && !def.alwaysFor?.includes(role);
};

/** Rolün geçerli yetkileri: değişiklik varsa o, yoksa varsayılan; kilitli ve "her zaman" kurallarıyla */
export const permissionsFor = (role: UserRole, overrides?: RolePermissions): Set<PermissionKey> => {
    const custom = overrides?.[role];
    const out = new Set<PermissionKey>();
    PERMISSIONS.forEach(p => {
        const granted = p.locked || !custom ? p.defaults.includes(role) : custom.includes(p.key);
        if (granted || p.alwaysFor?.includes(role)) out.add(p.key);
    });
    return out;
};

export interface PermissionHolder {
    role: UserRole;
    perms?: ReadonlySet<PermissionKey>;
}

/** Kimliğin yetkisi var mı? (perms yoksa rolün varsayılanı — testler ve eski çağrılar için) */
export const can = (id: PermissionHolder, key: PermissionKey): boolean =>
    (id.perms ?? permissionsFor(id.role)).has(key);

/**
 * Girdi yapmayan yönetim rolleri (Müdür, PYB Sorumlusu, Admin): görev ve
 * proje içeriğini salt okur. Not gizliliği kuralıyla aynı kümedir ve o kural
 * kilitli olduğu için admin değişiklikleriyle değişmez.
 */
export const isManagementRole = (role: UserRole): boolean => !permissionsFor(role).has('notes.private');

/** Rol adı ya da kimlikle çağrılabilen yardımcılar için (rol adı = varsayılan yetkiler) */
export const canFor = (who: UserRole | PermissionHolder | undefined, key: PermissionKey): boolean =>
    !!who && can(typeof who === 'string' ? { role: who } : who, key);

const sameSet = (a: Set<PermissionKey>, b: Set<PermissionKey>) => a.size === b.size && [...a].every(k => b.has(k));

/**
 * Bir rolün bir yetkisini açar/kapatır. Değiştirilemeyen yetkide null döner.
 * Sonuç varsayılana eşitse rolün değişikliği silinir (rol "varsayılan" görünür).
 */
export const setRolePermission = (overrides: RolePermissions | undefined, role: UserRole, key: PermissionKey, on: boolean): RolePermissions | null => {
    if (!isEditable(key, role)) return null;
    const current = permissionsFor(role, overrides);
    if (on) current.add(key); else current.delete(key);
    const next: RolePermissions = { ...(overrides || {}) };
    if (sameSet(current, permissionsFor(role))) delete next[role];
    else next[role] = PERMISSIONS.filter(p => current.has(p.key) && !p.locked).map(p => p.key);
    return next;
};

/** Rolü varsayılan yetkilerine döndürür */
export const resetRolePermissions = (overrides: RolePermissions | undefined, role: UserRole): RolePermissions => {
    const next: RolePermissions = { ...(overrides || {}) };
    delete next[role];
    return next;
};

/** Varsayılandan farklı olan roller */
export const customizedRoles = (overrides: RolePermissions | undefined): UserRole[] =>
    ROLE_ORDER.filter(r => !sameSet(permissionsFor(r, overrides), permissionsFor(r)));

/** Rolün varsayılana göre eklenen / kaldırılan yetkileri (denetim özeti ve ekran için) */
export const permissionDiff = (role: UserRole, overrides: RolePermissions | undefined): { added: PermissionKey[]; removed: PermissionKey[] } => {
    const now = permissionsFor(role, overrides);
    const base = permissionsFor(role);
    return {
        added: PERMISSIONS.filter(p => now.has(p.key) && !base.has(p.key)).map(p => p.key),
        removed: PERMISSIONS.filter(p => !now.has(p.key) && base.has(p.key)).map(p => p.key),
    };
};
