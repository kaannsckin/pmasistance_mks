import { Person, Resource, Task } from '../../types';
import { JiraIssueRecord } from '../integrations';
import { foldTr } from '../rag/text';

/**
 * Jira'daki atanan kişileri uygulamaya taşır: Veri Havuzu'nda olmayanlar
 * kişi olarak açılır, projenin ekibinde olmayanlar kaynak olarak eklenir.
 * Eşleşme e-posta, ad soyad ya da (tek kelimelik adda) ad ile yapılır;
 * aynı kişi iki kez açılmaz.
 */

const fold = (s: string) => foldTr(s.trim()).replace(/\s+/g, ' ');
const fullName = (p: Person) => `${p.firstName} ${p.lastName}`.trim();
const slug = (s: string) => foldTr(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const keyOf = (s: string | undefined) => (s || '').trim().toUpperCase();

export const isUnassigned = (name: string | undefined): boolean => !name?.trim() || /^(atanmam|unassigned)/i.test(foldTr(name.trim()));

const findPerson = (people: Person[], name: string, email?: string): Person | undefined => {
    const e = (email || '').trim().toLowerCase();
    if (e) { const hit = people.find(p => (p.email || '').toLowerCase() === e); if (hit) return hit; }
    const q = fold(name);
    return people.find(p => fold(fullName(p)) === q) || (!q.includes(' ') ? people.find(p => fold(p.firstName) === q) : undefined);
};

export interface JiraPeopleResult {
    people: Person[];
    resources: Resource[];
    /** Havuza yeni eklenen kişiler */
    addedPeople: string[];
    /** Proje ekibine yeni eklenen kaynaklar */
    addedResources: string[];
}

/**
 * `tasks`: eşitleme sonrası projenin görevleri; yalnız eşitlenen (Jira'dan gelen)
 * kayıtların atananları dikkate alınır. Kaynağın birimi, kişinin görevlerinde en sık geçen birimdir.
 */
export const ensureJiraPeople = (
    people: Person[],
    resources: Resource[],
    tasks: Task[],
    issues: JiraIssueRecord[],
    now: Date = new Date(),
): JiraPeopleResult => {
    const synced = new Set(issues.map(i => keyOf(i.key)));
    const emailOf = new Map<string, string>();
    issues.forEach(i => { if (i.assignee && i.assigneeEmail) emailOf.set(fold(i.assignee), i.assigneeEmail); });

    // kişi → birim sayımı
    const units = new Map<string, { name: string; units: Map<string, number> }>();
    tasks.forEach(t => {
        if (!synced.has(keyOf(t.jiraId)) || isUnassigned(t.resourceName)) return;
        const k = fold(t.resourceName);
        const e = units.get(k) || { name: t.resourceName.trim(), units: new Map() };
        if (t.unit) e.units.set(t.unit, (e.units.get(t.unit) || 0) + 1);
        units.set(k, e);
    });

    let outPeople = people;
    let outResources = resources;
    const addedPeople: string[] = [];
    const addedResources: string[] = [];
    const stamp = now.getTime().toString(36);
    units.forEach(({ name, units: u }, k) => {
        const email = emailOf.get(k);
        let person = findPerson(outPeople, name, email);
        if (!person) {
            const parts = name.split(/\s+/);
            person = {
                id: `person-jira-${slug(name) || 'kisi'}-${stamp}`,
                firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0],
                lastName: parts.length > 1 ? parts[parts.length - 1] : '',
                departmentCode: 'Tanımsız',
                availableAA: 1,
                roles: [],
                ...(email ? { email } : {}),
            };
            outPeople = [...outPeople, person];
            addedPeople.push(name);
        } else if (email && !person.email) {
            const id = person.id;
            outPeople = outPeople.map(p => (p.id === id ? { ...p, email } : p));
        }
        const pname = fullName(person) || name;
        if (outResources.some(r => fold(r.name) === fold(pname) || fold(r.name) === k)) return;
        const unit = [...u].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Genel';
        outResources = [...outResources, { id: `res-jira-${slug(pname) || 'kisi'}-${stamp}`, name: pname, participation: 100, unit, title: '' }];
        addedResources.push(pname);
    });
    return { people: outPeople, resources: outResources, addedPeople, addedResources };
};
