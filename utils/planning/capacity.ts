import { Leave, Person, Project, Task, TaskStatus } from '../../types';
import { SprintWindow } from '../taskToAllocation';
import { sprintCalendar } from '../sprintCalendar';
import { calculatePertFuzzyPert } from '../timeline';
import { isWorkday as isTrWorkday } from './workdays';

/**
 * Plan kapasite modeli: kişi × sprint için kullanılabilir geliştirme günü.
 *
 *   kapasite = katılım × (net gün ÷ sprint iş günü) × Σ gün (1 − o ayın izin oranı) × hedef doluluk
 *
 *  - Hafta sonu ve resmi tatiller sayılmaz (Türkiye takvimi).
 *  - İzin kişinin ay bazındaki izin AA'sından gün oranına çevrilir (1 AA = tam ay).
 *  - `fromToday`: bugünden önceki günler sayılmaz (sürmekte olan sprintte kalan kapasite).
 *  - Hedef doluluk (ör. %85) plan tamponudur: toplantı, destek, beklenmeyen işler.
 *  - Sprint içi test (net gün < sprint günü) her güne oransal yansır.
 *
 * Kaynak adı veri havuzundaki kişiyle ad soyadından eşleşir; eşleşmezse izin düşülmez.
 */

export const UNASSIGNED = 'Atanmamış';

const DAY = 86_400_000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const fold = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface CapacityInput {
    project: Project;
    people?: Person[];
    leaves?: Leave[];
    /** 0,5–1; varsayılan 1 (tampon yok) */
    targetLoad?: number;
    /** Bu tarihten önceki günler sayılmaz (verilmezse sprintin tamamı) */
    fromDate?: Date;
}

export interface SprintCapacity {
    /** Kullanılabilir gün (hedef doluluk uygulanmış) */
    days: number;
    /** Hedef doluluk öncesi gün */
    full: number;
    /** İzin nedeniyle düşen gün (katılım ve net oran uygulanmış) */
    leaveDays: number;
    /** Resmi tatil sayısı (iş günü) */
    holidays: number;
    /** Geçmiş (bugünden önce) iş günü */
    elapsed: number;
}

export type CapacityFn = (w: SprintWindow, resource: string) => SprintCapacity;

/** Kişi × sprint kapasite işlevi (önbellekli) */
export const capacityModel = (input: CapacityInput): CapacityFn => {
    const { project } = input;
    const cal = sprintCalendar(project.settings);
    const sprintDays = cal.weeks * 5;
    const netFactor = sprintDays > 0 ? cal.netDays / sprintDays : 0;
    const target = Math.max(0.3, Math.min(1, input.targetLoad ?? 1));
    const from = input.fromDate ? dayStart(input.fromDate) : -Infinity;
    const participation = new Map<string, number>();
    project.resources.forEach(r => participation.set(r.name, (participation.get(r.name) || 0) + (r.participation || 0) / 100));
    const personOf = new Map<string, Person>();
    (input.people || []).forEach(p => personOf.set(fold(`${p.firstName} ${p.lastName}`), p));
    const leaveRatio = (personId: string | undefined, d: Date): number => {
        if (!personId || !input.leaves?.length) return 0;
        const aa = input.leaves.filter(l => l.personId === personId && l.year === d.getFullYear() && l.month === d.getMonth() + 1).reduce((s, l) => s + (l.aa || 0), 0);
        return Math.max(0, Math.min(1, aa));
    };
    const cache = new Map<string, SprintCapacity>();
    return (w, resource) => {
        const key = `${w.sprint}|${resource}`;
        const hit = cache.get(key);
        if (hit) return hit;
        // Projede kaynak kaydı olmayan kişi (havuzdan atanmış) ve atanmamış iş: tek kişi tam katılım
        const share = participation.get(resource) ?? 1;
        const person = resource === UNASSIGNED ? undefined : personOf.get(fold(resource));
        let avail = 0, lost = 0, holidays = 0, elapsed = 0;
        for (let t = dayStart(w.start); t <= dayStart(w.end); t += DAY) {
            const d = new Date(t);
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            if (!isTrWorkday(d)) { holidays++; continue; }
            if (t < from) { elapsed++; continue; }
            const leave = leaveRatio(person?.id, d);
            avail += 1 - leave;
            lost += leave;
        }
        const full = share * netFactor * avail;
        const out: SprintCapacity = {
            days: Math.round(full * target * 100) / 100,
            full: round1(full),
            leaveDays: round1(share * netFactor * lost),
            holidays,
            elapsed,
        };
        cache.set(key, out);
        return out;
    };
};

// ------------------------------------------------------------------ efor

export interface EffortInput {
    /** Jira kalan süresi (saat) varsa başlamış işte onu kullan */
    useRemaining?: boolean;
    /** Görev başına geçmiş sapma çarpanı (gerçekleşen ÷ tahmin, ör. 1,3); yalnız başlamamış işe */
    calibrate?: (t: Task) => number | undefined;
    /** Sürmekte olan sprintte kalan gün oranı (0–1): Jira kalanı olmayan devam eden işin kalanı için */
    remainingFraction?: number;
}

export const pertOf = (t: Pick<Task, 'time'>): number => calculatePertFuzzyPert(t.time).pert;

/** Planlanacak (kalan) efor, gün */
export const remainingEffort = (t: Task, o: EffortInput = {}): number => {
    if (t.status === TaskStatus.Done) return 0;
    const started = t.status === TaskStatus.InProgress || (t.actualHours || 0) > 0;
    if (o.useRemaining && started && typeof t.remainingEstimateHours === 'number' && t.remainingEstimateHours >= 0) return t.remainingEstimateHours / 8;
    const base = pertOf(t);
    if (started) {
        // Kalan bilinmiyor: harcanan saat varsa tahminden düşülür, yoksa sprintte kalan gün oranı (en az %25)
        if ((t.actualHours || 0) > 0) return Math.max(base * 0.25, base - (t.actualHours || 0) / 8);
        return base * Math.max(0.25, Math.min(1, o.remainingFraction ?? 1));
    }
    const k = o.calibrate?.(t);
    return k && Number.isFinite(k) ? base * Math.max(0.5, Math.min(3, k)) : base;
};
