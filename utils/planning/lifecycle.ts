import { IssueType, Task, TaskStatus } from '../../types';
import { workdaysBetween } from './workdays';

/**
 * Kayıt yaşam döngüsü: açılış, ilk başlama, kapanış ve durum geçişleri.
 * "Kaç günde kapandı" bu damgalardan iş günü olarak ölçülür:
 *  - lead time: açılış → kapanış
 *  - cycle time: ilk başlama → kapanış
 * Damgalar uygulamadaki her yerel değişiklikte (pano, liste, form, AI
 * önerisi) otomatik vurulur; içe aktarılan kayıtlarda kaynaktan gelir.
 */

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
    bug: 'Hata',
    feature: 'Yeni özellik',
    improvement: 'İyileştirme',
    task: 'Görev',
    other: 'Diğer',
};

const MAX_LOG = 50;

/** Durum değişikliğini damgalar: geçiş günlüğü, ilk başlama, kapanış / yeniden açılış */
export const withStatus = (t: Task, to: TaskStatus, now: Date = new Date()): Task => {
    if (t.status === to) return t;
    const at = now.toISOString();
    const statusLog = [...(t.statusLog || []), { at, from: t.status, to }].slice(-MAX_LOG);
    const startedAt = to === TaskStatus.InProgress && !t.startedAt ? at : t.startedAt;
    const resolvedAt = to === TaskStatus.Done ? at : t.status === TaskStatus.Done ? undefined : t.resolvedAt;
    return { ...t, status: to, statusLog, startedAt, resolvedAt };
};

/**
 * Yerel bir değişiklik sonrası görev listesini damgalar: yeni kayıtlara açılış
 * zamanı (içe aktarılanlar hariç), durumu değişenlere geçiş. Değişmeyen
 * görevler aynı nesne olarak kalır.
 */
export const stampLifecycle = (prev: Task[], next: Task[], now: Date = new Date()): Task[] => {
    const before = new Map(prev.map(t => [t.id, t]));
    let changed = false;
    const out = next.map(t => {
        const old = before.get(t.id);
        if (!old) {
            if (t.createdAt || t.importedAt) return t;
            changed = true;
            const at = now.toISOString();
            return {
                ...t,
                createdAt: at,
                ...(t.status === TaskStatus.InProgress && !t.startedAt ? { startedAt: at } : {}),
                ...(t.status === TaskStatus.Done && !t.resolvedAt ? { resolvedAt: at } : {}),
            };
        }
        if (old.status === t.status || t.statusLog !== old.statusLog) return t; // değişmedi ya da çağıran zaten damgaladı
        changed = true;
        return withStatus({ ...t, status: old.status }, t.status, now);
    });
    return changed ? out : next;
};

export interface TaskDurations {
    leadDays: number | null; // açılış → kapanış (iş günü, uçlar dahil)
    cycleDays: number | null; // ilk başlama → kapanış
    reopened: number; // kapanıp yeniden açılma sayısı
    estimateDays: number | null; // PERT beklenen süre (b + 4m + w) / 6
}

/**
 * Görev tahmininin aralığı. Formda tek değer girilince uçlar boş (0) kalır:
 * boş uç olası değere eşit sayılır ({0, 5, 0} → 5 · 5 · 5); olası boşsa
 * uçların ortası alınır; sıra bozuksa sıralanır. Geçmişin kalibrasyon oranı
 * ile simülasyon aynı tabanı kullansın diye tek yerde.
 */
export const estimateRange = (t: Pick<Task, 'time'>): { best: number; likely: number; worst: number } | null => {
    const { best = 0, avg = 0, worst = 0 } = t.time || {};
    if (!(avg > 0 || best > 0 || worst > 0)) return null;
    const likely = avg > 0 ? avg : best > 0 && worst > 0 ? (best + worst) / 2 : Math.max(best, worst);
    const [b, m, w] = [best > 0 ? best : likely, likely, worst > 0 ? worst : likely].sort((x, y) => x - y);
    return { best: b, likely: m, worst: w };
};

export const pertDays = (t: Pick<Task, 'time'>): number | null => {
    const r = estimateRange(t);
    return r ? Math.round(((r.best + 4 * r.likely + r.worst) / 6) * 10) / 10 : null;
};

export const taskDurations = (t: Task): TaskDurations => {
    const done = t.status === TaskStatus.Done && !!t.resolvedAt;
    return {
        leadDays: done && t.createdAt ? workdaysBetween(t.createdAt, t.resolvedAt!) : null,
        cycleDays: done && t.startedAt ? workdaysBetween(t.startedAt, t.resolvedAt!) : null,
        reopened: (t.statusLog || []).filter(c => c.from === TaskStatus.Done && c.to !== TaskStatus.Done).length,
        estimateDays: pertDays(t),
    };
};
