import React, { useEffect, useMemo, useState } from 'react';
import { Person, Project, TitleDef } from '../../types';
import { BilledApplyMode, BilledHoursOptions, BilledHoursRecord } from '../../utils/billedHours';
import { fullName } from '../../utils/dataPool';
import { effectiveWorkdays } from '../../utils/planning/workdays';
import { buildWorkforce, hoursByMonth, PersonRow, RecordRow, WorkforceEntry } from '../../utils/workforce';
import { Icon } from './icons';
import { fmtCost, fmtDays, fmtHours, PersonBadge } from './WorkforceParts';

/**
 * Ekip ve tahsis › İş güçleri: Jira worklog'larından (billing hours) kim, hangi
 * kayıtta, ne kadar zaman harcamış ve maliyeti. Kişi aranınca o kişinin kayıt
 * kırılımı açılır; Kayıtlar görünümünde her kaydın kaç kişiyle kaç saat sürdüğü.
 */

type Period = 'this-month' | 'last-month' | 'last-3' | 'this-year' | 'last-year' | 'all';
const PERIODS: { id: Period; label: string }[] = [
    { id: 'this-month', label: 'Bu ay' },
    { id: 'last-month', label: 'Geçen ay' },
    { id: 'last-3', label: 'Son 3 ay' },
    { id: 'this-year', label: 'Bu yıl' },
    { id: 'last-year', label: 'Geçen yıl' },
    { id: 'all', label: 'Tüm zamanlar' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const periodRange = (p: Period, now: Date): { from?: string; to?: string } => {
    const y = now.getFullYear(), m = now.getMonth();
    switch (p) {
        case 'this-month': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
        case 'last-month': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
        case 'last-3': return { from: iso(new Date(y, m - 2, 1)), to: iso(new Date(y, m + 1, 0)) };
        case 'this-year': return { from: `${y}-01-01`, to: `${y}-12-31` };
        case 'last-year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
        default: return {};
    }
};
const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const monthLabel = (ym: string) => `${MONTH_SHORT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

interface Props {
    people: Person[];
    titles: TitleDef[];
    /** Kullanıcının görebildiği projeler (rol kapsamı) */
    projects: Project[];
    /** Jira'dan elle yenileme (yalnız düzenlenebilen projelerde yapılır) */
    onRefresh?: (projectIds: string[], force: boolean) => Promise<{ records: number; entries: number; missing: string[] }>;
    /** Gerçekleşen tahsise işleme (gerçekleşen girme yetkisi olan roller) */
    onApplyActuals?: (records: BilledHoursRecord[], options: BilledHoursOptions, mode: BilledApplyMode) => void;
    onViewPerson?: (personId: string) => void;
}

const Kpi: React.FC<{ label: string; value: string; sub?: string; tone?: string }> = ({ label, value, sub, tone }) => (
    <div className="m-surface rounded-2xl px-4 py-3 flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] m-text-3">{label}</span>
        <span className="text-[24px] leading-tight font-bold m-text m-tabular truncate">{value}</span>
        {sub && <span className={`text-[13px] ${tone || 'm-text-3'}`}>{sub}</span>}
    </div>
);

const MonthBars: React.FC<{ entries: WorkforceEntry[] }> = ({ entries }) => {
    const months = hoursByMonth(entries);
    const max = Math.max(...months.map(m => m.hours), 1);
    if (months.length < 2) return null;
    return (
        <div className="flex items-end gap-1.5 h-20 pt-2" role="img" aria-label={`Aylık saat: ${months.map(m => `${monthLabel(m.month)} ${m.hours}`).join(', ')}`}>
            {months.slice(-12).map(m => (
                <div key={m.month} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                    <span className="text-[11px] m-text-3 m-tabular">{Math.round(m.hours)}</span>
                    <span className="w-full rounded-t-md" style={{ height: `${Math.max(4, (m.hours / max) * 44)}px`, background: 'var(--m-accent)' }}></span>
                    <span className="text-[11px] m-text-3 whitespace-nowrap">{monthLabel(m.month)}</span>
                </div>
            ))}
        </div>
    );
};

/** Kişinin kayıt kırılımı: hangi kayıtta ne kadar zaman, maliyeti */
const PersonDetail: React.FC<{ row: PersonRow; onViewPerson?: (id: string) => void }> = ({ row, onViewPerson }) => {
    const byTask = useMemo(() => {
        const m = new Map<string, { key: string; summary: string; project: string; hours: number; cost: number | null; last: string }>();
        row.entries.forEach(e => {
            const x = m.get(e.taskId) || { key: e.issueKey, summary: e.summary, project: e.projectName, hours: 0, cost: 0, last: '' };
            x.hours += e.hours;
            x.cost = x.cost === null || e.cost === null ? null : x.cost + e.cost;
            if (e.date > x.last) x.last = e.date;
            m.set(e.taskId, x);
        });
        return [...m.values()].sort((a, b) => b.hours - a.hours);
    }, [row]);
    return (
        <div className="flex flex-col gap-3 px-3 pb-3">
            <MonthBars entries={row.entries} />
            <div className="overflow-x-auto">
                <table className="w-full text-[14px] border-collapse">
                    <thead>
                        <tr className="text-left m-text-3 text-[12.5px]">
                            <th className="font-semibold py-1.5 pr-3">Kayıt</th>
                            <th className="font-semibold py-1.5 pr-3 hidden md:table-cell">Proje</th>
                            <th className="font-semibold py-1.5 pr-3 text-right">Saat</th>
                            <th className="font-semibold py-1.5 pr-3 text-right hidden sm:table-cell">Pay</th>
                            <th className="font-semibold py-1.5 text-right">Maliyet</th>
                        </tr>
                    </thead>
                    <tbody>
                        {byTask.map(t => (
                            <tr key={t.key} className="border-t m-sep" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                                <td className="py-2 pr-3 min-w-0">
                                    <span className="m-text-3 m-tabular mr-2">{t.key}</span><span className="m-text">{t.summary}</span>
                                    <span className="block md:hidden text-[12.5px] m-text-3 truncate">{t.project}</span>
                                </td>
                                <td className="py-2 pr-3 m-text-2 whitespace-nowrap hidden md:table-cell">{t.project}</td>
                                <td className="py-2 pr-3 text-right m-tabular m-text whitespace-nowrap">{fmtHours(Math.round(t.hours * 100) / 100)}</td>
                                <td className="py-2 pr-3 text-right m-tabular m-text-3 hidden sm:table-cell">%{Math.round((t.hours / (row.hours || 1)) * 100)}</td>
                                <td className="py-2 text-right m-tabular m-text-2 whitespace-nowrap">{fmtCost(t.cost === null ? null : Math.round(t.cost))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {row.person && onViewPerson && (
                <button type="button" className="m-btn m-btn-plain self-start" style={{ minHeight: 36, padding: '0 10px' }} onClick={() => onViewPerson(row.person!.id)}>
                    Kişi profilini aç<Icon name="chevronRight" size={16} />
                </button>
            )}
        </div>
    );
};

const ModernWorkforce: React.FC<Props> = ({ people, titles, projects, onRefresh, onApplyActuals, onViewPerson }) => {
    const [period, setPeriod] = useState<Period>('this-year');
    const [projectId, setProjectId] = useState('all');
    const [query, setQuery] = useState('');
    const [view, setView] = useState<'people' | 'records'>('people');
    const [open, setOpen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
    const [confirmApply, setConfirmApply] = useState(false);

    const linkedProjects = useMemo(() => projects.filter(p => p.tasks.some(t => t.jiraId)), [projects]);
    const shown = useMemo(() => (projectId === 'all' ? linkedProjects : linkedProjects.filter(p => p.id === projectId)), [linkedProjects, projectId]);
    const now = useMemo(() => new Date(), []);
    const range = periodRange(period, now);
    const report = useMemo(() => buildWorkforce({ people, titles }, shown, { ...range, query }), [people, titles, shown, range.from, range.to, query]);

    // Arama tek kişiye indiyse onun kırılımı kendiliğinden açılır
    useEffect(() => {
        if (query.trim() && view === 'people' && report.people.length === 1) setOpen(report.people[0].key);
    }, [query, view, report.people]);

    const year = range.from && range.to && range.from.slice(0, 4) === range.to.slice(0, 4) ? Number(range.from.slice(0, 4)) : null;

    const refresh = async () => {
        if (!onRefresh) return;
        setBusy(true);
        setNotice(null);
        try {
            const r = await onRefresh(shown.map(p => p.id), true);
            setNotice({ ok: true, text: `${r.records} kaydın worklog'u Jira'dan alındı (${r.entries} satır).${r.missing.length ? ` Jira'da bulunamayan: ${r.missing.slice(0, 5).join(', ')}${r.missing.length > 5 ? '…' : ''}.` : ''}` });
        } catch (e) {
            setNotice({ ok: false, text: e instanceof Error ? e.message : String(e) });
        } finally {
            setBusy(false);
        }
    };

    const applyActuals = (mode: BilledApplyMode) => {
        if (!onApplyActuals || !year) return;
        const m = new Map<string, BilledHoursRecord>();
        report.people.forEach(p => p.entries.forEach(e => {
            const name = p.person ? fullName(p.person) : p.name;
            const month = Number(e.date.slice(5, 7));
            const k = `${e.projectName}|${name}|${month}`;
            const r = m.get(k) || { projectName: e.projectName, personName: name, month, hours: 0 };
            r.hours += e.hours;
            m.set(k, r);
        }));
        const workdaysByMonth = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, effectiveWorkdays(year, i + 1)]));
        onApplyActuals([...m.values()], { year, workdaysByMonth }, mode);
        setConfirmApply(false);
        setNotice({ ok: true, text: `${year} için ${m.size} kişi × proje × ay satırı gerçekleşen tahsise işlendi (${mode === 'fill' ? 'yalnız boş aylar' : 'üzerine yazıldı'}).` });
    };

    const empty = report.totalHours === 0;
    const noData = report.syncedTasks === 0;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex-1 min-w-[220px] max-w-[420px]">
                    <span className="sr-only">Kişi, kayıt ya da konu ara</span>
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 m-text-3 pointer-events-none"><Icon name="search" size={17} /></span>
                    <input type="search" className="m-input" style={{ paddingLeft: 38 }} placeholder="Kişi, kayıt (ATL-12) ya da konu ara" value={query} onChange={e => { setQuery(e.target.value); setOpen(null); }} />
                </label>
                <select aria-label="Dönem" className={`m-pill ${period !== 'this-year' ? 'is-active' : ''}`} value={period} onChange={e => setPeriod(e.target.value as Period)}>
                    {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <select aria-label="Proje" className={`m-pill ${projectId !== 'all' ? 'is-active' : ''}`} value={projectId} onChange={e => setProjectId(e.target.value)}>
                    <option value="all">Tüm projeler</option>
                    {linkedProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div className="m-segmented ml-auto" role="group" aria-label="Görünüm">
                    <button type="button" className="m-segment" aria-pressed={view === 'people'} onClick={() => setView('people')}>Kişiler</button>
                    <button type="button" className="m-segment" aria-pressed={view === 'records'} onClick={() => setView('records')}>Kayıtlar</button>
                </div>
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                <Kpi label="Harcanan süre" value={fmtHours(report.totalHours)} sub={fmtDays(report.totalHours)} />
                <Kpi label="Maliyet" value={fmtCost(report.totalCost)} sub={report.uncostedHours > 0 ? `${fmtHours(report.uncostedHours)} maliyetlenemedi` : 'Ünvan maliyetlerinden'} tone={report.uncostedHours > 0 ? 'm-ink-warn' : undefined} />
                <Kpi label="Kişi" value={String(report.people.length)} sub={report.unmatchedAuthors.length ? `${report.unmatchedAuthors.length} kişi havuzda yok` : 'Havuzla eşleşti'} tone={report.unmatchedAuthors.length ? 'm-ink-warn' : undefined} />
                <Kpi label="Kayıt" value={String(report.records.length)} sub={`${report.syncedTasks} kaydın worklog'u alındı${report.pendingTasks ? ` · ${report.pendingTasks} bekliyor` : ''}`} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] m-text-3 flex-1 min-w-[240px]">
                    Kaynak: Jira worklog'ları (billing hours). Görev Jira kaydıyla eşitlenince ve Jira'daki harcanan süre değişince kendiliğinden yenilenir.
                </span>
                {onRefresh && linkedProjects.length > 0 && (
                    <button type="button" className="m-btn m-btn-gray" disabled={busy} onClick={refresh}>
                        <Icon name="refresh" size={16} />{busy ? 'Alınıyor…' : 'Jira\'dan yenile'}
                    </button>
                )}
                {onApplyActuals && !empty && (
                    <button type="button" className="m-btn m-btn-gray" disabled={!year} title={year ? undefined : 'Tek bir yıl içindeki dönem seçin'} onClick={() => setConfirmApply(c => !c)}>
                        <Icon name="upload" size={16} />Gerçekleşen tahsise işle
                    </button>
                )}
            </div>

            {confirmApply && year && (
                <div role="group" aria-label="Gerçekleşen tahsise işleme" className="m-surface rounded-2xl p-4 flex flex-col gap-3">
                    <p className="m-0 text-[15px] m-text">
                        Seçili dönemin saatleri ({report.people.length} kişi, {report.records.length} kayıt) {year} yılının gerçekleşen tahsisine adam-ay olarak yazılacak
                        (gün = saat ÷ 8, adam-ay = gün ÷ ayın iş günü). Havuzda olmayan kişiler atlanır.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="m-btn m-btn-primary" onClick={() => applyActuals('fill')}>Yalnız boş ayları doldur</button>
                        <button type="button" className="m-btn m-btn-gray" onClick={() => applyActuals('overwrite')}>Üzerine yaz</button>
                        <button type="button" className="m-btn m-btn-plain" onClick={() => setConfirmApply(false)}>Vazgeç</button>
                    </div>
                </div>
            )}

            {notice && <p role="status" className={`m-0 rounded-xl px-3 py-2 text-[14px] ${notice.ok ? 'm-tone-ok' : 'm-tone-bad'}`}>{notice.text}</p>}

            {report.unmatchedAuthors.length > 0 && !empty && (
                <p className="m-0 text-[13.5px] m-ink-warn flex items-start gap-2">
                    <Icon name="alert" size={15} />
                    <span>Havuzda eşleşmeyen Jira kullanıcıları: {report.unmatchedAuthors.slice(0, 6).join(', ')}{report.unmatchedAuthors.length > 6 ? '…' : ''}. Veri Havuzu'na e-posta ya da aynı ad soyadla eklenince maliyetlenir.</span>
                </p>
            )}

            {empty ? (
                <div className="m-surface rounded-2xl px-6 py-10 flex flex-col items-center gap-2 text-center">
                    <Icon name="clock" size={28} />
                    <p className="m-0 text-[17px] font-semibold m-text">{noData ? 'Henüz Jira worklog verisi yok' : query ? 'Aramaya uyan kayıt yok' : 'Bu dönemde harcanan süre yok'}</p>
                    <p className="m-0 text-[14px] m-text-3 max-w-[56ch]">
                        {noData
                            ? 'Görevler Jira kayıtlarıyla eşitlenince (Planlama › Jira eşitleme) kim, hangi kayıtta ne kadar zaman harcamış buraya gelir.'
                            : 'Dönemi ya da projeyi değiştirmeyi deneyin.'}
                    </p>
                </div>
            ) : view === 'people' ? (
                <ul className="m-0 p-0 list-none m-surface rounded-2xl overflow-hidden" aria-label="Kişiler">
                    {report.people.map((p, i) => {
                        const isOpen = open === p.key;
                        return (
                            <li key={p.key} className={i ? 'border-t m-sep' : ''} style={i ? { borderTopStyle: 'solid', borderTopWidth: 1 } : undefined}>
                                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.key)} className="m-row-link w-full flex items-center gap-3 px-4 py-3 text-left">
                                    <PersonBadge name={p.name} matched={!!p.person} />
                                    <span className="flex-1 min-w-0 flex flex-col">
                                        <span className="text-[15px] font-semibold m-text truncate">{p.name}{!p.person && <span className="ml-2 text-[12px] font-semibold m-ink-warn">havuzda yok</span>}</span>
                                        <span className="text-[13px] m-text-3 truncate">
                                            {[p.person?.titleCode, p.person?.departmentCode].filter(Boolean).join(' · ') || 'Jira kullanıcısı'} · {p.records} kayıt · {p.projects} proje
                                        </span>
                                    </span>
                                    <span className="text-right flex flex-col">
                                        <span className="text-[15px] font-semibold m-text m-tabular">{fmtHours(p.hours)}</span>
                                        <span className="text-[13px] m-text-3 m-tabular">{p.uncostedHours === p.hours ? 'maliyetsiz' : fmtCost(p.cost)}</span>
                                    </span>
                                    <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={16} />
                                </button>
                                {isOpen && <PersonDetail row={p} onViewPerson={onViewPerson} />}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <ul className="m-0 p-0 list-none m-surface rounded-2xl overflow-hidden" aria-label="Kayıtlar">
                    {report.records.map((r: RecordRow, i) => {
                        const isOpen = open === r.taskId;
                        return (
                            <li key={r.taskId} className={i ? 'border-t m-sep' : ''} style={i ? { borderTopStyle: 'solid', borderTopWidth: 1 } : undefined}>
                                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.taskId)} className="m-row-link w-full flex items-center gap-3 px-4 py-3 text-left">
                                    <span className="flex-1 min-w-0 flex flex-col">
                                        <span className="text-[15px] m-text truncate"><span className="m-text-3 m-tabular mr-2">{r.issueKey}</span>{r.summary}</span>
                                        <span className="text-[13px] m-text-3 truncate">{r.projectName} · {r.people.length} kişi</span>
                                    </span>
                                    <span className="hidden sm:flex -space-x-1.5" aria-hidden="true">
                                        {r.people.slice(0, 4).map(x => <PersonBadge key={x.key} name={x.name} matched={!!x.person} size={26} />)}
                                    </span>
                                    <span className="text-right flex flex-col">
                                        <span className="text-[15px] font-semibold m-text m-tabular">{fmtHours(r.hours)}</span>
                                        <span className="text-[13px] m-text-3 m-tabular">{r.uncostedHours === r.hours ? 'maliyetsiz' : fmtCost(r.cost)}</span>
                                    </span>
                                    <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={16} />
                                </button>
                                {isOpen && (
                                    <ul className="m-0 px-4 pb-3 list-none flex flex-col">
                                        {r.people.map(x => (
                                            <li key={x.key} className="flex items-center gap-2.5 py-1.5">
                                                <PersonBadge name={x.name} matched={!!x.person} size={26} />
                                                <span className="flex-1 min-w-0 truncate text-[14px] m-text">{x.name}</span>
                                                <span className="text-[14px] m-text m-tabular">{fmtHours(x.hours)}</span>
                                                <span className="text-[13px] m-text-3 m-tabular">%{Math.round((x.hours / (r.hours || 1)) * 100)}</span>
                                                <span className="w-24 text-right text-[13px] m-text-3 m-tabular">{fmtCost(x.cost)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default ModernWorkforce;
