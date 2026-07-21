import { Person, WorkspaceData } from '../types';

/**
 * Veri sağlığı denetimi — gerçek veriyle çalışmadan önce tutarsızlıkları bulur.
 * Saf/test edilebilir: analiz issue listesi üretir; applyHealthFix issue'ları
 * tek tek (pure) uygular. UI her düzeltmeden sonra yeniden analiz eder.
 */

export type HealthSeverity = 'error' | 'warn' | 'info';

export type HealthCategory =
    | 'orphanAllocationPerson'
    | 'orphanAllocationProject'
    | 'unmatchedTaskAssignee'
    | 'unmatchedRiskOwner'
    | 'unlinkedRiskOwner'
    | 'duplicatePerson'
    | 'missingDepartment'
    | 'missingTitleCost'
    | 'projectWithoutOwner';

export type HealthFix =
    | { kind: 'deleteAllocation'; allocationId: string }
    | { kind: 'addPersonFromName'; name: string }
    | { kind: 'linkRiskOwner'; projectId: string; riskId: string; personId: string };

export interface HealthIssue {
    id: string;
    category: HealthCategory;
    severity: HealthSeverity;
    title: string;
    detail: string;
    fix?: HealthFix;
    fixLabel?: string;
}

export interface HealthReport {
    issues: HealthIssue[];
    counts: { error: number; warn: number; info: number; total: number };
    byCategory: Record<HealthCategory, number>;
}

export const CATEGORY_LABELS: Record<HealthCategory, string> = {
    orphanAllocationPerson: 'Yetim tahsis (kişi havuzda yok)',
    orphanAllocationProject: 'Yetim tahsis (proje yok)',
    unmatchedTaskAssignee: 'Eşleşmeyen görev ataması',
    unmatchedRiskOwner: 'Eşleşmeyen risk sahibi',
    unlinkedRiskOwner: 'Bağlanabilir risk sahibi',
    duplicatePerson: 'Mükerrer personel',
    missingDepartment: 'Bölümü eksik personel',
    missingTitleCost: 'Ünvan/maliyet eksik',
    projectWithoutOwner: 'Sahipsiz proje',
};

const trKey = (s: string): string => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
const fullName = (p: Person): string => `${p.firstName} ${p.lastName}`.trim();

export const analyzeDataHealth = (ws: WorkspaceData): HealthReport => {
    const issues: HealthIssue[] = [];
    const personById = new Map(ws.people.map(p => [p.id, p]));
    const projectById = new Map(ws.projects.map(p => [p.id, p]));
    const personByName = new Map<string, Person>();
    ws.people.forEach(p => { personByName.set(trKey(fullName(p)), p); });

    // 1) Yetim tahsisler
    ws.allocations.forEach(a => {
        if (!personById.has(a.personId)) {
            issues.push({
                id: `orphan-person-${a.id}`,
                category: 'orphanAllocationPerson',
                severity: 'error',
                title: 'Tahsis, havuzda olmayan kişiye bağlı',
                detail: `Tahsis (${a.year}) personId "${a.personId}" havuzda yok. Kişi silinmiş ya da içe aktarım eşleşmemiş olabilir.`,
                fix: { kind: 'deleteAllocation', allocationId: a.id },
                fixLabel: 'Tahsisi sil',
            });
        } else if (!projectById.has(a.projectId)) {
            issues.push({
                id: `orphan-project-${a.id}`,
                category: 'orphanAllocationProject',
                severity: 'error',
                title: 'Tahsis, olmayan projeye bağlı',
                detail: `${personById.get(a.personId) ? fullName(personById.get(a.personId)!) : a.personId} için tahsis (${a.year}) projectId "${a.projectId}" bulunamadı.`,
                fix: { kind: 'deleteAllocation', allocationId: a.id },
                fixLabel: 'Tahsisi sil',
            });
        }
    });

    // 2) Görev/risk atamaları havuzla eşleşiyor mu
    const seenUnmatchedNames = new Set<string>();
    ws.projects.forEach(p => {
        p.tasks.forEach(t => {
            const name = (t.resourceName || '').trim();
            if (!name) return;
            const key = trKey(name);
            if (personByName.has(key)) return;
            const dedup = `task|${key}`;
            if (seenUnmatchedNames.has(dedup)) return;
            seenUnmatchedNames.add(dedup);
            issues.push({
                id: `unmatched-task-${key}`,
                category: 'unmatchedTaskAssignee',
                severity: 'warn',
                title: `Görev ataması havuzda yok: ${name}`,
                detail: `"${name}" adına atanmış görev(ler) var ama havuzda bu kişi yok. Kişi sayfası ve tahsis köprüsü bu görevi eşleştiremez.`,
                fix: { kind: 'addPersonFromName', name },
                fixLabel: 'Havuza kişi ekle',
            });
        });

        (p.risks || []).forEach(r => {
            if (r.ownerPersonId) {
                if (!personById.has(r.ownerPersonId)) {
                    issues.push({
                        id: `risk-badowner-${p.id}-${r.id}`,
                        category: 'unmatchedRiskOwner',
                        severity: 'warn',
                        title: `Risk sahibi havuzda yok: ${r.title}`,
                        detail: `"${p.name}" projesindeki risk sahibinin (personId ${r.ownerPersonId}) havuz kaydı yok.`,
                    });
                }
                return;
            }
            const name = (r.owner || '').trim();
            if (!name) return;
            const key = trKey(name);
            const match = personByName.get(key);
            if (match) {
                issues.push({
                    id: `risk-unlinked-${p.id}-${r.id}`,
                    category: 'unlinkedRiskOwner',
                    severity: 'info',
                    title: `Risk sahibi havuza bağlanabilir: ${name}`,
                    detail: `"${r.title}" riskinin sahibi serbest metin. Havuzdaki ${fullName(match)} ile birebir eşleşiyor — bağlanınca kişi sayfasında görünür.`,
                    fix: { kind: 'linkRiskOwner', projectId: p.id, riskId: r.id, personId: match.id },
                    fixLabel: 'Havuza bağla',
                });
            } else {
                issues.push({
                    id: `risk-unmatched-${p.id}-${r.id}`,
                    category: 'unmatchedRiskOwner',
                    severity: 'warn',
                    title: `Risk sahibi havuzda yok: ${name}`,
                    detail: `"${r.title}" riskinin sahibi "${name}" havuzda yok.`,
                    fix: { kind: 'addPersonFromName', name },
                    fixLabel: 'Havuza kişi ekle',
                });
            }
        });
    });

    // 3) Mükerrer personel (aynı sicil ya da aynı ad)
    const bySicil = new Map<string, Person[]>();
    const byName = new Map<string, Person[]>();
    ws.people.forEach(p => {
        if (p.sicil && p.sicil.trim()) {
            const k = p.sicil.trim();
            (bySicil.get(k) || bySicil.set(k, []).get(k)!).push(p);
        }
        const nk = trKey(fullName(p));
        (byName.get(nk) || byName.set(nk, []).get(nk)!).push(p);
    });
    bySicil.forEach((list, sicil) => {
        if (list.length > 1) {
            issues.push({
                id: `dup-sicil-${sicil}`,
                category: 'duplicatePerson',
                severity: 'warn',
                title: `Mükerrer sicil: ${sicil}`,
                detail: `Aynı sicil ${list.length} kişide: ${list.map(fullName).join(', ')}. Tahsisler bölünmüş olabilir.`,
            });
        }
    });
    byName.forEach((list, key) => {
        if (list.length > 1) {
            issues.push({
                id: `dup-name-${key}`,
                category: 'duplicatePerson',
                severity: 'warn',
                title: `Aynı ada sahip ${list.length} kişi: ${fullName(list[0])}`,
                detail: `Ad eşleşmesi görev/risk atamalarını belirsizleştirir (havuzdan atama yapın).`,
            });
        }
    });

    // 4) Eksik bölüm
    ws.people.forEach(p => {
        if (!p.departmentCode || !p.departmentCode.trim()) {
            issues.push({
                id: `nodept-${p.id}`,
                category: 'missingDepartment',
                severity: 'info',
                title: `Bölümü eksik: ${fullName(p)}`,
                detail: 'Bölüm kodu olmadan bölüm özeti ve bölüm sorumlusu kapsamı bu kişiyi kapsayamaz.',
            });
        }
    });

    // 5) Ünvan/maliyet eksik (maliyet katmanı için) — tahsisli kişilerde önemli
    const allocatedPersonIds = new Set(ws.allocations.map(a => a.personId));
    const titleByCode = new Map(ws.titles.map(t => [t.code, t]));
    ws.people.forEach(p => {
        if (!allocatedPersonIds.has(p.id)) return;
        if (!p.titleCode) {
            issues.push({
                id: `notitle-${p.id}`,
                category: 'missingTitleCost',
                severity: 'info',
                title: `Ünvanı eksik: ${fullName(p)}`,
                detail: 'Ünvan olmadan maliyet hesaplanamaz (bu kişinin tahsisleri maliyete girmez).',
            });
        } else {
            const title = titleByCode.get(p.titleCode);
            if (!title || title.monthlyCost === undefined || title.monthlyCost <= 0) {
                issues.push({
                    id: `nocost-${p.id}`,
                    category: 'missingTitleCost',
                    severity: 'info',
                    title: `Maliyet tanımsız: ${p.titleCode}`,
                    detail: `${fullName(p)} kişisinin ünvanı (${p.titleCode}) için aylık maliyet girilmemiş.`,
                });
            }
        }
    });

    // 6) Sahipsiz proje (RBAC — düzenleyecek PM yok)
    ws.projects.forEach(p => {
        if (!p.pmPersonId) {
            issues.push({
                id: `noowner-${p.id}`,
                category: 'projectWithoutOwner',
                severity: 'warn',
                title: `Sahipsiz proje: ${p.name}`,
                detail: 'Proje Yöneticisi atanmadığı için hiçbir PM içeriğini düzenleyemez. Portföyden sahip atayın.',
            });
        } else if (!personById.has(p.pmPersonId)) {
            issues.push({
                id: `badowner-${p.id}`,
                category: 'projectWithoutOwner',
                severity: 'warn',
                title: `Proje sahibi havuzda yok: ${p.name}`,
                detail: `Atanmış PM (personId ${p.pmPersonId}) havuzda yok. Portföyden yeniden sahip atayın.`,
            });
        }
    });

    const counts = { error: 0, warn: 0, info: 0, total: issues.length };
    const byCategory = Object.fromEntries(Object.keys(CATEGORY_LABELS).map(k => [k, 0])) as Record<HealthCategory, number>;
    issues.forEach(i => { counts[i.severity]++; byCategory[i.category]++; });

    return { issues, counts, byCategory };
};

const newPersonId = (): string => `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Bir sağlık düzeltmesini (pure) uygular; workspace'in yeni kopyasını döner. */
export const applyHealthFix = (ws: WorkspaceData, fix: HealthFix): WorkspaceData => {
    switch (fix.kind) {
        case 'deleteAllocation':
            return { ...ws, allocations: ws.allocations.filter(a => a.id !== fix.allocationId) };
        case 'addPersonFromName': {
            const parts = fix.name.trim().split(/\s+/);
            const firstName = parts.shift() || fix.name.trim();
            const lastName = parts.join(' ');
            // Zaten eklenmişse tekrar ekleme
            if (ws.people.some(p => trKey(fullName(p)) === trKey(fix.name))) return ws;
            const person: Person = { id: newPersonId(), firstName, lastName, departmentCode: '', availableAA: 1, roles: [] };
            return { ...ws, people: [...ws.people, person] };
        }
        case 'linkRiskOwner': {
            const person = ws.people.find(p => p.id === fix.personId);
            return {
                ...ws,
                projects: ws.projects.map(p => p.id !== fix.projectId ? p : {
                    ...p,
                    risks: (p.risks || []).map(r => r.id !== fix.riskId ? r : {
                        ...r,
                        ownerPersonId: fix.personId,
                        owner: person ? fullName(person) : r.owner,
                    }),
                }),
            };
        }
        default:
            return ws;
    }
};
