import React, { useMemo, useState } from 'react';
import { TaskStatus, WorkspaceData } from '../../../types';
import { MONTH_INDEXES, MONTHS_TR } from '../../../utils/allocations';
import { buildPersonProfile } from '../../../utils/personProfile';
import { RISK_STATUS_LABELS } from '../../../utils/risks';
import { Icon } from '../icons';
import { RiskScorePill } from '../RiskParts';
import { initialsOf } from '../taskMeta';
import { rowSep, Sheet } from '../ui';

/**
 * Kişi profili: yıllık plan / gerçekleşen doluluğu (efektif kapasiteyle),
 * izin girişi, proje dağılımı, roller, görevler ve sahibi olduğu riskler.
 */

const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0' : (Math.round(v * 100) / 100).toString().replace('.', ','));

const STATUS: Record<TaskStatus, { label: string; tone: string }> = {
    [TaskStatus.Backlog]: { label: 'Havuz', tone: 'm-tone-hold' },
    [TaskStatus.ToDo]: { label: 'Yapılacak', tone: 'm-tone-hold' },
    [TaskStatus.InProgress]: { label: 'Süreçte', tone: 'm-tone-accent' },
    [TaskStatus.Done]: { label: 'Tamamlandı', tone: 'm-tone-ok' },
};

const H2: React.FC<{ children: React.ReactNode; count?: number; action?: React.ReactNode }> = ({ children, count, action }) => (
    <div className="flex items-center gap-2">
        <h3 className="m-0 text-[17px] font-semibold m-text">{children}{count !== undefined && <span className="ml-1.5 text-[14px] font-normal m-text-3 m-tabular">{count}</span>}</h3>
        <span className="flex-1"></span>
        {action}
    </div>
);

const LoadChart: React.FC<{ plan: number[]; actual: number[]; capacity: number[]; leave: number[]; over: Set<number>; year: number }> = ({ plan, actual, capacity, leave, over, year }) => {
    const [hover, setHover] = useState<number | null>(null);
    const max = Math.max(...plan, ...actual, ...capacity, 0.1) * 1.1;
    const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
    return (
        <figure className="m-0 flex flex-col gap-2" aria-label={`${year} aylık doluluk grafiği`}>
            <div className="relative flex items-stretch gap-1 h-44 pt-6" onMouseLeave={() => setHover(null)}>
                {MONTHS_TR.map((m, i) => (
                    <button key={m} type="button" aria-label={`${m}: plan ${fmt(plan[i])}, gerçekleşen ${fmt(actual[i])}, kapasite ${fmt(capacity[i])} AA${over.has(i + 1) ? ', kapasite aşıldı' : ''}`}
                        onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                        className="relative flex-1 h-full bg-transparent border-0 p-0 cursor-default rounded-md" style={hover === i ? { background: 'var(--m-fill-2)' } : undefined}>
                        {/* efektif kapasite (izin düşülmüş) */}
                        <span aria-hidden="true" className="absolute left-0.5 right-0.5 border-t-2 border-dashed" style={{ bottom: pct(capacity[i]), borderColor: 'var(--m-label-3)' }}></span>
                        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-[2px] h-full">
                            <span className="w-[38%] max-w-[14px] rounded-t" style={{ height: pct(plan[i]), background: 'var(--m-series-1)' }}></span>
                            <span className="w-[38%] max-w-[14px] rounded-t" style={{ height: pct(actual[i]), background: 'var(--m-series-2)' }}></span>
                        </span>
                    </button>
                ))}
                {hover !== null && (
                    <div role="status" className="absolute top-0 z-10 m-surface m-pop rounded-xl px-3 py-2 text-[13px] pointer-events-none whitespace-nowrap"
                        style={{ left: `${Math.min(Math.max(((hover + 0.5) / 12) * 100, 12), 82)}%`, transform: 'translateX(-50%)' }}>
                        <div className="font-semibold m-text">{MONTHS_TR[hover]} {year}</div>
                        <div className="flex items-center gap-1.5 m-text-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--m-series-1)' }}></span>Plan <b className="m-text m-tabular">{fmt(plan[hover])}</b> AA</div>
                        <div className="flex items-center gap-1.5 m-text-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--m-series-2)' }}></span>Gerçekleşen <b className="m-text m-tabular">{fmt(actual[hover])}</b> AA</div>
                        <div className="m-text-2">Kapasite <b className="m-text m-tabular">{fmt(capacity[hover])}</b> AA{leave[hover] > 0.049 ? ` (izin −${fmt(leave[hover])})` : ''}</div>
                        {over.has(hover + 1) && <div className="m-ink-bad font-semibold flex items-center gap-1"><Icon name="alert" size={13} />Kapasite aşıldı</div>}
                    </div>
                )}
            </div>
            <div className="flex gap-1 border-t m-sep pt-1" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                {MONTHS_TR.map((m, i) => (
                    <span key={m} className={`flex-1 text-center text-[12px] leading-tight ${over.has(i + 1) ? 'm-ink-bad font-semibold' : leave[i] > 0.049 ? 'm-ink-warn' : 'm-text-3'}`}>
                        {m}
                        {over.has(i + 1) && <span className="block" aria-hidden="true">▲</span>}
                    </span>
                ))}
            </div>
            <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] m-text-2">
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'var(--m-series-1)' }}></span>Plan</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'var(--m-series-2)' }}></span>Gerçekleşen</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--m-label-3)' }}></span>Efektif kapasite</span>
                <span className="inline-flex items-center gap-1.5 m-ink-bad">▲ Kapasite aşımı</span>
                {leave.some(v => v > 0.049) && <span className="m-ink-warn">Turuncu ay: izin</span>}
            </figcaption>
        </figure>
    );
};

const PersonProfileSheet: React.FC<{
    workspace: WorkspaceData;
    personId: string;
    canEditLeave: boolean;
    onSetLeave: (personId: string, year: number, month: number, aa: number) => void;
    onOpenProject?: (projectId: string) => void;
    onClose: () => void;
}> = ({ workspace, personId, canEditLeave, onSetLeave, onOpenProject, onClose }) => {
    const [year, setYear] = useState(new Date().getFullYear());
    const [view, setView] = useState<'chart' | 'table'>('chart');
    const [editLeave, setEditLeave] = useState(false);
    const profile = useMemo(() => buildPersonProfile(workspace, personId, year), [workspace, personId, year]);
    if (!profile) return null;
    const { person, capacity, monthlyCapacity, monthlyLeave, annualLeave, monthlyPlan, monthlyActual, overMonths, byProject, tasks, risks } = profile;
    const title = workspace.titles.find(t => t.code === person.titleCode);
    const dept = workspace.departments.find(d => d.code === person.departmentCode);
    const over = new Set(overMonths);
    const openTasks = tasks.filter(t => t.status !== TaskStatus.Done);
    const overdue = tasks.filter(t => t.overdue).length;
    const name = `${person.firstName} ${person.lastName}`.trim();
    const open = (projectId: string) => { if (onOpenProject) { onClose(); onOpenProject(projectId); } };

    const stats = [
        { label: 'Aylık kapasite', value: `${fmt(capacity)} AA` },
        { label: `${year} plan`, value: `${fmt(profile.totalPlanAA)} AA` },
        { label: 'Gerçekleşen', value: `${fmt(profile.totalActualAA)} AA` },
        { label: 'Aşırı yük', value: overMonths.length ? `${overMonths.length} ay` : 'Yok', tone: overMonths.length ? 'm-ink-bad' : 'm-ink-ok' },
    ];

    return (
        <Sheet
            xl
            title={name}
            subtitle={[dept ? `${dept.code} — ${dept.name}` : person.departmentCode || 'Bölüm yok', title ? title.name : '', person.sicil ? `Sicil ${person.sicil}` : '', person.email || ''].filter(Boolean).join(' · ')}
            onClose={onClose}
            headerAction={
                <div className="flex items-center">
                    <button type="button" className="m-icon-btn" aria-label="Önceki yıl" onClick={() => setYear(y => y - 1)}><Icon name="chevronLeft" size={18} /></button>
                    <span className="text-[15px] font-semibold m-text m-tabular w-12 text-center">{year}</span>
                    <button type="button" className="m-icon-btn" aria-label="Sonraki yıl" onClick={() => setYear(y => y + 1)}><Icon name="chevronRight" size={18} /></button>
                </div>
            }
        >
            <div className="flex items-center gap-3">
                <span aria-hidden="true" className="w-12 h-12 rounded-full m-accent-bg flex items-center justify-center text-[16px] font-semibold flex-none">{initialsOf(name)}</span>
                <div className="flex flex-wrap gap-1.5">
                    {person.roles.length ? person.roles.map(r => <span key={r} className="inline-flex items-center h-7 px-3 rounded-full m-fill-2 text-[13px] m-text-2">{r}</span>) : <span className="text-[14px] m-text-3">Rol tanımlanmamış</span>}
                </div>
            </div>

            <section aria-label="Özet" className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {stats.map(s => (
                    <div key={s.label} className="m-surface rounded-2xl px-4 py-3 flex flex-col gap-0.5">
                        <span className="text-[13px] m-text-2">{s.label}</span>
                        <span className={`text-[22px] font-bold leading-tight m-tabular ${s.tone || 'm-text'}`}>{s.value}</span>
                    </div>
                ))}
            </section>

            <section aria-label="Aylık doluluk" className="m-surface rounded-2xl p-4 flex flex-col gap-3">
                <H2 action={
                    <div className="m-segmented" role="group" aria-label="Görünüm">
                        <button type="button" className="m-segment !min-h-[34px] !px-3" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Grafik</button>
                        <button type="button" className="m-segment !min-h-[34px] !px-3" aria-pressed={view === 'table'} onClick={() => setView('table')}>Tablo</button>
                    </div>
                }>Aylık doluluk (tüm projeler)</H2>
                {view === 'chart' ? (
                    <LoadChart plan={monthlyPlan} actual={monthlyActual} capacity={monthlyCapacity} leave={monthlyLeave} over={over} year={year} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-[13px] m-tabular">
                            <thead><tr><th scope="col" className="text-left font-semibold m-text-3 py-1"></th>{MONTHS_TR.map(m => <th key={m} scope="col" className="text-center font-semibold m-text-3 py-1">{m}</th>)}</tr></thead>
                            <tbody>
                                {[['Plan', monthlyPlan], ['Gerçekleşen', monthlyActual], ['Kapasite', monthlyCapacity], ['İzin', monthlyLeave]].map(([l, arr]) => (
                                    <tr key={l as string}>
                                        <th scope="row" className="text-left font-semibold m-text-2 py-1 pr-2">{l as string}</th>
                                        {(arr as number[]).map((v, i) => <td key={i} className={`text-center py-1 ${l === 'Plan' && over.has(i + 1) ? 'm-ink-bad font-semibold' : 'm-text'}`}>{v > 0.004 ? fmt(v) : '—'}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section aria-label="İzin" className="m-surface rounded-2xl p-4 flex flex-col gap-3">
                <H2 action={canEditLeave ? <button type="button" className="m-btn m-btn-plain !min-h-[34px] !px-2.5 text-[14px]" onClick={() => setEditLeave(v => !v)}><Icon name={editLeave ? 'check' : 'pencil'} size={15} />{editLeave ? 'Bitti' : 'İzin gir'}</button> : undefined}>
                    Uygunluk ve izin{annualLeave > 0 && <span className="ml-1.5 text-[14px] font-normal m-ink-warn">{fmt(annualLeave)} AA izin</span>}
                </H2>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                    {MONTH_INDEXES.map((mo, i) => {
                        const lv = monthlyLeave[i];
                        return (
                            <div key={mo} className={`rounded-xl px-1 py-1.5 text-center flex flex-col gap-0.5 ${lv > 0.049 ? 'm-tone-warn' : 'm-fill-2'}`}>
                                <span className="text-[12px] font-semibold m-text-3">{MONTHS_TR[i]}</span>
                                {editLeave && canEditLeave ? (
                                    <input type="number" min={0} max={1} step={0.25} aria-label={`${MONTHS_TR[i]} izin AA`} value={lv || ''} placeholder="0"
                                        className="w-full text-center text-[13px] rounded-md border m-sep m-surface m-text px-0.5 py-0.5" style={{ borderStyle: 'solid', borderWidth: 1 }}
                                        onChange={e => onSetLeave(person.id, year, mo, Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))} />
                                ) : <span className="text-[13px] font-semibold m-tabular">{lv > 0.049 ? `−${fmt(lv)}` : '—'}</span>}
                                <span className="text-[11.5px] m-text-3 m-tabular" title="Efektif kapasite">{fmt(monthlyCapacity[i])}</span>
                            </div>
                        );
                    })}
                </div>
                {editLeave && <p className="m-0 text-[13px] m-text-3">İzin AA: 1 = tam ay, 0,5 = yarım ay. Efektif kapasite ve aşırı yük hemen güncellenir.</p>}
            </section>

            <section aria-label="Proje dağılımı" className="m-surface rounded-2xl p-4 flex flex-col gap-2.5">
                <H2 count={byProject.length}>Proje dağılımı ({year} plan)</H2>
                {byProject.length === 0 ? <p className="m-0 text-[14px] m-text-3">Bu yıl tahsis yok.</p> : byProject.map(r => (
                    <div key={r.projectId} className="flex items-center gap-3">
                        <button type="button" disabled={!onOpenProject} onClick={() => open(r.projectId)} className="w-48 flex-none text-left bg-transparent border-0 p-0 text-[14px] m-text truncate cursor-pointer disabled:cursor-default hover:underline" title={r.projectName}>
                            {r.projectName}{r.role ? <span className="m-text-3"> · {r.role}</span> : ''}
                        </button>
                        <span className="flex-1 h-2 rounded-full m-fill overflow-hidden" aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${(r.total / (byProject[0].total || 1)) * 100}%`, background: 'var(--m-series-1)' }}></span></span>
                        <span className="w-16 text-right text-[14px] font-semibold m-text m-tabular">{fmt(r.total)} AA</span>
                    </div>
                ))}
            </section>

            <div className="grid gap-4 lg:grid-cols-2 items-start">
                <section aria-label="Görevler" className="m-surface rounded-2xl p-4 flex flex-col gap-1">
                    <H2 count={openTasks.length}>Açık görevler{overdue > 0 && <span className="ml-1.5 text-[14px] font-normal m-ink-bad">{overdue} gecikmiş</span>}</H2>
                    {openTasks.length === 0 ? <p className="m-0 text-[14px] m-text-3">Açık görev yok (görevler sorumlu adıyla eşleşir).</p> : (
                        <div className="-mx-2 flex flex-col max-h-72 overflow-y-auto">
                            {openTasks.map((t, i) => {
                                const sep = rowSep(i);
                                return (
                                    <button key={`${t.projectId}-${t.taskId}`} type="button" disabled={!onOpenProject} onClick={() => open(t.projectId)} className={`m-row-link flex items-center gap-2 px-2 py-2 min-h-[48px] disabled:cursor-default ${sep.className}`} style={sep.style}>
                                        <span className="flex-1 min-w-0 flex flex-col">
                                            <span className="text-[14px] m-text truncate">{t.taskName}</span>
                                            <span className="text-[12.5px] m-text-3 truncate">{[t.projectName, t.dueDate ? new Date(t.dueDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : ''].filter(Boolean).join(' · ')}</span>
                                        </span>
                                        {t.overdue ? <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold m-tone-bad">Gecikmiş</span>
                                            : <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold ${STATUS[t.status].tone}`}>{STATUS[t.status].label}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>
                <section aria-label="Riskler" className="m-surface rounded-2xl p-4 flex flex-col gap-1">
                    <H2 count={risks.length}>Sahibi olduğu riskler</H2>
                    {risks.length === 0 ? <p className="m-0 text-[14px] m-text-3">Bu kişiye atanmış risk yok.</p> : (
                        <div className="-mx-2 flex flex-col max-h-72 overflow-y-auto">
                            {risks.map((r, i) => {
                                const sep = rowSep(i);
                                return (
                                    <button key={`${r.projectId}-${r.riskId}`} type="button" disabled={!onOpenProject} onClick={() => open(r.projectId)} className={`m-row-link flex items-center gap-2 px-2 py-2 min-h-[48px] disabled:cursor-default ${sep.className} ${r.status === 'closed' ? 'opacity-60' : ''}`} style={sep.style}>
                                        <RiskScorePill score={r.score} muted={r.status === 'closed'} />
                                        <span className="flex-1 min-w-0 flex flex-col">
                                            <span className="text-[14px] m-text truncate">{r.title}</span>
                                            <span className="text-[12.5px] m-text-3 truncate">{r.projectName} · {RISK_STATUS_LABELS[r.status]}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </Sheet>
    );
};

export default PersonProfileSheet;
