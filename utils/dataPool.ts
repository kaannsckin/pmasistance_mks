import { Department, Person, RoleCatalogEntry, TitleDef } from '../types';

/**
 * Veri havuzu (personel, bölüm, rol, ünvan) — süzme, eksik bilgi denetimi
 * ve ekleme/düzenleme doğrulamaları (saf, test edilebilir).
 */

export const trNorm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
export const trUpper = (s: string): string => s.trim().toLocaleUpperCase('tr-TR');
export const fullName = (p: Pick<Person, 'firstName' | 'lastName'>): string => `${p.firstName} ${p.lastName}`.trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PersonIssue = 'department' | 'title' | 'email' | 'cost';

export const PERSON_ISSUE_LABELS: Record<PersonIssue, string> = {
    department: 'Bölüm yok',
    title: 'Ünvan yok',
    cost: 'Ünvan maliyeti yok',
    email: 'E-posta yok',
};

/** Kişideki eksikler: bölüm, ünvan (maliyet hesabı), ünvan maliyeti, e-posta (hatırlatma/bildirim) */
export const personIssues = (p: Person, departments: Department[], titles: TitleDef[]): PersonIssue[] => {
    const out: PersonIssue[] = [];
    if (!p.departmentCode || !departments.some(d => d.code === p.departmentCode)) out.push('department');
    const title = p.titleCode ? titles.find(t => t.code === p.titleCode) : undefined;
    if (!title) out.push('title');
    else if (!title.monthlyCost) out.push('cost');
    if (!p.email || !EMAIL_RE.test(p.email)) out.push('email');
    return out;
};

export interface PeopleFilter {
    query?: string;
    department?: string; // 'all' | kod | '' (bölümsüz)
    issue?: PersonIssue | 'any' | null;
}

export const filterPeople = (people: Person[], f: PeopleFilter, departments: Department[], titles: TitleDef[]): Person[] => {
    const q = f.query ? trNorm(f.query) : '';
    return people
        .filter(p => !f.department || f.department === 'all' || p.departmentCode === f.department)
        .filter(p => !q || trNorm([fullName(p), p.sicil, p.email, p.titleCode, p.departmentCode, ...p.roles].filter(Boolean).join(' ')).includes(q))
        .filter(p => {
            if (!f.issue) return true;
            const issues = personIssues(p, departments, titles);
            return f.issue === 'any' ? issues.length > 0 : issues.includes(f.issue);
        })
        .sort((a, b) => fullName(a).localeCompare(fullName(b), 'tr'));
};

export const issueCounts = (people: Person[], departments: Department[], titles: TitleDef[]): Record<PersonIssue, number> & { any: number } => {
    const c = { department: 0, title: 0, cost: 0, email: 0, any: 0 };
    people.forEach(p => {
        const i = personIssues(p, departments, titles);
        i.forEach(k => { c[k]++; });
        if (i.length) c.any++;
    });
    return c;
};

// ---------------------------------------------------------------- doğrulama

export interface PersonDraft {
    firstName: string;
    lastName: string;
    sicil: string;
    email: string;
    departmentCode: string;
    titleCode: string;
    availableAA: number;
    roles: string[];
}

export const emptyPersonDraft = (departmentCode = ''): PersonDraft => ({ firstName: '', lastName: '', sicil: '', email: '', departmentCode, titleCode: '', availableAA: 1, roles: [] });

export const personToDraft = (p: Person): PersonDraft => ({
    firstName: p.firstName, lastName: p.lastName, sicil: p.sicil || '', email: p.email || '', departmentCode: p.departmentCode || '',
    titleCode: p.titleCode || '', availableAA: p.availableAA, roles: [...p.roles],
});

/** Hata (kaydedilemez) ve uyarı (kaydedilebilir) */
export const validatePerson = (d: PersonDraft, people: Person[], editingId?: string): { errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!d.firstName.trim() || !d.lastName.trim()) errors.push('Ad ve soyad zorunludur.');
    if (d.email.trim() && !EMAIL_RE.test(d.email.trim())) errors.push('E-posta adresi geçersiz.');
    if (!(d.availableAA >= 0 && d.availableAA <= 1.5)) errors.push('Kullanılabilir AA 0 ile 1,5 arasında olmalı.');
    const others = people.filter(p => p.id !== editingId);
    if (d.sicil.trim() && others.some(p => p.sicil && trNorm(p.sicil) === trNorm(d.sicil))) errors.push(`"${d.sicil.trim()}" sicil numarası başka bir kişide kayıtlı.`);
    if (d.firstName.trim() && d.lastName.trim() && others.some(p => trNorm(fullName(p)) === trNorm(`${d.firstName} ${d.lastName}`))) {
        warnings.push('Aynı adlı bir kişi havuzda var; sicil ile ayırt edin.');
    }
    if (d.email.trim() && others.some(p => p.email && trNorm(p.email) === trNorm(d.email))) warnings.push('Bu e-posta başka bir kişide de kayıtlı.');
    return { errors, warnings };
};

export const draftToPerson = (d: PersonDraft, base?: Person): Person => ({
    ...(base || { id: `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }),
    firstName: d.firstName.trim(),
    lastName: d.lastName.trim(),
    sicil: d.sicil.trim() || undefined,
    email: d.email.trim().toLowerCase() || undefined,
    departmentCode: d.departmentCode,
    titleCode: d.titleCode || undefined,
    availableAA: d.availableAA,
    roles: [...new Set(d.roles.map(r => r.trim()).filter(Boolean))],
});

export const validateDepartmentCode = (code: string, departments: Department[], editingCode?: string): string | null => {
    const c = trUpper(code);
    if (!c) return 'Bölüm kodu zorunludur (ör. U310).';
    if (departments.some(d => d.code !== editingCode && trUpper(d.code) === c)) return `"${c}" bölüm kodu zaten var.`;
    return null;
};

export const validateTitleCode = (code: string, titles: TitleDef[], editingCode?: string): string | null => {
    const c = trUpper(code);
    if (!c) return 'Ünvan kısaltması zorunludur (ör. ARŞ).';
    if (titles.some(t => t.code !== editingCode && trUpper(t.code) === c)) return `"${c}" ünvanı zaten var.`;
    return null;
};

export const validateRole = (departmentCode: string, name: string, roles: RoleCatalogEntry[]): string | null => {
    if (!departmentCode) return 'Bir bölüm seçin.';
    if (!name.trim()) return 'Rol adı zorunludur.';
    if (roles.some(r => r.departmentCode === departmentCode && trNorm(r.name) === trNorm(name))) return 'Bu bölümde aynı rol zaten tanımlı.';
    return null;
};

/** Rol kataloğu bölüm bazında (bölüm sırasıyla) */
export const rolesByDepartment = (roles: RoleCatalogEntry[], departments: Department[]): { code: string; name: string; roles: RoleCatalogEntry[] }[] => {
    const names = new Map(departments.map(d => [d.code, d.name]));
    const groups = new Map<string, RoleCatalogEntry[]>();
    roles.forEach(r => groups.set(r.departmentCode, [...(groups.get(r.departmentCode) || []), r]));
    return [...groups.entries()]
        .map(([code, rs]) => ({ code, name: names.get(code) || code, roles: rs.sort((a, b) => a.name.localeCompare(b.name, 'tr')) }))
        .sort((a, b) => a.code.localeCompare(b.code, 'tr'));
};
