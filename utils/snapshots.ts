import { Snapshot, WorkspaceData } from '../types';
import { MONTH_INDEXES } from './allocations';

const round2 = (v: number) => Math.round(v * 100) / 100;

const MAX_SNAPSHOTS_PER_YEAR = 24; // localStorage boyutunu korumak için

/** O anın portföy fotoğrafını üretir (kompakt toplamlar). */
export const buildSnapshot = (
    ws: WorkspaceData,
    year: number,
    label: string,
    trigger: Snapshot['trigger']
): Snapshot => {
    const yearAllocations = ws.allocations.filter(a => a.year === year);
    const monthlyPlan = MONTH_INDEXES.map(m => round2(yearAllocations.reduce((s, a) => s + (a.plan[m] || 0), 0)));
    const monthlyActual = MONTH_INDEXES.map(m => round2(yearAllocations.reduce((s, a) => s + (a.actual[m] || 0), 0)));

    const byProject = ws.projects
        .map(p => {
            const list = yearAllocations.filter(a => a.projectId === p.id);
            const planAA = round2(list.reduce((s, a) => s + MONTH_INDEXES.reduce((x, m) => x + (a.plan[m] || 0), 0), 0));
            const actualAA = round2(list.reduce((s, a) => s + MONTH_INDEXES.reduce((x, m) => x + (a.actual[m] || 0), 0), 0));
            return { projectId: p.id, name: p.name, planAA, actualAA };
        })
        .filter(e => e.planAA > 0 || e.actualAA > 0);

    return {
        id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        takenAt: new Date().toISOString(),
        year,
        label,
        trigger,
        totalPlanAA: round2(monthlyPlan.reduce((a, b) => a + b, 0)),
        totalActualAA: round2(monthlyActual.reduce((a, b) => a + b, 0)),
        monthlyPlan,
        monthlyActual,
        byProject,
    };
};

/** Snapshot'ı çalışma alanına ekler; yıl başına üst sınırı korur (en eskiler düşer). */
export const addSnapshot = (ws: WorkspaceData, snapshot: Snapshot): WorkspaceData => {
    const sameYear = ws.snapshots.filter(s => s.year === snapshot.year);
    const others = ws.snapshots.filter(s => s.year !== snapshot.year);
    const trimmed = [...sameYear, snapshot]
        .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
        .slice(-MAX_SNAPSHOTS_PER_YEAR);
    return { ...ws, snapshots: [...others, ...trimmed] };
};

/** Yıl için kronolojik snapshot listesi */
export const snapshotsForYear = (ws: WorkspaceData, year: number): Snapshot[] =>
    ws.snapshots.filter(s => s.year === year).sort((a, b) => a.takenAt.localeCompare(b.takenAt));

/**
 * Projenin baseline'ı: o yıl için en son KİLİT tetiklemeli snapshot'ta
 * projenin plan değeri (onaylanan plan). Kilit baseline'ı yoksa en son
 * manuel snapshot'a düşer.
 */
const MONTHS_TR_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/**
 * Aylık otomatik baseline: uygulama açılışında çağrılır. İçinde bulunulan
 * takvim ayında (o yıl için) henüz hiç anlık görüntü alınmamışsa ve yılda
 * tahsis verisi varsa, "Aylık otomatik" etiketiyle bir snapshot alır.
 * Böylece plan kayması trendi ayda en az bir noktaya sahip olur.
 * Değişiklik gerekmiyorsa null döner.
 */
export const ensureMonthlySnapshot = (ws: WorkspaceData, now: Date = new Date()): WorkspaceData | null => {
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-11
    const hasDataThisYear = ws.allocations.some(a =>
        a.year === year && (Object.keys(a.plan).length > 0 || Object.keys(a.actual).length > 0));
    if (!hasDataThisYear) return null;

    const alreadyThisMonth = ws.snapshots.some(s => {
        if (s.year !== year) return false;
        const t = new Date(s.takenAt);
        return t.getFullYear() === year && t.getMonth() === month;
    });
    if (alreadyThisMonth) return null;

    const snapshot = {
        ...buildSnapshot(ws, year, `Aylık otomatik — ${MONTHS_TR_LONG[month]} ${year}`, 'monthly'),
        takenAt: now.toISOString(),
    };
    return addSnapshot(ws, snapshot);
};

export const baselinePlanFor = (ws: WorkspaceData, projectId: string, year: number): number | undefined => {
    const list = snapshotsForYear(ws, year);
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].trigger !== 'lock') continue;
        const entry = list[i].byProject.find(e => e.projectId === projectId);
        if (entry) return entry.planAA;
    }
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i].byProject.find(e => e.projectId === projectId);
        if (entry) return entry.planAA;
    }
    return undefined;
};
