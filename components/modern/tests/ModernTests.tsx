import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Person, Project, ProjectRoleDef, Task, TestBoardColumn, TestBoardItem, TestSnapshot } from '../../../types';
import { fetchIntegrationHealth } from '../../../utils/integrations';
import { issueKind } from '../../../utils/issueTypeMeta';
import { mapJiraIssueType, mapJiraPriority } from '../../../utils/planning/jiraFields';
import { relativeTime } from '../../../utils/recentChanges';
import {
    describeCondition, distributeItems, makeSnapshot, ruleContext, TestRuleContext, TestWeekReport, weekNumber, weekReport, withSnapshot,
} from '../../../utils/testBoard';
import { fetchTestItems } from '../../../utils/testBoardFetch';
import { buildTestReport, reportHtml, reportMarkdown } from '../../../utils/testReport';
import { Icon } from '../icons';
import IssueTypeChip from '../IssueTypeChip';
import { initialsOf, PRIORITY_META } from '../taskMeta';
import TaskKeyButton from '../TaskKeyButton';
import TestSettingsSheet from './TestSettingsSheet';

/**
 * Testler: kayıtlı Jira filtresindeki (ör. gib_testset) kayıtlar kural
 * tabanlı panoda; her Cuma 20:00 alınan anlık görüntüler ve haftalık
 * karşılaştırma raporu. Mantık utils/testBoard.ts'te.
 */

interface Props {
    project: Project;
    people: Person[];
    roleDefs: ProjectRoleDef[];
    canEdit: boolean;
    actor: string;
    onUpdateProject: (updater: (p: Project) => Project) => void;
    onViewTask: (t: Task) => void;
    /** Açılıştaki sekme (varsayılan pano) */
    initialTab?: Tab;
}

type Tab = 'board' | 'report' | 'snapshots';
type Lane = 'none' | 'type';

const num = (v: number) => v.toLocaleString('tr-TR');
const dateTime = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
const UPPER: React.CSSProperties = { textTransform: 'uppercase', letterSpacing: '.03em' };

const typeView = (type: string) => ({ issueType: mapJiraIssueType(type), jiraIssueType: type });
const kindClass = (type: string) => {
    const k = issueKind(typeView(type));
    return k && k !== 'other' ? `m-issue-card m-issue-${k}` : '';
};

/** Görev kodu: projede karşılığı olan kayıt düğme (ayrıntı açar), olmayan düz etiket (AGENTS.md) */
const KeyRef: React.FC<{ k: string; tasks: Map<string, Task>; onViewTask: (t: Task) => void; strike?: boolean }> = ({ k, tasks, onViewTask, strike }) => {
    const t = tasks.get(k.toUpperCase());
    return t
        ? <TaskKeyButton task={t} onOpen={() => onViewTask(t)} className="!min-h-[24px] !px-1.5 !text-[12.5px] !rounded-md" />
        : <span className={`m-tabular font-semibold m-text-3 text-[12.5px] flex-none ${strike ? 'line-through' : ''}`}>{k}</span>;
};

const TestCard: React.FC<{ i: TestBoardItem; done: boolean; tasks: Map<string, Task>; onViewTask: (t: Task) => void }> = ({ i, done, tasks, onViewTask }) => {
    const prio = mapJiraPriority(i.priority);
    const pm = PRIORITY_META[prio];
    const bar = prio === 'Blocker' ? 'var(--m-bad)' : prio === 'High' ? 'var(--m-warn)' : 'transparent';
    return (
        <article className={`m-surface ${kindClass(i.type)} rounded-[10px] px-3 py-2.5 flex flex-col gap-1.5`}
            style={{ boxShadow: `inset 3px 0 0 ${bar}, var(--m-shadow-sm, 0 1px 2px rgba(0,0,0,.06))` }}>
            <span className="flex items-center gap-2 flex-wrap text-[12.5px]">
                <IssueTypeChip t={typeView(i.type)} />
                <KeyRef k={i.key} tasks={tasks} onViewTask={onViewTask} strike={done} />
                <span title="Jira durumu" className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-bold m-fill-2 m-text-2" style={UPPER}>{i.status || '—'}</span>
            </span>
            <span className={`text-[14px] leading-snug ${done ? 'm-text-2' : 'm-text font-medium'}`}>{i.summary}</span>
            {i.parentKey && <span className="flex items-center gap-1.5 text-[12px] m-text-3"><Icon name="subtask" size={12} />Üst görev <KeyRef k={i.parentKey} tasks={tasks} onViewTask={onViewTask} /></span>}
            <span className="flex items-center gap-2 text-[12px] m-text-3 w-full min-w-0">
                {(prio === 'Blocker' || prio === 'High') && <span className={`inline-flex items-center gap-0.5 font-semibold flex-none ${pm.ink}`}><Icon name="flag" size={12} strokeWidth={2.2} />{pm.label}</span>}
                {i.reporter && <span className="truncate" title={`Kaydı açan (Reporter): ${i.reporter}`}>Kaydı açan: {i.reporter}</span>}
                {i.assignee
                    ? <span title={`Atanan: ${i.assignee}`} aria-label={`Atanan: ${i.assignee}`} className="ml-auto w-7 h-7 rounded-full m-accent-bg flex items-center justify-center text-[11px] font-bold flex-none">{initialsOf(i.assignee)}</span>
                    : <span className="ml-auto w-7 h-7 rounded-full m-fill-2 m-text-3 flex items-center justify-center flex-none" title="Atanmamış"><Icon name="users" size={13} /></span>}
            </span>
        </article>
    );
};

const ModernTests: React.FC<Props> = ({ project, people, roleDefs, canEdit, actor, onUpdateProject, onViewTask, initialTab = 'board' }) => {
    const tb = project.testBoard;
    const [tab, setTab] = useState<Tab>(initialTab);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const abort = useRef<AbortController | null>(null);
    useEffect(() => () => abort.current?.abort(), []);

    const ctx = useMemo(() => ruleContext(project, people), [project, people]);
    const tasksByKey = useMemo(() => new Map(project.tasks.filter(t => t.jiraId?.trim()).map(t => [t.jiraId!.trim().toUpperCase(), t])), [project.tasks]);
    const roleName = (id: string) => roleDefs.find(r => r.id === id)?.name || id;

    /** Filtreyi okur; istenirse aynı anda elle anlık görüntü alır */
    const refresh = async (snapshot = false) => {
        if (!tb?.settings.filterId) return;
        setError(null); setNote(null);
        const c = new AbortController();
        abort.current = c;
        setBusy(0);
        try {
            const health = await fetchIntegrationHealth(c.signal);
            if (!health.jira) throw new Error('Jira bağlantısı bu sunucuda yapılandırılmamış.');
            const r = await fetchTestItems(tb.settings.filterId, health.authMode, c.signal, setBusy);
            const now = new Date();
            onUpdateProject(p => {
                if (!p.testBoard) return p;
                const snap = snapshot ? makeSnapshot(p.testBoard.settings, r.items, ruleContext(p, people), now, { manual: true, by: actor }) : null;
                return { ...p, testBoard: { ...p.testBoard, items: r.items, fetchedAt: now.toISOString(), ...(snap ? { snapshots: withSnapshot(p.testBoard.snapshots, snap) } : {}) } };
            });
            setNote(`${num(r.items.length)} kayıt okundu${r.truncated ? ' (sınıra takıldı: ilk 2.000 kayıt)' : ''}${snapshot ? '; ara görüntü alındı' : ''}.`);
        } catch (e) {
            if ((e as Error)?.name !== 'AbortError') setError(e instanceof Error ? e.message : String(e));
        } finally { setBusy(null); }
    };

    if (!tb) {
        return (
            <div className="flex flex-col gap-4">
                <Header />
                <div className="rounded-2xl m-fill-2 px-5 py-8 text-center flex flex-col items-center gap-2">
                    <span className="text-[17px] font-semibold m-text">Test panosu kurulmamış</span>
                    <span className="text-[14.5px] m-text-3 max-w-[64ch]">Kayıtlı bir Jira filtresindeki (ör. gib_testset) test, hata, değişiklik talebi ve doğrulama kayıtları; durum, tür, atanan ve açan kişiyi birleştiren kurallarla kolonlara dağıtılır. Her Cuma 20:00'de pano saklanır ve haftalık rapor çıkarılır.</span>
                    {canEdit ? <button type="button" className="m-btn m-btn-primary mt-1" onClick={() => setSettingsOpen(true)}><Icon name="sliders" size={16} />Test panosunu kur</button>
                        : <span className="text-[13.5px] m-text-3">Kurulumu projenin PY'si yapar.</span>}
                </div>
                {settingsOpen && <TestSettingsSheet project={project} items={[]} ctx={ctx} roleDefs={roleDefs} onClose={() => setSettingsOpen(false)}
                    onSave={settings => { onUpdateProject(p => ({ ...p, testBoard: { ...(p.testBoard || {}), settings } })); setSettingsOpen(false); }} />}
            </div>
        );
    }

    const items = tb.items || [];
    const weekly = (tb.snapshots || []).filter(s => !s.manual);

    return (
        <div className="flex flex-col gap-4">
            <Header
                sub={<>Kayıtlı filtre: <b className="m-text-2">{tb.settings.filterName || `#${tb.settings.filterId}`}</b>{tb.fetchedAt ? <> · {num(items.length)} kayıt · {relativeTime(tb.fetchedAt)} yenilendi</> : ' · henüz okunmadı'} · Haftalık görüntü her Cuma 20:00</>}
                actions={canEdit ? (
                    <>
                        <button type="button" className="m-btn m-btn-primary !min-h-[36px] !px-3 text-[14px]" disabled={busy !== null} onClick={() => refresh(false)}><Icon name="refresh" size={15} />{busy !== null ? `Okunuyor… ${num(busy)}` : 'Jira\'dan yenile'}</button>
                        <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" disabled={busy !== null} title="Jira'dan yenileyip şimdiki hâli ara görüntü olarak saklar (haftalık görüntünün yerine geçmez)" onClick={() => refresh(true)}><Icon name="history" size={15} />Görüntü al</button>
                        <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" onClick={() => setSettingsOpen(true)}><Icon name="sliders" size={15} />Kolonlar ve kurallar</button>
                    </>
                ) : undefined} />
            {error && <p role="alert" className="m-0 rounded-xl m-tone-bad px-3 py-2 text-[14px]">{error}</p>}
            {note && <p role="status" className="m-0 text-[14px] m-ink-ok">{note}</p>}

            <div role="tablist" className="flex gap-1 p-1 rounded-xl m-fill-2 self-start">
                {([['board', 'Pano'], ['report', 'Haftalık rapor'], ['snapshots', `Anlık görüntüler (${(tb.snapshots || []).length})`]] as const).map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                        className={`h-8 px-3 rounded-lg border-0 cursor-pointer text-[14px] ${tab === k ? 'm-surface font-semibold m-text' : 'bg-transparent m-text-2'}`}>{l}</button>
                ))}
            </div>

            {tab === 'board' && (items.length
                ? <TestBoardView columns={tb.settings.columns} items={items} ctx={ctx} tasks={tasksByKey} onViewTask={onViewTask} roleName={roleName} />
                : <p className="m-0 py-6 text-center text-[15px] m-text-3">{canEdit ? '"Jira\'dan yenile" ile filtredeki kayıtları okuyun.' : 'Kayıtlar henüz okunmadı.'}</p>)}
            {tab === 'report' && <TestReportView project={project} items={items} weekly={weekly} ctx={ctx} tasks={tasksByKey} onViewTask={onViewTask} />}
            {tab === 'snapshots' && <TestSnapshotsView snapshots={tb.snapshots || []} canEdit={canEdit} tasks={tasksByKey} onViewTask={onViewTask}
                onDelete={id => onUpdateProject(p => (p.testBoard ? { ...p, testBoard: { ...p.testBoard, snapshots: (p.testBoard.snapshots || []).filter(s => s.id !== id) } } : p))} />}

            {settingsOpen && <TestSettingsSheet project={project} items={items} ctx={ctx} roleDefs={roleDefs} initial={tb.settings} onClose={() => setSettingsOpen(false)}
                onSave={settings => { onUpdateProject(p => ({ ...p, testBoard: { ...(p.testBoard || {}), settings } })); setSettingsOpen(false); }} />}
        </div>
    );
};

const Header: React.FC<{ sub?: React.ReactNode; actions?: React.ReactNode }> = ({ sub, actions }) => (
    <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
            <h2 className="m-0 text-[22px] font-bold m-text">Testler</h2>
            {sub && <p className="m-0 mt-0.5 text-[14.5px] m-text-3">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
);

// ---------------------------------------------------------------- pano

const TestBoardView: React.FC<{
    columns: TestBoardColumn[];
    items: TestBoardItem[]; ctx: TestRuleContext; tasks: Map<string, Task>; onViewTask: (t: Task) => void; roleName: (id: string) => string;
}> = ({ columns, items, ctx, tasks, onViewTask, roleName }) => {
    const [query, setQuery] = useState('');
    const [lane, setLane] = useState<Lane>('none');
    const q = query.trim().toLocaleLowerCase('tr-TR');
    const shown = useMemo(() => (q ? items.filter(i => `${i.key} ${i.summary} ${i.assignee} ${i.reporter}`.toLocaleLowerCase('tr-TR').includes(q)) : items), [items, q]);
    const dist = useMemo(() => distributeItems(columns, shown, ctx), [columns, shown, ctx]);
    const unmatched = dist.get('') || [];
    const cols = [...columns.map(c => ({ id: c.id, name: c.name, hint: c.when.map(w => describeCondition(w, roleName)).join(' ve ') || 'koşulsuz', done: c.meaning === 'approved' })),
        ...(unmatched.length ? [{ id: '', name: 'Eşleşmeyen', hint: 'Hiçbir kolonun kuralına uymayan kayıtlar: kuralları gözden geçirin', done: false }] : [])];
    const lanes = useMemo(() => {
        if (lane === 'none') return [{ id: 'all', title: '', keys: null as Set<string> | null }];
        const byType = new Map<string, Set<string>>();
        shown.forEach(i => { const t = i.type || 'Türsüz'; if (!byType.has(t)) byType.set(t, new Set()); byType.get(t)!.add(i.key); });
        return [...byType].sort((a, b) => b[1].size - a[1].size).map(([t, keys]) => ({ id: t, title: t, keys }));
    }, [lane, shown]);
    const grid = `repeat(${cols.length}, minmax(240px, 1fr))`;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex-none">
                    <span className="sr-only">Panoda ara</span>
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 m-text-3 pointer-events-none"><Icon name="search" size={15} /></span>
                    <input type="search" className="m-input !h-9 !py-0 w-[220px] text-[14px]" style={{ paddingLeft: 32 }} placeholder="Anahtar, başlık, kişi…" value={query} onChange={e => setQuery(e.target.value)} />
                </label>
                <select aria-label="Kulvar" className={`m-pill ${lane !== 'none' ? 'is-active' : ''}`} value={lane} onChange={e => setLane(e.target.value as Lane)}>
                    <option value="none">Kulvar yok</option>
                    <option value="type">Türe göre</option>
                </select>
                {unmatched.length > 0 && <span className="text-[13.5px] m-ink-warn flex items-center gap-1.5"><Icon name="alert" size={14} />{unmatched.length} kayıt hiçbir kolona uymuyor</span>}
            </div>
            <div className="overflow-x-auto pb-2 -mx-1 px-1">
                <div style={{ minWidth: cols.length * 252 }}>
                    <div className="grid gap-3 sticky top-0 z-[1] m-bg pb-2" style={{ gridTemplateColumns: grid }}>
                        {cols.map(c => (
                            <div key={c.id || 'none'} title={c.hint} className={`rounded-xl px-3 py-2 flex items-center gap-2 ${c.id ? 'm-fill-2' : 'm-tone-warn'}`}>
                                <h3 className="m-0 text-[13px] font-bold truncate" style={UPPER}>{c.name}</h3>
                                <span className="text-[13px] font-semibold m-tabular opacity-80">{(dist.get(c.id) || []).length}</span>
                                <Icon name="info" size={12} className="ml-auto opacity-50 flex-none" />
                            </div>
                        ))}
                    </div>
                    {lanes.map(l => (
                        <section key={l.id} aria-label={l.title || 'Kayıtlar'} className="mb-3">
                            {l.title && <h4 className="m-0 flex items-center gap-2 h-9 px-1 mb-1 text-[15px] font-semibold m-text"><IssueTypeChip t={typeView(l.title)} /><span className="font-normal m-text-3 text-[14px]">{l.keys!.size} kayıt</span></h4>}
                            <div className="grid gap-3 items-stretch" style={{ gridTemplateColumns: grid }}>
                                {cols.map(c => (
                                    <div key={c.id || 'none'} className="flex flex-col gap-2 rounded-xl p-1.5 min-h-[64px]" style={{ background: 'color-mix(in srgb, var(--m-fill-2, #f2f2f7) 55%, transparent)' }}>
                                        {(dist.get(c.id) || []).filter(i => !l.keys || l.keys.has(i.key)).map(i => <TestCard key={i.key} i={i} done={c.done} tasks={tasks} onViewTask={onViewTask} />)}
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------- haftalık rapor

const Tile: React.FC<{ label: string; value: number; sub?: string; tone?: string }> = ({ label, value, sub, tone }) => (
    <div className="m-surface rounded-2xl px-4 py-3 flex flex-col gap-0.5 min-w-[150px] flex-1">
        <span className="text-[13px] m-text-3">{label}</span>
        <span className={`text-[26px] font-bold m-tabular leading-tight ${tone || 'm-text'}`}>{num(value)}</span>
        {sub && <span className="text-[12.5px] m-text-3">{sub}</span>}
    </div>
);

const List: React.FC<{ title: string; rows: { key: string; name: string; extra?: string }[]; tasks: Map<string, Task>; onViewTask: (t: Task) => void }> = ({ title, rows, tasks, onViewTask }) => (
    <div className="m-surface rounded-2xl px-4 py-3 flex flex-col gap-1.5 min-w-0">
        <h4 className="m-0 text-[14.5px] font-semibold m-text">{title} <span className="font-normal m-text-3">{rows.length}</span></h4>
        {rows.length === 0 && <span className="text-[13.5px] m-text-3">Yok.</span>}
        {rows.slice(0, 12).map(r => (
            <span key={r.key} className="flex items-center gap-2 text-[13.5px] min-w-0"><KeyRef k={r.key} tasks={tasks} onViewTask={onViewTask} /><span className="truncate m-text-2 flex-1" title={r.name}>{r.name}</span>{r.extra && <span className="text-[12.5px] m-text-3 flex-none">{r.extra}</span>}</span>
        ))}
        {rows.length > 12 && <span className="text-[12.5px] m-text-3">+{rows.length - 12} kayıt daha</span>}
    </div>
);

const PRIO_LABEL: Record<string, string> = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' };

const TestReportView: React.FC<{ project: Project; items: TestBoardItem[]; weekly: TestSnapshot[]; ctx: TestRuleContext; tasks: Map<string, Task>; onViewTask: (t: Task) => void }> = ({ project, items, weekly, ctx, tasks, onViewTask }) => {
    const sorted = useMemo(() => [...weekly].sort((a, b) => b.at.localeCompare(a.at)), [weekly]);
    const [pick, setPick] = useState<string>(sorted[0]?.id || 'live');
    const [copied, setCopied] = useState(false);
    const [view, setView] = useState<'executive' | 'detailed' | 'overview'>('executive');
    const report: TestWeekReport | null = useMemo(() => {
        const settings = project.testBoard!.settings;
        if (pick === 'live') {
            if (!items.length) return null;
            const cur = makeSnapshot(settings, items, ctx, new Date());
            return weekReport(cur, sorted[0], items, ctx);
        }
        const idx = sorted.findIndex(s => s.id === pick);
        if (idx < 0) return null;
        return weekReport(sorted[idx], sorted[idx + 1], items, ctx);
    }, [pick, sorted, items, ctx, project.testBoard]);
    const waitingCol = report?.columns.find(c => c.meaning === 'waiting');
    const doc = useMemo(() => {
        if (!report) return null;
        const settings = project.testBoard!.settings;
        return buildTestReport(report, { project: project.name, filter: settings.filterName || `#${settings.filterId}`, generatedAt: pick === 'live' ? new Date().toISOString() : report.to }, view === 'detailed' ? 'detailed' : 'executive');
    }, [report, project.name, project.testBoard, pick, view]);
    const html = useMemo(() => (doc ? reportHtml(doc) : ''), [doc]);
    const md = useMemo(() => (doc ? reportMarkdown(doc) : ''), [doc]);
    /** Kopyalama: biçimli (Teams, Outlook, Word tabloları korur) + Markdown düz metin; biçimli desteklenmezse yalnız Markdown */
    const copy = async () => {
        if (!doc) return;
        const text = md;
        try {
            if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
                await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
            } else await navigator.clipboard.writeText(text);
            setCopied(true); setTimeout(() => setCopied(false), 2000);
        } catch {
            try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* izin yok */ }
        }
    };
    const download = () => {
        if (!doc) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
        a.download = `${project.name} ${doc.subtitle.split(' · ')[0]} ${doc.kind === 'executive' ? 'yonetici ozeti' : 'test raporu'}.md`.replace(/[\\/:*?"<>|]+/g, '-');
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    const print = () => {
        if (!doc) return;
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${doc.title.replace(/</g, '&lt;')} · ${doc.subtitle.replace(/</g, '&lt;')}</title><style>@page{margin:16mm}body{margin:24px}</style></head><body>${html}</body></html>`);
        w.document.close();
        w.focus();
        w.print();
    };
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Hafta" className="m-pill is-active" value={pick} onChange={e => setPick(e.target.value)}>
                    <option value="live">Bu hafta (şu ana kadar)</option>
                    {sorted.map(s => <option key={s.id} value={s.id}>{weekNumber(s.week)}. hafta · {dateTime(s.at)}{s.late ? ' (geç alındı)' : ''}</option>)}
                </select>
                {report && (
                    <div className="m-segmented" role="group" aria-label="Görünüm">
                        <button type="button" className="m-segment" aria-pressed={view === 'executive'} onClick={() => setView('executive')}>Yönetici özeti</button>
                        <button type="button" className="m-segment" aria-pressed={view === 'detailed'} onClick={() => setView('detailed')}>Detaylı rapor</button>
                        <button type="button" className="m-segment" aria-pressed={view === 'overview'} onClick={() => setView('overview')}>Göstergeler</button>
                    </div>
                )}
                {report && view !== 'overview' && <>
                    <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" onClick={copy} title="Teams, Outlook ya da Word'e tablolarıyla yapıştırılır; düz metin alan yerlere Markdown olarak gider"><Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Kopyalandı' : 'Kopyala'}</button>
                    <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" onClick={download} title="Markdown dosyası (.md) olarak indir"><Icon name="download" size={15} />.md indir</button>
                    <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" onClick={print} title="Yazdır ya da PDF olarak kaydet"><Icon name="printer" size={15} />Yazdır / PDF</button>
                </>}
                {report && <span className="text-[13px] m-text-3">{dateTime(report.from)} – {dateTime(report.to)}{report.hasPrevious ? '' : ' · önceki haftalık görüntü yok, son 7 gün sayıldı'}</span>}
            </div>
            {!report && <p className="m-0 py-6 text-center text-[15px] m-text-3">{weekly.length ? 'Seçilen görüntü bulunamadı.' : 'İlk haftalık görüntü Cuma 20:00\'de alınır. O zamana kadar "Bu hafta" raporu için önce Jira\'dan yenileyin.'}</p>}
            {report && view !== 'overview' && (
                <div className="rounded-2xl px-6 py-5 overflow-x-auto" style={{ background: '#ffffff', border: '1px solid var(--m-sep, #e5e7eb)' }}
                    // Rapor HTML'i uygulamanın ürettiği, tüm Jira metinleri kaçışlı (utils/testReport.ts › esc)
                    dangerouslySetInnerHTML={{ __html: html }} />
            )}
            {report && view === 'overview' && (
                <>
                    <div className="flex flex-wrap gap-3">
                        <Tile label="Test edilip onaylanan" value={report.approved.length} tone="m-ink-ok" />
                        <Tile label="Açılan hata" value={report.newBugs.length} sub={report.testerRoleDefined ? `${report.bugsFromTesters} tanesi test ekibinden` : 'test ekibi rolü tanımlı değil'} tone={report.newBugs.length ? 'm-ink-bad' : undefined} />
                        <Tile label="Açılan değişiklik talebi" value={report.newChanges.length} />
                        <Tile label="Yeniden açılan" value={report.reopened.length} tone={report.reopened.length ? 'm-ink-warn' : undefined} />
                        {waitingCol && <Tile label={waitingCol.name} value={waitingCol.now} sub={waitingCol.before === null ? undefined : `geçen hafta ${waitingCol.before} (${waitingCol.now - waitingCol.before >= 0 ? '+' : ''}${waitingCol.now - waitingCol.before})`} />}
                    </div>
                    {report.newBugs.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                            <span className="m-text-3">Açılan hataların önceliği:</span>
                            {report.bugsByPriority.filter(p => p.n).map(p => <span key={p.priority} className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full m-fill-2 font-semibold ${PRIORITY_META[p.priority].ink}`}><Icon name="flag" size={12} />{PRIO_LABEL[p.priority]} {p.n}</span>)}
                        </div>
                    )}
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                        <List tasks={tasks} onViewTask={onViewTask} title="Test edilip onaylanan" rows={report.approved.map(r => ({ key: r.k, name: r.n }))} />
                        <List tasks={tasks} onViewTask={onViewTask} title="Açılan hatalar" rows={report.newBugs.map(b => ({ key: b.key, name: b.summary, extra: `${PRIO_LABEL[mapJiraPriority(b.priority)]}${b.reporter ? ` · ${b.reporter}` : ''}` }))} />
                        <List tasks={tasks} onViewTask={onViewTask} title="Açılan değişiklik talepleri" rows={report.newChanges.map(b => ({ key: b.key, name: b.summary }))} />
                        <List tasks={tasks} onViewTask={onViewTask} title="Yeniden açılan" rows={report.reopened.map(b => ({ key: b.key, name: b.summary }))} />
                        {waitingCol && <List tasks={tasks} onViewTask={onViewTask} title={`${waitingCol.name} (en uzun bekleyen önce)`} rows={report.waiting.map(w => ({ key: w.key, name: w.name, extra: w.days === null ? '' : `${w.days} gün` }))} />}
                        <div className="m-surface rounded-2xl px-4 py-3 flex flex-col gap-1.5">
                            <h4 className="m-0 text-[14.5px] font-semibold m-text">Kolonlar</h4>
                            {report.columns.map(c => (
                                <span key={c.id} className="flex items-center gap-2 text-[13.5px]">
                                    <span className="flex-1 m-text-2">{c.name}</span>
                                    <b className="m-tabular m-text">{c.now}</b>
                                    {c.before !== null && <span className={`m-tabular text-[12.5px] w-12 text-right ${c.now > c.before ? 'm-ink-warn' : c.now < c.before ? 'm-ink-ok' : 'm-text-3'}`}>{c.now === c.before ? '=' : `${c.now > c.before ? '+' : ''}${c.now - c.before}`}</span>}
                                </span>
                            ))}
                            {report.unmatched > 0 && <span className="flex items-center gap-2 text-[13.5px] m-ink-warn"><span className="flex-1">Eşleşmeyen</span><b className="m-tabular">{report.unmatched}</b><span className="w-12" /></span>}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// ---------------------------------------------------------------- anlık görüntüler

const TestSnapshotsView: React.FC<{ snapshots: TestSnapshot[]; canEdit: boolean; tasks: Map<string, Task>; onViewTask: (t: Task) => void; onDelete: (id: string) => void }> = ({ snapshots, canEdit, tasks, onViewTask, onDelete }) => {
    const list = [...snapshots].sort((a, b) => b.at.localeCompare(a.at));
    const [openId, setOpenId] = useState<string | null>(null);
    const open = list.find(s => s.id === openId);
    if (!list.length) return <p className="m-0 py-6 text-center text-[15px] m-text-3">Henüz görüntü yok. Haftalık görüntü her Cuma 20:00'de (o saatte uygulama kapalıysa ilk açılışta) alınır; "Görüntü al" ile ara görüntü de saklanabilir.</p>;
    return (
        <div className="flex flex-col gap-3">
            {list.map(s => {
                const counts = s.columns.map(c => ({ ...c, n: s.rows.filter(r => r.c === c.id).length }));
                return (
                    <div key={s.id} className="m-surface rounded-2xl px-4 py-3 flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[15px] font-semibold m-text">{s.manual ? 'Ara görüntü' : `${weekNumber(s.week)}. hafta`}</span>
                            <span className="text-[13.5px] m-text-3">{dateTime(s.at)} · {num(s.rows.length)} kayıt{s.by ? ` · ${s.by}` : ''}</span>
                            {s.late && <span className="text-[11.5px] px-1.5 h-5 inline-flex items-center rounded-full m-tone-warn" title="Cuma 20:00'de uygulama açık değildi; ilk açılışta alındı">geç alındı</span>}
                            <span className="ml-auto flex gap-1">
                                <button type="button" className="m-btn m-btn-gray !min-h-[32px] !px-2.5 text-[13.5px]" aria-expanded={openId === s.id} onClick={() => setOpenId(openId === s.id ? null : s.id)}><Icon name="columns" size={13} />{openId === s.id ? 'Kapat' : 'Panoyu gör'}</button>
                                {canEdit && <button type="button" className="m-icon-btn !w-8 !h-8" aria-label="Görüntüyü sil" onClick={() => { if (window.confirm('Bu görüntü silinsin mi? Haftalık rapor karşılaştırması bu görüntü olmadan yapılır.')) onDelete(s.id); }}><Icon name="trash" size={14} /></button>}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {counts.map(c => <span key={c.id} className="inline-flex items-center gap-1 h-6 px-2 rounded-full m-fill-2 text-[12.5px] m-text-2">{c.name} <b className="m-tabular m-text">{c.n}</b></span>)}
                        </div>
                        {open?.id === s.id && (
                            <div className="overflow-x-auto">
                                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${s.columns.length}, minmax(200px, 1fr))`, minWidth: s.columns.length * 208 }}>
                                    {s.columns.map(c => (
                                        <div key={c.id} className="flex flex-col gap-1 rounded-xl p-2 m-fill-2">
                                            <span className="text-[12.5px] font-bold m-text-2" style={UPPER}>{c.name}</span>
                                            {s.rows.filter(r => r.c === c.id).map(r => (
                                                <span key={r.k} className={`m-surface ${kindClass(r.t)} rounded-lg px-2 py-1.5 flex flex-col gap-0.5`}>
                                                    <span className="flex items-center gap-1.5 text-[12px]"><IssueTypeChip t={typeView(r.t)} /><KeyRef k={r.k} tasks={tasks} onViewTask={onViewTask} /></span>
                                                    <span className="text-[13px] m-text leading-snug">{r.n}</span>
                                                    <span className="text-[11.5px] m-text-3">{r.s}{r.a ? ` · Atanan: ${r.a}` : ''}</span>
                                                </span>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default ModernTests;
