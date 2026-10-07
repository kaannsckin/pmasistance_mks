import React, { useMemo, useState } from 'react';
import { ExpectationUrgency, PlanLockStatus, ProjectStatus, UserRole, View, WorkspaceData } from '../../types';
import { actorLabel } from '../../utils/audit';
import { orgCapacity } from '../../utils/deptScorecard';
import { defaultStatusMonth, buildPortfolioEVM } from '../../utils/evm';
import { buildExecutiveBrief } from '../../utils/execBrief';
import { attentionProjects, attentionReasons, buildExecProjectRows, ExecProjectRow, ExecSortKey, filterExecRows, healthDistribution, SortDir, sortExecRows } from '../../utils/execOverview';
import { buildExecReport, exportExecReportToExcel } from '../../utils/execReport';
import { executiveSummary, HealthBand } from '../../utils/executive';
import { CATEGORY_LABELS, daysUntilNeed, isActiveExpectation, sortExpectations, STATUS_LABELS, URGENCY_LABELS, URGENCY_ORDER, urgencyCounts, waitingLabel } from '../../utils/expectations';
import { exportExecReportToPpt } from '../../utils/pptExport';
import { recentChanges, relativeTime } from '../../utils/recentChanges';
import { topPortfolioRisks } from '../../utils/risks';
import ExecBriefModal from '../ExecBriefModal';
import ExecutiveView from '../ExecutiveView';
import HealthModelSheet, { HealthInfoButton } from './HealthModelSheet';
import { Icon, IconName } from './icons';
import { PROJECT_STATUS_LABEL, RAG_TONE } from './ModernProjectHeader';
import { RAG_DOT } from './ModernSidebar';
import { URGENCY_TONE } from './ModernExpectations';
import { latestPublication, weekLabel } from '../../utils/weeklyReport';
import { BAND_META, Card, LinkButton, rowSep } from './ui';

/**
 * Modern yönetim ekranı. Yönetici 30+ projeyi tek tek görmek yerine:
 *  1. Genel bakış: dört gösterge, otomatik özet, sağlık dağılımı ve yalnızca
 *     dikkat isteyen projeler (en fazla 6), onaylar, riskler, birim yükü.
 *  2. Tüm projeler: aranabilir, süzülebilir, sıralanabilir tek tablo.
 *  3. Ayrıntılı analiz: EVM, bütçe, trend vb. için mevcut ayrıntılı ekran.
 */

interface ModernExecutiveProps {
    workspace: WorkspaceData;
    currentRole: UserRole;
    onOpenProject: (projectId: string) => void;
    onTakeSnapshot: (year: number) => void;
    onNavigate: (view: View) => void;
    onOpenAudit: () => void;
    /** Yönetimden beklentiler sayfası (aciliyet süzgeciyle) */
    onOpenExpectations: (urgency?: ExpectationUrgency) => void;
}

type Screen = 'overview' | 'projects' | 'details';
type BandFilter = HealthBand | 'all' | 'attention';

const LOCK_LABEL: Record<PlanLockStatus, string> = { draft: 'Taslak', submitted: 'Onay bekliyor', locked: 'Onaylı' };
const MONTH_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const num = (v: number, digits = 2) => v.toLocaleString('tr-TR', { maximumFractionDigits: digits });
const idx = (v: number | null) => (v === null ? '—' : num(v));

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button type="button" onClick={onClick} className="self-start inline-flex items-center min-h-[44px] -ml-2 pr-2 rounded-xl text-[17px] m-accent bg-transparent border-0 cursor-pointer">
        <Icon name="chevronLeft" size={24} strokeWidth={2.2} />
        Yönetim
    </button>
);

const ScorePill: React.FC<{ row: ExecProjectRow }> = ({ row }) => (
    <span className={`inline-flex items-center justify-center min-w-[52px] h-7 px-2.5 rounded-full text-[13px] font-semibold m-tabular ${BAND_META[row.band].tone}`} aria-label={`Sağlık ${row.score}, ${BAND_META[row.band].label}`}>
        {row.score}
    </span>
);

// ------------------------------------------------------------------ Tüm projeler

const COLUMNS: { key: ExecSortKey | null; label: string; align?: 'right' }[] = [
    { key: 'name', label: 'Proje' },
    { key: 'health', label: 'Sağlık' },
    { key: null, label: 'Haftalık durum' },
    { key: 'progress', label: 'İlerleme' },
    { key: 'spi', label: 'SPI', align: 'right' },
    { key: 'cpi', label: 'CPI', align: 'right' },
    { key: 'risks', label: 'Risk', align: 'right' },
    { key: 'overdue', label: 'Geciken', align: 'right' },
    { key: 'plan', label: 'Plan (AA)', align: 'right' },
    { key: null, label: 'Plan onayı' },
];
const GRID = 'minmax(220px, 2.4fr) 64px 104px minmax(110px, 1fr) 56px 56px 56px 72px 76px 112px';

const AllProjects: React.FC<{
    rows: ExecProjectRow[];
    year: number;
    initialBand: BandFilter;
    onBack: () => void;
    onOpenProject: (id: string) => void;
    onExport: () => void;
    onInfo: () => void;
}> = ({ rows, year, initialBand, onBack, onOpenProject, onExport, onInfo }) => {
    const [query, setQuery] = useState('');
    const [band, setBand] = useState<BandFilter>(initialBand);
    const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
    const [sort, setSort] = useState<{ key: ExecSortKey; dir: SortDir }>({ key: 'health', dir: 'asc' });

    const attentionIds = useMemo(() => new Set(attentionProjects(rows, rows.length).map(r => r.projectId)), [rows]);
    const shown = useMemo(() => {
        const base = band === 'attention'
            ? filterExecRows(rows, { query, status }).filter(r => attentionIds.has(r.projectId))
            : filterExecRows(rows, { query, band, status });
        return sortExecRows(base, sort.key, sort.dir);
    }, [rows, query, band, status, sort, attentionIds]);

    const toggleSort = (key: ExecSortKey) =>
        setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'health' || key === 'spi' || key === 'cpi' ? 'asc' : 'desc' }));
    const filtered = !!query || band !== 'all' || status !== 'all';

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
                <BackButton onClick={onBack} />
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="m-0 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">Tüm projeler</h1>
                        <p className="m-0 mt-1 text-[15px] m-text-3">{rows.length} proje · {year}</p>
                    </div>
                    <button type="button" className="m-btn m-btn-gray" onClick={onExport}><Icon name="download" size={18} />Excel olarak indir</button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
                <label className="flex items-center gap-2 min-h-[44px] px-3.5 rounded-xl m-surface m-text-3" style={{ flex: '1 1 260px', maxWidth: 420 }}>
                    <Icon name="search" size={18} strokeWidth={2} />
                    <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Proje, kod ya da proje yöneticisi" aria-label="Projelerde ara" className="flex-1 min-w-0 border-0 bg-transparent outline-none text-[15px] m-text" />
                </label>
                <select aria-label="Sağlık" className={`m-pill ${band !== 'all' ? 'is-active' : ''}`} value={band} onChange={e => setBand(e.target.value as BandFilter)}>
                    <option value="all">Tüm sağlık durumları</option>
                    <option value="attention">Dikkat isteyenler</option>
                    <option value="bad">Sorunlu</option>
                    <option value="warn">İzlemede</option>
                    <option value="good">Sağlıklı</option>
                </select>
                <select aria-label="Proje durumu" className={`m-pill ${status !== 'all' ? 'is-active' : ''}`} value={status} onChange={e => setStatus(e.target.value as ProjectStatus | 'all')}>
                    <option value="all">Tüm durumlar</option>
                    {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map(s => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
                </select>
                {filtered && <button type="button" className="m-btn m-btn-plain" onClick={() => { setQuery(''); setBand('all'); setStatus('all'); }}>Temizle</button>}
                <span className="ml-auto text-[15px] m-text-3" aria-live="polite">{shown.length} proje gösteriliyor</span>
            </div>

            <div className="m-surface rounded-2xl overflow-x-auto">
                <div role="table" aria-label="Projeler" style={{ minWidth: 1060 }}>
                    <div role="row" className="grid items-center gap-2.5 px-4 py-2.5 text-[13px] m-text-3" style={{ gridTemplateColumns: GRID }}>
                        {COLUMNS.map(c => {
                            const active = c.key && sort.key === c.key;
                            return (
                                <span key={c.label} role="columnheader" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={c.align === 'right' ? 'text-right' : ''}>
                                    {c.key ? (
                                        <button type="button" onClick={() => toggleSort(c.key!)} className={`inline-flex items-center gap-1 min-h-[36px] bg-transparent border-0 p-0 cursor-pointer text-[13px] ${active ? 'm-text font-semibold' : 'm-text-3'}`} style={{ font: 'inherit' }}>
                                            {c.label}
                                            {active && <Icon name="chevronDown" size={14} strokeWidth={2.4} style={{ transform: sort.dir === 'asc' ? 'rotate(180deg)' : undefined }} />}
                                        </button>
                                    ) : c.label}
                                </span>
                            );
                        })}
                    </div>
                    {shown.length === 0 && <p className="m-0 px-5 py-10 text-center text-[15px] m-text-3 border-t m-sep">Süzgece uyan proje yok.</p>}
                    {shown.map(r => (
                        <button
                            key={r.projectId}
                            type="button"
                            role="row"
                            onClick={() => onOpenProject(r.projectId)}
                            className="m-row-link grid items-center gap-2.5 px-4 py-2 min-h-[60px] border-0 border-t m-sep"
                            style={{ gridTemplateColumns: GRID, borderTopStyle: 'solid', borderTopWidth: 1 }}
                        >
                            <span role="cell" className="min-w-0 flex flex-col gap-0.5">
                                <span className="text-[15px] font-semibold m-text truncate">{r.name}</span>
                                <span className="text-[13px] m-text-3 truncate">{[r.code, r.pmName || 'Sahip atanmadı', PROJECT_STATUS_LABEL[r.status]].filter(Boolean).join(' · ')}</span>
                            </span>
                            <span role="cell"><ScorePill row={r} /></span>
                            <span role="cell" className="flex items-center gap-2 text-[14px] m-text">
                                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: RAG_DOT[r.rag || 'none'] }}></span>
                                {r.rag ? RAG_TONE[r.rag].label : <span className="m-text-3">Girilmedi</span>}
                            </span>
                            <span role="cell" className="flex items-center gap-2">
                                <span aria-hidden="true" className="flex-1 h-1.5 rounded-full m-fill overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${r.progressPct}%`, background: 'var(--m-accent)' }}></span></span>
                                <span className="w-10 text-right text-[14px] m-tabular m-text">%{r.progressPct}</span>
                            </span>
                            <span role="cell" className={`text-right text-[14px] m-tabular ${r.spi !== null && r.spi < 0.9 ? 'm-ink-bad font-semibold' : r.spi !== null && r.spi < 1 ? 'm-ink-warn' : 'm-text'}`}>{idx(r.spi)}</span>
                            <span role="cell" className={`text-right text-[14px] m-tabular ${r.cpi !== null && r.cpi < 0.9 ? 'm-ink-bad font-semibold' : r.cpi !== null && r.cpi < 1 ? 'm-ink-warn' : 'm-text'}`}>{idx(r.cpi)}</span>
                            <span role="cell" className={`text-right text-[14px] m-tabular ${r.highRisks ? 'm-ink-bad font-semibold' : 'm-text-3'}`}>{r.highRisks || '—'}</span>
                            <span role="cell" className={`text-right text-[14px] m-tabular ${r.overdueTasks ? 'm-ink-bad font-semibold' : 'm-text-3'}`}>{r.overdueTasks || '—'}</span>
                            <span role="cell" className="text-right text-[14px] m-tabular m-text">{num(r.planAA, 1)}</span>
                            <span role="cell" className={`text-[14px] ${r.lockStatus === 'submitted' ? 'm-ink-warn font-semibold' : r.lockStatus === 'locked' ? 'm-ink-ok' : 'm-text-3'}`}>{LOCK_LABEL[r.lockStatus]}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex items-start gap-1.5">
                <p className="m-0 flex-1 text-[13px] m-text-3">Sağlık: takvim (SPI), bütçe (CPI), geciken görev, risk, haftalık durum, PY puanı, kaynak ve yönetim beklentilerinden ağırlıklı 0–100. SPI takvim, CPI bütçe performansıdır; 1'in altı geride ya da aşımda demektir (maliyetlenmemiş projede —). Risk: skoru 15 ve üstü açık riskler.</p>
                <HealthInfoButton onClick={onInfo} />
            </div>
        </div>
    );
};

// ------------------------------------------------------------------ Genel bakış

const ModernExecutive: React.FC<ModernExecutiveProps> = ({ workspace, currentRole, onOpenProject, onTakeSnapshot, onNavigate, onOpenAudit, onOpenExpectations }) => {
    const thisYear = new Date().getFullYear();
    const [year, setYear] = useState(thisYear);
    const [screen, setScreen] = useState<Screen>('overview');
    const [projectsBand, setProjectsBand] = useState<BandFilter>('all');
    const [reportsOpen, setReportsOpen] = useState(false);
    const [showBrief, setShowBrief] = useState(false);
    const [pptBusy, setPptBusy] = useState(false);
    const [healthInfo, setHealthInfo] = useState(false);

    const rows = useMemo(() => buildExecProjectRows(workspace, year), [workspace, year]);
    const dist = useMemo(() => healthDistribution(rows), [rows]);
    const attention = useMemo(() => attentionProjects(rows, 6), [rows]);
    const attentionTotal = useMemo(() => attentionProjects(rows, rows.length).length, [rows]);
    const expCounts = useMemo(() => urgencyCounts(workspace.expectations || []), [workspace.expectations]);
    const topExpectations = useMemo(() => sortExpectations((workspace.expectations || []).filter(isActiveExpectation)).slice(0, 3), [workspace.expectations]);
    const projectNames = useMemo(() => new Map(workspace.projects.map(p => [p.id, p.name])), [workspace.projects]);
    const meetingsPending = useMemo(() => (workspace.customerMeetings || []).filter(m => m.status === 'pending'), [workspace.customerMeetings]);
    // Önce onay bekleyenler, sonra yaklaşan onaylı görüşmeler (en fazla 3)
    const meetingsShown = useMemo(() => {
        const now = Date.now();
        const upcoming = (workspace.customerMeetings || []).filter(m => m.status === 'approved' && new Date(m.date).getTime() >= now);
        return [...meetingsPending, ...upcoming].sort((a, b) => (a.status === b.status ? a.date.localeCompare(b.date) : a.status === 'pending' ? -1 : 1)).slice(0, 3);
    }, [workspace.customerMeetings, meetingsPending]);
    const latestPub = useMemo(() => latestPublication(workspace), [workspace]);
    const report = useMemo(() => buildExecReport(workspace, year), [workspace, year]);
    const summary = useMemo(() => executiveSummary(workspace, year), [workspace, year]);
    const evm = useMemo(() => buildPortfolioEVM(workspace, year), [workspace, year]);
    const org = useMemo(() => orgCapacity(workspace, year), [workspace, year]);
    const risks = useMemo(() => topPortfolioRisks(workspace).slice(0, 4), [workspace]);
    const changes = useMemo(() => recentChanges(workspace, new Date(), 7), [workspace]);
    const brief = useMemo(() => (showBrief ? buildExecutiveBrief(workspace, year) : ''), [showBrief, workspace, year]);
    const statusMonth = defaultStatusMonth(year);
    const pending = rows.filter(r => r.lockStatus === 'submitted');
    const orgScore = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 100;
    const orgBand: HealthBand = orgScore >= 75 ? 'good' : orgScore >= 50 ? 'warn' : 'bad';
    const k = report.kpi;
    const depts = [...org.departments].filter(d => d.utilization !== null).sort((a, b) => (b.utilization || 0) - (a.utilization || 0)).slice(0, 6);

    const openProjects = (band: BandFilter) => { setProjectsBand(band); setScreen('projects'); };
    const exportPpt = async () => {
        setPptBusy(true);
        try { await exportExecReportToPpt(report, workspace.settings.theme || 'classic'); }
        catch (e) { alert(`Sunum oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`); }
        finally { setPptBusy(false); }
    };

    const infoSheet = healthInfo ? <HealthModelSheet workspace={workspace} onClose={() => setHealthInfo(false)} /> : null;

    if (screen === 'projects') {
        return (
            <>
                {infoSheet}
                <AllProjects rows={rows} year={year} initialBand={projectsBand} onBack={() => setScreen('overview')} onOpenProject={onOpenProject} onExport={() => exportExecReportToExcel(report)} onInfo={() => setHealthInfo(true)} />
            </>
        );
    }
    if (screen === 'details') {
        return (
            <div className="flex flex-col gap-4">
                <BackButton onClick={() => setScreen('overview')} />
                <div className="m-legacy">
                    <ExecutiveView workspace={workspace} currentRole={currentRole} onOpenProject={onOpenProject} onTakeSnapshot={onTakeSnapshot} />
                </div>
            </div>
        );
    }

    const kpis: { label: string; value: string; note: string; noteTone: string }[] = [
        {
            label: 'Portföy sağlığı',
            value: `${orgScore}`,
            note: `100 üzerinden · ${dist.bad ? `${dist.bad} sorunlu proje` : 'sorunlu proje yok'}`,
            noteTone: BAND_META[orgBand].ink,
        },
        {
            label: 'Aktif proje',
            value: String(k.projectCounts.devam),
            note: `${k.projectCounts.teklif} teklif · ${k.projectCounts.beklemede} beklemede · ${k.projectCounts.tamamlandi} bitti`,
            noteTone: 'm-text-3',
        },
        evm.projects.length
            ? {
                label: 'Takvim ve bütçe',
                value: `SPI ${idx(evm.spi)}`,
                note: `CPI ${idx(evm.cpi)} · ${evm.cpi !== null && evm.cpi < 1 ? 'bütçe aşımında' : 'bütçe içinde'}`,
                noteTone: (evm.spi !== null && evm.spi < 0.9) || (evm.cpi !== null && evm.cpi < 0.9) ? 'm-ink-bad' : (evm.spi !== null && evm.spi < 1) || (evm.cpi !== null && evm.cpi < 1) ? 'm-ink-warn' : 'm-ink-ok',
            }
            : { label: 'Takvim ve bütçe', value: '—', note: 'Maliyet verisi yok (unvan maliyeti girilmeli)', noteTone: 'm-text-3' },
        {
            label: 'Kaynak doluluğu',
            value: org.utilization === null ? '—' : `%${Math.round(org.utilization * 100)}`,
            note: org.overAllocatedPeople ? `${org.overAllocatedPeople} kişi bazı aylarda kapasite üstü` : 'Kapasite aşımı yok',
            noteTone: org.overAllocatedPeople ? 'm-ink-bad' : 'm-text-3',
        },
    ];

    const reportItems: { icon: IconName; label: string; run: () => void; disabled?: boolean }[] = [
        { icon: 'report', label: 'Brifing (tek sayfa)', run: () => setShowBrief(true) },
        { icon: 'download', label: 'Yönetici paketi (Excel)', run: () => exportExecReportToExcel(report) },
        { icon: 'download', label: pptBusy ? 'Sunum hazırlanıyor…' : 'Sunum (PowerPoint)', run: exportPpt, disabled: pptBusy },
        { icon: 'history', label: 'Anlık görüntü al (baseline)', run: () => onTakeSnapshot(year) },
    ];

    return (
        <div className="flex flex-col gap-7">
            {showBrief && <ExecBriefModal brief={brief} year={year} onClose={() => setShowBrief(false)} />}
            {infoSheet}

            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="m-0 text-[15px] m-text-3">{year} · durum ayı {statusMonth ? MONTH_LONG[statusMonth - 1] : 'henüz başlamadı'}</p>
                    <h1 className="m-0 mt-0.5 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">Yönetim</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                    <select aria-label="Yıl" className="m-pill" value={year} onChange={e => setYear(parseInt(e.target.value, 10))}>
                        {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button type="button" className="m-btn m-btn-gray" onClick={() => setScreen('details')}>Ayrıntılı analiz</button>
                    <div className="relative">
                        <button type="button" className="m-btn m-btn-primary" aria-haspopup="menu" aria-expanded={reportsOpen} onClick={() => setReportsOpen(o => !o)}>
                            Raporlar
                            <Icon name="chevronDown" size={16} strokeWidth={2.2} />
                        </button>
                        {reportsOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setReportsOpen(false)} aria-hidden="true"></div>
                                <div role="menu" className="absolute right-0 top-full mt-2 w-64 m-surface m-pop rounded-2xl py-1.5 z-50">
                                    {reportItems.map(it => (
                                        <button key={it.label} type="button" role="menuitem" disabled={it.disabled} onClick={() => { setReportsOpen(false); it.run(); }} className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-3.5 text-[15px] disabled:opacity-50">
                                            <span className="m-text-3"><Icon name={it.icon} size={18} /></span>{it.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <p className="m-0 text-[17px] leading-relaxed m-text-2 max-w-[78ch]">{summary}</p>

            <section aria-label="Göstergeler" className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {kpis.map(kp => (
                    <div key={kp.label} className="m-surface rounded-2xl px-5 py-4 flex flex-col gap-1">
                        <span className="text-[15px] m-text-3">{kp.label}</span>
                        <span className="text-[32px] leading-tight font-bold tracking-[-0.02em] m-tabular m-text">{kp.value}</span>
                        <span className={`text-[14px] ${kp.noteTone}`}>{kp.note}</span>
                    </div>
                ))}
            </section>

            <section aria-labelledby="ex-expect" className="m-surface rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 id="ex-expect" className="m-0 text-[17px] font-semibold m-text">Yönetimden beklentiler</h2>
                        <p className="m-0 mt-0.5 text-[14px] m-text-3">
                            {expCounts.total ? `Proje yöneticileri ve bölüm sorumluları sizden ${expCounts.total} konuda karar bekliyor${expCounts.unanswered ? `; ${expCounts.unanswered} tanesi henüz yanıtlanmadı` : ''}` : 'Bekleyen karar ya da onay yok'}
                        </p>
                    </div>
                    <LinkButton onClick={() => onOpenExpectations()}>{expCounts.total ? `Tümü (${expCounts.total})` : 'Beklentiler'}</LinkButton>
                </div>
                <div className="grid gap-2.5 grid-cols-3">
                    {URGENCY_ORDER.map(u => (
                        <button key={u} type="button" onClick={() => onOpenExpectations(u)} className="m-row-link flex items-center gap-3 min-h-[56px] px-3.5 rounded-xl m-fill-2" aria-label={`${URGENCY_LABELS[u]}: ${expCounts[u]} beklenti, listeyi aç`}>
                            <span aria-hidden="true" className="w-3 h-3 rounded-full flex-none" style={{ background: URGENCY_TONE[u].dot }}></span>
                            <span className="flex-1 text-[15px] m-text">{URGENCY_LABELS[u]}</span>
                            <span className={`text-[22px] font-bold m-tabular ${expCounts[u] ? URGENCY_TONE[u].ink : 'm-text'}`}>{expCounts[u]}</span>
                        </button>
                    ))}
                </div>
                {topExpectations.length > 0 && (
                    <div className="-mx-2 flex flex-col">
                        {topExpectations.map((e, i) => {
                            const sep = rowSep(i);
                            const due = daysUntilNeed(e);
                            return (
                                <button key={e.id} type="button" onClick={() => onOpenExpectations(e.urgency)} className={`m-row-link flex items-center gap-3 px-2 py-2.5 min-h-[56px] ${sep.className}`} style={sep.style}>
                                    <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: URGENCY_TONE[e.urgency].dot }}></span>
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className="text-[15px] font-semibold m-text truncate">{e.title}</span>
                                        <span className="text-[13px] m-text-3 truncate">{[CATEGORY_LABELS[e.category], e.projectId ? projectNames.get(e.projectId) : '', e.createdByName, waitingLabel(e)].filter(Boolean).join(' · ')}</span>
                                    </span>
                                    {due !== null && due < 0 && <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold m-tone-bad whitespace-nowrap">{-due} gün gecikti</span>}
                                    {e.status === 'acknowledged' && <span className="hidden sm:inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold m-tone-accent">{STATUS_LABELS[e.status]}</span>}
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            <section aria-labelledby="ex-meet" className="m-surface rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 id="ex-meet" className="m-0 text-[17px] font-semibold m-text">Müşteri görüşmeleri ve haftalık rapor</h2>
                        <p className="m-0 mt-0.5 text-[14px] m-text-3">
                            {meetingsPending.length ? `${meetingsPending.length} görüşme onayınızı bekliyor` : 'Onay bekleyen görüşme yok'}
                            {latestPub ? ` · Son yayınlanan rapor: ${weekLabel(latestPub.year, latestPub.week)}` : ' · Henüz yayınlanmış haftalık rapor yok'}
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        <LinkButton onClick={() => onNavigate(View.WeeklyReport)}>Haftalık rapor</LinkButton>
                        <LinkButton onClick={() => onNavigate(View.Meetings)}>Görüşmeler</LinkButton>
                    </div>
                </div>
                {meetingsShown.length > 0 && (
                    <div className="-mx-2 flex flex-col">
                        {meetingsShown.map((m, i) => {
                            const sep = rowSep(i);
                            return (
                                <button key={m.id} type="button" onClick={() => onNavigate(View.Meetings)} className={`m-row-link flex items-center gap-3 px-2 py-2.5 min-h-[56px] ${sep.className}`} style={sep.style}>
                                    <span className="w-11 flex-none flex flex-col items-center rounded-lg m-fill-2 py-1" aria-hidden="true">
                                        <span className="text-[10.5px] font-semibold m-ink-bad">{new Date(m.date).toLocaleDateString('tr-TR', { month: 'short' }).toLocaleUpperCase('tr-TR')}</span>
                                        <span className="text-[17px] font-bold m-text leading-none m-tabular">{new Date(m.date).getDate()}</span>
                                    </span>
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className="text-[15px] font-semibold m-text truncate">{m.title}</span>
                                        <span className="text-[13px] m-text-3 truncate">{[m.customer, m.projectId ? projectNames.get(m.projectId) : '', m.createdByName].filter(Boolean).join(' · ')}</span>
                                    </span>
                                    {m.managementAttendance && <span className="hidden sm:inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold m-tone-warn whitespace-nowrap">Katılımınız isteniyor</span>}
                                    <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${m.status === 'pending' ? 'm-tone-warn' : 'm-tone-accent'}`}>{m.status === 'pending' ? 'Onay bekliyor' : 'Onaylı'}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            <section aria-labelledby="ex-dist" className="m-surface rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-1.5 min-w-0">
                        <div className="min-w-0">
                            <h2 id="ex-dist" className="m-0 text-[17px] font-semibold m-text">Proje sağlığı</h2>
                            <p className="m-0 mt-0.5 text-[14px] m-text-3">Takvim, bütçe, geciken iş, risk, haftalık durum, PY puanı, kaynak ve beklentilerden ağırlıklı skor</p>
                        </div>
                        <HealthInfoButton onClick={() => setHealthInfo(true)} />
                    </div>
                    <LinkButton onClick={() => openProjects('all')}>Tüm projeler ({rows.length})</LinkButton>
                </div>
                {rows.length > 0 && (
                    <div className="flex h-3.5 rounded-full overflow-hidden m-fill" aria-hidden="true">
                        {(['bad', 'warn', 'good'] as HealthBand[]).map(b => dist[b] > 0 && (
                            <span key={b} style={{ width: `${(dist[b] / dist.total) * 100}%`, background: BAND_META[b].dot }}></span>
                        ))}
                    </div>
                )}
                <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                    {(['bad', 'warn', 'good'] as HealthBand[]).map(b => (
                        <button key={b} type="button" onClick={() => openProjects(b)} className="m-row-link flex items-center gap-3 min-h-[56px] px-3.5 rounded-xl m-fill-2" aria-label={`${BAND_META[b].label}: ${dist[b]} proje, listeyi aç`}>
                            <span aria-hidden="true" className="w-3 h-3 rounded-full flex-none" style={{ background: BAND_META[b].dot }}></span>
                            <span className="flex-1 text-[15px] m-text">{BAND_META[b].label}</span>
                            <span className="text-[22px] font-bold m-tabular m-text">{dist[b]}</span>
                            <span style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>
                        </button>
                    ))}
                </div>
            </section>

            <div className="grid gap-5 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
                <Card
                    title="Dikkat isteyen projeler"
                    labelledBy="ex-attn"
                    action={attentionTotal > attention.length ? <LinkButton onClick={() => openProjects('attention')}>Tümü ({attentionTotal})</LinkButton> : undefined}
                >
                    {attention.length === 0 ? (
                        <div className="flex items-center gap-3 min-h-[56px]">
                            <span className="w-9 h-9 rounded-[10px] m-tone-ok flex items-center justify-center flex-none"><Icon name="check" strokeWidth={2.2} /></span>
                            <span className="text-[15px] m-text">Dikkat isteyen proje yok.</span>
                        </div>
                    ) : (
                        <div className="-mx-2 flex flex-col">
                            {attention.map((r, i) => (
                                <button key={r.projectId} type="button" onClick={() => onOpenProject(r.projectId)} className={`m-row-link flex items-center gap-3 px-2 py-2.5 min-h-[60px] ${i > 0 ? 'border-t m-sep' : ''}`} style={i > 0 ? { borderTopStyle: 'solid', borderTopWidth: 1 } : undefined}>
                                    <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: BAND_META[r.band].dot }}></span>
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className="text-[15px] font-semibold m-text truncate">{r.name}</span>
                                        <span className="text-[13px] m-text-3 truncate">{[r.pmName || 'Sahip atanmadı', ...attentionReasons(r).slice(0, 2)].join(' · ')}</span>
                                    </span>
                                    <ScorePill row={r} />
                                </button>
                            ))}
                        </div>
                    )}
                </Card>

                <div className="flex flex-col gap-5 min-w-0">
                    <Card
                        title="Bekleyen plan onayları"
                        labelledBy="ex-appr"
                        action={pending.length > 0 ? <LinkButton onClick={() => onNavigate(View.Allocations)}>Onayla</LinkButton> : undefined}
                    >
                        {pending.length === 0 ? (
                            <p className="m-0 text-[15px] m-text-3">Onay bekleyen plan yok.</p>
                        ) : (
                            <p className="m-0 text-[15px] m-text">
                                <span className="text-[22px] font-bold m-ink-warn m-tabular mr-2">{pending.length}</span>
                                {pending.slice(0, 3).map(p => p.name).join(', ')}{pending.length > 3 ? ` ve ${pending.length - 3} proje daha` : ''}
                            </p>
                        )}
                    </Card>
                    <Card title="En yüksek riskler" labelledBy="ex-risks" action={<LinkButton onClick={() => onNavigate(View.RiskReport)}>Risk raporu</LinkButton>}>
                        {risks.length === 0 ? (
                            <p className="m-0 text-[15px] m-text-3">Açık risk yok.</p>
                        ) : (
                            <div className="-mx-2 flex flex-col">
                                {risks.map((r, i) => (
                                    <button key={`${r.projectId}-${r.id}`} type="button" onClick={() => onOpenProject(r.projectId)} className={`m-row-link flex items-center gap-3 px-2 py-2 min-h-[52px] ${i > 0 ? 'border-t m-sep' : ''}`} style={i > 0 ? { borderTopStyle: 'solid', borderTopWidth: 1 } : undefined}>
                                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <span className="text-[15px] m-text truncate">{r.title}</span>
                                            <span className="text-[13px] m-text-3 truncate">{r.projectName}</span>
                                        </span>
                                        <span className={`inline-flex items-center h-7 px-2.5 rounded-full text-[13px] font-semibold m-tabular ${r.band === 'high' ? 'm-tone-bad' : r.band === 'medium' ? 'm-tone-warn' : 'm-tone-hold'}`} aria-label={`Risk skoru ${r.score}`}>{r.score}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            <div className="grid gap-5 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
                <Card title="Birim doluluğu" labelledBy="ex-dept" action={<LinkButton onClick={() => onNavigate(View.Allocations)}>Ekip ve tahsis</LinkButton>}>
                    {depts.length === 0 ? (
                        <p className="m-0 text-[15px] m-text-3">Birim kapasitesi tanımlı değil.</p>
                    ) : depts.map(d => {
                        const u = Math.round((d.utilization || 0) * 100);
                        const color = d.band === 'bad' ? 'var(--m-bad)' : d.band === 'warn' ? 'var(--m-warn)' : 'var(--m-accent)';
                        return (
                            <div key={d.code} className="flex items-center gap-3 min-h-[40px]">
                                <span className="w-32 flex-none min-w-0 flex flex-col leading-tight">
                                    <span className="text-[15px] m-text truncate">{d.name || d.code}</span>
                                    <span className="text-[12px] m-text-3">{d.headcount} kişi</span>
                                </span>
                                <span aria-hidden="true" className="flex-1 h-2 rounded-full m-fill overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, u)}%`, background: color }}></span></span>
                                <span className={`w-14 text-right text-[15px] font-semibold m-tabular ${d.band === 'bad' ? 'm-ink-bad' : d.band === 'warn' ? 'm-ink-warn' : 'm-text'}`}>%{u}</span>
                            </div>
                        );
                    })}
                </Card>
                <Card title="Son 7 gün" labelledBy="ex-changes" action={<LinkButton onClick={onOpenAudit}>Denetim günlüğü</LinkButton>}>
                    {changes.length === 0 ? (
                        <p className="m-0 text-[15px] m-text-3">Son 7 günde kayıtlı değişiklik yok.</p>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {changes.slice(0, 5).map(c => (
                                <div key={c.id} className="flex flex-col py-1.5">
                                    <span className="text-[15px] m-text">{c.summary}</span>
                                    <span className="text-[13px] m-text-3">{actorLabel(c)} · {relativeTime(c.at)}</span>
                                </div>
                            ))}
                            {changes.length > 5 && <span className="text-[13px] m-text-3">ve {changes.length - 5} değişiklik daha</span>}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default ModernExecutive;
