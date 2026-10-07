import React, { useMemo, useState } from 'react';
import { Person, PestelItem, Project, Risk, SwotItem } from '../../types';
import { EMBED_SYSTEM, parseRiskSuggestions, RiskSuggestion, riskSuggestionPrompt } from '../../utils/ai/embedded';
import { riskDraftFromPestel, summarizePestel } from '../../utils/pestel';
import { filterRisks, isActiveRisk, matrixCounts, reportRisks, riskKpis, RiskStatusFilter } from '../../utils/riskReport';
import { createRisk, RISK_BAND_LABELS, RISK_STATUS_LABELS } from '../../utils/risks';
import { summarizeSwot } from '../../utils/swot';
import { applyRiskView, RoleView } from '../../utils/viewConfig';
import { useAiRun } from '../assistant/AiButton';
import PestelModal from '../PestelModal';
import SwotModal from '../SwotModal';
import { Icon } from './icons';
import { RiskMatrix, RiskScorePill, RiskSheet, RISK_STATUS_TONE } from './RiskParts';
import { Card, rowSep, ViewFilterNote } from './ui';

/**
 * Modern proje Riskler sekmesi: süzülebilir risk listesi, 5×5 matris ve
 * bant özeti. Riskleri yalnız proje sahibi PM düzenler; diğerleri ayrıntıyı
 * salt okur. PESTEL, SWOT ve AI önerisi "Analizler" menüsünde.
 */

interface ModernRisksProps {
    project: Project;
    people: Person[];
    canEdit: boolean;
    onUpdateRisks: (risks: Risk[]) => void;
    onUpdatePestel: (items: PestelItem[]) => void;
    onUpdateSwot: (items: SwotItem[]) => void;
    /** Admin görünüm ayarı: en düşük skor, kapananlar, sıralama */
    riskView?: Pick<RoleView, 'minRiskScore' | 'showClosedRisks' | 'riskSort'>;
}

const STATUS_TABS: { key: RiskStatusFilter; label: string }[] = [
    { key: 'active', label: 'Aktif' },
    { key: 'monitoring', label: 'İzlenen' },
    { key: 'closed', label: 'Kapanan' },
    { key: 'all', label: 'Tümü' },
];

const ModernRisks: React.FC<ModernRisksProps> = ({ project, people, canEdit, onUpdateRisks, onUpdatePestel, onUpdateSwot, riskView }) => {
    const risks = project.risks || [];
    const pestelItems = project.pestelItems || [];
    const swotItems = project.swotItems || [];
    const [status, setStatus] = useState<RiskStatusFilter>('active');
    const [cell, setCell] = useState<string | null>(null);
    const [sheet, setSheet] = useState<{ risk?: Risk } | null>(null);
    const [toolsOpen, setToolsOpen] = useState(false);
    const [showPestel, setShowPestel] = useState(false);
    const [showSwot, setShowSwot] = useState(false);
    const ai = useAiRun();
    const [aiRisks, setAiRisks] = useState<(RiskSuggestion & { selected: boolean })[] | null>(null);

    const allRows = useMemo(() => reportRisks({ projects: [project], people }), [project, people]);
    const rows = useMemo(() => (riskView ? applyRiskView(allRows, riskView as RoleView) : allRows), [allRows, riskView]);
    const hiddenByView = allRows.length - rows.length;
    const tabs = riskView && !riskView.showClosedRisks ? STATUS_TABS.filter(t => t.key !== 'closed') : STATUS_TABS;
    const kpis = useMemo(() => riskKpis(rows), [rows]);
    const counts = useMemo(() => matrixCounts(rows), [rows]);
    const shown = useMemo(() => filterRisks(rows, { status, cell }), [rows, status, cell]);
    const tabCount = (k: RiskStatusFilter) => filterRisks(rows, { status: k }).length;
    const pestelCount = useMemo(() => summarizePestel(pestelItems).total, [pestelItems]);
    const swotCount = useMemo(() => summarizeSwot(swotItems).total, [swotItems]);

    const saveRisk = (r: Risk) => {
        onUpdateRisks(risks.some(x => x.id === r.id) ? risks.map(x => (x.id === r.id ? r : x)) : [...risks, r]);
        setSheet(null);
    };
    const deleteRisk = (id: string) => { onUpdateRisks(risks.filter(r => r.id !== id)); setSheet(null); };

    const suggest = async () => {
        setToolsOpen(false);
        const list = await ai.run(EMBED_SYSTEM, riskSuggestionPrompt(project, new Date()), t => parseRiskSuggestions(t, risks.map(r => r.title)));
        if (list) setAiRisks(list.map(r => ({ ...r, selected: true })));
    };
    const addAiRisks = () => {
        const chosen = (aiRisks || []).filter(r => r.selected);
        if (chosen.length) onUpdateRisks([...risks, ...chosen.map(r => createRisk({ title: r.title, description: r.description, probability: r.probability, impact: r.impact, mitigation: r.mitigation }))]);
        setAiRisks(null);
    };

    const tools = [
        { key: 'pestel', label: 'PESTEL analizi', count: pestelCount, run: () => { setToolsOpen(false); setShowPestel(true); } },
        { key: 'swot', label: 'SWOT analizi', count: swotCount, run: () => { setToolsOpen(false); setShowSwot(true); } },
        ...(canEdit && ai.available ? [{ key: 'ai', label: ai.loading ? 'AI öneriyor…' : 'AI risk önerisi', count: 0, run: suggest }] : []),
    ];
    const [p, i] = cell ? cell.split('-') : [];

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="m-segmented" role="group" aria-label="Risk durumu">
                    {tabs.map(t => (
                        <button key={t.key} type="button" className="m-segment" aria-pressed={status === t.key} onClick={() => setStatus(t.key)}>
                            {t.label}<span className="m-text-3 m-tabular">{tabCount(t.key)}</span>
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="relative">
                        <button type="button" className="m-btn m-btn-gray" aria-haspopup="menu" aria-expanded={toolsOpen} onClick={() => setToolsOpen(o => !o)}>
                            Analizler
                            <Icon name="chevronDown" size={16} strokeWidth={2.2} />
                        </button>
                        {toolsOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setToolsOpen(false)} aria-hidden="true"></div>
                                <div role="menu" className="absolute right-0 top-full mt-2 w-60 m-surface m-pop rounded-2xl py-1.5 z-50">
                                    {tools.map(t => (
                                        <button key={t.key} type="button" role="menuitem" disabled={t.key === 'ai' && ai.loading} onClick={t.run} className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-3.5 text-[15px] disabled:opacity-50">
                                            <span className="flex-1">{t.label}</span>
                                            {t.count > 0 && <span className="text-[13px] m-text-3 m-tabular">{t.count}</span>}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    {canEdit && (
                        <button type="button" className="m-btn m-btn-primary" onClick={() => setSheet({})}>
                            <Icon name="plus" size={18} strokeWidth={2.2} />
                            Yeni risk
                        </button>
                    )}
                </div>
            </div>

            {hiddenByView > 0 && <ViewFilterNote text={`Yönetici ayarı: ${[riskView!.minRiskScore ? `skoru ${riskView!.minRiskScore} ve üstü riskler` : '', !riskView!.showClosedRisks ? 'kapananlar gizli' : ''].filter(Boolean).join(' · ')} · ${hiddenByView} risk gizli`} />}

            {ai.error && (
                <div role="alert" className="m-surface rounded-2xl px-4 py-3 flex items-center gap-3">
                    <span className="m-ink-bad"><Icon name="alert" size={18} /></span>
                    <span className="flex-1 text-[15px] m-text">{ai.error}</span>
                    <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={() => ai.setError(null)}><Icon name="x" /></button>
                </div>
            )}
            {aiRisks && (
                <Card title="AI risk önerileri" labelledBy="mr-ai" subtitle="Eklemek istediklerinizi seçin; sonra düzenleyebilirsiniz">
                    <div className="flex flex-col gap-2">
                        {aiRisks.map((r, idx) => (
                            <label key={idx} className="flex items-start gap-3 p-3 rounded-xl m-fill-2 cursor-pointer">
                                <input type="checkbox" className="mt-1 w-4 h-4" checked={r.selected} onChange={e => setAiRisks(aiRisks.map((x, j) => (j === idx ? { ...x, selected: e.target.checked } : x)))} />
                                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="text-[15px] font-semibold m-text">{r.title}</span>
                                    {r.description && <span className="text-[14px] m-text-2">{r.description}</span>}
                                    {r.mitigation && <span className="text-[13px] m-text-3">Aksiyon: {r.mitigation}</span>}
                                </span>
                                <RiskScorePill score={r.probability * r.impact} />
                            </label>
                        ))}
                    </div>
                    <div className="flex justify-end gap-2.5">
                        <button type="button" className="m-btn m-btn-plain" onClick={() => setAiRisks(null)}>Vazgeç</button>
                        <button type="button" className="m-btn m-btn-primary" disabled={!aiRisks.some(r => r.selected)} onClick={addAiRisks}>Seçilenleri ekle ({aiRisks.filter(r => r.selected).length})</button>
                    </div>
                </Card>
            )}

            <div className="flex flex-wrap gap-5 items-start">
                <section aria-label="Risk listesi" className="m-surface rounded-2xl p-2 flex-1 min-w-0" style={{ flexBasis: 480 }}>
                    {cell && (
                        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                            <button type="button" className="m-pill is-active" onClick={() => setCell(null)} aria-label="Matris süzgecini kaldır">
                                Olasılık {p} × Etki {i}
                                <Icon name="x" size={14} strokeWidth={2.4} />
                            </button>
                        </div>
                    )}
                    {shown.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
                            <span className="w-11 h-11 rounded-full m-tone-ok flex items-center justify-center"><Icon name="shield" size={22} /></span>
                            <span className="text-[17px] font-semibold m-text">{rows.length === 0 ? 'Henüz risk kaydı yok' : 'Bu süzgeçte risk yok'}</span>
                            {rows.length === 0 && canEdit && <span className="text-[15px] m-text-3">Projeyi etkileyebilecek belirsizlikleri ekleyin; yönetim raporunda görünür.</span>}
                            {rows.length === 0 && canEdit && <button type="button" className="m-btn m-btn-primary mt-1" onClick={() => setSheet({})}><Icon name="plus" size={18} strokeWidth={2.2} />İlk riski ekle</button>}
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {shown.map((r, idx) => {
                                const sep = rowSep(idx);
                                const closed = !isActiveRisk(r);
                                return (
                                    <button key={r.id} type="button" onClick={() => setSheet({ risk: risks.find(x => x.id === r.id) })} className={`m-row-link flex items-center gap-3 px-3 py-2.5 min-h-[60px] rounded-none ${sep.className}`} style={sep.style}>
                                        <RiskScorePill score={r.score} muted={closed} />
                                        <span className={`flex-1 min-w-0 flex flex-col gap-0.5 ${closed ? 'opacity-60' : ''}`}>
                                            <span className="text-[15px] font-semibold m-text truncate">{r.title}</span>
                                            <span className="text-[13px] m-text-3 truncate">
                                                {r.ownerName || <span className="m-ink-warn">Sahibi yok</span>}
                                                {' · '}
                                                {r.mitigation ? 'Aksiyon var' : <span className={r.band === 'high' && !closed ? 'm-ink-bad' : ''}>Aksiyon yok</span>}
                                                {' · '}P{r.probability} × E{r.impact}
                                            </span>
                                        </span>
                                        {r.status !== 'open' && <span className={`hidden sm:inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold ${RISK_STATUS_TONE[r.status]}`}>{RISK_STATUS_LABELS[r.status]}</span>}
                                        <span style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>

                <aside className="flex flex-col gap-5 w-full lg:w-[340px] flex-none">
                    <Card title="Risk matrisi" labelledBy="mr-matrix" subtitle={`${kpis.active} aktif risk${cell ? '' : ' · hücreye tıklayıp süzün'}`}>
                        <RiskMatrix counts={counts} selected={cell} onSelect={key => { setCell(key); if (key) setStatus('active'); }} />
                    </Card>
                    <Card title="Özet" labelledBy="mr-sum">
                        <div className="grid grid-cols-3 gap-2">
                            {(['high', 'medium', 'low'] as const).map(b => (
                                <div key={b} className="rounded-xl m-fill-2 px-3 py-2.5 flex flex-col">
                                    <span className={`text-[22px] font-bold m-tabular ${b === 'high' && kpis.high ? 'm-ink-bad' : 'm-text'}`}>{kpis[b]}</span>
                                    <span className="text-[13px] m-text-3">{RISK_BAND_LABELS[b]}</span>
                                </div>
                            ))}
                        </div>
                        {(kpis.highWithoutAction > 0 || kpis.withoutOwner > 0) && (
                            <ul className="m-0 p-0 list-none flex flex-col gap-1.5 text-[14px]">
                                {kpis.highWithoutAction > 0 && <li className="flex items-center gap-2 m-ink-bad"><Icon name="alert" size={16} />{kpis.highWithoutAction} yüksek riskin aksiyonu yok</li>}
                                {kpis.withoutOwner > 0 && <li className="flex items-center gap-2 m-ink-warn"><Icon name="users" size={16} />{kpis.withoutOwner} riskin sahibi yok</li>}
                            </ul>
                        )}
                        {!canEdit && <p className="m-0 text-[13px] m-text-3">Riskleri yalnızca projenin sahibi PM düzenler.</p>}
                    </Card>
                </aside>
            </div>

            {sheet && (
                <RiskSheet
                    risk={sheet.risk}
                    projectName={project.name}
                    people={people}
                    canEdit={canEdit}
                    onClose={() => setSheet(null)}
                    onSave={saveRisk}
                    onDelete={deleteRisk}
                />
            )}
            {(showPestel || showSwot) && (
                <div className="m-legacy">
                    {showPestel && (
                        <PestelModal
                            projectName={project.name}
                            items={pestelItems}
                            canEdit={canEdit}
                            existingRiskTitles={new Set(risks.map(r => r.title.toLocaleLowerCase('tr-TR')))}
                            onUpdate={onUpdatePestel}
                            onCreateRisk={(item) => onUpdateRisks([...risks, createRisk(riskDraftFromPestel(item))])}
                            onClose={() => setShowPestel(false)}
                            aiProject={project}
                        />
                    )}
                    {showSwot && (
                        <SwotModal
                            projectName={project.name}
                            items={swotItems}
                            canEdit={canEdit}
                            pestelItems={pestelItems}
                            risks={risks}
                            onUpdate={onUpdateSwot}
                            onClose={() => setShowSwot(false)}
                            aiProject={project}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default ModernRisks;
