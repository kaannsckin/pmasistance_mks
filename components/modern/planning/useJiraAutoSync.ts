import { useEffect, useRef } from 'react';
import { Project } from '../../../types';
import { fetchIntegrationHealth, fetchJiraSyncPage, IntegrationHealth, JiraIssueRecord } from '../../../utils/integrations';
import { JiraImportOptions } from '../../../utils/planning/jiraImport';
import { hasSyncWork, readSyncState, runProjectSync, syncDue, writeSyncState } from '../../../utils/planning/jiraSync';

/**
 * Otomatik Jira eşitleme: aralığı tanımlı (proje ayarı) ve düzenlenebilen
 * projeler, sekme görünür ve çevrimiçiyken zamanı geldikçe eşitlenir. Son
 * eşitleme anı cihazda tutulur (çalışma alanını her turda değiştirmemek
 * için); görevlere yalnız gerçek değişiklik varsa yazılır.
 */
export const useJiraAutoSync = (
    getProjects: () => Project[],
    apply: (projectId: string, issues: JiraIssueRecord[], opts: JiraImportOptions, addNew: boolean, label: string) => void,
): void => {
    const getRef = useRef(getProjects);
    const applyRef = useRef(apply);
    getRef.current = getProjects;
    applyRef.current = apply;

    useEffect(() => {
        let running = false;
        let health: { at: number; value: IntegrationHealth } | null = null;
        const tick = async () => {
            if (running || document.hidden || navigator.onLine === false) return;
            const due = getRef.current().filter(p => syncDue(p.jiraSync, readSyncState(p.id)?.at, Date.now()) && hasSyncWork(p));
            if (!due.length) return;
            running = true;
            try {
                if (!health || Date.now() - health.at > 10 * 60_000) health = { at: Date.now(), value: await fetchIntegrationHealth() };
                if (!health.value.jira) return;
                const authMode = health.value.authMode;
                for (const p of due) {
                    try {
                        const r = await runProjectSync(p, o => fetchJiraSyncPage(o, authMode));
                        if (r.preview.added || r.preview.updated) applyRef.current(p.id, r.fetched.issues, r.opts, r.addNew, 'otomatik');
                        writeSyncState(p.id, { at: new Date().toISOString(), ok: true, text: r.text });
                    } catch (e) {
                        // Hata da damgalanır: bir sonraki deneme aralık dolunca
                        writeSyncState(p.id, { at: new Date().toISOString(), ok: false, text: e instanceof Error ? e.message : String(e) });
                    }
                }
            } catch { /* sunucuya ulaşılamadı: sonraki turda */ } finally {
                running = false;
            }
        };
        const first = window.setTimeout(tick, 8000);
        const id = window.setInterval(tick, 60_000);
        const onVisible = () => { if (!document.hidden) void tick(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { window.clearTimeout(first); window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    }, []);
};
