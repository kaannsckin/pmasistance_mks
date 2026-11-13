import React, { useEffect, useRef, useState } from 'react';
import { Task } from '../../types';
import { fetchIntegrationHealth, fetchJiraSyncPage, IntegrationHealth, JiraIssueRecord, updateJiraIssue } from '../../utils/integrations';
import { diffToChanges, ISSUE_KEY_RE, jiraDiff, JiraDiffField } from '../../utils/planning/jiraSync';
import { relativeTime } from '../../utils/recentChanges';
import { Icon } from './icons';

/**
 * Görev ayrıntısında Jira bağlantısı: kaydın Jira'daki güncel hâli getirilir,
 * uygulamadaki hâlle farkı gösterilir. Fark iki yöne de kapatılabilir:
 * "Jira'daki hâli al" (uygulamayı yeniler) ya da seçilen alanları, yorumu ve
 * harcanan süreyi Jira'ya yazar (sunucuda JIRA_ALLOW_UPDATE açıksa).
 */

interface Props {
    task: Task;
    /** Jira'daki hâli göreve uygular */
    onPull: (issue: JiraIssueRecord) => void;
}

const FIELD_LABEL: Record<string, string> = { summary: 'başlık', priority: 'öncelik', dueDate: 'termin', estimateHours: 'tahmin', status: 'durum', comment: 'yorum', worklog: 'worklog' };

const JiraIssuePanel: React.FC<Props> = ({ task, onPull }) => {
    const key = (task.jiraId || '').trim().toUpperCase();
    const [health, setHealth] = useState<IntegrationHealth | null>(null);
    const [issue, setIssue] = useState<JiraIssueRecord | null>(null);
    const [busy, setBusy] = useState<'load' | 'push' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [picked, setPicked] = useState<Set<JiraDiffField>>(new Set());
    const [comment, setComment] = useState('');
    const [hours, setHours] = useState('');
    const abort = useRef<AbortController | null>(null);

    useEffect(() => {
        const c = new AbortController();
        fetchIntegrationHealth(c.signal).then(setHealth).catch(() => undefined);
        return () => { c.abort(); abort.current?.abort(); };
    }, []);
    useEffect(() => { setIssue(null); setError(null); setNote(null); setPicked(new Set()); }, [key]);

    if (!ISSUE_KEY_RE.test(key) || !health?.jira) return null;

    const load = async () => {
        setError(null); setNote(null);
        const c = new AbortController();
        abort.current = c;
        setBusy('load');
        try {
            const r = await fetchJiraSyncPage({ keys: [key] }, health.authMode, c.signal);
            if (!r.issues[0]) throw new Error(`${key} Jira'da bulunamadı (silinmiş ya da taşınmış olabilir).`);
            setIssue(r.issues[0]);
            setPicked(new Set());
        } catch (e) {
            if ((e as Error)?.name !== 'AbortError') setError(e instanceof Error ? e.message : String(e));
        } finally { setBusy(null); }
    };

    const diff = issue ? jiraDiff(task, issue) : [];
    const worklogHours = Number(hours.replace(',', '.'));
    const validHours = !hours.trim() || (Number.isFinite(worklogHours) && worklogHours > 0 && worklogHours <= 24);
    const hasPush = picked.size > 0 || !!comment.trim() || (!!hours.trim() && validHours);

    const push = async () => {
        if (!hasPush || !validHours) return;
        setError(null); setNote(null);
        const c = new AbortController();
        abort.current = c;
        setBusy('push');
        try {
            const r = await updateJiraIssue(key, {
                ...diffToChanges(task, picked),
                ...(comment.trim() ? { comment: comment.trim() } : {}),
                ...(hours.trim() ? { worklogHours } : {}),
            }, health.authMode, c.signal);
            if (r.issue) { setIssue(r.issue); onPull(r.issue); }
            if (r.applied.includes('comment')) setComment('');
            if (r.applied.includes('worklog')) setHours('');
            setPicked(new Set());
            if (r.applied.length) setNote(`Jira güncellendi: ${r.applied.map(a => FIELD_LABEL[a] || a).join(', ')}.`);
            if (r.errors.length) setError(r.errors.map(x => `${FIELD_LABEL[x.field] || x.field}: ${x.message}`).join(' · '));
        } catch (e) {
            if ((e as Error)?.name !== 'AbortError') setError(e instanceof Error ? e.message : String(e));
        } finally { setBusy(null); }
    };

    const toggle = (f: JiraDiffField) => setPicked(prev => { const n = new Set(prev); if (n.has(f)) n.delete(f); else n.add(f); return n; });

    return (
        <section aria-label="Jira" className="rounded-xl m-fill-2 px-4 py-3 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold m-text-2">Jira · <span className="m-tabular">{key}</span></span>
                <button type="button" className="m-btn m-btn-gray" disabled={busy !== null} onClick={load}>
                    <Icon name="refresh" size={16} />{busy === 'load' ? 'Getiriliyor…' : issue ? 'Yeniden getir' : "Jira'daki güncel hâli getir"}
                </button>
            </div>
            {issue && (
                <>
                    <p className="m-0 text-[14px] m-text-2">
                        Jira'da: <strong className="m-text">{issue.status || '—'}</strong>{issue.assignee ? ` · ${issue.assignee}` : ''}{issue.priority ? ` · ${issue.priority}` : ''}{issue.due ? ` · termin ${issue.due}` : ''}{issue.updated ? ` · ${relativeTime(issue.updated)} güncellendi` : ''}
                    </p>
                    {diff.length === 0 ? (
                        <p className="m-0 text-[14px] m-ink-ok flex items-center gap-1.5"><Icon name="check" size={16} />Başlık, öncelik, durum ve termin Jira ile aynı.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[14px] border-collapse">
                                <thead><tr className="text-left m-text-3 text-[13px]">
                                    {health.jiraUpdate && <th className="font-semibold py-1 pr-2 w-8"><span className="sr-only">Jira'ya yaz</span></th>}
                                    <th className="font-semibold py-1 pr-3">Alan</th><th className="font-semibold py-1 pr-3">Uygulama</th><th className="font-semibold py-1">Jira</th>
                                </tr></thead>
                                <tbody>{diff.map(d => (
                                    <tr key={d.field}>
                                        {health.jiraUpdate && <td className="py-1 pr-2"><input type="checkbox" className="w-4 h-4" aria-label={`${d.label}: Jira'ya yaz`} checked={picked.has(d.field)} disabled={busy !== null} onChange={() => toggle(d.field)} /></td>}
                                        <td className="py-1 pr-3 m-text-3 whitespace-nowrap">{d.label}</td>
                                        <td className="py-1 pr-3 m-text break-words">{d.local}</td>
                                        <td className="py-1 m-text-2 break-words">{d.remote}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                    {health.jiraUpdate && (
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="flex-1 min-w-[180px]"><input aria-label="Jira yorumu" className="m-input" value={comment} maxLength={2000} placeholder="Jira'ya yorum (isteğe bağlı)" disabled={busy !== null} onChange={e => setComment(e.target.value)} /></div>
                            <div className="w-[130px] flex-none"><input aria-label="Harcanan süre (saat)" className="m-input" inputMode="decimal" value={hours} placeholder="Worklog (sa)" aria-invalid={!validHours} disabled={busy !== null} onChange={e => setHours(e.target.value)} /></div>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className="m-btn m-btn-gray" disabled={busy !== null} onClick={() => { onPull(issue); setNote("Jira'daki hâl göreve uygulandı."); }}><Icon name="download" size={16} />Jira'daki hâli al</button>
                        {health.jiraUpdate
                            ? <button type="button" className="m-btn m-btn-primary" disabled={busy !== null || !hasPush || !validHours} onClick={push}><Icon name="upload" size={16} />{busy === 'push' ? 'Yazılıyor…' : "Seçilenleri Jira'ya yaz"}</button>
                            : <span className="text-[13px] m-text-3">Jira'ya yazma bu sunucuda kapalı (JIRA_ALLOW_UPDATE).</span>}
                    </div>
                </>
            )}
            {note && <p role="status" className="m-0 text-[14px] m-ink-ok">{note}</p>}
            {error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{error}</p>}
        </section>
    );
};

export default JiraIssuePanel;
