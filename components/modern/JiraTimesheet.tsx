import React, { useMemo, useState } from 'react';
import { Leave, Person, Project, TitleDef } from '../../types';
import { Identity } from '../../utils/rbac';
import { effectiveCapacity } from '../../utils/availability';
import { addDays, formatRange, isIsoDay, parseIsoDay, toIsoDay, weekRange } from '../../utils/calendarRange';
import { JiraIssueWorklog } from '../../utils/integrations';
import { JIRA_WORK_TIME_ZONE, jiraLocalDay } from '../../utils/jiraHistory';
import { isHalfDay, isWorkday } from '../../utils/planning/workdays';
import { isoWeekOf } from '../../utils/weeklyReport';
import { getWorklogTimeZone, hourlyRate, HOURS_PER_DAY, matchWorklogPerson, setWorklogTimeZone } from '../../utils/workforce';
import { ISSUE_TYPE_LABELS } from '../../utils/planning/lifecycle';
import { fmtCost, fmtHours } from './WorkforceParts';
import { projectJiraKey, useJiraTimesheet } from './useJiraTimesheet';

const TIME_ZONES = [...new Set([JIRA_WORK_TIME_ZONE, 'UTC', ...(Intl.supportedValuesOf?.('timeZone') || [])])];
const personKey = (row: JiraIssueWorklog) => row.accountId || row.authorEmail || row.author;
const total = (hours: number[]) => hours.reduce((a, b) => a + b, 0);
const pivot = (log: JiraIssueWorklog[], days: string[]) => {
    const totals = new Map<string, number>();
    log.forEach(row => totals.set(row.date, (totals.get(row.date) || 0) + row.hours));
    return days.map(day => totals.get(day) || 0);
};
const dailyCapacity = (person: Person, leaves: Leave[], day: string) => {
    const date = parseIsoDay(day)!;
    return isWorkday(date) ? HOURS_PER_DAY * (isHalfDay(date) ? 0.5 : 1) * effectiveCapacity(person, leaves, date.getFullYear(), date.getMonth() + 1) : 0;
};

const JiraTimesheet = ({ projects, people, leaves, titles, identity }: { projects: Project[]; people: Person[]; leaves: Leave[]; titles: TitleDef[]; identity: Identity }) => {
    const linked = projects.filter(p => projectJiraKey(p));
    const [projectId, setProjectId] = useState(linked[0]?.id || '');
    const [period, setPeriod] = useState<'week' | 'month'>('week');
    const [anchor, setAnchor] = useState(() => jiraLocalDay(Date.now(), getWorklogTimeZone())!);
    const [zone, setZone] = useState(getWorklogTimeZone);
    const [view, setView] = useState<'timesheet' | 'usage'>('timesheet');
    const [grouping, setGrouping] = useState<'person' | 'team'>('person');
    const [person, setPerson] = useState('');
    const [team, setTeam] = useState('');
    const [component, setComponent] = useState('');
    const [version, setVersion] = useState('');
    const [issueType, setIssueType] = useState('');
    const [refresh, setRefresh] = useState(0);
    const [expanded, setExpanded] = useState<string | null>(null);
    const project = linked.find(p => p.id === projectId) || linked[0];
    const jiraKey = project && projectJiraKey(project);
    const date = parseIsoDay(anchor)!;
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const wk = isoWeekOf(date);
    const range = period === 'week' ? weekRange(wk.year, wk.week, false) : { start: toIsoDay(monthStart), end: toIsoDay(monthEnd) };
    const { start, end } = range;
    const sheet = useJiraTimesheet({ project, start, end, timeZone: zone, identity, people, refresh });
    const current: { rows: JiraIssueWorklog[]; error?: string } | undefined = sheet.status === 'ready' ? { rows: sheet.rows }
        : sheet.status === 'error' ? { rows: [], error: sheet.error } : undefined;
    const days = useMemo(() => {
        const list: string[] = [];
        for (let day = start; day <= end; day = addDays(day, 1)) list.push(day);
        return list;
    }, [start, end]);
    const tasks = new Map(project?.tasks.filter(t => t.jiraId).map(t => [t.jiraId!.toUpperCase(), t]));
    const groups = new Map<string, { name: string; person?: Person; log: JiraIssueWorklog[] }>();
    current?.rows.forEach(row => {
        const id = personKey(row);
        const group = groups.get(id) || { name: row.author || 'Eşlenmemiş', person: matchWorklogPerson(people, row.author, row.authorEmail), log: [] };
        group.log.push(row);
        groups.set(id, group);
    });
    const teams = [...new Set([...groups.values()].flatMap(group => group.person?.departmentCode ? [group.person.departmentCode] : []))].sort();
    const taskValues = [...tasks.values()];
    const components = [...new Set(taskValues.flatMap(t => t.components || []))].sort();
    const versions = [...new Set(taskValues.flatMap(t => t.fixVersion ? [t.fixVersion] : []))].sort();
    const issueTypes = [...new Set(taskValues.flatMap(t => t.issueType ? [t.issueType] : []))].sort();
    const today = jiraLocalDay(Date.now(), zone)!;
    const rows = [...groups].flatMap(([id, group]) => {
        if ((person && person !== id) || (team && group.person?.departmentCode !== team)) return [];
        const filtered = group.log.filter(row => {
            const task = tasks.get(row.issueKey.toUpperCase());
            return (!component || task?.components?.includes(component)) && (!version || task?.fixVersion === version) && (!issueType || task?.issueType === issueType);
        });
        if (!filtered.length) return [];
        const byIssue = new Map<string, JiraIssueWorklog[]>();
        filtered.forEach(row => byIssue.set(row.issueKey, [...(byIssue.get(row.issueKey) || []), row]));
        return [{ id, ...group, log: filtered, hours: pivot(filtered, days), capacity: group.person ? days.map(day => dailyCapacity(group.person!, leaves, day)) : undefined,
            issues: [...byIssue].sort(([a], [b]) => a.localeCompare(b, 'tr', { numeric: true })).map(([key, log]) => ({ key, title: tasks.get(key)?.name || log[0].summary, hours: pivot(log, days) })) }];
    }).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const usage = new Map<string, { label: string; hours: number; capacity: number; cost: number; missingCapacity: boolean; uncosted: number }>();
    for (const row of rows) {
        const key = grouping === 'team' ? row.person?.departmentCode || 'Eşlenmemiş' : row.id;
        const entry = usage.get(key) || { label: grouping === 'team' ? key : row.name, hours: 0, capacity: 0, cost: 0, missingCapacity: false, uncosted: 0 };
        entry.hours += total(row.hours);
        if (row.capacity) entry.capacity += total(row.capacity);
        else entry.missingCapacity = true;
        row.log.forEach(log => {
            const rate = hourlyRate(row.person, titles, log.date);
            if (rate === null) entry.uncosted += log.hours;
            else entry.cost += log.hours * rate;
        });
        usage.set(key, entry);
    }
    const usageRows = [...usage.values()].sort((a, b) => b.hours - a.hours);
    const [exportError, setExportError] = useState('');
    const exportSheet = async (format: 'xlsx' | 'pdf' | 'csv') => {
        setExportError('');
        try {
            const timeHeader = ['Kişi', 'Jira anahtarı', 'Kayıt', ...days, 'Toplam saat', 'Kapasite (saat)'];
            const timeRows = rows.flatMap(row => [
                [row.name, '', '', ...row.hours, total(row.hours), row.capacity ? total(row.capacity) : null],
                ...row.issues.map(issue => [row.name, issue.key, issue.title || '', ...issue.hours, total(issue.hours), null]),
            ]);
            const usageHeader = [grouping === 'team' ? 'Ekip' : 'Kişi', 'Harcanan (sa)', 'Kapasite (sa)', 'Kullanım (%)', 'Maliyet (TL)', 'Maliyetlenemeyen (sa)'];
            const usageCells = usageRows.map(row => [row.label, row.hours, row.missingCapacity ? null : row.capacity,
                !row.missingCapacity && row.capacity ? row.hours / row.capacity * 100 : null, row.cost, row.uncosted]);
            const [header, data] = view === 'usage' ? [usageHeader, usageCells] : [timeHeader, timeRows];
            if (format === 'xlsx') {
                const XLSX = await import('xlsx');
                const book = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([header, ...data]), view === 'usage' ? 'Kullanım ve maliyet' : 'Zaman çizelgesi');
                XLSX.writeFile(book, `${jiraKey}-${view === 'usage' ? 'kullanim' : 'zaman-cizelgesi'}-${start}.xlsx`);
                return;
            }
            const { downloadDocument } = await import('../../utils/export/renderAiDocument');
            const { normalizeDocument } = await import('../../utils/export/aiDocument');
            // PDF'de aylık tarihler haftalara bölünür, tablo sayfaya sığar.
            const blocks = format === 'pdf' && view === 'timesheet'
                ? Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => {
                    const week = days.slice(i * 7, i * 7 + 7);
                    return { kind: 'table' as const, title: formatRange({ start: week[0], end: week[week.length - 1] }),
                        columns: [...timeHeader.slice(0, 3), ...week.map(day => day.slice(5))],
                        rows: timeRows.map(row => [...row.slice(0, 3), ...row.slice(3 + i * 7, 3 + i * 7 + week.length)]) };
                })
                : [{ kind: 'table' as const, columns: header, rows: data }];
            const doc = normalizeDocument({ title: `${jiraKey} · ${view === 'usage' ? 'Kullanım ve maliyet' : 'Zaman çizelgesi'}`,
                subtitle: `${formatRange(range)} · ${zone}`, format, blocks });
            await downloadDocument(doc, format);
        } catch (e) {
            setExportError((e as Error).message);
        }
    };

    const shift = (amount: number) => setAnchor(period === 'week' ? addDays(anchor, amount * 7)
        : toIsoDay(new Date(date.getFullYear(), date.getMonth() + amount, Math.min(date.getDate(), 28))));

    if (!jiraKey) return <p className="m-0 text-sm m-text-3">Zaman çizelgesi için Jira projesi bağlayın.</p>;
    return (
        <section className="grid gap-3 min-w-0" aria-label="Jira zaman çizelgesi">
            <div className="flex flex-wrap items-center gap-2">
                <select className="m-pill" aria-label="Çizelge projesi" value={project.id} onChange={e => {
                    setProjectId(e.target.value); setTeam(''); setPerson(''); setComponent(''); setVersion(''); setIssueType('');
                }}>{linked.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <select className="m-pill" aria-label="Çizelge dönemi" value={period} onChange={e => setPeriod(e.target.value as 'week' | 'month')}>
                    <option value="week">Hafta</option><option value="month">Ay</option>
                </select>
                <button className="m-btn m-btn-gray" type="button" aria-label="Önceki dönem" onClick={() => shift(-1)}>‹</button>
                <input type="date" className="m-input !w-auto" aria-label="Çizelge tarihi" value={anchor} onChange={e => { if (isIsoDay(e.target.value)) setAnchor(e.target.value); }} />
                <button className="m-btn m-btn-gray" type="button" aria-label="Sonraki dönem" onClick={() => shift(1)}>›</button>
                <select className="m-pill" aria-label="Çizelge saat dilimi" value={zone} onChange={e => { setZone(e.target.value); setWorklogTimeZone(e.target.value); }}>
                    {TIME_ZONES.map(tz => <option key={tz}>{tz}</option>)}
                </select>
                <button className="m-btn m-btn-gray" type="button" disabled={!current} onClick={() => setRefresh(r => r + 1)}>Yenile</button>
                <button className="m-btn m-btn-gray" type="button" disabled={!rows.length} onClick={() => void exportSheet('xlsx')}>Excel indir</button>
                <button className="m-btn m-btn-gray" type="button" disabled={!rows.length} onClick={() => void exportSheet('csv')}>CSV indir</button>
                <button className="m-btn m-btn-gray" type="button" disabled={!rows.length} onClick={() => void exportSheet('pdf')}>PDF indir</button>
            </div>
            <div className="flex flex-wrap gap-2">
                <select className="m-pill" aria-label="Worklog raporu" value={view} onChange={e => setView(e.target.value as typeof view)}>
                    <option value="timesheet">Kişi × gün</option><option value="usage">Kullanım ve maliyet</option>
                </select>
                {view === 'usage' && <select className="m-pill" aria-label="Rapor gruplaması" value={grouping} onChange={e => setGrouping(e.target.value as typeof grouping)}>
                    <option value="person">Kişiye göre</option><option value="team">Ekibe göre</option>
                </select>}
                <select className="m-pill" aria-label="Çizelge kişi filtresi" value={person} onChange={e => setPerson(e.target.value)}>
                    <option value="">Tüm kişiler</option>{[...groups].map(([id, g]) => <option key={id} value={id}>{g.name}</option>)}
                </select>
                <select className="m-pill" aria-label="Çizelge ekip filtresi" value={team} onChange={e => setTeam(e.target.value)}>
                    <option value="">Tüm ekipler</option>{teams.map(t => <option key={t}>{t}</option>)}
                </select>
                <select className="m-pill" aria-label="Çizelge bileşen filtresi" value={component} onChange={e => setComponent(e.target.value)}>
                    <option value="">Tüm bileşenler</option>{components.map(c => <option key={c}>{c}</option>)}
                </select>
                <select className="m-pill" aria-label="Çizelge sürüm filtresi" value={version} onChange={e => setVersion(e.target.value)}>
                    <option value="">Tüm sürümler</option>{versions.map(v => <option key={v}>{v}</option>)}
                </select>
                <select className="m-pill" aria-label="Çizelge kayıt türü filtresi" value={issueType} onChange={e => setIssueType(e.target.value)}>
                    <option value="">Tüm kayıt türleri</option>{issueTypes.map(t => <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>)}
                </select>
            </div>
            <div className="text-sm m-text-2">{formatRange(range)}{current && !current.error && ` · ${rows.length} kişi · ${fmtHours(rows.reduce((n, row) => n + total(row.hours), 0))}`}</div>
            {exportError && <p className="m-0 text-sm m-ink-warn" role="status">{exportError}</p>}
            {!current ? <p className="m-0 text-sm m-text-3" role="status">Jira çalışma kayıtları getiriliyor…</p>
                : current.error ? <p className="m-0 text-sm m-ink-warn" role="status">{current.error}</p>
                : !rows.length ? <p className="m-0 text-sm m-text-3">Bu dönem ve filtreler için görebileceğiniz çalışma kaydı yok.</p>
                : view === 'usage' ? <div className="m-surface rounded-xl overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead><tr>{[grouping === 'team' ? 'Ekip' : 'Kişi', 'Harcanan', 'Kapasite', 'Kullanım', 'Maliyet'].map((label, i) =>
                            <th key={label} scope="col" className={`p-3 ${i ? 'text-right' : 'text-left'}`}>{label}</th>)}</tr></thead>
                        <tbody>{usageRows.map(row => {
                            const pct = row.missingCapacity || !row.capacity ? undefined : row.hours / row.capacity;
                            return <tr className="border-t m-sep" key={row.label}>
                                <th scope="row" className="px-3 py-2 text-left min-w-28">{row.label}</th>
                                <td className="p-3 text-right whitespace-nowrap">{fmtHours(row.hours)}</td>
                                <td className="p-3 text-right whitespace-nowrap">{row.missingCapacity ? '—' : fmtHours(row.capacity)}</td>
                                <td className="p-3 text-right min-w-24">
                                    {pct === undefined ? '—' : <><span>{pct.toLocaleString('tr-TR', { style: 'percent', maximumFractionDigits: 1 })}</span>
                                        <div className="rounded-full h-1.5 m-fill mt-1" aria-hidden="true"><div className="rounded-full h-full" style={{ width: `${Math.min(pct, 1) * 100}%`, background: 'var(--m-accent)' }} /></div></>}
                                </td>
                                <td className="p-3 text-right whitespace-nowrap">
                                    {row.uncosted >= row.hours ? '—' : fmtCost(row.cost)}
                                    {row.uncosted > 0 && <small className="block m-text-3">{fmtHours(row.uncosted)} maliyetsiz</small>}
                                </td>
                            </tr>;
                        })}</tbody>
                    </table>
                </div>
                : <div className="m-surface rounded-xl overflow-x-auto" tabIndex={0} aria-label="Günlere göre çalışma saatleri">
                    <table className="w-full text-sm border-collapse">
                        <thead><tr>
                            <th scope="col" className="text-left px-3 py-2">Kişi ve kayıt</th>
                            {days.map(day => <th key={day} scope="col" title={day} className="px-2 py-2 min-w-12 text-right">{day.slice(-2)}</th>)}
                            <th scope="col" className="px-3 py-2 text-right">Toplam</th>
                        </tr></thead>
                        <tbody>{rows.map(row => <React.Fragment key={row.id}>
                            <tr className="border-t m-sep">
                                <th scope="row" className="text-left px-2 py-2 min-w-44">
                                    <button type="button" className="m-btn m-btn-plain" aria-expanded={expanded === row.id} onClick={() => setExpanded(id => id === row.id ? null : row.id)}>{row.name}</button>
                                </th>
                                {row.hours.map((hours, i) => {
                                    const capacity = row.capacity?.[i];
                                    const under = capacity !== undefined && days[i] <= today && hours < capacity;
                                    return <td key={days[i]} className={`px-2 py-2 text-right m-tabular whitespace-nowrap ${under ? 'm-tone-warn' : ''}`} title={capacity === undefined ? undefined : `Kapasite ${fmtHours(capacity)}`}>{hours ? fmtHours(hours) : '—'}{capacity !== undefined && capacity > 0 && <small className="block m-text-3">{fmtHours(capacity)}</small>}</td>;
                                })}
                                <td className="px-3 text-right font-semibold whitespace-nowrap">{fmtHours(total(row.hours))}{row.capacity && <small className="block m-text-3">{fmtHours(total(row.capacity))}</small>}</td>
                            </tr>
                            {expanded === row.id && row.issues.map(issue => <tr key={issue.key} className="border-t m-sep">
                                <th scope="row" className="text-left px-3 py-2"><span className="m-text-3">{issue.key}</span> {issue.title}</th>
                                {issue.hours.map((hours, i) => <td key={days[i]} className="px-2 text-right whitespace-nowrap">{hours ? fmtHours(hours) : '—'}</td>)}
                                <td className="px-3 text-right whitespace-nowrap">{fmtHours(total(issue.hours))}</td>
                            </tr>)}
                        </React.Fragment>)}</tbody>
                    </table>
                </div>}
        </section>
    );
};

export default JiraTimesheet;
