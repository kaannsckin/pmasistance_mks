import { useEffect, useRef } from 'react';
import { Project } from '../../../types';
import { fetchIntegrationHealth, fetchJiraIssueWorklogs, IntegrationHealth, JiraIssueWorklog, MAX_WORKLOG_KEYS } from '../../../utils/integrations';
import { pendingWorklogKeys } from '../../../utils/workforce';

/** Çekilen worklog'ları uygulamaya yazar (App: applyIssueWorklogs ile projelere) */
export type ApplyWorklogs = (requested: string[], entries: JiraIssueWorklog[], missing: string[]) => void;

let healthCache: { at: number; value: IntegrationHealth } | null = null;
const jiraHealth = async (): Promise<IntegrationHealth> => {
    if (!healthCache || Date.now() - healthCache.at > 10 * 60_000) healthCache = { at: Date.now(), value: await fetchIntegrationHealth() };
    return healthCache.value;
};

/**
 * Elle yenileme (İş güçleri › Jira'dan yenile): seçili projelerdeki kayıtların
 * worklog'ları 50'lik gruplarla çekilir. `force` ise değişmemiş kayıtlar da
 * yeniden istenir (Jira'da sonradan düzeltilen worklog'lar için).
 */
export const refreshWorklogsNow = async (
    projects: Project[],
    apply: ApplyWorklogs,
    force = false,
): Promise<{ records: number; entries: number; missing: string[] }> => {
    const health = await jiraHealth();
    if (!health.jira) throw new Error('Jira bağlantısı yapılandırılmamış (Yönetici konsolu › Entegrasyonlar).');
    const all = pendingWorklogKeys(projects, 2000, force);
    let entries = 0;
    const missing: string[] = [];
    for (let i = 0; i < all.length; i += MAX_WORKLOG_KEYS) {
        const keys = all.slice(i, i + MAX_WORKLOG_KEYS);
        const r = await fetchJiraIssueWorklogs(keys, health.authMode);
        apply(keys, r.entries, r.missing);
        entries += r.entries.length;
        missing.push(...r.missing);
    }
    return { records: all.length - missing.length, entries, missing };
};

/**
 * Arka planda worklog yenileme: Jira'daki harcanan süresi değişen (ya da
 * worklog'u hiç çekilmemiş) kayıtlar dakikada en çok 50'şer çekilir. Sekme
 * görünür ve çevrimiçiyken çalışır; hata alınca 10 dakika bekler.
 */
export const useJiraWorklogRefresh = (getProjects: () => Project[], apply: ApplyWorklogs): void => {
    const getRef = useRef(getProjects);
    const applyRef = useRef(apply);
    getRef.current = getProjects;
    applyRef.current = apply;

    useEffect(() => {
        let running = false;
        let pauseUntil = 0;
        const skip = new Set<string>(); // Jira'da bulunamayan kayıtlar bu oturumda yeniden istenmez
        const tick = async () => {
            if (running || document.hidden || navigator.onLine === false || Date.now() < pauseUntil) return;
            const keys = pendingWorklogKeys(getRef.current(), MAX_WORKLOG_KEYS + skip.size).filter(k => !skip.has(k)).slice(0, MAX_WORKLOG_KEYS);
            if (!keys.length) return;
            running = true;
            try {
                const health = await jiraHealth();
                if (!health.jira) return;
                const r = await fetchJiraIssueWorklogs(keys, health.authMode);
                r.missing.forEach(k => skip.add(k));
                applyRef.current(keys, r.entries, r.missing);
            } catch {
                pauseUntil = Date.now() + 10 * 60_000; // Jira'ya ulaşılamadı ya da yetki yok: sonra yeniden dene
            } finally {
                running = false;
            }
        };
        const first = window.setTimeout(tick, 6000);
        const id = window.setInterval(tick, 60_000);
        const onVisible = () => { if (!document.hidden) void tick(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { window.clearTimeout(first); window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    }, []);
};
