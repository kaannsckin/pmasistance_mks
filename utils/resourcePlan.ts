import { Person, Resource, Task } from '../types';

/**
 * Proje ekibi (kaynaklar) ve aylık katılım (adam/ay) planı. Katılım yüzde
 * olarak tutulur (100 = tam zamanlı); "güncel katılım" içinde bulunulan ayın
 * plan değeridir.
 */

export const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const lower = (s: string) => s.trim().toLocaleLowerCase('tr-TR');
const newId = () => `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Excel hücresi → yüzde: 0,5 / "50%" / 50 → 50 */
export const parsePercent = (val: unknown): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val <= 1 && val > 0 ? Math.round(val * 100) : Math.round(val);
    const raw = String(val);
    const clean = raw.replace('%', '').replace(',', '.').trim();
    if (!clean) return 0;
    const num = parseFloat(clean);
    if (isNaN(num)) return 0;
    return clean.includes('.') && num <= 1 && !raw.includes('%') ? Math.round(num * 100) : Math.round(num);
};

const UNIT_KEYWORDS = ['toplam', 'değişebilir', 'paket', 'birim', 'grup', 'idame', 'tutum', 'bileşen'];

/**
 * Adam/ay tablosu (ilk sütun ad, sonraki 12 sütun aylar) → kaynaklar. "… Toplam",
 * "… Birim" gibi satırlar birim başlığı sayılır; altındaki kişiler o birime
 * yazılır. Var olan kişi (ad eşleşmesi) güncellenir, yoksa eklenir.
 */
export const rowsToResourcePlan = (rows: unknown[][], existing: Resource[], currentMonth: number): { resources: Resource[]; added: number; updated: number } => {
    const out = [...existing];
    let unit = 'Genel';
    let added = 0, updated = 0;
    rows.slice(1).forEach(row => {
        const name = String(row[0] ?? '').trim();
        if (!name) return;
        const l = lower(name);
        if (UNIT_KEYWORDS.some(k => l.includes(k))) {
            // "Yazılım Birimi Toplam" → "Yazılım" (anahtar sözcük içeren kelimeler atılır)
            unit = name.split(/\s+/).filter(w => !UNIT_KEYWORDS.some(k => lower(w).includes(k))).join(' ') || name;
            return;
        }
        const plan: Record<number, number> = {};
        for (let i = 0; i < 12; i++) plan[i] = parsePercent(row[i + 1]);
        const idx = out.findIndex(r => lower(r.name) === l);
        if (idx > -1) {
            out[idx] = { ...out[idx], monthlyPlan: plan, unit, participation: plan[currentMonth] };
            updated++;
        } else {
            out.push({ id: newId(), name, unit, title: 'Uzman', participation: plan[currentMonth], monthlyPlan: plan });
            added++;
        }
    });
    return { resources: out, added, updated };
};

export interface UnitPlan {
    unit: string;
    resources: Resource[];
    /** Ay başına birim toplamı (%) */
    totals: number[];
    /** Birim kapasitesi: kişi × 100 */
    capacity: number;
}

/** Birimlere göre gruplu plan; birim toplamı kapasiteyi aşarsa uyarı gösterilir */
export const unitPlans = (resources: Resource[]): UnitPlan[] => {
    const groups = new Map<string, Resource[]>();
    resources.forEach(r => {
        const u = r.unit || 'Diğer';
        groups.set(u, [...(groups.get(u) || []), r]);
    });
    return [...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
        .map(([unit, list]) => ({
            unit,
            resources: list,
            totals: Array.from({ length: 12 }, (_, m) => list.reduce((s, r) => s + (r.monthlyPlan?.[m] || 0), 0)),
            capacity: list.length * 100,
        }));
};

/** Bir ayın plan değerini yazar; içinde bulunulan aysa güncel katılım da değişir */
export const setMonthlyValue = (resources: Resource[], id: string, month: number, value: number, currentMonth: number): Resource[] =>
    resources.map(r => (r.id === id
        ? { ...r, monthlyPlan: { ...(r.monthlyPlan || {}), [month]: value }, participation: month === currentMonth ? value : r.participation }
        : r));

/** Kaynağı günceller; ad ya da birim değişirse görevlerdeki atama da güncellenir */
export const updateResource = (resources: Resource[], tasks: Task[], id: string, patch: Partial<Pick<Resource, 'name' | 'unit' | 'title' | 'participation' | 'color'>>): { resources: Resource[]; tasks: Task[] } => {
    const old = resources.find(r => r.id === id);
    if (!old) return { resources, tasks };
    const next = { ...old, ...patch, name: (patch.name ?? old.name).trim() || old.name };
    const nameChanged = next.name !== old.name;
    const unitChanged = next.unit !== old.unit;
    return {
        resources: resources.map(r => (r.id === id ? next : r)),
        tasks: nameChanged || unitChanged
            ? tasks.map(t => (t.resourceName === old.name ? { ...t, resourceName: next.name, unit: unitChanged ? next.unit : t.unit } : t))
            : tasks,
    };
};

/** Aynı adla ikinci kaynak eklenmesin */
export const hasResourceNamed = (resources: Resource[], name: string): boolean => resources.some(r => lower(r.name) === lower(name));

/** Yeni kaynak: güncel ay katılımıyla aylık plan başlatılır */
export const createResource = (name: string, unit: string, title: string, participation: number, currentMonth: number): Resource => ({
    id: newId(),
    name: name.trim(),
    unit: unit.trim(),
    title: title.trim() || 'Uzman',
    participation,
    monthlyPlan: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, i === currentMonth ? participation : 0])),
});

/** Havuz kişisinden kaynak alanları */
export const personToResourceFields = (p: Person): { name: string; unit: string; title: string } => ({
    name: `${p.firstName} ${p.lastName}`.trim(),
    unit: p.departmentCode || '',
    title: p.titleCode || 'Uzman',
});

/** Kişinin projedeki açık / toplam görevi */
export const resourceTaskCounts = (name: string, tasks: Task[]): { open: number; total: number } => {
    const mine = tasks.filter(t => t.resourceName === name);
    return { open: mine.filter(t => t.status !== 'Done').length, total: mine.length };
};
