import React, { useMemo, useState } from 'react';
import { WorkspaceData } from '../../types';
import { exportRiskReportToExcel, filterRisks, groupByProject, isActiveRisk, matrixCounts, ReportRisk, reportRisks, riskKpis } from '../../utils/riskReport';
import { RiskBand, RISK_BAND_LABELS, RISK_STATUS_LABELS } from '../../utils/risks';
import { applyRiskView, RoleView } from '../../utils/viewConfig';
import { Icon } from './icons';
import { RiskMatrix, RiskScorePill, RiskSheet, RISK_STATUS_TONE, RISK_TONE } from './RiskParts';
import { Card, rowSep, ViewFilterNote } from './ui';

/**
 * Portföy risk raporu. Yönetim önce yüksek riskleri ve dağılımı tek bakışta
 * görür; ardından her projenin risklerini ayrı ayrı açıp okur. Kapsam
 * (görünür projeler) dışarıdan verilir; ekran salt okunurdur.
 */

interface ModernRiskReportProps {
    workspace: WorkspaceData;
    projectIds: Set<string>;
    onOpenProjectRisks: (projectId: string) => void;
    /** Admin görünüm ayarı: en düşük skor, kapananlar, sıralama */
    riskView?: Pick<RoleView, 'minRiskScore' | 'showClosedRisks' | 'riskSort'>;
}

const HIGH_LIMIT = 8;

const ModernRiskReport: React.FC<ModernRiskReportProps> = ({ workspace, projectIds, onOpenProjectRisks, riskView }) => {
    const allRows = useMemo(() => reportRisks(workspace, projectIds), [workspace, projectIds]);
    const rows = useMemo(() => (riskView ? applyRiskView(allRows, riskView as RoleView) : allRows), [allRows, riskView]);
    const hiddenByView = allRows.length - rows.length;
    const kpis = useMemo(() => riskKpis(rows), [rows]);
    const counts = useMemo(() => matrixCounts(rows), [rows]);
    const highRisks = useMemo(() => rows.filter(r => isActiveRisk(r) && r.band === 'high'), [rows]);
    const [showAllHigh, setShowAllHigh] = useState(false);
    const [band, setBand] = useState<RiskBand | 'all'>('all');
    const [query, setQuery] = useState('');
    const [cell, setCell] = useState<string | null>(null);
    const filtered = useMemo(() => filterRisks(rows, { band, query, cell }), [rows, band, query, cell]);
    const groups = useMemo(() => groupByProject(filtered), [filtered]);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groupByProject(rows).filter(g => g.high > 0).map(g => g.projectId)));
    const [detail, setDetail] = useState<ReportRisk | null>(null);

    const projectCount = projectIds.size;
    const withActive = new Set(rows.filter(isActiveRisk).map(r => r.projectId)).size;
    const filtering = band !== 'all' || !!query.trim() || !!cell;
    const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const allOpen = groups.length > 0 && groups.every(g => expanded.has(g.projectId));
    const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

    const summary = kpis.active === 0
        ? `${projectCount} projede aktif risk kaydı yok.`
        : [
            `${withActive} projede ${kpis.active} aktif risk var`,
            kpis.high ? `; ${kpis.high} tanesi yüksek ve ${kpis.highProjects} projede toplanıyor.` : '; yüksek risk yok.',
            kpis.highWithoutAction ? ` ${kpis.highWithoutAction} yüksek riskin azaltıcı aksiyonu yazılmamış.` : '',
            kpis.withoutOwner ? ` ${kpis.withoutOwner} riskin sahibi yok.` : '',
        ].join('');

    const kpiTiles = [
        { label: 'Aktif risk', value: kpis.active, note: kpis.monitoring ? `${kpis.monitoring} tanesi izleniyor` : `${kpis.closed} kapanan`, tone: 'm-text-3' },
        { label: 'Yüksek risk', value: kpis.high, note: kpis.high ? `${kpis.highProjects} projede` : 'Yüksek risk yok', tone: kpis.high ? 'm-ink-bad' : 'm-ink-ok' },
        { label: 'Aksiyonsuz yüksek risk', value: kpis.highWithoutAction, note: kpis.highWithoutAction ? 'Azaltıcı aksiyon bekleniyor' : 'Hepsinin aksiyonu var', tone: kpis.highWithoutAction ? 'm-ink-bad' : 'm-ink-ok' },
        { label: 'Sahipsiz risk', value: kpis.withoutOwner, note: kpis.withoutOwner ? 'Sorumlu atanmalı' : 'Hepsinin sahibi var', tone: kpis.withoutOwner ? 'm-ink-warn' : 'm-ink-ok' },
    ];
    const shownHigh = showAllHigh ? highRisks : highRisks.slice(0, HIGH_LIMIT);
    const [cp, ci] = cell ? cell.split('-') : [];

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="m-0 text-[15px] m-text-3">{projectCount} proje · {today}</p>
                    <h1 className="m-0 mt-0.5 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">Risk raporu</h1>
                </div>
                <button type="button" className="m-btn m-btn-gray" onClick={() => exportRiskReportToExcel(rows)} disabled={rows.length === 0}>
                    <Icon name="download" size={18} />
                    Excel'e aktar
                </button>
            </header>

            <p className="m-0 text-[17px] leading-relaxed m-text-2 max-w-[78ch]">{summary}</p>
            {hiddenByView > 0 && <ViewFilterNote text={`Yönetici ayarı: ${[riskView!.minRiskScore ? `skoru ${riskView!.minRiskScore} ve üstü riskler` : '', !riskView!.showClosedRisks ? 'kapananlar gizli' : ''].filter(Boolean).join(' · ')} · ${hiddenByView} risk gizli`} />}

            <section aria-label="Göstergeler" className="grid gap-4 grid-cols-2 xl:grid-cols-4">
                {kpiTiles.map(k => (
                    <div key={k.label} className="m-surface rounded-2xl px-5 py-4 flex flex-col gap-1">
                        <span className="text-[15px] m-text-3">{k.label}</span>
                        <span className="text-[32px] leading-tight font-bold tracking-[-0.02em] m-tabular m-text">{k.value}</span>
                        <span className={`text-[14px] ${k.tone}`}>{k.note}</span>
                    </div>
                ))}
            </section>

            <div className="grid gap-5 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))' }}>
                <Card
                    title="Yüksek riskler"
                    labelledBy="rr-high"
                    subtitle="Skor 15 ve üzeri; en yüksek başta"
                    action={highRisks.length > HIGH_LIMIT ? <button type="button" className="m-btn m-btn-plain" onClick={() => setShowAllHigh(v => !v)}>{showAllHigh ? 'Daha az' : `Tümü (${highRisks.length})`}</button> : undefined}
                >
                    {highRisks.length === 0 ? (
                        <div className="flex items-center gap-3 min-h-[56px]">
                            <span className="w-9 h-9 rounded-[10px] m-tone-ok flex items-center justify-center flex-none"><Icon name="check" strokeWidth={2.2} /></span>
                            <span className="text-[15px] m-text">Portföyde yüksek risk yok.</span>
                        </div>
                    ) : (
                        <div className="-mx-2 flex flex-col">
                            {shownHigh.map((r, idx) => {
                                const sep = rowSep(idx);
                                return (
                                    <button key={`${r.projectId}-${r.id}`} type="button" onClick={() => setDetail(r)} className={`m-row-link flex items-center gap-3 px-2 py-2 min-h-[60px] ${sep.className}`} style={sep.style}>
                                        <RiskScorePill score={r.score} />
                                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <span className="text-[15px] font-semibold m-text truncate">{r.title}</span>
                                            <span className="text-[13px] m-text-3 truncate">
                                                {r.projectName} · {r.ownerName || <span className="m-ink-warn">sahibi yok</span>} · {r.mitigation ? 'aksiyon var' : <span className="m-ink-bad">aksiyon yok</span>}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </Card>

                <Card title="Portföy risk matrisi" labelledBy="rr-matrix" subtitle="Hücreye tıklayınca aşağıdaki liste süzülür">
                    <RiskMatrix counts={counts} selected={cell} onSelect={setCell} />
                    <div className="grid grid-cols-3 gap-2">
                        {(['high', 'medium', 'low'] as RiskBand[]).map(b => (
                            <button key={b} type="button" aria-pressed={band === b} onClick={() => setBand(band === b ? 'all' : b)} className="m-row-link rounded-xl m-fill-2 px-3 py-2.5 flex flex-col items-start" style={band === b ? { boxShadow: `inset 0 0 0 2px ${RISK_TONE[b].solid}` } : undefined}>
                                <span className={`text-[22px] font-bold m-tabular ${RISK_TONE[b].ink}`}>{kpis[b]}</span>
                                <span className="text-[13px] m-text-3">{RISK_BAND_LABELS[b]}</span>
                            </button>
                        ))}
                    </div>
                </Card>
            </div>

            <section aria-labelledby="rr-projects" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 id="rr-projects" className="m-0 text-[22px] font-bold m-text">Proje bazlı riskler</h2>
                        <p className="m-0 mt-0.5 text-[14px] m-text-3">En riskli proje başta · {withActive} projede aktif risk, {Math.max(0, projectCount - withActive)} projede yok</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="m-search flex items-center gap-2 min-h-[40px] px-3 rounded-[10px] m-text-3">
                            <Icon name="search" size={16} />
                            <input aria-label="Risklerde ara" className="bg-transparent border-0 outline-none text-[15px] m-text w-44" placeholder="Risk, proje, sahip" value={query} onChange={e => setQuery(e.target.value)} />
                        </label>
                        <select aria-label="Önem" className={`m-pill ${band !== 'all' ? 'is-active' : ''}`} value={band} onChange={e => setBand(e.target.value as RiskBand | 'all')}>
                            <option value="all">Tüm önem düzeyleri</option>
                            {(['high', 'medium', 'low'] as RiskBand[]).map(b => <option key={b} value={b}>{RISK_BAND_LABELS[b]}</option>)}
                        </select>
                        {cell && (
                            <button type="button" className="m-pill is-active" onClick={() => setCell(null)} aria-label="Matris süzgecini kaldır">
                                Olasılık {cp} × Etki {ci}
                                <Icon name="x" size={14} strokeWidth={2.4} />
                            </button>
                        )}
                        {groups.length > 0 && (
                            <button type="button" className="m-btn m-btn-plain" onClick={() => setExpanded(allOpen ? new Set() : new Set(groups.map(g => g.projectId)))}>
                                {allOpen ? 'Tümünü kapat' : 'Tümünü aç'}
                            </button>
                        )}
                    </div>
                </div>

                {groups.length === 0 ? (
                    <div className="m-surface rounded-2xl px-5 py-8 text-center text-[15px] m-text-3">
                        {filtering ? 'Bu süzgece uyan risk yok.' : 'Kapsamdaki projelerde aktif risk yok.'}
                    </div>
                ) : groups.map(g => {
                    const open = expanded.has(g.projectId);
                    const panelId = `rr-p-${g.projectId}`;
                    return (
                        <div key={g.projectId} className="m-surface rounded-2xl overflow-hidden">
                            <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => toggle(g.projectId)} className="m-row-link flex items-center gap-3 px-4 py-3 min-h-[64px]">
                                <span style={{ color: 'var(--m-chevron)', transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}><Icon name="chevronRight" size={18} strokeWidth={2.2} /></span>
                                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="text-[17px] font-semibold m-text truncate">{g.name}{g.code && <span className="ml-2 text-[13px] font-normal m-text-3">{g.code}</span>}</span>
                                    <span className="text-[13px] m-text-3 truncate">{g.risks[0]?.title}</span>
                                </span>
                                <span className="hidden sm:flex items-center gap-1.5">
                                    {(['high', 'medium', 'low'] as RiskBand[]).map(b => g[b] > 0 && (
                                        <span key={b} className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold m-tabular ${RISK_TONE[b].tone}`}>{g[b]} {RISK_BAND_LABELS[b].toLocaleLowerCase('tr-TR')}</span>
                                    ))}
                                </span>
                                <RiskScorePill score={g.maxScore} />
                            </button>
                            {open && (
                                <div id={panelId} className="border-t m-sep px-2 pb-2" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                                    {g.risks.map((r, idx) => {
                                        const sep = rowSep(idx);
                                        return (
                                            <button key={r.id} type="button" onClick={() => setDetail(r)} className={`m-row-link grid items-center gap-3 px-3 py-2.5 ${sep.className}`} style={{ ...sep.style, gridTemplateColumns: '40px minmax(0, 2fr) minmax(0, 1fr) minmax(0, 2fr) 92px' }}>
                                                <RiskScorePill score={r.score} />
                                                <span className="min-w-0 flex flex-col">
                                                    <span className="text-[15px] m-text truncate">{r.title}</span>
                                                    <span className="text-[12px] m-text-3">P{r.probability} × E{r.impact}</span>
                                                </span>
                                                <span className="text-[14px] truncate">{r.ownerName ? <span className="m-text-2">{r.ownerName}</span> : <span className="m-ink-warn">Sahibi yok</span>}</span>
                                                <span className="text-[14px] truncate">{r.mitigation ? <span className="m-text-2">{r.mitigation}</span> : <span className={r.band === 'high' ? 'm-ink-bad' : 'm-text-3'}>Aksiyon yok</span>}</span>
                                                <span className={`justify-self-end inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold ${RISK_STATUS_TONE[r.status]}`}>{RISK_STATUS_LABELS[r.status]}</span>
                                            </button>
                                        );
                                    })}
                                    <div className="flex items-center justify-between gap-3 px-3 pt-2">
                                        <span className="text-[13px] m-text-3">{g.closed ? `${g.closed} kapanan risk listede yok` : ''}</span>
                                        <button type="button" onClick={() => onOpenProjectRisks(g.projectId)} className="inline-flex items-center gap-0.5 min-h-[40px] px-2 rounded-xl text-[15px] font-semibold m-accent bg-transparent border-0 cursor-pointer">
                                            Projenin riskleri
                                            <Icon name="chevronRight" size={18} strokeWidth={2.2} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </section>

            {detail && (
                <RiskSheet
                    risk={detail}
                    projectName={detail.projectName}
                    people={workspace.people}
                    canEdit={false}
                    onClose={() => setDetail(null)}
                    onOpenProject={() => { const id = detail.projectId; setDetail(null); onOpenProjectRisks(id); }}
                />
            )}
        </div>
    );
};

export default ModernRiskReport;
