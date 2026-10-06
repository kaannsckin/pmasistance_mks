import React, { useMemo, useState } from 'react';
import { Allocation, Leave, Person, PlanLock, PlanLockStatus, Project, TitleDef, UserRole } from '../../types';
import { EffortField, MONTHS_TR } from '../../utils/allocations';
import { BilledApplyMode, BilledHoursOptions, BilledHoursRecord } from '../../utils/billedHours';
import { Identity } from '../../utils/rbac';
import { AllocationSuggestion, ApplyMode } from '../../utils/taskToAllocation';
import { buildUtilization, HeatCell, HeatLevel } from '../../utils/utilization';
import AllocationView, { AllocationControlState, AllocationMode, AllocationTab } from '../AllocationView';
import { Icon, IconName } from './icons';
import { uniq } from './taskMeta';

/**
 * Modern "Ekip ve tahsis": varsayılan görünüm kişi × ay doluluk tablosu ve
 * seçili hücrenin ayrıntısı. Düzenleme tablosu, özetler ve araçlar (uygun
 * kişi, kapasite–talep, öngörü, senaryo) mevcut AllocationView'dan gelir;
 * başlık, süzgeçler ve sekmeler burada tek yerde toplanır.
 */

interface ModernAllocationProps {
    allocations: Allocation[];
    people: Person[];
    projects: Project[];
    planLocks: PlanLock[];
    leaves: Leave[];
    titles: TitleDef[];
    currentRole: UserRole;
    identity: Identity;
    onSetCell: (allocationId: string, field: EffortField, month: number, value: number | undefined) => void;
    onAddAllocation: (personId: string, projectId: string, year: number, workPackageId?: string, role?: string) => void;
    onDeleteAllocation: (allocationId: string) => void;
    onLockAction: (projectId: string, year: number, status: PlanLockStatus) => void;
    onApplySuggestions: (projectId: string, year: number, suggestions: AllocationSuggestion[], mode: ApplyMode) => void;
    onApplyBilledHours: (records: BilledHoursRecord[], options: BilledHoursOptions, mode: BilledApplyMode, autoCreate: boolean) => void;
    onViewPerson?: (personId: string) => void;
}

type ViewKey = 'heat' | 'grid' | 'person' | 'department' | 'project';
type ToolKey = 'staffing' | 'roles' | 'forecast' | 'scenario';

const VIEWS: { id: ViewKey; label: string }[] = [
    { id: 'heat', label: 'Doluluk' },
    { id: 'grid', label: 'Tahsis tablosu' },
    { id: 'person', label: 'Kişi özeti' },
    { id: 'department', label: 'Bölüm özeti' },
    { id: 'project', label: 'Proje özeti' },
];

const TOOLS: { id: ToolKey; label: string; hint: string; icon: IconName }[] = [
    { id: 'staffing', label: 'Uygun kişi bul', hint: 'Rol ve ay aralığına göre boş kapasite', icon: 'users' },
    { id: 'roles', label: 'Kapasite–talep', hint: 'Rol bazında açık ve ihtiyaç', icon: 'activity' },
    { id: 'forecast', label: 'Öngörü', hint: 'Yıl sonu yük ve maliyet tahmini', icon: 'timeline' },
    { id: 'scenario', label: 'Senaryo', hint: 'Kaydırma ve ekleme denemeleri', icon: 'swap' },
];

const MODES: { id: AllocationMode; label: string }[] = [
    { id: 'plan', label: 'Plan' },
    { id: 'actual', label: 'Gerçekleşen' },
    { id: 'compare', label: 'Karşılaştır' },
];

const HEAT_STYLE: Record<HeatLevel, { bg: string; ink: string; label: string }> = {
    empty: { bg: 'transparent', ink: 'var(--m-label-3)', label: 'tahsis yok' },
    leave: { bg: 'var(--m-heat-leave-bg)', ink: 'var(--m-heat-leave-ink)', label: 'izinli' },
    low: { bg: 'var(--m-heat-low-bg)', ink: 'var(--m-heat-low-ink)', label: 'düşük' },
    healthy: { bg: 'var(--m-heat-ok-bg)', ink: 'var(--m-heat-ok-ink)', label: 'sağlıklı' },
    full: { bg: 'var(--m-heat-full-bg)', ink: 'var(--m-heat-full-ink)', label: 'dolu' },
    over: { bg: 'var(--m-heat-over-bg)', ink: 'var(--m-heat-over-ink)', label: 'kapasite aşımı' },
};

const LEGEND: { level: HeatLevel; text: string }[] = [
    { level: 'low', text: '%40 altı' },
    { level: 'healthy', text: '%40–85' },
    { level: 'full', text: '%85–100 · dolu' },
    { level: 'over', text: '%100 üstü · aşım' },
    { level: 'leave', text: 'İzin' },
];

const MONTH_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const aa = (v: number): string => (Math.round(v * 100) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const pct = (r: number | null): string => (r === null ? '—' : `%${Math.round(r * 100)}`);
const personName = (p: Person) => `${p.firstName} ${p.lastName}`.trim();
const initials = (p: Person) => `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toLocaleUpperCase('tr-TR');

const cellText = (c: HeatCell): string => (c.level === 'empty' ? '—' : c.level === 'leave' ? 'İzin' : c.ratio === null ? '!' : `%${Math.round(c.ratio * 100)}`);

const ModernAllocation: React.FC<ModernAllocationProps> = (props) => {
    const { allocations, people, projects, leaves, identity, onViewPerson } = props;
    const thisYear = new Date().getFullYear();
    const [ctl, setCtl] = useState<AllocationControlState>({ year: thisYear, mode: 'plan', tab: 'grid', projectFilter: 'all', deptFilter: 'all' });
    const [view, setView] = useState<ViewKey>('heat');
    const [tool, setTool] = useState<ToolKey | null>(null);
    const [toolsOpen, setToolsOpen] = useState(false);
    const [staffPreset, setStaffPreset] = useState<{ key: number; role: string; from: number; to: number; aa: number } | undefined>();
    const [billedRequest, setBilledRequest] = useState(0);
    const [picked, setPicked] = useState<{ personId: string; month: number } | null>(null);

    const change = (patch: Partial<AllocationControlState>) => setCtl(prev => ({ ...prev, ...patch }));
    const canEnter = identity.role === 'py' || identity.role === 'bolum_sorumlu';
    const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
    const departments = useMemo(() => uniq<string>(people.map(p => p.departmentCode).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'tr')), [people]);

    // ---- Doluluk verisi ----
    const field: EffortField = ctl.mode === 'plan' ? 'plan' : 'actual';
    const shownPeople = useMemo(() => {
        const inProject = ctl.projectFilter === 'all' ? null
            : new Set(allocations.filter(a => a.year === ctl.year && a.projectId === ctl.projectFilter).map(a => a.personId));
        return people
            .filter(p => ctl.deptFilter === 'all' || p.departmentCode === ctl.deptFilter)
            .filter(p => !inProject || inProject.has(p.id))
            .sort((a, b) => personName(a).localeCompare(personName(b), 'tr'));
    }, [people, allocations, ctl.year, ctl.projectFilter, ctl.deptFilter]);

    const util = useMemo(() => buildUtilization(allocations, shownPeople, ctl.year, field, leaves), [allocations, shownPeople, ctl.year, field, leaves]);
    const planUtil = useMemo(
        () => (ctl.mode === 'compare' ? buildUtilization(allocations, shownPeople, ctl.year, 'plan', leaves) : null),
        [allocations, shownPeople, ctl.year, ctl.mode, leaves],
    );
    const personById = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
    const projectName = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects]);

    // Seçili hücre yoksa ilk kapasite aşımını göster (içinde bulunulan aydan itibaren)
    const autoPick = useMemo(() => {
        const fromMonth = ctl.year === thisYear ? new Date().getMonth() + 1 : 1;
        for (const r of util.rows) {
            const c = r.cells.find(x => x.level === 'over' && x.month >= fromMonth) || r.cells.find(x => x.level === 'over');
            if (c) return { personId: r.personId, month: c.month };
        }
        return null;
    }, [util.rows, ctl.year, thisYear]);
    const sel = picked && util.rows.some(r => r.personId === picked.personId) ? picked : autoPick;
    const selRow = sel ? util.rows.find(r => r.personId === sel.personId) : undefined;
    const selCell = selRow && sel ? selRow.cells[sel.month - 1] : undefined;
    const selPerson = sel ? personById.get(sel.personId) : undefined;

    const breakdown = useMemo(() => {
        if (!sel) return [];
        return allocations
            .filter(a => a.year === ctl.year && a.personId === sel.personId)
            .map(a => ({ id: a.id, project: projectName.get(a.projectId) || 'Bilinmeyen proje', role: a.role, plan: a.plan[sel.month] || 0, actual: a.actual[sel.month] || 0 }))
            .filter(x => (field === 'plan' ? x.plan : x.actual) > 0 || (ctl.mode === 'compare' && x.plan > 0))
            .sort((a, b) => (field === 'plan' ? b.plan - a.plan : b.actual - a.actual));
    }, [sel, allocations, ctl.year, projectName, field, ctl.mode]);

    const openTool = (t: ToolKey) => { setTool(t); change({ tab: t }); setToolsOpen(false); };
    const closeTool = () => { setTool(null); if (view !== 'heat') change({ tab: view as AllocationTab }); };
    const openView = (v: ViewKey) => { setTool(null); setView(v); if (v !== 'heat') change({ tab: v as AllocationTab }); };

    const editInGrid = () => {
        if (!selPerson) return;
        change({ tab: 'grid', deptFilter: selPerson.departmentCode || 'all', projectFilter: 'all' });
        setTool(null);
        setView('grid');
    };
    const findReplacement = () => {
        if (!sel || !selPerson || !selCell) return;
        const over = Math.max(0, selCell.load - selCell.capacity);
        setStaffPreset({ key: Date.now(), role: selPerson.roles[0] || '', from: sel.month, to: Math.min(12, sel.month + 2), aa: over > 0.01 ? Math.round(over * 100) / 100 : 0.25 });
        openTool('staffing');
    };

    const showHeat = !tool && view === 'heat';
    const toolMeta = tool ? TOOLS.find(t => t.id === tool) : undefined;

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="m-0 text-[15px] m-text-3">Adam/ay planı · {util.rows.length} kişi · {ctl.year}</p>
                    <h1 className="m-0 mt-0.5 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">Ekip ve tahsis</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                    {!tool && (
                        <div className="m-segmented" role="group" aria-label="Veri türü">
                            {MODES.map(m => (
                                <button key={m.id} type="button" className="m-segment" aria-pressed={ctl.mode === m.id} onClick={() => change({ mode: m.id })}>{m.label}</button>
                            ))}
                        </div>
                    )}
                    <div className="relative">
                        <button type="button" className="m-btn m-btn-gray" aria-haspopup="menu" aria-expanded={toolsOpen} onClick={() => setToolsOpen(o => !o)}>
                            Araçlar
                            <Icon name="chevronDown" size={16} strokeWidth={2} />
                        </button>
                        {toolsOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setToolsOpen(false)} aria-hidden="true"></div>
                                <div role="menu" className="absolute right-0 top-full mt-2 w-72 m-surface m-pop rounded-2xl py-1.5 z-50">
                                    {TOOLS.map(t => (
                                        <button key={t.id} type="button" role="menuitem" onClick={() => openTool(t.id)} className="m-row-link w-full flex items-center gap-3 min-h-[52px] px-3.5 text-left">
                                            <span className="m-text-3"><Icon name={t.icon} size={18} /></span>
                                            <span className="flex-1 min-w-0 flex flex-col leading-tight">
                                                <span className="text-[15px] m-text">{t.label}</span>
                                                <span className="text-[13px] m-text-3">{t.hint}</span>
                                            </span>
                                            {tool === t.id && <span className="m-accent"><Icon name="check" size={18} strokeWidth={2.2} /></span>}
                                        </button>
                                    ))}
                                    {canEnter && (
                                        <>
                                            <div className="border-t m-sep my-1"></div>
                                            <button type="button" role="menuitem" onClick={() => { setToolsOpen(false); setTool(null); setView('grid'); change({ tab: 'grid' }); setBilledRequest(n => n + 1); }} className="m-row-link w-full flex items-center gap-3 min-h-[52px] px-3.5 text-left">
                                                <span className="m-text-3"><Icon name="upload" size={18} /></span>
                                                <span className="flex-1 min-w-0 flex flex-col leading-tight">
                                                    <span className="text-[15px] m-text">Jira Billed Hours içe aktar</span>
                                                    <span className="text-[13px] m-text-3">Faturalanan saatleri gerçekleşene yazar</span>
                                                </span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex flex-wrap items-center gap-2">
                {tool && toolMeta ? (
                    <button type="button" className="m-pill is-active" onClick={closeTool} aria-label={`${toolMeta.label} aracını kapat`}>
                        {toolMeta.label}
                        <Icon name="x" size={16} strokeWidth={2.2} />
                    </button>
                ) : (
                    <select aria-label="Görünüm" className="m-pill is-active" value={view} onChange={e => openView(e.target.value as ViewKey)}>
                        {VIEWS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                )}
                <select aria-label="Yıl" className="m-pill" value={ctl.year} onChange={e => change({ year: parseInt(e.target.value, 10) })}>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                {tool !== 'roles' && tool !== 'staffing' && tool !== 'forecast' && (
                    <select aria-label="Proje" className={`m-pill ${ctl.projectFilter !== 'all' ? 'is-active' : ''}`} value={ctl.projectFilter} onChange={e => change({ projectFilter: e.target.value })}>
                        <option value="all">Tüm projeler</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                )}
                <select aria-label="Birim" className={`m-pill ${ctl.deptFilter !== 'all' ? 'is-active' : ''}`} value={ctl.deptFilter} onChange={e => change({ deptFilter: e.target.value })}>
                    <option value="all">Tüm birimler</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
            </div>

            {showHeat ? (
                <>
                    <section aria-label="Özet" className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                        <div className="m-surface rounded-2xl px-5 py-4 flex flex-col gap-1">
                            <span className="text-[15px] m-text-3">Ortalama doluluk</span>
                            <span className="text-[30px] leading-tight font-bold tracking-[-0.02em] m-tabular m-text">{pct(util.avgUtilization)}</span>
                            <span className="text-[14px] m-text-3">{ctl.year} · {field === 'plan' ? 'plan' : 'gerçekleşen'}</span>
                        </div>
                        <div className="m-surface rounded-2xl px-5 py-4 flex flex-col gap-1">
                            <span className="text-[15px] m-text-3">Kapasite aşımı</span>
                            <span className="text-[30px] leading-tight font-bold tracking-[-0.02em] m-tabular m-text">{util.peopleOver}</span>
                            <span className={`text-[14px] ${util.peopleOver ? 'm-ink-bad' : 'm-text-3'}`}>{util.peopleOver ? 'kişi en az bir ayda aşımda' : 'Aşım yok'}</span>
                        </div>
                        <div className="m-surface rounded-2xl px-5 py-4 flex flex-col gap-1">
                            <span className="text-[15px] m-text-3">Atıl</span>
                            <span className="text-[30px] leading-tight font-bold tracking-[-0.02em] m-tabular m-text">{util.peopleIdle}</span>
                            <span className="text-[14px] m-text-3">{util.peopleIdle ? 'kişinin bu yıl tahsisi yok' : 'Herkesin tahsisi var'}</span>
                        </div>
                    </section>

                    <div className="flex flex-wrap items-start gap-5">
                        <section aria-label="Aylık doluluk" className="flex flex-col gap-3 min-w-0" style={{ flex: '999 1 980px' }}>
                            <div className="m-surface rounded-2xl overflow-x-auto">
                                <div style={{ minWidth: 960 }}>
                                    <div aria-hidden="true" className="grid items-center gap-1.5 px-4 pt-3 pb-2 text-[13px] m-text-3" style={{ gridTemplateColumns: 'minmax(200px, 1.6fr) repeat(12, minmax(52px, 1fr)) 72px' }}>
                                        <span>Kişi</span>
                                        {MONTHS_TR.map(m => <span key={m} className="text-center">{m}</span>)}
                                        <span className="text-right">Yıllık</span>
                                    </div>
                                    {util.rows.length === 0 && (
                                        <p className="m-0 px-5 py-10 text-center text-[15px] m-text-3 border-t m-sep">Bu süzgeçte kişi yok. Veri havuzuna personel ekleyin ya da süzgeci değiştirin.</p>
                                    )}
                                    {util.rows.map(r => {
                                        const person = personById.get(r.personId);
                                        const planRow = planUtil?.rows.find(x => x.personId === r.personId);
                                        return (
                                            <div key={r.personId} className="grid items-center gap-1.5 px-4 py-1.5 min-h-[60px] border-t m-sep" style={{ gridTemplateColumns: 'minmax(200px, 1.6fr) repeat(12, minmax(52px, 1fr)) 72px' }}>
                                                <button type="button" onClick={() => person && onViewPerson?.(person.id)} className="flex items-center gap-2.5 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer" style={{ font: 'inherit' }} aria-label={`${r.name}: kişi profili`}>
                                                    <span aria-hidden="true" className="w-8 h-8 rounded-full m-fill flex items-center justify-center text-[12px] font-bold flex-none m-text">{person ? initials(person) : '?'}</span>
                                                    <span className="min-w-0 flex flex-col leading-tight">
                                                        <span className="text-[15px] font-semibold m-text truncate">{r.name}</span>
                                                        <span className="text-[13px] m-text-3 truncate">{[r.departmentCode, person?.roles[0]].filter(Boolean).join(' · ') || '—'}</span>
                                                    </span>
                                                </button>
                                                {r.cells.map(c => {
                                                    const st = HEAT_STYLE[c.level];
                                                    const isSel = !!sel && sel.personId === r.personId && sel.month === c.month;
                                                    const planCell = planRow?.cells[c.month - 1];
                                                    return (
                                                        <button
                                                            key={c.month}
                                                            type="button"
                                                            onClick={() => setPicked({ personId: r.personId, month: c.month })}
                                                            aria-pressed={isSel}
                                                            aria-label={`${r.name}, ${MONTH_LONG[c.month - 1]}: ${c.level === 'empty' ? 'tahsis yok' : `${pct(c.ratio)}, ${st.label}`}${planCell ? `, plan ${pct(planCell.ratio)}` : ''}`}
                                                            className="h-11 rounded-[10px] border-0 flex flex-col items-center justify-center leading-none cursor-pointer m-tabular"
                                                            style={{
                                                                background: st.bg,
                                                                color: st.ink,
                                                                fontWeight: c.level === 'over' ? 700 : 600,
                                                                fontSize: 13,
                                                                boxShadow: isSel ? '0 0 0 2px var(--m-surface), 0 0 0 4px var(--m-label)' : c.level === 'empty' ? 'inset 0 0 0 1px var(--m-sep)' : 'none',
                                                            }}
                                                        >
                                                            {cellText(c)}
                                                            {planCell && <span className="text-[11px] font-medium opacity-80 mt-0.5">plan {planCell.level === 'empty' ? '—' : pct(planCell.ratio)}</span>}
                                                        </button>
                                                    );
                                                })}
                                                <span className={`text-right text-[15px] m-tabular ${r.overCount ? 'm-ink-bad font-semibold' : 'm-text'}`}>{pct(r.avgRatio)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <ul aria-label="Renk açıklaması" className="list-none m-0 p-0 px-1 flex flex-wrap gap-x-5 gap-y-2 text-[14px] m-text-2">
                                {LEGEND.map(l => (
                                    <li key={l.level} className="flex items-center gap-2">
                                        <span aria-hidden="true" className="w-[18px] h-[18px] rounded-[5px]" style={{ background: HEAT_STYLE[l.level].bg, boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}></span>
                                        {l.text}
                                    </li>
                                ))}
                                <li className="flex items-center gap-2 m-text-3">Oran = yük ÷ izin düşülmüş kapasite</li>
                            </ul>
                        </section>

                        <aside aria-label="Seçili hücre ayrıntısı" aria-live="polite" className="m-surface rounded-2xl p-5 flex flex-col gap-4" style={{ flex: '1 1 320px' }}>
                            {!selPerson || !selCell || !sel ? (
                                <div className="flex flex-col gap-2">
                                    <span className="w-10 h-10 rounded-xl m-tone-ok flex items-center justify-center"><Icon name="check" strokeWidth={2.2} /></span>
                                    <p className="m-0 text-[17px] font-semibold m-text">{util.peopleOver ? 'Bir hücre seçin' : 'Kapasite aşımı yok'}</p>
                                    <p className="m-0 text-[15px] m-text-3">Bir kişinin bir ayına tıklayınca yükün hangi projelerden geldiğini ve sonraki ayları burada görürsünüz.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[15px] m-text-3">{personName(selPerson)} · {MONTH_LONG[sel.month - 1]} {ctl.year}</span>
                                        <span className="flex flex-wrap items-baseline gap-x-2.5">
                                            <span className={`text-[32px] font-bold tracking-[-0.02em] m-tabular ${selCell.level === 'over' ? 'm-ink-bad' : 'm-text'}`}>{selCell.level === 'empty' ? '%0' : pct(selCell.ratio)}</span>
                                            {selCell.level === 'over' && (
                                                <span className="text-[15px] font-semibold m-ink-bad">{aa(selCell.load - selCell.capacity)} AA aşım</span>
                                            )}
                                        </span>
                                        <span className="text-[14px] m-text-3">
                                            Yük {aa(selCell.load)} AA · kapasite {aa(selCell.capacity)} AA{selCell.leave > 0 ? ` · ${aa(selCell.leave)} AA izin` : ''}
                                        </span>
                                    </div>
                                    <div className="rounded-xl m-fill-2 overflow-hidden">
                                        {breakdown.length === 0 && <p className="m-0 px-3.5 py-3 text-[15px] m-text-3">Bu ay tahsis yok.</p>}
                                        {breakdown.map((b, i) => (
                                            <div key={b.id} className={`flex items-center gap-3 min-h-[52px] px-3.5 ${i > 0 ? 'border-t m-sep' : ''}`}>
                                                <span className="flex-1 min-w-0 flex flex-col leading-tight">
                                                    <span className="text-[15px] m-text truncate">{b.project}</span>
                                                    {b.role && <span className="text-[13px] m-text-3 truncate">{b.role}</span>}
                                                </span>
                                                <span className="text-[15px] font-semibold m-tabular m-text">{aa(field === 'plan' ? b.plan : b.actual)} AA</span>
                                                {ctl.mode === 'compare' && <span className="text-[13px] m-text-3 m-tabular">plan {aa(b.plan)}</span>}
                                            </div>
                                        ))}
                                    </div>
                                    {selRow && (
                                        <div className="flex flex-col gap-2">
                                            <span className="text-[13px] font-semibold m-text-2">Sonraki aylar · boş kapasite</span>
                                            <div className="flex gap-1.5">
                                                {selRow.cells.slice(sel.month, sel.month + 4).map(c => {
                                                    const free = c.capacity - c.load;
                                                    return (
                                                        <span key={c.month} className={`flex-1 rounded-[10px] px-2 py-1.5 flex flex-col items-center leading-tight ${free < -0.005 ? 'm-tone-bad' : free <= 0.05 ? 'm-tone-warn' : 'm-tone-ok'}`}>
                                                            <span className="text-[12px] font-semibold">{MONTHS_TR[c.month - 1]}</span>
                                                            <span className="text-[14px] font-semibold m-tabular">{aa(free)}</span>
                                                        </span>
                                                    );
                                                })}
                                                {sel.month === 12 && <span className="text-[14px] m-text-3">Yıl sonu</span>}
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-2.5">
                                        <button type="button" className="m-btn m-btn-primary flex-1" style={{ minWidth: 150 }} onClick={editInGrid}>Tahsisi düzenle</button>
                                        <button type="button" className="m-btn m-btn-gray flex-1" style={{ minWidth: 150 }} onClick={findReplacement}>Uygun kişi bul</button>
                                    </div>
                                </>
                            )}
                        </aside>
                    </div>
                </>
            ) : (
                <div className="m-legacy">
                    <AllocationView
                        {...props}
                        control={{ ...ctl, onChange: change, staffPreset, billedRequest }}
                    />
                </div>
            )}
        </div>
    );
};

export default ModernAllocation;
