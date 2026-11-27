import { Project } from '../../../types';
import { fetchIntegrationHealth, fetchJiraSyncPage, JiraIssueRecord, updateJiraIssue } from '../../../utils/integrations';
import { JiraImportOptions } from '../../../utils/planning/jiraImport';
import { hasSyncWork, JiraPushOutcome, runFullSync, writeSyncState } from '../../../utils/planning/jiraSync';

export type ApplyJiraSync = (projectId: string, issues: JiraIssueRecord[], opts: JiraImportOptions, addNew: boolean, label: string, pushed?: JiraPushOutcome) => void;

/**
 * Projeyi şimdi Jira ile eşitler (projenin kayıtlı eşitleme ayarıyla: kaynak,
 * alan yönleri, Jira'ya yazma). Pano ve diğer ekranlardaki "Jira ile eşitle"
 * düğmesi kullanır; sonuç özeti döner ve son eşitleme damgası yazılır.
 */
export const syncProjectNow = async (project: Project, apply: ApplyJiraSync, label = 'elle', signal?: AbortSignal): Promise<string> => {
    if (!hasSyncWork(project)) throw new Error('Bu projede eşitlenecek Jira kaydı ya da eşitleme kaynağı yok (Planlama › Jira eşitleme).');
    const health = await fetchIntegrationHealth(signal);
    if (!health.jira) throw new Error('Jira bağlantısı bu sunucuda yapılandırılmamış.');
    try {
        const update = health.jiraUpdate ? (key: string, changes: Parameters<typeof updateJiraIssue>[1]) => updateJiraIssue(key, changes, health.authMode, signal) : null;
        const r = await runFullSync(project, o => fetchJiraSyncPage(o, health.authMode, signal), update);
        if (r.shouldApply) apply(project.id, r.issues, r.opts, r.addNew, label, r.pushed);
        writeSyncState(project.id, { at: new Date().toISOString(), ok: true, text: r.text });
        return r.text;
    } catch (e) {
        if ((e as Error)?.name !== 'AbortError') writeSyncState(project.id, { at: new Date().toISOString(), ok: false, text: e instanceof Error ? e.message : String(e) });
        throw e;
    }
};
