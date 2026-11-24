import React, { useEffect, useState } from 'react';
import { fetchIntegrationHealth, fetchJiraIssueWorklogs, JiraIssueWorklog } from '../../utils/integrations';
import { getWorklogTimeZone } from '../../utils/workforce';
import { fmtHours } from './WorkforceParts';

const PAGE_SIZE = 25;

const TaskJiraWorklogs = ({ issueKey, canViewProject, email }: { issueKey: string; canViewProject: boolean; email?: string }) => {
    const zone = getWorklogTimeZone();
    const time = new Intl.DateTimeFormat('tr-TR', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' });
    const [entries, setEntries] = useState<JiraIssueWorklog[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(true);
    const [page, setPage] = useState(0);
    const [refresh, setRefresh] = useState(0);

    useEffect(() => {
        let current = true;
        setBusy(true);
        setError('');
        void (async () => {
            try {
                const health = await fetchIntegrationHealth();
                if (!health.jira) throw new Error('Jira bağlantısı yapılandırılmadı.');
                const result = await fetchJiraIssueWorklogs([issueKey], health.authMode, { timeZone: zone });
                if (result.missing.length) throw new Error('Jira kaydı bulunamadı.');
                if (current) {
                    const allowed = health.authMode === 'supabase' || canViewProject ? result.entries : result.entries.filter(row => !!email && row.authorEmail === email.trim().toLowerCase());
                    setEntries(allowed.sort((a, b) => (b.started || b.date).localeCompare(a.started || a.date)));
                    setPage(0);
                }
            } catch (e) {
                if (current) setError((e as Error).message);
            } finally {
                if (current) setBusy(false);
            }
        })();
        return () => { current = false; };
    }, [issueKey, refresh, canViewProject, email, zone]);

    return (
        <section aria-label="Jira çalışma kayıtları" className="grid gap-2 min-w-0">
            <div className="flex flex-wrap justify-between gap-2 items-center">
                <span className="text-sm m-text-2">{zone}{!busy && !error && ` · ${entries.length} kayıt · ${fmtHours(entries.reduce((sum, row) => sum + row.hours, 0))}`}</span>
                <button type="button" className="m-btn m-btn-gray" disabled={busy} onClick={() => setRefresh(n => n + 1)}>Yenile</button>
            </div>
            {busy && <p className="m-0 m-text-3 text-sm" role="status">Çalışma kayıtları getiriliyor…</p>}
            {error && <p className="m-0 m-ink-warn text-sm" role="status">{error}</p>}
            {!busy && !error && !entries.length && <p className="m-0 m-text-3 text-sm">Görebileceğiniz çalışma kaydı yok.</p>}
            {!busy && !error && entries.length > 0 && <ul className="m-0 p-0 list-none grid gap-2">
                {entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row, index) => <li className="m-surface rounded-xl p-3 grid gap-1 min-w-0" key={row.id || index}>
                    <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{row.author || 'Jira kullanıcısı'}</strong><span className="m-tabular">{fmtHours(row.hours)}</span></div>
                    <div className="flex flex-wrap gap-2 text-xs m-text-3">
                        <time dateTime={row.started || row.date}>{row.started ? time.format(new Date(row.started)) : row.date}</time>
                        {row.updated && <span>Güncelleme {time.format(new Date(row.updated))}</span>}
                    </div>
                    {row.comment && <p className="m-0 text-sm whitespace-pre-wrap break-words">{row.comment}</p>}
                </li>)}
            </ul>}
            {!busy && !error && entries.length > PAGE_SIZE && <div className="flex gap-2 text-sm items-center">
                <button type="button" className="m-btn m-btn-gray" disabled={!page} onClick={() => setPage(p => p - 1)}>Önceki</button>
                <span>{page + 1} / {Math.ceil(entries.length / PAGE_SIZE)}</span>
                <button type="button" className="m-btn m-btn-gray" disabled={(page + 1) * PAGE_SIZE >= entries.length} onClick={() => setPage(p => p + 1)}>Sonraki</button>
            </div>}
        </section>
    );
};

export default TaskJiraWorklogs;
