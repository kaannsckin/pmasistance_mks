import { Task, TaskStatus } from '../../types';
import { completesGroup } from '../../utils/easterEggs';

/** Modern görev ekranlarının ortak etiketleri ve hesapları */

export const PRIORITY_META: Record<Task['priority'], { label: string; ink: string; rank: number }> = {
    Blocker: { label: 'Engelleyici', ink: 'm-ink-bad', rank: 0 },
    High: { label: 'Yüksek', ink: 'm-ink-warn', rank: 1 },
    Medium: { label: 'Orta', ink: 'm-ink-hold', rank: 2 },
    Low: { label: 'Düşük', ink: 'm-ink-hold', rank: 3 },
};

export type BoardColumn = TaskStatus.ToDo | TaskStatus.InProgress | TaskStatus.Done;

export const COLUMN_META: Record<BoardColumn, { label: string; ring: string; fill: string }> = {
    [TaskStatus.ToDo]: { label: 'Yapılacak', ring: 'var(--m-hold)', fill: 'transparent' },
    [TaskStatus.InProgress]: { label: 'Süreçte', ring: 'var(--m-accent)', fill: 'var(--m-accent-tint)' },
    [TaskStatus.Done]: { label: 'Tamamlandı', ring: 'var(--m-ok)', fill: 'var(--m-ok)' },
};

/** Backlog, panoda "Yapılacak" sütununda görünür (klasik panoyla aynı) */
export const columnOf = (status: TaskStatus): BoardColumn =>
    status === TaskStatus.Backlog ? TaskStatus.ToDo : (status as BoardColumn);

const DAY = 86_400_000;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Bitiş tarihi geçmiş ve bitmemişse kaç gün geciktiği (yoksa 0) */
export const daysLate = (task: Pick<Task, 'dueDate' | 'status'>, now: Date = new Date()): number => {
    if (!task.dueDate || task.status === TaskStatus.Done) return 0;
    const due = new Date(task.dueDate);
    if (isNaN(due.getTime())) return 0;
    const diff = Math.floor((dayStart(now) - dayStart(due)) / DAY);
    return diff > 0 ? diff : 0;
};

export const missingEstimate = (task: Pick<Task, 'time' | 'status'>): boolean =>
    task.status !== TaskStatus.Done && !(task.time?.avg > 0 || task.time?.best > 0 || task.time?.worst > 0);

export const shortDate = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

export const initialsOf = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toLocaleUpperCase('tr-TR');
};

export const sprintLabel = (version: number, names?: Record<number, string>): string =>
    version === 0 ? 'Havuz' : names?.[version]?.trim() || `Sürüm ${version}`;

/** Bu durum değişikliği projeyi ya da bir sürümü bitiriyorsa kutlama mesajı */
export const celebrationFor = (tasks: Task[], id: string, status: TaskStatus, names?: Record<number, string>): string | null => {
    if (status !== TaskStatus.Done) return null;
    const task = tasks.find(t => t.id === id);
    if (!task) return null;
    if (completesGroup(tasks, id, status)) return 'Proje tamamlandı! Tebrikler.';
    if (task.version > 0 && completesGroup(tasks.filter(t => t.version === task.version), id, status)) {
        return `${sprintLabel(task.version, names)} tamamlandı!`;
    }
    return null;
};

/** Tekrarsız liste (sırayı korur) */
export const uniq = <T,>(arr: T[]): T[] => arr.filter((v, i) => arr.indexOf(v) === i);
