import { Project, Task, TaskStatus } from '../../types';
import { JiraCreateInput, JiraCreateResult } from '../integrations';
import { HOURS_PER_DAY } from './history';
import { pertDays } from './lifecycle';

/**
 * Planlamadaki kayıtları Jira'da açmak için saf yardımcılar. Sorumlu (kişi
 * adı) gönderilmez; Jira'da atama ekipçe yapılır. Birim, Jira projesinde
 * aynı adlı bileşen varsa bileşen olur; tahmin ilk tahmine (saat) çevrilir.
 */

/**
 * Bir istekte gönderilen kayıt sayısı (sunucu sınırı 50). Küçük tutulur:
 * sunucusuz fonksiyon süre sınırına takılırsa o parçada açılan kayıtların
 * anahtarı kaybolur (yeniden göndermede çift kayıt olur).
 */
export const JIRA_BATCH = 5;

/** Jira'da açılabilecek kayıtlar: anahtarı olmayan, kapanmamış */
export const jiraExportCandidates = (project: Pick<Project, 'tasks'>): Task[] =>
    project.tasks.filter(t => !t.jiraId?.trim() && t.status !== TaskStatus.Done && t.name.trim());

export const jiraInputOf = (t: Task): JiraCreateInput => {
    const days = pertDays(t);
    return {
        ref: t.id,
        summary: t.name.replace(/\s+/g, ' ').trim().slice(0, 255),
        description: t.notes?.trim() || undefined,
        issueType: t.issueType,
        priority: t.priority,
        component: t.unit?.trim() || undefined,
        estimateHours: days ? Math.round(days * HOURS_PER_DAY * 10) / 10 : undefined,
    };
};

export const chunk = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Açılan kayıtların anahtarlarını görevlere yazar; zaten anahtarı olan görev değişmez */
export const linkJiraKeys = (tasks: Task[], links: Record<string, string>): { tasks: Task[]; linked: number } => {
    let linked = 0;
    const out = tasks.map(t => {
        const key = links[t.id];
        if (!key || t.jiraId?.trim()) return t;
        linked++;
        return { ...t, jiraId: key };
    });
    return { tasks: linked ? out : tasks, linked };
};

/** Sonuçların özeti: açılan anahtarlar, hatalar ve Jira ekranında olmadığı için gönderilmeyen alanlar */
export const summarizeJiraResults = (results: JiraCreateResult[]) => {
    const created = results.filter(r => r.key);
    const dropped = [...new Set(created.flatMap(r => r.dropped || []))];
    return {
        links: Object.fromEntries(created.map(r => [r.ref, r.key!])) as Record<string, string>,
        created: created.length,
        failed: results.filter(r => !r.key).map(r => ({ ref: r.ref, error: r.error || 'Bilinmeyen hata' })),
        dropped,
    };
};

/** Jira alan adlarının Türkçe karşılığı (kullanıcıya gösterim) */
export const JIRA_FIELD_LABELS: Record<string, string> = {
    description: 'açıklama', priority: 'önem', components: 'bileşen (birim)', timetracking: 'ilk tahmin',
};
