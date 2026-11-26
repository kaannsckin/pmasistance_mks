import { Project, ProjectComponent, ProjectProgressModel, ProjectVersion, ReleasePlan, Task, TaskStatus } from '../types';
import { progressOf } from './progress';

/**
 * Projeye özel bileşen ve sürüm listeleri (Jira "Components" ve
 * "Versions/Releases"). Proje sahibi ve yönetici yönetir. Görevler
 * `components` (birden çok) ve `fixVersion` (hedef sürüm) ile bağlanır;
 * yeniden adlandırma/silme görevlerdeki başvuruları da günceller.
 */

const norm = (s: string) => s.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
let seq = 0;
export const listId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

export const VERSION_STATUS_LABELS: Record<ProjectVersion['status'], string> = {
    unreleased: 'Yayınlanmadı',
    released: 'Yayınlandı',
    archived: 'Arşivlendi',
};

/** Plan kendi sürümünü ya da aynı adlı mevcut proje sürümünü kullanır. */
export const versionForReleasePlan = (versions: ProjectVersion[], plan: ReleasePlan, proposed?: ProjectVersion): ProjectVersion =>
    versions.find(v => v.id === plan.versionId)
    || versions.find(v => norm(v.name) === norm(proposed?.name || plan.name.trim() || 'Adsız sürüm'))
    || proposed
    || {
        id: `version-${plan.id}`,
        name: plan.name.trim() || 'Adsız sürüm',
        description: plan.summary?.trim() || undefined,
        startDate: plan.startDate,
        releaseDate: plan.targetDate,
        status: 'unreleased',
    };

/** Eski aktarılmış planlara proje sürümü ekler. Güncel görev atamaları korunur. */
export const migrateReleaseVersions = (project: Project): Project => {
    const legacy = (project.releasePlans || []).filter(p => p.status === 'committed' && !p.versionId);
    if (!legacy.length) return project;

    const versions = [...(project.versions || [])];
    const planVersions = new Map<string, ProjectVersion>();
    const taskVersions = new Map<string, string>();
    // Bir görev geçmişte birkaç plana girmişse son aktarımın sürümü kullanılır.
    legacy.sort((a, b) => (a.baseline?.at || a.updatedAt).localeCompare(b.baseline?.at || b.updatedAt));
    for (const plan of legacy) {
        const version = versionForReleasePlan(versions, plan);
        if (!versions.includes(version)) versions.push(version);
        planVersions.set(plan.id, version);
        (plan.baseline?.taskIds || plan.manualCommit?.taskIds)?.forEach(id => taskVersions.set(id, version.name));
    }
    return {
        ...project,
        versions,
        tasks: project.tasks.map(t => !t.fixVersion && taskVersions.has(t.id) ? { ...t, fixVersion: taskVersions.get(t.id) } : t),
        releasePlans: project.releasePlans!.map(p => {
            const version = planVersions.get(p.id);
            return version ? { ...p, versionId: version.id } : p;
        }),
    };
};

/** Görevlerde geçen ama listede olmayan bileşen ve sürüm adları (Jira'dan gelenler dahil) */
export const listSuggestions = (p: Pick<Project, 'tasks' | 'components' | 'versions'>): { components: { name: string; count: number }[]; versions: { name: string; count: number }[] } => {
    const have = (list: { name: string }[] | undefined) => new Set((list || []).map(x => norm(x.name)));
    const hc = have(p.components);
    const hv = have(p.versions);
    // Yazım farkları (İstemci / istemci) tek öneride: ilk görülen yazım
    const comps = new Map<string, { name: string; count: number }>();
    const vers = new Map<string, { name: string; count: number }>();
    const bump = (m: Map<string, { name: string; count: number }>, raw: string) => {
        const k = norm(raw);
        const cur = m.get(k);
        m.set(k, { name: cur?.name || raw.trim(), count: (cur?.count || 0) + 1 });
    };
    p.tasks.forEach(t => {
        (t.components || []).forEach(c => { if (c.trim() && !hc.has(norm(c))) bump(comps, c); });
        if (t.fixVersion?.trim() && !hv.has(norm(t.fixVersion))) bump(vers, t.fixVersion);
    });
    const sort = (m: Map<string, { name: string; count: number }>) => [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'tr'));
    return { components: sort(comps), versions: sort(vers) };
};

export const componentUsage = (tasks: Task[], name: string): number => tasks.filter(t => (t.components || []).some(c => norm(c) === norm(name))).length;

export interface VersionProgress {
    total: number;
    done: number;
    open: number;
    /** Yayın tarihi geçmiş ve yayınlanmamış */
    late: boolean;
    /** Durum yüzdeleriyle ilerleme (0–100; model yoksa tamamlanan oranı) */
    pct: number;
}

export const versionProgress = (tasks: Task[], v: ProjectVersion, now: Date = new Date(), model?: ProjectProgressModel): VersionProgress => {
    const list = tasks.filter(t => t.fixVersion && norm(t.fixVersion) === norm(v.name));
    const done = list.filter(t => t.status === TaskStatus.Done).length;
    return {
        total: list.length,
        done,
        open: list.length - done,
        late: v.status === 'unreleased' && !!v.releaseDate && v.releaseDate < now.toISOString().slice(0, 10),
        pct: progressOf(list, model).pct,
    };
};

/** Bileşen adı değişti / silindi: görev başvuruları güncellenir */
export const renameComponentInTasks = (tasks: Task[], oldName: string, newName: string | null): Task[] =>
    tasks.map(t => {
        if (!(t.components || []).some(c => norm(c) === norm(oldName))) return t;
        const rest = (t.components || []).filter(c => norm(c) !== norm(oldName));
        const next = newName && !rest.some(c => norm(c) === norm(newName)) ? [...rest, newName] : rest;
        return { ...t, components: next.length ? next : undefined };
    });

/** Sürüm adı değişti / silindi: hedef sürüm başvuruları güncellenir */
export const renameVersionInTasks = (tasks: Task[], oldName: string, newName: string | null): Task[] =>
    tasks.map(t => (t.fixVersion && norm(t.fixVersion) === norm(oldName) ? { ...t, fixVersion: newName || undefined } : t));

/**
 * Sürümü yayınlar (Jira "Release"): sürüm "yayınlandı" olur; bitmemiş
 * görevler başka bir sürüme taşınır ya da hedef sürümden çıkarılır.
 */
export const releaseVersion = (
    p: Pick<Project, 'tasks' | 'versions'>,
    versionId: string,
    moveOpenTo: string | null,
    now: Date = new Date(),
): { tasks: Task[]; versions: ProjectVersion[]; moved: number } => {
    const v = (p.versions || []).find(x => x.id === versionId);
    if (!v) return { tasks: p.tasks, versions: p.versions || [], moved: 0 };
    let moved = 0;
    const tasks = p.tasks.map(t => {
        if (!t.fixVersion || norm(t.fixVersion) !== norm(v.name) || t.status === TaskStatus.Done) return t;
        moved++;
        return { ...t, fixVersion: moveOpenTo || undefined };
    });
    const versions = (p.versions || []).map(x => (x.id === versionId ? { ...x, status: 'released' as const, releasedAt: now.toISOString().slice(0, 10), releaseDate: x.releaseDate || now.toISOString().slice(0, 10) } : x));
    return { tasks, versions, moved };
};

/** Bileşenin varsayılan ataması (Jira "component lead as default assignee") */
export const defaultAssigneeFor = (components: ProjectComponent[] | undefined, names: string[] | undefined): string | undefined => {
    for (const n of names || []) {
        const c = (components || []).find(x => norm(x.name) === norm(n));
        if (c?.assignLead && c.lead) return c.lead;
    }
    return undefined;
};

/** Liste doğrulaması: boş ya da tekrar eden ad */
export const listProblems = (components: ProjectComponent[], versions: ProjectVersion[]): string[] => {
    const errs: string[] = [];
    const dup = (names: string[]) => names.filter((n, i) => names.findIndex(x => norm(x) === norm(n)) !== i);
    if (components.some(c => !c.name.trim()) || versions.some(v => !v.name.trim())) errs.push('Ad boş olamaz.');
    const dc = dup(components.map(c => c.name));
    if (dc.length) errs.push(`Aynı adlı bileşen: ${[...new Set(dc)].join(', ')}.`);
    const dv = dup(versions.map(v => v.name));
    if (dv.length) errs.push(`Aynı adlı sürüm: ${[...new Set(dv)].join(', ')}.`);
    if (versions.some(v => v.startDate && v.releaseDate && v.startDate > v.releaseDate)) errs.push('Sürümün başlangıcı yayın tarihinden sonra olamaz.');
    return errs;
};
