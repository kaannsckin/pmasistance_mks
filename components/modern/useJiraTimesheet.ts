import { useEffect, useState } from 'react';
import { Person, Project } from '../../types';
import { fetchIntegrationHealth, fetchJiraTimesheet, JiraIssueWorklog } from '../../utils/integrations';
import { Identity, ownsProject } from '../../utils/rbac';

export const projectJiraKey = (project: Project): string | undefined =>
    project.jiraProjectKey?.trim() || project.tasks.find(t => t.jiraId)?.jiraId?.split('-')[0];

export type JiraTimesheetState =
    | { status: 'off' }
    | { status: 'loading' }
    | { status: 'ready'; rows: JiraIssueWorklog[] }
    | { status: 'error'; error: string };

interface Options {
    project?: Project;
    start: string;
    end: string;
    timeZone: string;
    identity: Identity;
    people: Person[];
    refresh?: number;
}

/**
 * Projenin Jira çalışma kayıtları (worklog). Supabase oturumunda erişimi sunucu
 * uygular; aksi halde yalnız proje sahibi PY tüm kayıtları, diğerleri kendi
 * e-postasıyla girilenleri görür.
 */
export const useJiraTimesheet = ({ project, start, end, timeZone, identity, people, refresh = 0 }: Options): JiraTimesheetState => {
    const jiraKey = project && projectJiraKey(project);
    const owns = !!project && ownsProject(project, identity);
    const email = people.find(person => person.id === identity.personId)?.email?.trim().toLowerCase();
    const requestKey = JSON.stringify([jiraKey, start, end, timeZone, refresh, owns, email]);
    const [result, setResult] = useState<{ key: string; state: JiraTimesheetState }>();

    useEffect(() => {
        if (!jiraKey || !start || !end) return;
        let current = true;
        void (async () => {
            try {
                const health = await fetchIntegrationHealth();
                if (!health.jira) throw new Error('Jira bağlantısı yapılandırılmadı.');
                const rows = await fetchJiraTimesheet({ projectKey: jiraKey, from: start, to: end, timeZone }, health.authMode);
                const visible = health.authMode === 'supabase' || owns ? rows : rows.filter(row => !!email && row.authorEmail === email);
                if (current) setResult({ key: requestKey, state: { status: 'ready', rows: visible } });
            } catch (e) {
                if (current) setResult({ key: requestKey, state: { status: 'error', error: (e as Error).message } });
            }
        })();
        return () => { current = false; };
    }, [requestKey, jiraKey, start, end, timeZone, owns, email]);

    if (!jiraKey || !start || !end) return { status: 'off' };
    return result?.key === requestKey ? result.state : { status: 'loading' };
};
