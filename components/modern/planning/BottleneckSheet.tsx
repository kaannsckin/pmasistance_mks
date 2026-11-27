import React, { useMemo, useState } from 'react';
import { Leave, Person, Project, Task } from '../../../types';
import {
    applyPlanToSprints, applyReassignments, BottleneckScenario, BottleneckSettings, cellKey, DEFAULT_BOTTLENECK, DEFAULT_TEST_UNIT,
    defaultStartDate, defaultTargetDate, LoadKind, milestoneRank, PersonRow, planBottleneck, Reassignment,
} from '../../../utils/planning/bottleneck';
import { buildSprintWindows } from '../../../utils/taskToAllocation';
import { sprintCalendar } from '../../../utils/sprintCalendar';
import { Icon } from '../icons';
import { Field, SelectionStrip, Sheet } from '../ui';
import TaskKeyButton from '../TaskKeyButton';

/**
 * Darboğaz ve dengeleme: haftalık sürüm ritminde kişi × hafta doluluk ısı
 * haritası. Üç senaryo: mevcut atama, ekip içi dengeleme (öneriler) ve hedefe
 * yetişecek kapasite (ekiplere gereken ek kişi). Hesap utils/planning/bottleneck.ts.
 */

interface BottleneckSheetProps {
    project: Project;
    people: Person[];
    leaves: Leave[];
    canEdit: boolean;
    onClose: () => void;
    onViewTask: (task: Task) => void;
    /** Değişen görev listesinin tamamı ve kısa özet */
    onApply: (tasks: Task[], summary: string) => void;
}

type Stored = Pick<BottleneckSettings, 'targetDate' | 'testUnit' | 'testRatio' | 'focus' | 'fixers' | 'scopeMilestone'>;

const SCENARIOS: { id: BottleneckScenario; label: string; hint: string }[] = [
    { id: 'current', label: 'Mevcut atama', hint: 'Görevler atandığı kişide; kimin hangi hafta tıkandığı görünür.' },
    { id: 'balanced', label: 'Ekip içi dengeleme', hint: 'Başlamamış işler aynı ekipte en erken bitirebilecek kişiye kaydırılır; tek kişiye sığmayan iş bölünür.' },
    { id: 'capacity', label: 'Hedefe yetişecek kapasite', hint: 'Dengeli plana hedefe yetişene dek ek kişi eklenir; ekiplerin ihtiyacı görünür.' },
];
const KIND_LABEL: Record<LoadKind, string> = { dev: 'geliştirme', test: 'test', fix: 'bulgu' };
const ROLE_LABEL = { dev: '', test: 'Test', fixer: 'Bulgu sorumlusu' } as const;
const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const pct = (v: number) => `%${Math.round(v * 100)}`;
const dm = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const toneOf = (ratio: number | null) => ratio === null || ratio < 0.05 ? 'm-fill-2 m-text-3' : ratio >= 0.95 ? 'm-tone-bad' : ratio >= 0.75 ? 'm-tone-warn' : 'm-tone-ok';
const storageKey = (projectId: string) => `planasistan.bottleneck.${projectId}`;

const readStored = (projectId: string): Partial<Stored> => {
    try {
        const raw = localStorage.getItem(storageKey(projectId));
        const v: unknown = raw ? JSON.parse(raw) : {};
        return v && typeof v === 'object' ? v as Partial<Stored> : {};
    } catch { return {}; }
};
const writeStored = (projectId: string, v: Stored) => {
    try { localStorage.setItem(storageKey(projectId), JSON.stringify(v)); } catch { /* özel pencere: ayar yalnız bu oturumda */ }
};

const BottleneckSheet: React.FC<BottleneckSheetProps> = ({ project, people, leaves, canEdit, onClose, onViewTask, onApply }) => {
    const units = useMemo(() => Array.from(new Set<string>(project.resources.map(r => r.unit || 'Genel'))).sort((a, b) => a.localeCompare(b, 'tr')), [project.resources]);
    const [stored] = useState(() => readStored(project.id));
    const [startDate, setStartDate] = useState(() => defaultStartDate());
    const [targetDate, setTargetDate] = useState(stored.targetDate || defaultTargetDate());
    const [testUnit, setTestUnit] = useState(stored.testUnit ?? (units.includes(DEFAULT_TEST_UNIT) ? DEFAULT_TEST_UNIT : ''));
    const [testRatio, setTestRatio] = useState(stored.testRatio ?? DEFAULT_BOTTLENECK.testRatio);
    const [focus, setFocus] = useState(stored.focus ?? DEFAULT_BOTTLENECK.focus);
    const [fixers, setFixers] = useState<Record<string, string>>(stored.fixers || {});
    const [scopeMilestone, setScope] = useState<number | undefined>(stored.scopeMilestone);
    const [scenario, setScenario] = useState<BottleneckScenario>('current');
    const [cell, setCell] = useState<{ week: number; person: string } | null>(null);
    const [picked, setPicked] = useState<Set<string>>(new Set());

    const settings: BottleneckSettings = useMemo(() => ({
        ...DEFAULT_BOTTLENECK, startDate, targetDate, testUnit, testRatio, focus, fixers, scopeMilestone,
        useRemaining: !!project.settings.useJiraRemainingEstimate,
    }), [startDate, targetDate, testUnit, testRatio, focus, fixers, scopeMilestone, project.settings.useJiraRemainingEstimate]);
    const valid = !!startDate && !!targetDate && targetDate >= startDate;
    const result = useMemo(() => valid ? planBottleneck({ project, people, leaves, settings, scenario }) : null, [valid, project, people, leaves, settings, scenario]);
    const save = (patch: Partial<Stored>) => writeStored(project.id, { targetDate, testUnit, testRatio, focus, fixers, scopeMilestone, ...patch });

    const taskById = useMemo(() => new Map(project.tasks.map(t => [t.id, t])), [project.tasks]);
    const milestones = useMemo(() => Array.from(new Set<number>(project.tasks.map(t => milestoneRank(t.labels)).filter(r => r < 99))).sort((a, b) => a - b), [project.tasks]);
    const fixerUnits = result ? Object.keys(result.fixers) : [];

    if (!result) {
        return (
            <Sheet title="Darboğaz ve dengeleme" onClose={onClose} xxl>
                <p className="m-0 text-[15px] m-ink-warn">Başlangıç ve hedef tarihini girin; hedef başlangıçtan önce olamaz.</p>
            </Sheet>
        );
    }

    const { weeks, targetWeek, lastReleaseWeek } = result;
    const lastLoaded = Math.max(targetWeek, ...result.people.map(p => p.lastWeek));
    const shown = weeks.slice(0, Math.min(weeks.length, Math.max(targetWeek + 3, Math.min(lastLoaded + 1, targetWeek + 12))));
    const total = result.tasks.length;
    const fits = result.tasks.filter(t => t.fits).length;
    const late = result.tasks.filter(t => !t.fits);
    const singles = result.reassignments.filter(r => r.to.length === 1 && r.from);
    const splits = result.reassignments.filter(r => r.to.length > 1);
    const assignNew = result.reassignments.filter(r => r.to.length === 1 && !r.from);
    const ratio = (p: { capacity: number[] }, w: number, used: number) => (p.capacity[w] > 0 ? used / p.capacity[w] : null);
    const usedOf = (p: PersonRow, w: number) => p.load.dev[w] + p.load.test[w] + p.load.fix[w];
    const cellTasks = cell ? result.cells.get(cellKey(cell.week, cell.person)) || [] : [];

    const sprintOf = (() => {
        let windows: ReturnType<typeof buildSprintWindows> | null = null;
        return (d: Date) => {
            windows ??= buildSprintWindows(project, 200);
            const hit = windows.find(w => d <= w.end) || windows[windows.length - 1];
            return hit.sprint;
        };
    })();
    const weekly = sprintCalendar(project.settings).weeks === 1;

    const applyPicked = () => {
        const list = singles.concat(assignNew).filter(r => picked.has(r.taskId));
        const tasks = applyReassignments(project.tasks, list, project.resources.map(r => ({ name: r.name, unit: r.unit })));
        onApply(tasks, `${list.length} görevin sorumlusu dengeleme önerisine göre değişti.`);
        setPicked(new Set());
    };
    const writeSprints = () => {
        const { tasks, changed } = applyPlanToSprints(project.tasks, result, sprintOf);
        if (!changed) { onApply(project.tasks, 'Sprintler zaten bu planla aynı.'); return; }
        if (!window.confirm(`${changed} görevin sprinti bu plana göre değişecek. Devam edilsin mi?`)) return;
        onApply(tasks, `${changed} görevin sprinti darboğaz planına göre güncellendi.`);
    };

    const teamCells = (unit: string) => {
        const t = result.teams.find(x => x.unit === unit)!;
        return shown.map(w => {
            const r = t.capacity[w.index] > 0 ? t.load[w.index] / t.capacity[w.index] : null;
            return <td key={w.index} className={`px-1 py-1.5 text-center text-[12px] font-semibold m-tabular ${toneOf(r)}`}>{r === null ? '–' : pct(r)}</td>;
        });
    };

    return (
        <Sheet
            title="Darboğaz ve dengeleme"
            subtitle={`${dm(weeks[0].start)} – ${dm(new Date(`${targetDate}T00:00:00`))} · her cuma sürüm · son sürüm ${dm(weeks[lastReleaseWeek].end)} · son hafta test ve bulgu`}
            onClose={onClose}
            xxl
            footer={<>
                <span className="flex-1 text-[13px] m-text-3">
                    {!canEdit ? 'Görüntüleme: plan ve öneriler yalnız proje düzenleme yetkisiyle uygulanır.'
                        : scenario === 'current'
                        ? weekly ? 'Plan, görevlerin sprintlerine yazılabilir.' : 'Sprint takvimi haftalık değil; plan en yakın sprintlere yazılır. Haftalık sürüm için Takvim → Sürekli geliştirme.'
                        : 'Önerileri uygulayın; "Mevcut atama" senaryosu yeni atamayla yeniden hesaplanır.'}
                </span>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Kapat</button>
                {canEdit && scenario !== 'current' && (
                    <button type="button" className="m-btn m-btn-gray" disabled={!picked.size} onClick={applyPicked}><Icon name="users" size={18} />{picked.size} öneriyi uygula</button>
                )}
                {canEdit && scenario === 'current' && (
                    <button type="button" className="m-btn m-btn-primary" disabled={!total} onClick={writeSprints}><Icon name="calendar" size={18} />Planı sprintlere yaz</button>
                )}
            </>}
        >
            <details className="m-fill-2 rounded-xl px-4 py-3">
                <summary className="cursor-pointer text-[15px] font-semibold m-text">Plan ayarları</summary>
                <div className="grid gap-3 pt-3 sm:grid-cols-3">
                    <Field label="Başlangıç" htmlFor="bn-start" hint="Bu günden önceki günler sayılmaz.">
                        <input id="bn-start" type="date" className="m-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </Field>
                    <Field label="Hedef bitiş" htmlFor="bn-target" hint="Hedefin düştüğü hafta son sürümün testi ve düzeltmesidir.">
                        <input id="bn-target" type="date" className="m-input" value={targetDate} onChange={e => { setTargetDate(e.target.value); save({ targetDate: e.target.value }); }} />
                    </Field>
                    <Field label="Test ekibi" htmlFor="bn-test-unit" hint="Sürümden sonraki hafta testi bu birim yapar.">
                        <select id="bn-test-unit" className="m-input" value={testUnit} onChange={e => { setTestUnit(e.target.value); save({ testUnit: e.target.value }); }}>
                            <option value="">Test adımı yok</option>
                            {units.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </Field>
                    <Field label="Test ve bulgu eforu (%)" htmlFor="bn-ratio" hint="Geliştirme eforunun oranı; 2 / 4 / 6 saate yuvarlanır.">
                        <input id="bn-ratio" type="number" min={0} max={100} className="m-input m-tabular" value={Math.round(testRatio * 100)}
                            onChange={e => { const v = Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100; setTestRatio(v); save({ testRatio: v }); }} />
                    </Field>
                    <Field label="Odak (%)" htmlFor="bn-focus" hint="Toplantı ve kesintiler sonrası kullanılabilir oran.">
                        <input id="bn-focus" type="number" min={30} max={100} className="m-input m-tabular" value={Math.round(focus * 100)}
                            onChange={e => { const v = Math.max(30, Math.min(100, Number(e.target.value) || 85)) / 100; setFocus(v); save({ focus: v }); }} />
                    </Field>
                    {milestones.length > 0 && (
                        <Field label="Hedefe yetişmesi gereken kapsam" htmlFor="bn-scope" hint="Kapasite senaryosu yalnız bu kapsam için ek kişi hesaplar.">
                            <select id="bn-scope" className="m-input" value={scopeMilestone ?? ''} onChange={e => { const v = e.target.value === '' ? undefined : Number(e.target.value); setScope(v); save({ scopeMilestone: v }); }}>
                                <option value="">Tüm görevler</option>
                                {milestones.map(m => <option key={m} value={m}>Milestone {m}{m > milestones[0] ? ` ve öncesi` : ''}</option>)}
                            </select>
                        </Field>
                    )}
                    {fixerUnits.map(u => {
                        const pool = project.resources.filter(r => (r.unit || 'Genel') === u).map(r => r.name);
                        return (
                            <Field key={u} label={`${u} bulgu sorumlusu`} htmlFor={`bn-fixer-${u}`} hint="Test bulgularını bu kişi düzeltir.">
                                <select id={`bn-fixer-${u}`} className="m-input" value={fixers[u] || ''} onChange={e => { const next = { ...fixers, [u]: e.target.value }; setFixers(next); save({ fixers: next }); }}>
                                    <option value="">Otomatik ({result.fixers[u]})</option>
                                    {pool.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </Field>
                        );
                    })}
                </div>
            </details>

            <div className="flex flex-col gap-1.5">
                <SelectionStrip className="m-segmented self-start" role="group" label="Senaryo" selection={scenario}>
                    {SCENARIOS.map(s => <button key={s.id} type="button" className="m-segment" aria-pressed={scenario === s.id} onClick={() => { setScenario(s.id); setCell(null); setPicked(new Set()); }}>{s.label}</button>)}
                </SelectionStrip>
                <span className="text-[13px] m-text-3">{SCENARIOS.find(s => s.id === scenario)!.hint}</span>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
                <div className={`rounded-xl px-4 py-3 ${fits === total ? 'm-tone-ok' : 'm-tone-warn'}`}>
                    <div className="text-[13px] font-semibold">Hedefe yetişen</div>
                    <div className="text-[22px] font-bold m-tabular">{fits} / {total} görev</div>
                </div>
                <div className={`rounded-xl px-4 py-3 ${result.unestimated.length ? 'm-tone-warn' : 'm-fill-2'}`}>
                    <div className="text-[13px] font-semibold">Efor girilmemiş</div>
                    <div className="text-[22px] font-bold m-tabular">{result.unestimated.length} görev</div>
                    {result.unestimated.length > 0 && <div className="text-[12px]">Yük olarak sayılmadı; gerçek darboğaz daha büyük olabilir.</div>}
                </div>
                <div className="rounded-xl px-4 py-3 m-fill-2">
                    <div className="text-[13px] font-semibold m-text-2">{scenario === 'capacity' ? 'Gereken ek kapasite' : 'Hedef sonrasına taşan'}</div>
                    {scenario === 'capacity'
                        ? (result.extra.length
                            ? <ul className="m-0 p-0 list-none text-[15px] m-text">{result.extra.map(e => <li key={`${e.unit}-${e.role}`}><strong>{e.unit}</strong> +{e.count} {e.role === 'fixer' ? 'bulgu sorumlusu' : e.role === 'test' ? 'test' : 'geliştirici'}</li>)}</ul>
                            : <div className="text-[15px] m-ink-ok font-semibold">Ek kişi gerekmiyor</div>)
                        : <ul className="m-0 p-0 list-none text-[15px] m-text">{result.teams.filter(t => t.spill > 0.05).map(t => <li key={t.unit}><strong>{t.unit}</strong> {num(t.spill)} gün</li>)}{!result.teams.some(t => t.spill > 0.05) && <li className="m-ink-ok font-semibold">Taşma yok</li>}</ul>}
                </div>
            </div>

            <section aria-label="Kişi ve ekip doluluğu" className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3 text-[12px] m-text-3">
                    <span className="text-[15px] font-semibold m-text">Haftalık doluluk</span>
                    <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded m-tone-ok"></span>%75 altı</span>
                    <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded m-tone-warn"></span>%75–95</span>
                    <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded m-tone-bad"></span>%95 ve üstü</span>
                    <span>Hücreye dokunun: o haftanın görevleri.</span>
                </div>
                <div className="overflow-x-auto rounded-xl m-surface">
                    <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
                        <thead>
                            <tr>
                                <th scope="col" className="sticky left-0 z-10 m-surface text-left text-[12px] font-semibold m-text-2 px-2 py-1.5 min-w-[150px] sm:min-w-[210px]">Kişi · iş / kapasite</th>
                                {shown.map(w => (
                                    <th key={w.index} scope="col" className={`text-center text-[11px] font-semibold px-1 py-1.5 whitespace-nowrap ${w.afterTarget ? 'm-text-3' : 'm-text-2'}`}
                                        style={w.index === targetWeek ? { boxShadow: 'inset 0 -2px 0 var(--m-accent)' } : undefined}>
                                        H{w.index + 1}<br />{dm(w.start)}{w.index === lastReleaseWeek ? <><br /><span className="m-accent">son sürüm</span></> : w.index === targetWeek ? <><br /><span className="m-accent">hedef</span></> : null}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {result.teams.map(t => (
                                <React.Fragment key={t.unit}>
                                    <tr>
                                        <th scope="row" className="sticky left-0 z-10 m-surface text-left px-2 pt-3 pb-1">
                                            <span className="block text-[13px] font-bold m-text">{t.unit} · {t.members.length} kişi</span>
                                            <span className={`block text-[12px] font-semibold m-tabular ${t.demand > t.targetCapacity ? 'm-ink-bad' : 'm-text-2'}`}>{num(t.demand)} / {num(t.targetCapacity)} g</span>
                                        </th>
                                        {teamCells(t.unit)}
                                    </tr>
                                    {result.people.filter(p => p.unit === t.unit).sort((a, b) => Number(a.virtual) - Number(b.virtual) || b.demand - a.demand).map(p => {
                                        const r = p.targetCapacity > 0 ? p.demand / p.targetCapacity : 0;
                                        return (
                                            <tr key={p.name}>
                                                <th scope="row" className="sticky left-0 z-10 m-surface text-left font-normal px-2 py-1">
                                                    <span className={`block text-[13px] m-text truncate max-w-[150px] sm:max-w-[260px] ${p.virtual ? 'italic' : ''}`} title={p.name}>{p.name}</span>
                                                    <span className={`block text-[11px] m-tabular whitespace-nowrap ${r > 1 ? 'm-ink-bad font-semibold' : 'm-text-3'}`}>
                                                        {(ROLE_LABEL[p.role] || p.virtual) ? `${p.virtual ? 'eklenen' : ROLE_LABEL[p.role]} · ` : ''}{num(p.demand)} / {num(p.targetCapacity)} g{p.spill > 0.05 ? ` · ${num(p.spill)} taşar` : ''}
                                                    </span>
                                                </th>
                                                {shown.map(w => {
                                                    const used = usedOf(p, w.index);
                                                    const rr = ratio(p, w.index, used);
                                                    const on = cell?.week === w.index && cell.person === p.name;
                                                    return (
                                                        <td key={w.index} className="p-0">
                                                            <button type="button" disabled={used < 0.01}
                                                                onClick={() => setCell(on ? null : { week: w.index, person: p.name })}
                                                                aria-pressed={on}
                                                                aria-label={`${p.name}, H${w.index + 1}: ${num(used)} / ${num(p.capacity[w.index])} gün`}
                                                                title={`${num(used)} / ${num(p.capacity[w.index])} gün · geliştirme ${num(p.load.dev[w.index])}, test ${num(p.load.test[w.index])}, bulgu ${num(p.load.fix[w.index])}`}
                                                                className={`w-full min-w-[46px] min-h-[32px] rounded-md border-0 text-[12px] font-semibold m-tabular ${toneOf(rr)} ${used >= 0.01 ? 'cursor-pointer' : ''}`}
                                                                style={on ? { boxShadow: 'inset 0 0 0 2px var(--m-accent)' } : w.afterTarget && used >= 0.01 ? { opacity: 0.8 } : undefined}>
                                                                {rr === null ? '–' : used < 0.01 ? '' : pct(rr)}
                                                            </button>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                {cell && (
                    <div role="region" aria-label="Hücre ayrıntısı" className="m-fill-2 rounded-xl px-4 py-3 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <span className="flex-1 text-[15px] font-semibold m-text">{cell.person} · H{cell.week + 1} ({dm(weeks[cell.week].start)} – {dm(weeks[cell.week].end)})</span>
                            <button type="button" className="m-icon-btn" aria-label="Ayrıntıyı kapat" onClick={() => setCell(null)}><Icon name="x" /></button>
                        </div>
                        <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                            {cellTasks.map(c => {
                                const t = taskById.get(c.taskId);
                                return (
                                    <li key={`${c.taskId}-${c.kind}`} className="flex items-center gap-2 text-[14px] m-text">
                                        {t && <TaskKeyButton task={t} onOpen={() => onViewTask(t)} />}
                                        <span className="flex-1 min-w-0 truncate">{t?.name || c.taskId}</span>
                                        <span className="text-[12px] m-text-3 whitespace-nowrap">{KIND_LABEL[c.kind]} · {num(c.days)} g</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </section>

            {result.warnings.length > 0 && (
                <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[13px] m-ink-warn">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>
            )}

            {scenario !== 'current' && (singles.length + assignNew.length + splits.length) > 0 && (
                <section aria-label="Dengeleme önerileri" className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="flex-1 text-[15px] font-semibold m-text">Dengeleme önerileri</span>
                        {canEdit && <button type="button" className="m-btn m-btn-plain !min-h-[36px]" onClick={() => setPicked(picked.size ? new Set() : new Set(singles.concat(assignNew).map(r => r.taskId)))}>{picked.size ? 'Seçimi temizle' : 'Tümünü seç'}</button>}
                    </div>
                    <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                        {singles.concat(assignNew).map((r: Reassignment) => {
                            const t = taskById.get(r.taskId);
                            if (!t) return null;
                            return (
                                <li key={r.taskId} className="m-fill-2 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2 text-[14px] m-text">
                                    {canEdit && <input type="checkbox" className="w-5 h-5" aria-label={`${t.name} önerisini seç`} checked={picked.has(r.taskId)}
                                        onChange={e => { const next = new Set(picked); if (e.target.checked) next.add(r.taskId); else next.delete(r.taskId); setPicked(next); }} />}
                                    <TaskKeyButton task={t} onOpen={() => onViewTask(t)} />
                                    <span className="flex-1 min-w-[160px] truncate">{t.name}</span>
                                    <span className="whitespace-nowrap m-text-2">{r.from || 'Atanmamış'} → <strong>{r.to[0]}</strong></span>
                                    <span className="text-[12px] m-text-3 whitespace-nowrap">{num(r.days)} g{r.gainWeeks > 0 ? ` · ${r.gainWeeks} hafta erken` : ''}</span>
                                </li>
                            );
                        })}
                        {splits.map(r => {
                            const t = taskById.get(r.taskId);
                            if (!t) return null;
                            return (
                                <li key={r.taskId} className="m-tone-warn rounded-xl px-3 py-2 flex flex-wrap items-center gap-2 text-[14px]">
                                    <TaskKeyButton task={t} onOpen={() => onViewTask(t)} />
                                    <span className="flex-1 min-w-[160px] truncate">{t.name}</span>
                                    <span className="whitespace-nowrap">Bölünmeli: {r.to.join(' + ')}</span>
                                    <span className="text-[12px] whitespace-nowrap">{num(r.days)} g · alt görevlere ayırın</span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {late.length > 0 && (
                <details className="m-fill-2 rounded-xl px-4 py-3">
                    <summary className="cursor-pointer text-[15px] font-semibold m-text">Hedefe yetişmeyen {late.length} görev</summary>
                    <ul className="m-0 p-0 pt-2 list-none flex flex-col gap-1.5">
                        {late.map(p => {
                            const t = taskById.get(p.taskId);
                            if (!t) return null;
                            return (
                                <li key={p.taskId} className="flex flex-wrap items-center gap-2 text-[14px] m-text">
                                    <TaskKeyButton task={t} onOpen={() => onViewTask(t)} />
                                    <span className="flex-1 min-w-[160px] truncate">{t.name}</span>
                                    <span className="text-[12px] m-text-3 whitespace-nowrap">{p.people.join(' + ')} · {num(p.days)} g · {p.release >= 0 ? `sürüm ${dm(weeks[p.release].end)}` : 'planlanamadı'}</span>
                                    <span className="text-[12px] m-ink-warn whitespace-nowrap">{p.reason}</span>
                                </li>
                            );
                        })}
                    </ul>
                </details>
            )}
        </Sheet>
    );
};

export default BottleneckSheet;
