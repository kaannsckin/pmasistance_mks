import React, { useCallback, useState } from 'react';
import { Leave, Person, Project, ReleasePlan, TaskStatus } from '../../../types';
import { toIsoDay } from '../../../utils/calendarRange';
import { PlanningModel } from '../../../utils/planning/ml/runModel';
import { PlanningHistory } from '../../../utils/planning/history';
import { BASELINE_ITERATIONS, baselineGroups, CommitResult, createReleasePlan, groupOf, includedItems, RELEASE_GROUP, RELEASE_STEPS } from '../../../utils/planning/releasePlan';
import { runSimulationAsync } from '../../../utils/planning/runSimulation';
import { buildSimulation, dateAtOffset } from '../../../utils/planning/simulationInput';
import { workdaysBetween } from '../../../utils/planning/workdays';
import { Icon } from '../icons';
import { rowSep } from '../ui';
import ReleaseWizard from './ReleaseWizard';

/**
 * Sürüm planları: taslaklar (kalınan adımdan sürdürülür) ve aktarılmış
 * planlar (taban çizgisi; güncel simülasyonla karşılaştırılır).
 */

interface Props {
    project: Project;
    history: PlanningHistory;
    people: Person[];
    leaves: Leave[];
    visibleProjectIds: ReadonlySet<string>;
    canEdit: boolean;
    blindEstimate: boolean;
    aiBlocked?: boolean;
    ml?: PlanningModel | null;
    /** Plan kendi projesine yazılır (kayıt, proje değiştirildikten sonra da gelebilir) */
    onSavePlan: (projectId: string, plan: ReleasePlan) => void;
    onDeletePlan: (projectId: string, id: string) => void;
    onCommit: (result: CommitResult) => void;
    onOpenGoals: () => void;
}

const fmtDay = (iso?: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const pct = (v: number) => `%${Math.round(v * 100)}`;

const ReleasePlanner: React.FC<Props> = ({ project, history, people, leaves, visibleProjectIds, canEdit, blindEstimate, aiBlocked, ml, onSavePlan, onDeletePlan, onCommit, onOpenGoals }) => {
    const [openId, setOpenId] = useState<string | null>(null);
    const [justCommitted, setJustCommitted] = useState<string | null>(null);
    const projectId = project.id;
    const savePlan = useCallback((p: ReleasePlan) => onSavePlan(projectId, p), [onSavePlan, projectId]);
    const plans = [...(project.releasePlans || [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const open = plans.find(p => p.id === openId);

    if (open && open.status === 'draft') {
        return (
            <ReleaseWizard
                key={open.id}
                project={project}
                initial={open}
                history={history}
                people={people}
                leaves={leaves}
                visibleProjectIds={visibleProjectIds}
                canEdit={canEdit}
                blindEstimate={blindEstimate}
                aiBlocked={aiBlocked}
                ml={ml}
                onSave={savePlan}
                onCommit={c => { onCommit(c); setJustCommitted(c.plan.id); }}
                onClose={() => setOpenId(null)}
            />
        );
    }
    if (open) return <BaselineView plan={open} project={project} history={history} people={people} leaves={leaves} fresh={justCommitted === open.id} onBack={() => setOpenId(null)} onOpenGoals={onOpenGoals} />;

    const create = () => {
        const p = createReleasePlan(project);
        savePlan(p);
        setOpenId(p.id);
    };

    return (
        <section className="m-surface rounded-2xl p-5 flex flex-col gap-3" aria-labelledby="rp-list">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 id="rp-list" className="m-0 text-[17px] font-semibold m-text">Sürüm planları</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Sürümü tanımlayın, kayıtları girin; geçmiş kayıtlar ve AI önerir, simülasyon olasılıklı takvimi ve kilometre taşlarını verir, plan görevlere aktarılır.</p>
                </div>
                {canEdit && <button type="button" className="m-btn m-btn-primary" onClick={create}><Icon name="plus" size={18} strokeWidth={2.2} />Yeni sürüm planı</button>}
            </div>
            {!plans.length && <p className="m-0 text-[15px] m-text-2">Henüz sürüm planı yok.</p>}
            <div className="flex flex-col">
                {plans.map((p, k) => {
                    const sep = rowSep(k);
                    const committed = p.status === 'committed';
                    return (
                        <div key={p.id} className={`flex flex-wrap items-center gap-3 py-3 ${sep.className}`} style={sep.style}>
                            <span className="flex-1 min-w-[200px] flex flex-col gap-0.5">
                                <span className="text-[15px] font-semibold m-text">{p.name.trim() || 'Adsız sürüm'}</span>
                                <span className="text-[13px] m-text-3">
                                    {committed ? `Aktarıldı ${fmtDay(p.baseline?.at.slice(0, 10))} · P80 ${fmtDay(p.baseline?.p80)}` : `Adım ${p.step}/6 · ${RELEASE_STEPS[p.step - 1]}`}
                                    {' · '}{includedItems(p).length} kayıt{p.targetDate ? ` · hedef ${fmtDay(p.targetDate)}` : ''}
                                </span>
                            </span>
                            <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold ${committed ? 'm-tone-ok' : 'm-tone-hold'}`}>{committed ? 'Aktarıldı' : 'Taslak'}</span>
                            <button type="button" className="m-btn m-btn-gray" onClick={() => setOpenId(p.id)}>{committed ? 'Aç' : canEdit ? 'Devam et' : 'Görüntüle'}</button>
                            {canEdit && !committed && <button type="button" className="m-icon-btn" aria-label={`${p.name || 'Adsız sürüm'} taslağını sil`} onClick={() => { if (window.confirm('Taslak silinsin mi?')) onDeletePlan(projectId, p.id); }}><Icon name="trash" size={16} /></button>}
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

/** Aktarılmış plan: taban çizgisi ve güncel tahmin */
const BaselineView: React.FC<{ plan: ReleasePlan; project: Project; history: PlanningHistory; people: Person[]; leaves: Leave[]; fresh: boolean; onBack: () => void; onOpenGoals: () => void }> = ({ plan, project, history, people, leaves, fresh, onBack, onOpenGoals }) => {
    const b = plan.baseline;
    const [current, setCurrent] = useState<{ state: 'idle' | 'running' } | { state: 'done'; p50?: string; p80?: string; doneAll: boolean } >({ state: 'idle' });
    const tasks = project.tasks.filter(t => b?.taskIds.includes(t.id));
    const done = tasks.filter(t => t.status === TaskStatus.Done).length;

    const forecast = async () => {
        if (!b) return;
        setCurrent({ state: 'running' });
        const built = buildSimulation(project, history, { people, leaves }, { now: new Date(), scope: 'open', testDays: plan.testDays, iterations: BASELINE_ITERATIONS });
        built.input.groups = baselineGroups(built, b);
        if (!built.input.groups[0].tasks.length) { setCurrent({ state: 'done', doneAll: true }); return; }
        const r = await runSimulationAsync(built.input).catch(() => null);
        const g = r ? groupOf(r, RELEASE_GROUP) : undefined;
        const at = (v: number) => toIsoDay(dateAtOffset(built.start, Math.ceil(v) + plan.testDays));
        setCurrent(g ? { state: 'done', p50: at(g.finish.p50), p80: at(g.finish.p80), doneAll: false } : { state: 'idle' });
    };
    const shift = current.state === 'done' && current.p80 && b ? (current.p80 >= b.p80 ? (workdaysBetween(b.p80, current.p80) ?? 1) - 1 : -((workdaysBetween(current.p80, b.p80) ?? 1) - 1)) : null;

    return (
        <section className="m-surface rounded-2xl p-5 flex flex-col gap-3.5" aria-labelledby="rp-base">
            <button type="button" onClick={onBack} className="self-start inline-flex items-center min-h-[40px] -ml-2 pr-2 rounded-xl text-[15px] m-accent bg-transparent border-0 cursor-pointer">
                <Icon name="chevronLeft" size={20} strokeWidth={2.2} />Sürüm planları
            </button>
            {fresh && (
                <p role="status" className="m-0 rounded-xl px-3.5 py-2.5 m-tone-ok text-[15px] font-semibold flex items-center gap-2"><Icon name="check" size={18} strokeWidth={2.4} />Plan aktarıldı: görevler listede, kilometre taşları Hedefler ekranında.</p>
            )}
            <h2 id="rp-base" className="m-0 text-[20px] font-bold m-text">{plan.name || 'Adsız sürüm'}</h2>
            {plan.summary && <p className="m-0 text-[15px] m-text-2 whitespace-pre-line">{plan.summary}</p>}
            {b && (
                <>
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                        {[['Taban P50', fmtDay(b.p50)], ['Taban P80', fmtDay(b.p80)], ['Taban P95', fmtDay(b.p95)], ['Tamamlanan', `${done}/${tasks.length}`]].map(([k, v]) => (
                            <div key={k} className="rounded-xl m-fill-2 p-3.5 flex flex-col gap-0.5">
                                <span className="text-[13px] font-semibold m-text-2">{k}</span>
                                <span className="text-[18px] font-bold m-text m-tabular">{v}</span>
                            </div>
                        ))}
                    </div>
                    <p className="m-0 text-[14px] m-text-3">Aktarım {fmtDay(b.at.slice(0, 10))} · {b.itemCount} kayıt · toplam efor {String(b.effortDays).replace('.', ',')} gün{b.targetProbability !== null ? ` · hedef olasılığı ${pct(b.targetProbability)}` : ''}{plan.targetDate ? ` · hedef ${fmtDay(plan.targetDate)}` : ''}</p>
                    {b.milestones.length > 0 && (
                        <div className="flex flex-col">
                            {b.milestones.map((m, k) => { const sep = rowSep(k); return (
                                <div key={m.id} className={`flex flex-wrap items-center gap-3 py-2 text-[14px] ${sep.className}`} style={sep.style}>
                                    <span className="flex-1 min-w-0 m-text font-semibold">{m.name}</span>
                                    <span className="m-text-2 m-tabular">P50 {fmtDay(m.p50)} · P80 {fmtDay(m.p80)}</span>
                                </div>
                            ); })}
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <button type="button" className="m-btn m-btn-gray" disabled={current.state === 'running'} onClick={forecast}><Icon name="refresh" size={18} />{current.state === 'running' ? 'Hesaplanıyor…' : 'Güncel tahmin'}</button>
                        {b.objectiveId && <button type="button" className="m-btn m-btn-plain" onClick={onOpenGoals}>Hedeflerde gör</button>}
                    </div>
                    {current.state === 'done' && (current.doneAll
                        ? <p className="m-0 text-[15px] m-ink-ok">Sürümün bütün kayıtları kapandı.</p>
                        : <p className="m-0 text-[15px] m-text">Güncel tahmin: P50 <b>{fmtDay(current.p50)}</b>, P80 <b>{fmtDay(current.p80)}</b>{shift !== null ? <> — taban çizgisine göre <b className={shift > 0 ? 'm-ink-bad' : 'm-ink-ok'}>{shift === 0 ? 'değişmedi' : shift > 0 ? `${shift} iş günü geç` : `${-shift} iş günü erken`}</b></> : null}.</p>)}
                </>
            )}
        </section>
    );
};

export default ReleasePlanner;
