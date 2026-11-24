import React, { useEffect, useMemo, useState } from 'react';
import { Task } from '../../types';
import { fetchIntegrationHealth, fetchJiraIssueHistory } from '../../utils/integrations';
import { JIRA_WORK_TIME_ZONE, jiraHistoryField, type JiraHistoryEntry, type JiraHistoryItem } from '../../utils/jiraHistory';
import { TASK_STATUS_LABELS } from './taskMeta';

const FIELD_LABELS: Record<string, string> = {
    status: 'Durum', assignee: 'Atanan', original: 'İlk tahmin', remaining: 'Kalan süre',
    due: 'Termin', sprint: 'Sprint', priority: 'Öncelik', description: 'Açıklama',
    labels: 'Etiketler', fixversion: 'Sürüm',
};

const fieldName = (item: JiraHistoryItem) => FIELD_LABELS[jiraHistoryField(item)] || item.field;
const textOf = (item: JiraHistoryItem, side: 'from' | 'to') => item[`${side}String`] ?? item[side] ?? '';
const historyDate = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: JIRA_WORK_TIME_ZONE });
const fmtHours = (value: number) => `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} sa`;
const PAGE_SIZE = 25;

const MAX_DIFF_LINES = 200;
type DiffLine = { mode: 'add' | 'remove'; line: string };

const diffLines = (before: string[], after: string[]): DiffLine[] => {
    const grid = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
    for (let x = before.length - 1; x >= 0; x--) {
        for (let y = after.length - 1; y >= 0; y--)
            grid[x][y] = before[x] === after[y] ? 1 + grid[x + 1][y + 1] : Math.max(grid[x + 1][y], grid[x][y + 1]);
    }
    const changes: DiffLine[] = [];
    let x = 0, y = 0;
    while (x < before.length || y < after.length) {
        if (x < before.length && y < after.length && before[x] === after[y]) { x++; y++; }
        else if (y === after.length || (x < before.length && grid[x + 1][y] >= grid[x][y + 1]))
            changes.push({ mode: 'remove', line: before[x++] });
        else changes.push({ mode: 'add', line: after[y++] });
    }
    return changes;
};

const DescriptionDiff = ({ item }: { item: JiraHistoryItem }) => {
    const [open, setOpen] = useState(false);
    const before = open && textOf(item, 'from') ? textOf(item, 'from').split(/\r?\n/) : [];
    const after = open && textOf(item, 'to') ? textOf(item, 'to').split(/\r?\n/) : [];
    const lines = open ? diffLines(before.slice(0, MAX_DIFF_LINES), after.slice(0, MAX_DIFF_LINES)) : [];
    return (
        <details className="text-sm min-w-0" onToggle={e => setOpen(e.currentTarget.open)}>
            <summary className="cursor-pointer">Açıklama farkı</summary>
            {open && <div className="whitespace-pre-wrap break-words text-[13px] mt-1">
                {lines.map(({ line, mode }, i) => <div key={i} className={mode === 'add' ? 'm-ink-ok' : 'm-ink-bad'}>{mode === 'add' ? '+' : '−'} {line}</div>)}
                {!lines.length && <span className="m-text-3">Görünen satırlarda fark yok.</span>}
                {Math.max(before.length, after.length) > MAX_DIFF_LINES && <span className="m-text-3">İlk {MAX_DIFF_LINES} satır karşılaştırıldı.</span>}
            </div>}
        </details>
    );
};

const HistorySummary = ({ task }: { task: Task }) => {
    const summary = task.historySummary;
    if (!summary) return null;
    const statuses = Object.entries(summary.timeInStatus).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...statuses.map(([, hours]) => hours));
    return (
        <section className="m-surface rounded-xl p-3 grid gap-2" aria-label="Durumda geçen süre">
            <span className="text-sm font-semibold">Durumda geçen süre</span>
            <span className="text-xs m-text-3">İş günleri 09.00–17.00 · {summary.partial ? 'Jira aramasında gelen geçmiş' : historyDate.format(new Date(summary.at))}</span>
            {statuses.map(([status, hours]) => <div key={status} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm"><span>{status}</span><span className="m-tabular">{fmtHours(hours)}</span></div>
                <div className="h-1.5 m-fill rounded-full overflow-hidden"><div className="h-full rounded-full bg-[var(--m-accent)]" style={{ width: `${hours / max * 100}%` }} /></div>
            </div>)}
            <div className="text-xs m-text-2">Yeniden açılma {summary.reopenCount} · Atanan değişikliği {summary.assigneeChanges} · Tahmin değişikliği {summary.estimateChanges} · Termin değişikliği {summary.dueDateShifts} · Sprint değişikliği {summary.sprintChanges}</div>
        </section>
    );
};

type Activity = JiraHistoryEntry & { application?: boolean };

const TaskJiraHistory: React.FC<{ task: Task }> = ({ task }) => {
    const [entries, setEntries] = useState<JiraHistoryEntry[]>([]);
    const [loading, setLoading] = useState(!!task.jiraId);
    const [error, setError] = useState('');
    const [field, setField] = useState('');
    const [author, setAuthor] = useState('');
    const [page, setPage] = useState(0);
    const key = task.jiraId;

    useEffect(() => {
        if (!key) return;
        const controller = new AbortController();
        void (async () => {
            try {
                const health = await fetchIntegrationHealth(controller.signal);
                if (!health.jira) throw new Error('Jira bağlantısı yapılandırılmadı.');
                setEntries(await fetchJiraIssueHistory(key, health.authMode, controller.signal));
            } catch (e) {
                if (!controller.signal.aborted) setError((e as Error).message);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        })();
        return () => controller.abort();
    }, [key]);

    const activity = useMemo<Activity[]>(() => {
        const jiraTimes = new Set(entries.filter(entry => entry.items.some(item => jiraHistoryField(item) === 'status')).map(entry => entry.at));
        return [...entries, ...(task.statusLog || []).filter(entry => !jiraTimes.has(entry.at)).map((entry, index) => ({
        id: `app-${index}`, at: entry.at, author: '', application: true,
        items: [{ field: 'status', from: entry.from, fromString: TASK_STATUS_LABELS[entry.from], to: entry.to, toString: TASK_STATUS_LABELS[entry.to] }],
    }))].filter(entry => Number.isFinite(Date.parse(entry.at))).sort((a, b) => b.at.localeCompare(a.at));
    }, [entries, task.statusLog]);
    const fields = new Set<string>(activity.flatMap(entry => entry.items.map(fieldName)));
    const authors = new Set<string>(activity.map(entry => entry.author).filter(Boolean));
    const filtered = activity.flatMap(entry => {
        if (author && entry.author !== author) return [];
        const items = field ? entry.items.filter(item => fieldName(item) === field) : entry.items;
        return items.length ? [{ ...entry, items }] : [];
    });
    const hasNext = (page + 1) * PAGE_SIZE < filtered.length;
    const estimateRows = entries.flatMap(entry => entry.items.filter(item => ['original', 'remaining'].includes(jiraHistoryField(item)))
        .map(item => ({ at: entry.at, item }))).slice(0, 8).reverse();

    const maxEstimate = Math.max(1, ...estimateRows.map(({ item }) => Number(item.to) || 0));
    return (
        <div className="grid gap-3 min-w-0" aria-label="Kayıt geçmişi">
            <HistorySummary task={task} />
            {estimateRows.length > 0 && <details className="m-surface rounded-xl p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Son tahmin değişiklikleri</summary>
                <ol className="my-2 pl-5 m-text-2 grid gap-2">{estimateRows.map(({ at, item }, i) => (
                    <li key={i}>
                        <div>{historyDate.format(new Date(at))} · {fieldName(item)} · {textOf(item, 'from') || '—'} → {textOf(item, 'to') || '—'}</div>
                        {item.to && Number.isFinite(Number(item.to)) && <div className="h-1.5 m-fill rounded-full mt-1" aria-hidden="true">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(0, Number(item.to)) * 100 / maxEstimate}%`, background: jiraHistoryField(item) === 'original' ? 'var(--m-accent)' : 'var(--m-warn)' }} />
                        </div>}
                    </li>
                ))}</ol>
            </details>}
            <div className="grid grid-cols-2 gap-2 min-w-0">
                <select aria-label="Değişiklik alanı" className="m-input min-w-0" value={field} onChange={e => { setField(e.target.value); setPage(0); }}>
                    <option value="">Tüm alanlar</option>{[...fields].sort((a, b) => a.localeCompare(b, 'tr')).map(f => <option key={f}>{f}</option>)}
                </select>
                <select aria-label="Değişikliği yapan kişi" className="m-input min-w-0" value={author} onChange={e => { setAuthor(e.target.value); setPage(0); }}>
                    <option value="">Tüm kişiler</option>{[...authors].sort((a, b) => a.localeCompare(b, 'tr')).map(a => <option key={a}>{a}</option>)}
                </select>
            </div>
            {loading && <p className="m-0 text-sm m-text-3" role="status">Jira geçmişi getiriliyor…</p>}
            {error && <p className="m-0 text-sm m-ink-warn" role="status">{error}</p>}
            {!loading && !error && !filtered.length && <p className="m-0 text-sm m-text-3">Bu filtrelere uyan değişiklik yok.</p>}
            <ol className="m-0 p-0 list-none grid gap-2">
                {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(entry => (
                    <li key={entry.id} className="m-surface rounded-xl p-3 grid gap-2 min-w-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-1 text-xs m-text-2">
                            <span className="font-semibold">{entry.application ? 'Uygulama' : entry.author || 'Jira'}</span>
                            <time dateTime={entry.at}>{historyDate.format(new Date(entry.at))}</time>
                        </div>
                        {entry.items.map((item, index) => jiraHistoryField(item) === 'description'
                            ? <React.Fragment key={index}><DescriptionDiff item={item} /></React.Fragment>
                            : <div key={index} className="text-sm break-words min-w-0"><b>{fieldName(item)}</b> · {textOf(item, 'from') || '—'} → {textOf(item, 'to') || '—'}</div>)}
                    </li>
                ))}
            </ol>
            {(page > 0 || hasNext) && <div className="flex flex-wrap items-center gap-2 text-sm">
                <button className="m-btn m-btn-gray" type="button" disabled={!page} onClick={() => setPage(p => p - 1)}>Önceki</button>
                <span>{page + 1} / {Math.ceil(filtered.length / PAGE_SIZE)}</span>
                <button className="m-btn m-btn-gray" type="button" disabled={!hasNext} onClick={() => setPage(p => p + 1)}>Sonraki</button>
            </div>}
        </div>
    );
};

export default TaskJiraHistory;
