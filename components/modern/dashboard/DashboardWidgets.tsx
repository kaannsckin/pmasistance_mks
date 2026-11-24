import React, { useMemo, useRef, useState } from 'react';
import { DashboardDim, DashboardWidget, Project, ProjectKpi, Task, TaskStatus, WorkspaceData } from '../../../types';
import {
    applyFilter, breakdown, BreakdownRow, burnup, dimLabel, DimContext, isDone, isOverdue, MEASURE_LABELS, milestonePlan, pivot,
} from '../../../utils/dashboard/data';
import { formatKpi, kpiDelta, kpiProgress, latestPoint, METRIC_BY_KEY, MetricTone } from '../../../utils/dashboard/metrics';
import { currentSprint, deadlineLabel, upcomingDeadlines } from '../../../utils/projectOverview';
import { relativeTime } from '../../../utils/recentChanges';
import { RISK_BAND_LABELS, riskBand, riskScore } from '../../../utils/risks';
import { taskStatusLabel } from '../../../utils/workflow';
import { buildWorkforce } from '../../../utils/workforce';
import { groupTimeTracking, taskTimeTracking, TimeTrackingGroup, totalTimeTracking } from '../../../utils/timeTracking';
import { Icon } from '../icons';
import { rowSep } from '../ui';

/** Bileşen çizimleri: her biri süzülmüş veriden hesaplar, yalnız gösterir */

export interface WidgetEnv extends DimContext {
    ws: WorkspaceData;
    now: Date;
    canEdit: boolean;
    onViewTask: (t: Task) => void;
    onDrill: (title: string, tasks: Task[]) => void;
    onEditKpi: (kpi: ProjectKpi | null) => void;
}

const SERIES = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)', 'var(--viz-7)', 'var(--viz-8)'];
const TONE_INK: Record<MetricTone, string> = { ok: 'm-ink-ok', warn: 'm-ink-warn', bad: 'm-ink-bad', neutral: 'm-text' };
const fmt = (v: number, d = 1) => v.toLocaleString('tr-TR', { maximumFractionDigits: d });
const pctText = (v: number) => `%${Math.round(v * 100)}`;
const shortDay = (v?: string | Date) => (!v ? '—' : (typeof v === 'string' ? new Date(`${v.slice(0, 10)}T00:00:00`) : v).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }));

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="m-0 py-6 text-center text-[14px] m-text-3">{children}</p>;

const Legend: React.FC<{ items: { label: string; color: string }[] }> = ({ items }) => (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] m-text-2" aria-hidden="true">
        {items.map(i => <span key={i.label} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />{i.label}</span>)}
    </div>
);

// ------------------------------------------------------------------ metrik
export const MetricWidget: React.FC<{ w: DashboardWidget; tasks: Task[]; env: WidgetEnv }> = ({ w, tasks, env }) => {
    const def = METRIC_BY_KEY.get(w.config?.metric || 'progress') || METRIC_BY_KEY.get('progress')!;
    const v = def.compute({ ...env, tasks: def.filtered ? tasks : env.project.tasks });
    return (
        <div className="flex flex-col gap-1.5">
            <span className={`text-[34px] leading-none font-semibold m-tabular ${TONE_INK[v.tone || 'neutral']}`}>{v.text}</span>
            {v.pct !== undefined && (
                <span className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--viz-track)' }} aria-hidden="true">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, v.pct)) * 100}%`, background: v.tone === 'bad' ? 'var(--m-bad)' : 'var(--viz-1)' }} />
                </span>
            )}
            {v.sub && <span className="text-[13px] m-text-3">{v.sub}</span>}
        </div>
    );
};

// ------------------------------------------------------------------ KPI
const Sparkline: React.FC<{ k: ProjectKpi }> = ({ k }) => {
    const [hover, setHover] = useState<number | null>(null);
    const pts = k.points;
    if (pts.length < 2) return null;
    const W = 300, H = 64, P = 6;
    const vals = [...pts.map(p => p.value), ...(k.target !== undefined ? [k.target] : [])];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const x = (i: number) => P + (i * (W - 2 * P)) / (pts.length - 1);
    const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    return (
        <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" role="img" aria-label={`${k.name} geçmişi: ${pts.map(p => `${p.date} ${formatKpi(p.value, k.unit)}`).join(', ')}`}
                onMouseLeave={() => setHover(null)}
                onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width * W - P) / ((W - 2 * P) / (pts.length - 1))); setHover(Math.max(0, Math.min(pts.length - 1, i))); }}>
                {k.target !== undefined && <line x1={P} x2={W - P} y1={y(k.target)} y2={y(k.target)} stroke="var(--m-label-3, #8e8e93)" strokeDasharray="4 4" strokeWidth={1} />}
                <path d={d} fill="none" stroke="var(--viz-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p, i) => <circle key={p.date} cx={x(i)} cy={y(p.value)} r={hover === i ? 4.5 : 3} fill="var(--viz-1)" stroke="var(--m-surface)" strokeWidth={2} />)}
            </svg>
            {hover !== null && (
                <span className="m-viz-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: -6, transform: 'translate(-50%, -100%)' }}>
                    {shortDay(pts[hover].date)} · <b>{formatKpi(pts[hover].value, k.unit)}</b>{pts[hover].note ? ` · ${pts[hover].note}` : ''}
                </span>
            )}
        </div>
    );
};

export const KpiWidget: React.FC<{ w: DashboardWidget; env: WidgetEnv }> = ({ w, env }) => {
    const k = (env.project.kpis || []).find(x => x.id === w.config?.kpiId) || (env.project.kpis || [])[0];
    if (!k) {
        return (
            <div className="flex flex-col items-start gap-2">
                <p className="m-0 text-[14px] m-text-3">Bu projede henüz özel gösterge yok (ör. PoC skoru, müşteri memnuniyeti, test kapsaması).</p>
                {env.canEdit && <button type="button" className="m-btn m-btn-gray !min-h-[36px] text-[14px]" onClick={() => env.onEditKpi(null)}><Icon name="plus" size={15} />Gösterge oluştur</button>}
            </div>
        );
    }
    const cur = latestPoint(k);
    const prog = kpiProgress(k);
    const delta = kpiDelta(k);
    const good = delta === undefined ? undefined : (delta >= 0) === (k.higherIsBetter !== false);
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-end gap-3 flex-wrap">
                <span className="text-[38px] leading-none font-semibold m-text m-tabular">{formatKpi(cur?.value, k.unit)}</span>
                {delta !== undefined && delta !== 0 && (
                    <span className={`text-[14px] font-semibold ${good ? 'm-ink-ok' : 'm-ink-bad'}`}>
                        {delta > 0 ? '▲' : '▼'} {formatKpi(Math.abs(delta), k.unit === 'percent' ? 'number' : k.unit)}{k.unit === 'percent' ? ' puan' : ''}
                    </span>
                )}
                {k.target !== undefined && (
                    <span className="text-[14px] m-text-2 ml-auto">Hedef <b className="m-text">{formatKpi(k.target, k.unit)}</b>{k.targetLabel ? ` · ${k.targetLabel}` : ''}</span>
                )}
            </div>
            {prog !== undefined && (
                <span className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--viz-track)' }} role="img" aria-label={`Hedefe ilerleme ${pctText(prog)}`}>
                    <span className="block h-full rounded-full" style={{ width: `${prog * 100}%`, background: 'var(--viz-1)' }} />
                </span>
            )}
            <Sparkline k={k} />
            <div className="flex items-center gap-2 text-[12.5px] m-text-3">
                <span className="flex-1 min-w-0 truncate">{cur ? `Son ölçüm ${shortDay(cur.date)}${cur.note ? ` · ${cur.note}` : ''}` : 'Ölçüm yok'}{k.source === 'import' ? ' · aktarımla güncellenir' : ''}</span>
                {env.canEdit && <button type="button" className="m-btn m-btn-plain !min-h-[30px] !px-2 text-[13px]" onClick={() => env.onEditKpi(k)}><Icon name="pencil" size={13} />Ölçüm</button>}
            </div>
        </div>
    );
};

// ------------------------------------------------------------------ ilerleme halkası
export const ProgressWidget: React.FC<{ w: DashboardWidget; tasks: Task[]; env: WidgetEnv }> = ({ w, tasks, env }) => {
    const m = w.config?.measure || 'count';
    const r = breakdown(tasks, { kind: 'category' }, env, m, env.now);
    const get = (k: string) => r.find(x => x.key === k)?.measure || 0;
    const done = get('Tamamlandı'), prog = get('Süreçte'), todo = get('Yapılacak') + get('Bekleyen');
    const total = done + prog + todo;
    if (!total) return <Empty>Kayıt yok.</Empty>;
    const segs = [{ v: done, c: 'var(--m-ok)', l: 'Tamamlandı' }, { v: prog, c: 'var(--viz-1)', l: 'Süreçte' }, { v: todo, c: 'var(--viz-track)', l: 'Bekleyen' }];
    const R = 42, C = 2 * Math.PI * R;
    let off = 0;
    return (
        <div className="flex items-center gap-4">
            <svg viewBox="0 0 100 100" className="w-28 h-28 flex-none -rotate-90" role="img" aria-label={`Tamamlanan ${pctText(done / total)}, süreçte ${pctText(prog / total)}`}>
                {segs.map(s => {
                    const len = (s.v / total) * C;
                    const el = <circle key={s.l} cx="50" cy="50" r={R} fill="none" stroke={s.c} strokeWidth="12" strokeDasharray={`${Math.max(0, len - (s.v && s.v < total ? 1.5 : 0))} ${C}`} strokeDashoffset={-off}><title>{`${s.l}: ${fmt(s.v)}`}</title></circle>;
                    off += len;
                    return el;
                })}
            </svg>
            <div className="flex flex-col gap-1">
                <span className="text-[30px] leading-none font-semibold m-text m-tabular">{pctText(done / total)}</span>
                <span className="text-[13px] m-text-3">{MEASURE_LABELS[m]}: {fmt(done)} / {fmt(total)}</span>
                <Legend items={segs.map(s => ({ label: `${s.l} ${fmt(s.v)}`, color: s.c }))} />
            </div>
        </div>
    );
};

// ------------------------------------------------------------------ yatay çubuklar (kırılım)
const StackBar: React.FC<{ row: BreakdownRow; max: number; m: string }> = ({ row, max }) => {
    const total = row.measure || 0;
    const w = max ? (total / max) * 100 : 0;
    const doneW = total ? (row.measureDone / total) * 100 : 0;
    const progW = total ? (Math.min(row.inProgress, row.total) / row.total) * (100 - doneW) : 0;
    return (
        <span className="flex-1 h-3 rounded-[4px] overflow-hidden flex" style={{ background: 'var(--viz-track)' }} aria-hidden="true">
            <span className="h-full flex" style={{ width: `${w}%`, gap: 2 }}>
                {doneW > 0 && <span className="h-full rounded-[3px]" style={{ width: `${doneW}%`, background: 'var(--m-ok)' }} />}
                {progW > 0 && <span className="h-full rounded-[3px]" style={{ width: `${progW}%`, background: 'var(--viz-1)' }} />}
                <span className="h-full flex-1 rounded-[3px]" style={{ background: 'var(--viz-7)', opacity: 0.35 }} />
            </span>
        </span>
    );
};

const Donut: React.FC<{ rows: BreakdownRow[]; onDrill: (r: BreakdownRow) => void }> = ({ rows, onDrill }) => {
    const top = rows.slice(0, 7);
    const rest = rows.slice(7);
    const items = [...top.map((r, i) => ({ r, c: SERIES[i] })), ...(rest.length ? [{ r: { ...rest[0], key: `Diğer (${rest.length})`, measure: rest.reduce((s, x) => s + x.measure, 0), tasks: rest.flatMap(x => x.tasks) } as BreakdownRow, c: SERIES[7] }] : [])];
    const total = items.reduce((s, x) => s + x.r.measure, 0) || 1;
    const R = 40, C = 2 * Math.PI * R;
    let off = 0;
    return (
        <div className="flex items-center gap-4 flex-wrap">
            <svg viewBox="0 0 100 100" className="w-32 h-32 flex-none -rotate-90" role="img" aria-label={items.map(x => `${x.r.key} ${fmt(x.r.measure)}`).join(', ')}>
                {items.map(x => {
                    const len = (x.r.measure / total) * C;
                    const el = <circle key={x.r.key} cx="50" cy="50" r={R} fill="none" stroke={x.c} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-off} className="cursor-pointer" onClick={() => onDrill(x.r)}><title>{`${x.r.key}: ${fmt(x.r.measure)} (${pctText(x.r.measure / total)})`}</title></circle>;
                    off += len;
                    return el;
                })}
            </svg>
            <ul className="m-0 p-0 list-none flex flex-col gap-1 min-w-0 flex-1">
                {items.map(x => (
                    <li key={x.r.key}>
                        <button type="button" className="m-row-link flex items-center gap-2 px-1 py-0.5 rounded-md text-[13.5px]" onClick={() => onDrill(x.r)}>
                            <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: x.c }} />
                            <span className="flex-1 min-w-0 truncate">{x.r.key}</span>
                            <span className="m-tabular m-text-2">{fmt(x.r.measure)} · {pctText(x.r.measure / total)}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export const BreakdownWidget: React.FC<{ w: DashboardWidget; tasks: Task[]; env: WidgetEnv; dim?: DashboardDim }> = ({ w, tasks, env, dim }) => {
    const m = w.config?.measure || 'count';
    const d = dim || w.config?.dim || { kind: 'workPackage' };
    const rows = useMemo(() => breakdown(tasks, d, env, m, env.now), [tasks, d, env, m]);
    if (!rows.length) return <Empty>Kayıt yok.</Empty>;
    const drill = (r: BreakdownRow) => env.onDrill(`${dimLabel(d)}: ${r.key}`, r.tasks);
    if (w.config?.chart === 'donut') return <Donut rows={rows} onDrill={drill} />;
    if (w.config?.chart === 'table') {
        return (
            <div className="overflow-x-auto">
                <table className="w-full text-[13.5px] border-collapse">
                    <thead><tr className="text-left m-text-3 text-[12.5px]"><th className="font-semibold py-1 pr-2">{dimLabel(d)}</th><th className="font-semibold py-1 px-2 text-right">Kayıt</th><th className="font-semibold py-1 px-2 text-right">Tamamlanan</th><th className="font-semibold py-1 px-2 text-right">Geciken</th>{m !== 'count' && <th className="font-semibold py-1 px-2 text-right">{MEASURE_LABELS[m]}</th>}<th className="font-semibold py-1 pl-2 text-right">İlerleme</th></tr></thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.key} className="border-t m-sep cursor-pointer" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }} onClick={() => drill(r)}>
                                <td className="py-1.5 pr-2 m-text">{r.key}</td>
                                <td className="py-1.5 px-2 text-right m-tabular">{r.total}</td>
                                <td className="py-1.5 px-2 text-right m-tabular">{r.done}</td>
                                <td className={`py-1.5 px-2 text-right m-tabular ${r.overdue ? 'm-ink-bad' : 'm-text-3'}`}>{r.overdue}</td>
                                {m !== 'count' && <td className="py-1.5 px-2 text-right m-tabular">{fmt(r.measure)}</td>}
                                <td className="py-1.5 pl-2 text-right m-tabular">{pctText(r.pct)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    const max = Math.max(...rows.map(r => r.measure));
    const shown = rows.slice(0, w.config?.limit || 12);
    return (
        <div className="flex flex-col gap-2">
            <Legend items={[{ label: 'Tamamlanan', color: 'var(--m-ok)' }, { label: 'Süreçte', color: 'var(--viz-1)' }, { label: 'Kalan', color: 'color-mix(in srgb, var(--viz-7) 35%, transparent)' }]} />
            <ul className="m-0 p-0 list-none flex flex-col">
                {shown.map(r => (
                    <li key={r.key}>
                        <button type="button" onClick={() => drill(r)} title={`${r.key}: ${r.total} kayıt, ${r.done} tamamlandı, ${r.inProgress} süreçte, ${r.overdue} geciken`}
                            className="m-row-link w-full grid items-center gap-x-3 px-1 py-1.5 rounded-lg text-[13.5px]" style={{ gridTemplateColumns: 'minmax(80px, 34%) 1fr auto' }}>
                            <span className="min-w-0 truncate m-text">{r.key}</span>
                            <StackBar row={r} max={max} m={m} />
                            <span className="m-tabular m-text-2 whitespace-nowrap text-right">
                                {m === 'count' ? `${r.done}/${r.total}` : `${fmt(r.measureDone)}/${fmt(r.measure)}`} · {pctText(r.pct)}
                                {r.overdue > 0 && <span className="ml-1.5 m-ink-bad font-semibold">{r.overdue} gecikti</span>}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            {rows.length > shown.length && <span className="text-[12.5px] m-text-3">ve {rows.length - shown.length} değer daha</span>}
        </div>
    );
};

// ------------------------------------------------------------------ durum dağılımı
const CATEGORY_COLOR: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'color-mix(in srgb, var(--viz-7) 35%, transparent)',
    [TaskStatus.ToDo]: 'var(--viz-7)',
    [TaskStatus.InProgress]: 'var(--viz-1)',
    [TaskStatus.Done]: 'var(--m-ok)',
};
const CATEGORY_TR: Record<TaskStatus, string> = { [TaskStatus.Backlog]: 'Bekleyen', [TaskStatus.ToDo]: 'Yapılacak', [TaskStatus.InProgress]: 'Süreçte', [TaskStatus.Done]: 'Tamamlandı' };

export const StatusMixWidget: React.FC<{ tasks: Task[]; env: WidgetEnv }> = ({ tasks, env }) => {
    if (!tasks.length) return <Empty>Kayıt yok.</Empty>;
    const cats = [TaskStatus.Backlog, TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.Done].map(c => ({ c, n: tasks.filter(t => t.status === c).length })).filter(x => x.n);
    const statuses = breakdown(tasks, { kind: 'status' }, env, 'count', env.now);
    const catOf = (label: string) => env.workflow.statuses.find(s => s.label === label)?.category ?? TaskStatus.ToDo;
    return (
        <div className="flex flex-col gap-3">
            <div className="flex h-4 rounded-[4px] overflow-hidden" style={{ gap: 2 }} role="img" aria-label={cats.map(x => `${CATEGORY_TR[x.c]} ${x.n}`).join(', ')}>
                {cats.map(x => <span key={x.c} className="h-full rounded-[3px]" style={{ width: `${(x.n / tasks.length) * 100}%`, background: CATEGORY_COLOR[x.c] }} title={`${CATEGORY_TR[x.c]}: ${x.n}`} />)}
            </div>
            <Legend items={cats.map(x => ({ label: `${CATEGORY_TR[x.c]} ${x.n} (${pctText(x.n / tasks.length)})`, color: CATEGORY_COLOR[x.c] }))} />
            <ul className="m-0 p-0 list-none grid gap-x-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {statuses.map(r => (
                    <li key={r.key}>
                        <button type="button" className="m-row-link w-full flex items-center gap-2 px-1 py-1 rounded-md text-[13.5px]" onClick={() => env.onDrill(`Durum: ${r.key}`, r.tasks)}>
                            <span className="w-2 h-2 rounded-full flex-none" style={{ background: CATEGORY_COLOR[catOf(r.key)] }} />
                            <span className="flex-1 min-w-0 truncate">{r.key}</span>
                            <span className="m-tabular m-text-2">{r.total}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

// ------------------------------------------------------------------ kilometre taşları
const STATE_META = {
    done: { label: 'Tamamlandı', tone: 'm-tone-ok' },
    late: { label: 'Gecikti', tone: 'm-tone-bad' },
    active: { label: 'Devam ediyor', tone: 'm-tone-accent' },
    planned: { label: 'Planlandı', tone: 'm-tone-hold' },
} as const;

export const MilestonesWidget: React.FC<{ w: DashboardWidget; tasks: Task[]; env: WidgetEnv }> = ({ w, tasks, env }) => {
    const d = w.config?.dim || { kind: 'sprint' };
    const m = w.config?.measure || 'count';
    const rows = useMemo(() => milestonePlan(tasks, d, env, m, env.now), [tasks, d, env, m]);
    if (!rows.length) return <Empty>Kayıt yok.</Empty>;
    const effortRows = m === 'effort';
    return (
        <div className="flex flex-col gap-3">
            {/* Kümülatif: her taş sonunda planlanan kapsam ve bugüne kadar tamamlanan */}
            <div className="flex items-stretch gap-2 h-28" role="img" aria-label={rows.map(r => `${r.key}: plan ${pctText(r.cumulativePlanned)}, tamamlanan ${pctText(r.cumulativeDone)}`).join('; ')}>
                {rows.map(r => (
                    <div key={r.key} className="flex-1 min-w-0 flex flex-col items-center gap-1" title={`${r.key} sonunda planlanan ${pctText(r.cumulativePlanned)} · tamamlanan ${pctText(r.cumulativeDone)}`}>
                        <span className="text-[11.5px] m-text-2 m-tabular">{pctText(r.cumulativePlanned)}</span>
                        <div className="w-full max-w-[56px] flex-1 min-h-[40px] relative rounded-t-[4px] overflow-hidden" style={{ background: 'var(--viz-track)' }}>
                            <span className="absolute bottom-0 left-0 right-0 rounded-t-[4px]" style={{ height: `${r.cumulativePlanned * 100}%`, background: 'var(--viz-1)', opacity: 0.35 }} />
                            <span className="absolute bottom-0 left-0 right-0 rounded-t-[4px]" style={{ height: `${r.cumulativeDone * 100}%`, background: 'var(--m-ok)' }} />
                        </div>
                        <span className="text-[12px] m-text truncate max-w-full">{r.key}</span>
                    </div>
                ))}
            </div>
            <Legend items={[{ label: 'Kümülatif plan (taş sonunda)', color: 'color-mix(in srgb, var(--viz-1) 35%, transparent)' }, { label: 'Tamamlanan', color: 'var(--m-ok)' }]} />
            <div className="overflow-x-auto">
                <table className="w-full text-[13.5px] border-collapse">
                    <thead>
                        <tr className="text-left m-text-3 text-[12.5px]">
                            <th className="font-semibold py-1 pr-2">{dimLabel(d).replace(/^Etiket: /, '')}</th>
                            <th className="font-semibold py-1 px-2 text-right">Kayıt</th>
                            {effortRows && <th className="font-semibold py-1 px-2 text-right">Efor (gün)</th>}
                            <th className="font-semibold py-1 px-2">Başlangıç</th>
                            <th className="font-semibold py-1 px-2">Bitiş</th>
                            <th className="font-semibold py-1 px-2 text-right">Tamamlanan</th>
                            <th className="font-semibold py-1 px-2 text-right">Geciken</th>
                            <th className="font-semibold py-1 pl-2">Durum</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.key} className="border-t m-sep cursor-pointer" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }} onClick={() => env.onDrill(`${r.key}`, r.tasks)}>
                                <td className="py-1.5 pr-2 font-semibold m-text">{r.key}</td>
                                <td className="py-1.5 px-2 text-right m-tabular">{r.total}</td>
                                {effortRows && <td className="py-1.5 px-2 text-right m-tabular">{fmt(r.measure)}</td>}
                                <td className="py-1.5 px-2 whitespace-nowrap m-text-2">{shortDay(r.start)}</td>
                                <td className="py-1.5 px-2 whitespace-nowrap m-text-2">{shortDay(r.end)}{r.daysLeft !== undefined && r.state !== 'done' ? <span className="m-text-3"> · {r.daysLeft >= 0 ? `${r.daysLeft} gün` : `${-r.daysLeft} gün geçti`}</span> : ''}</td>
                                <td className="py-1.5 px-2 text-right m-tabular">{r.done}/{r.total} · {pctText(r.pct)}</td>
                                <td className={`py-1.5 px-2 text-right m-tabular ${r.overdue ? 'm-ink-bad font-semibold' : 'm-text-3'}`}>{r.overdue}</td>
                                <td className="py-1.5 pl-2"><span className={`inline-flex items-center h-6 px-2 rounded-full text-[12px] font-semibold whitespace-nowrap ${STATE_META[r.state].tone}`}>{STATE_META[r.state].label}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ------------------------------------------------------------------ iş paketleri
export const WorkPackagesWidget: React.FC<{ w: DashboardWidget; tasks: Task[]; env: WidgetEnv }> = ({ w, tasks, env }) => {
    const rows = breakdown(tasks, { kind: 'workPackage' }, env, w.config?.measure || 'effort', env.now);
    if (!rows.length) return <Empty>Kayıt yok.</Empty>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[13.5px] border-collapse">
                <thead>
                    <tr className="text-left m-text-3 text-[12.5px]">
                        <th className="font-semibold py-1 pr-2">İş paketi</th><th className="font-semibold py-1 px-2 text-right">Kayıt</th><th className="font-semibold py-1 px-2 text-right">Efor (gün)</th>
                        <th className="font-semibold py-1 px-2 w-[28%]">İlerleme</th><th className="font-semibold py-1 px-2 text-right">Geciken</th><th className="font-semibold py-1 pl-2">Son termin</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => {
                        const effort = r.tasks.reduce((s, t) => s + (t.time?.avg || 0), 0);
                        const lastDue = r.tasks.map(t => t.dueDate?.slice(0, 10)).filter(Boolean).sort().pop();
                        return (
                            <tr key={r.key} className="border-t m-sep cursor-pointer" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }} onClick={() => env.onDrill(r.key, r.tasks)}>
                                <td className="py-1.5 pr-2 m-text">{r.key}</td>
                                <td className="py-1.5 px-2 text-right m-tabular">{r.total}</td>
                                <td className="py-1.5 px-2 text-right m-tabular">{fmt(effort)}</td>
                                <td className="py-1.5 px-2">
                                    <span className="flex items-center gap-2">
                                        <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--viz-track)' }} aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${r.pct * 100}%`, background: 'var(--m-ok)' }} /></span>
                                        <span className="m-tabular m-text-2 w-10 text-right">{pctText(r.pct)}</span>
                                    </span>
                                </td>
                                <td className={`py-1.5 px-2 text-right m-tabular ${r.overdue ? 'm-ink-bad font-semibold' : 'm-text-3'}`}>{r.overdue}</td>
                                <td className="py-1.5 pl-2 whitespace-nowrap m-text-2">{shortDay(lastDue)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// ------------------------------------------------------------------ çapraz tablo
export const PivotWidget: React.FC<{ w: DashboardWidget; tasks: Task[]; env: WidgetEnv }> = ({ w, tasks, env }) => {
    const a = w.config?.dim || { kind: 'priority' };
    const b = w.config?.dim2 || { kind: 'category' };
    const m = w.config?.measure || 'count';
    const p = useMemo(() => pivot(tasks, a, b, env, m), [tasks, a, b, env, m]);
    if (!p.rows.length) return <Empty>Kayıt yok.</Empty>;
    const cellTasks = (r: string, c: string) => tasks.filter(t => breakdown([t], a, env).some(x => x.key === r) && breakdown([t], b, env).some(x => x.key === c));
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                    <tr className="m-text-3 text-[12px]">
                        <th className="text-left font-semibold px-2 py-1">{dimLabel(a).replace(/^Etiket: /, '')} \ {dimLabel(b).replace(/^Etiket: /, '')}</th>
                        {p.cols.map(c => <th key={c} className="font-semibold px-2 py-1 text-right">{c}</th>)}
                        <th className="font-semibold px-2 py-1 text-right">Toplam</th>
                    </tr>
                </thead>
                <tbody>
                    {p.rows.map((r, i) => (
                        <tr key={r}>
                            <th scope="row" className="text-left font-medium px-2 py-1.5 m-text">{r}</th>
                            {p.cols.map((c, j) => {
                                const v = p.cells[i][j];
                                const alpha = p.max ? 0.08 + (v / p.max) * 0.77 : 0;
                                return (
                                    <td key={c} className={`px-2 py-1.5 text-right m-tabular rounded-[4px] ${v ? 'cursor-pointer' : ''}`}
                                        style={{ background: v ? `rgba(var(--viz-seq), ${alpha.toFixed(2)})` : 'transparent', color: alpha > 0.55 ? '#fff' : undefined }}
                                        title={`${r} × ${c}: ${fmt(v)}`}
                                        onClick={v ? () => env.onDrill(`${r} × ${c}`, cellTasks(r, c)) : undefined}>
                                        {v ? fmt(v) : <span className="m-text-3">·</span>}
                                    </td>
                                );
                            })}
                            <td className="px-2 py-1.5 text-right m-tabular font-semibold">{fmt(p.rowTotals[i])}</td>
                        </tr>
                    ))}
                    <tr>
                        <th scope="row" className="text-left font-semibold px-2 py-1.5 m-text-2">Toplam</th>
                        {p.colTotals.map((v, j) => <td key={p.cols[j]} className="px-2 py-1.5 text-right m-tabular font-semibold">{fmt(v)}</td>)}
                        <td className="px-2 py-1.5 text-right m-tabular font-semibold">{fmt(p.total)}</td>
                    </tr>
                </tbody>
            </table>
            <p className="m-0 mt-1 text-[12px] m-text-3">{MEASURE_LABELS[m]} · koyu hücre daha çok · hücreye tıklayınca kayıtlar açılır</p>
        </div>
    );
};

// ------------------------------------------------------------------ plan / gerçekleşen eğrisi
export const BurnupWidget: React.FC<{ w: DashboardWidget; tasks: Task[]; env: WidgetEnv }> = ({ w, tasks, env }) => {
    const m = w.config?.measure || 'count';
    const pts = useMemo(() => burnup(tasks, m, env.now, 52, env.project), [tasks, m, env.now, env.project]);
    const [hover, setHover] = useState<number | null>(null);
    const ref = useRef<SVGSVGElement>(null);
    if (pts.length < 2) return <Empty>Eğri için termini olan kayıt gerekir.</Empty>;
    const W = 520, H = 180, L = 34, R = 10, T = 10, B = 24;
    const max = Math.max(1, ...pts.map(p => Math.max(p.planned, p.done, p.scope)));
    const x = (i: number) => L + (i * (W - L - R)) / (pts.length - 1);
    const y = (v: number) => T + (1 - v / max) * (H - T - B);
    const line = (k: 'planned' | 'done') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
    const todayIdx = pts.findIndex(p => p.date > env.now.toISOString().slice(0, 10)) - 1;
    const ticks = [0, 0.5, 1].map(f => Math.round(max * f));
    return (
        <div className="flex flex-col gap-2">
            <Legend items={[{ label: 'Planlanan (termine göre)', color: 'var(--viz-1)' }, { label: 'Tamamlanan', color: 'var(--viz-3)' }]} />
            <div className="relative">
                <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
                    aria-label={`Son hafta: planlanan ${fmt(pts[pts.length - 1].planned)}, tamamlanan ${fmt(pts[pts.length - 1].done)}, kapsam ${fmt(pts[0].scope)}`}
                    onMouseLeave={() => setHover(null)}
                    onMouseMove={e => { const r = ref.current!.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((px - L) / (W - L - R)) * (pts.length - 1))))); }}>
                    {ticks.map(t => (
                        <g key={t}>
                            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--m-sep)" strokeWidth={1} />
                            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="currentColor" className="m-text-3">{t}</text>
                        </g>
                    ))}
                    {todayIdx >= 0 && <line x1={x(todayIdx)} x2={x(todayIdx)} y1={T} y2={H - B} stroke="var(--m-label-3, #8e8e93)" strokeDasharray="3 4" />}
                    <path d={line('planned')} fill="none" stroke="var(--viz-1)" strokeWidth={2} strokeLinejoin="round" />
                    <path d={line('done')} fill="none" stroke="var(--viz-3)" strokeWidth={2} strokeLinejoin="round" />
                    {[0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} fontSize="11" fill="currentColor" className="m-text-3">{shortDay(pts[i].date)}</text>)}
                    {hover !== null && (
                        <g>
                            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--m-label-2, #3c3c43)" strokeWidth={1} />
                            <circle cx={x(hover)} cy={y(pts[hover].planned)} r={4} fill="var(--viz-1)" stroke="var(--m-surface)" strokeWidth={2} />
                            <circle cx={x(hover)} cy={y(pts[hover].done)} r={4} fill="var(--viz-3)" stroke="var(--m-surface)" strokeWidth={2} />
                        </g>
                    )}
                </svg>
                {hover !== null && (
                    <span className="m-viz-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: 0, transform: `translate(${hover > pts.length / 2 ? '-105%' : '5%'}, 0)` }}>
                        <b>{shortDay(pts[hover].date)} haftası</b><br />Planlanan {fmt(pts[hover].planned)} · Tamamlanan {fmt(pts[hover].done)}<br /><span className="m-text-3">Kapsam {fmt(pts[hover].scope)} · {MEASURE_LABELS[m]}</span>
                    </span>
                )}
            </div>
        </div>
    );
};

// ------------------------------------------------------------------ ekip yükü
export const TeamWidget: React.FC<{ w: DashboardWidget; tasks: Task[]; env: WidgetEnv }> = ({ w, tasks, env }) => {
    const d = w.config?.dim || { kind: 'assignee' };
    const rows = breakdown(tasks, d, env, 'effort', env.now).sort((a, b) => b.open - a.open || b.measure - a.measure);
    if (!rows.length) return <Empty>Kayıt yok.</Empty>;
    const shown = rows.slice(0, w.config?.limit || 8);
    const maxOpen = Math.max(1, ...shown.map(r => r.open));
    return (
        <ul className="m-0 p-0 list-none flex flex-col">
            {shown.map((r, i) => {
                const sep = rowSep(i);
                return (
                    <li key={r.key}>
                        <button type="button" className={`m-row-link w-full grid items-center gap-x-3 px-1 py-2 text-[13.5px] ${sep.className}`} style={{ ...sep.style, gridTemplateColumns: 'minmax(80px, 38%) 1fr auto' }} onClick={() => env.onDrill(`${dimLabel(d)}: ${r.key}`, r.tasks)}>
                            <span className="min-w-0 truncate m-text">{r.key}</span>
                            <span className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--viz-track)' }} aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${(r.open / maxOpen) * 100}%`, background: 'var(--viz-1)' }} /></span>
                            <span className="m-tabular m-text-2 whitespace-nowrap text-right">{r.open} açık · {fmt(r.measure - r.measureDone)} gün{r.overdue ? <span className="ml-1.5 m-ink-bad font-semibold">{r.overdue} gecikti</span> : null}</span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
};

// ------------------------------------------------------------------ terminler
export const DeadlinesWidget: React.FC<{ w: DashboardWidget; tasks: Task[]; env: WidgetEnv }> = ({ w, tasks, env }) => {
    const limit = w.config?.limit || 8;
    const overdue = tasks.filter(t => isOverdue(t, env.now)).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const soon = upcomingDeadlines({ ...env.project, tasks }, env.now, 50).items.filter(d => d.daysUntil >= 0);
    const items = [...overdue.map(t => ({ task: t, daysUntil: Math.round((new Date(`${t.dueDate!.slice(0, 10)}T00:00:00`).getTime() - new Date(env.now.toDateString()).getTime()) / 86_400_000) })), ...soon].slice(0, limit);
    if (!items.length) return <Empty>Geciken ya da yaklaşan termin yok.</Empty>;
    return (
        <div className="flex flex-col">
            <span className="text-[12.5px] m-text-3 mb-1">{overdue.length} geciken · {soon.filter(d => d.daysUntil <= 14).length} kayıt 14 gün içinde</span>
            {items.map((d, i) => {
                const sep = rowSep(i);
                const tone = d.daysUntil < 0 ? 'm-tone-bad' : d.daysUntil <= 2 ? 'm-tone-warn' : 'm-tone-hold';
                return (
                    <button key={d.task.id} type="button" onClick={() => env.onViewTask(d.task)} className={`m-row-link flex items-center gap-3 px-1 py-2 min-h-[48px] ${sep.className}`} style={sep.style}>
                        <span className="flex-1 min-w-0 flex flex-col">
                            <span className="text-[14px] m-text truncate">{d.task.name}</span>
                            <span className="text-[12.5px] m-text-3 truncate">{d.task.resourceName || 'Atanmadı'} · {taskStatusLabel(d.task, env.workflow)}</span>
                        </span>
                        <span className={`inline-flex items-center h-6 px-2 rounded-full text-[12px] font-semibold whitespace-nowrap ${tone}`}>{deadlineLabel(d.daysUntil)}</span>
                    </button>
                );
            })}
        </div>
    );
};

// ------------------------------------------------------------------ riskler
export const RisksWidget: React.FC<{ w: DashboardWidget; env: WidgetEnv }> = ({ w, env }) => {
    const open = (env.project.risks || []).filter(r => r.status !== 'closed').sort((a, b) => riskScore(b) - riskScore(a));
    if (!open.length) return <Empty>Açık risk yok.</Empty>;
    const bands = (['high', 'medium', 'low'] as const).map(b => ({ b, n: open.filter(r => riskBand(riskScore(r)) === b).length }));
    const TONE = { high: 'm-tone-bad', medium: 'm-tone-warn', low: 'm-tone-ok' } as const;
    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2 flex-wrap">{bands.map(x => <span key={x.b} className={`inline-flex items-center h-6 px-2 rounded-full text-[12px] font-semibold ${TONE[x.b]}`}>{RISK_BAND_LABELS[x.b]} {x.n}</span>)}</div>
            <ul className="m-0 p-0 list-none flex flex-col">
                {open.slice(0, w.config?.limit || 6).map((r, i) => {
                    const sep = rowSep(i);
                    const s = riskScore(r);
                    return (
                        <li key={r.id} className={`flex items-center gap-3 py-2 ${sep.className}`} style={sep.style}>
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-semibold m-tabular flex-none ${TONE[riskBand(s)]}`}>{s}</span>
                            <span className="flex-1 min-w-0 flex flex-col">
                                <span className="text-[14px] m-text truncate">{r.title}</span>
                                <span className="text-[12.5px] m-text-3 truncate">{[r.owner || 'Sahip yok', r.mitigation ? 'Aksiyon var' : 'Aksiyon yok'].join(' · ')}</span>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

// ------------------------------------------------------------------ sprint
export const SprintWidget: React.FC<{ env: WidgetEnv }> = ({ env }) => {
    const s = currentSprint(env.project, env.now);
    if (!s) return <Empty>Sprint planı yok.</Empty>;
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[22px] font-semibold m-text">{s.label}</span>
                <span className={`text-[13px] font-semibold ${s.daysLeft < 0 ? 'm-ink-bad' : 'm-text-2'}`}>{s.daysLeft >= 0 ? `${s.daysLeft} gün kaldı` : `${-s.daysLeft} gün geçti`}</span>
            </div>
            <span className="text-[13px] m-text-3">{shortDay(s.start)} – {shortDay(s.end)} · {s.total} kayıt</span>
            <div className="flex h-3 rounded-[4px] overflow-hidden" style={{ gap: 2, background: 'var(--viz-track)' }} role="img" aria-label={`${s.done} tamamlandı, ${s.inProgress} süreçte, ${s.total - s.done - s.inProgress} yapılacak`}>
                {s.done > 0 && <span className="h-full rounded-[3px]" style={{ width: `${(s.done / s.total) * 100}%`, background: 'var(--m-ok)' }} />}
                {s.inProgress > 0 && <span className="h-full rounded-[3px]" style={{ width: `${(s.inProgress / s.total) * 100}%`, background: 'var(--viz-1)' }} />}
            </div>
            <Legend items={[{ label: `${s.done} tamamlandı`, color: 'var(--m-ok)' }, { label: `${s.inProgress} süreçte`, color: 'var(--viz-1)' }, { label: `${s.total - s.done - s.inProgress} yapılacak`, color: 'var(--viz-track)' }]} />
            {s.laterTasks > 0 && <span className="text-[12.5px] m-text-3">Sonraki sprintlerde {s.laterTasks} kayıt bekliyor</span>}
        </div>
    );
};

// ------------------------------------------------------------------ worklog
export const WorklogWidget: React.FC<{ w: DashboardWidget; tasks: Task[]; env: WidgetEnv }> = ({ w, tasks, env }) => {
    const r = useMemo(() => buildWorkforce(env.ws, [{ ...env.project, tasks }]), [env.ws, env.project, tasks]);
    if (!r.totalHours) return <Empty>Jira worklog'u yok (Ekip ve tahsis › İş güçleri).</Empty>;
    const shown = r.people.slice(0, w.config?.limit || 8);
    const max = Math.max(...shown.map(p => p.hours));
    const tl = (v: number) => v.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[13px] m-text-2">{fmt(r.totalHours)} sa · {tl(r.totalCost)}{r.uncostedHours ? ` · ${fmt(r.uncostedHours)} sa maliyetsiz` : ''}</span>
            {shown.map((p, i) => {
                const sep = rowSep(i);
                return (
                    <div key={p.key} className={`grid items-center gap-x-3 py-1.5 text-[13.5px] ${sep.className}`} style={{ ...sep.style, gridTemplateColumns: 'minmax(80px, 36%) 1fr auto' }}>
                        <span className="min-w-0 truncate m-text">{p.name}</span>
                        <span className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--viz-track)' }} aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${(p.hours / max) * 100}%`, background: 'var(--viz-1)' }} /></span>
                        <span className="m-tabular m-text-2 whitespace-nowrap">{fmt(p.hours)} sa · {p.cost ? tl(p.cost) : '—'}</span>
                    </div>
                );
            })}
        </div>
    );
};

// ------------------------------------------------------------------ son değişiklikler
export const ActivityWidget: React.FC<{ w: DashboardWidget; tasks: Task[]; env: WidgetEnv }> = ({ w, tasks, env }) => {
    const CAT: Record<TaskStatus, string> = { [TaskStatus.Backlog]: 'Bekleyen', [TaskStatus.ToDo]: 'Yapılacak', [TaskStatus.InProgress]: 'Süreçte', [TaskStatus.Done]: 'Tamamlandı' };
    const events = tasks
        .flatMap(t => (t.statusLog || []).map(e => ({ t, e })))
        .sort((a, b) => b.e.at.localeCompare(a.e.at))
        .slice(0, w.config?.limit || 8);
    if (!events.length) return <Empty>Durum geçişi kaydı yok.</Empty>;
    return (
        <ul className="m-0 p-0 list-none flex flex-col">
            {events.map(({ t, e }, i) => {
                const sep = rowSep(i);
                return (
                    <li key={`${t.id}-${e.at}`}>
                        <button type="button" className={`m-row-link w-full flex items-center gap-3 px-1 py-2 text-left ${sep.className}`} style={sep.style} onClick={() => env.onViewTask(t)}>
                            <span className={`w-2 h-2 rounded-full flex-none`} style={{ background: e.to === TaskStatus.Done ? 'var(--m-ok)' : 'var(--viz-1)' }} />
                            <span className="flex-1 min-w-0 flex flex-col">
                                <span className="text-[14px] m-text truncate">{t.name}</span>
                                <span className="text-[12.5px] m-text-3">{CAT[e.from]} → {CAT[e.to]}</span>
                            </span>
                            <span className="text-[12.5px] m-text-3 whitespace-nowrap">{relativeTime(e.at, env.now)}</span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
};

// ------------------------------------------------------------------ not
export const NoteWidget: React.FC<{ w: DashboardWidget }> = ({ w }) => {
    const text = w.config?.text?.trim();
    if (!text) return <Empty>Boş not. Düzenle › ayarlardan metin yazın.</Empty>;
    return <div className="text-[14.5px] leading-relaxed m-text whitespace-pre-wrap break-words">{text}</div>;
};

const JiraBottlenecks = ({ tasks, env }: { tasks: Task[]; env: WidgetEnv }) => {
    const [metric, setMetric] = useState<'reopenCount' | 'assigneeChanges' | 'dueDateShifts'>('reopenCount');
    const withHistory = tasks.filter(task => task.historySummary && !task.historySummary.partial);
    const byStatus = new Map<string, number[]>();
    for (const task of withHistory) {
        for (const [status, hours] of Object.entries(task.historySummary!.timeInStatus)) {
            const values = byStatus.get(status) || [];
            values.push(hours);
            byStatus.set(status, values);
        }
    }
    const statuses = [...byStatus].map(([status, values]) => {
        values.sort((a, b) => a - b);
        const count = values.length;
        const median = (values[Math.floor(count / 2)] + values[Math.floor((count - 1) / 2)]) / 2;
        return { status, count, median, mean: values.reduce((sum, hours) => sum + hours, 0) / count };
    }).sort((a, b) => b.median - a.median);
    const top = withHistory.filter(task => task.historySummary![metric] > 0)
        .sort((a, b) => b.historySummary![metric] - a.historySummary![metric]).slice(0, 5);
    if (!withHistory.length) return <Empty>Durum süreleri için Jira kayıtlarını eşitleyin.</Empty>;
    return (
        <div className="grid gap-3">
            <div className="overflow-x-auto">
                <table className="w-full text-sm"><thead><tr>
                    <th className="text-left">Durum</th><th className="text-right">Ortanca</th><th className="text-right">Ortalama</th><th className="text-right">Kayıt</th>
                </tr></thead><tbody>
                    {statuses.map(({ status, count, median, mean }) => <tr key={status}>
                        <td className="py-1">{status}</td><td className="text-right whitespace-nowrap">{fmt(median)} sa</td>
                        <td className="text-right whitespace-nowrap">{fmt(mean)} sa</td><td className="text-right">{count}</td>
                    </tr>)}
                </tbody></table>
            </div>
            <label className="text-sm grid gap-1">En çok değişen kayıtlar
                <select className="m-input" value={metric} onChange={e => setMetric(e.target.value as typeof metric)}>
                    <option value="reopenCount">Yeniden açılan</option>
                    <option value="assigneeChanges">Atananı değişen</option>
                    <option value="dueDateShifts">Termini kayan</option>
                </select>
            </label>
            {top.length ? <ul className="m-0 p-0 list-none">{top.map(task => <li key={task.id}>
                <button type="button" className="m-row-link w-full text-left p-1 flex gap-2 justify-between" onClick={() => env.onViewTask(task)}>
                    <span className="text-sm min-w-0 truncate">{task.jiraId} · {task.name}</span>
                    <span className="text-sm m-tabular">{task.historySummary![metric]}</span>
                </button>
            </li>)}</ul> : <span className="text-sm m-text-3">Bu türde değişen kayıt yok.</span>}
        </div>
    );
};

const EffortStatusWidget: React.FC<{ tasks: Task[]; env: WidgetEnv }> = ({ tasks, env }) => {
    const [dimension, setDimension] = useState<TimeTrackingGroup>('project');
    const totals = totalTimeTracking(tasks);
    if (!totals.tracked) return <Empty>Jira zaman takibi için veri bulunamadı.</Empty>;
    const over = tasks.map(task => ({ task, data: taskTimeTracking(task) }))
        .filter(row => row.data.overrun || (row.data.variance ?? 0) > 0)
        .sort((a, b) => (b.data.variance ?? 0) - (a.data.variance ?? 0)).slice(0, 5);
    const max = Math.max(1, totals.comparableOriginal, totals.comparableEac);
    const groups = dimension === 'project' ? [] : groupTimeTracking([{ ...env.project, tasks }], dimension).filter(g => g.tracked);
    return <div className="flex flex-col gap-2">
        {totals.comparable > 0 ? <>
            {[{ label: 'İlk tahmin', value: totals.comparableOriginal }, { label: 'EAC', value: totals.comparableEac }].map(b => (
                <div key={b.label} className="grid grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-2 text-[13px] m-text-2">
                    <span>{b.label}</span>
                    <span aria-hidden="true" className="h-2 m-fill rounded-full overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${b.value / max * 100}%`, background: b.label === 'EAC' && totals.comparableEac > totals.comparableOriginal ? 'var(--m-bad)' : 'var(--m-accent)' }} /></span>
                    <span className="m-tabular">{fmt(b.value)} sa</span>
                </div>
            ))}
            <p className="m-0 text-[12px] m-text-3">{totals.comparable} karşılaştırılabilir kayıt</p>
        </> : <p className="m-0 text-[13px] m-text-3">Karşılaştırma için tahmin, harcanan ve kalan süre gerekli.</p>}
        <label className="flex items-center flex-wrap gap-2 text-[13px] m-text-2">
            Kırılım <select className="m-input !w-auto" value={dimension} onChange={e => setDimension(e.target.value as TimeTrackingGroup)}>
                <option value="project">Proje</option><option value="release">Sürüm</option><option value="component">Bileşen</option><option value="person">Atanan kişi</option>
            </select>
        </label>
        {groups.length > 0 && <ul className="m-0 p-0 list-none max-h-44 overflow-auto">
            {groups.map(g => <li key={g.key} className="text-[13px] border-t m-sep py-1.5 break-words"><b className="m-text">{g.label}</b> <span className="m-text-2">· Tahmin {fmt(g.original)} sa · Harcanan {fmt(g.spent)} sa · Kalan {fmt(g.remaining)} sa</span></li>)}
        </ul>}
        {over.length > 0 && <div><p className="m-0 font-semibold text-[13px] m-text">En çok aşan kayıtlar</p>
            {over.map(({ task, data }) => <button key={task.id} type="button" className="m-row-link flex items-center justify-between gap-2 py-1.5 text-[13px]" onClick={() => env.onViewTask(task)}>
                <span className="truncate">{[task.jiraId, task.name].filter(Boolean).join(' · ')}</span>
                <span className="m-ink-bad shrink-0">{(data.variance ?? 0) > 0 ? `+${fmt(data.variance!)} sa` : 'Aşım'}</span>
            </button>)}
        </div>}
    </div>;
};

// ------------------------------------------------------------------ yönlendirici
export const WidgetBody: React.FC<{ w: DashboardWidget; env: WidgetEnv }> = ({ w, env }) => {
    const tasks = useMemo(() => applyFilter(env.project.tasks, w.config?.filter), [env.project.tasks, w.config?.filter]);
    switch (w.type) {
        case 'metric': return <MetricWidget w={w} tasks={tasks} env={env} />;
        case 'kpi': return <KpiWidget w={w} env={env} />;
        case 'progress': return <ProgressWidget w={w} tasks={tasks} env={env} />;
        case 'statusMix': return <StatusMixWidget tasks={tasks} env={env} />;
        case 'breakdown': return <BreakdownWidget w={w} tasks={tasks} env={env} />;
        case 'milestones': return <MilestonesWidget w={w} tasks={tasks} env={env} />;
        case 'workPackages': return <WorkPackagesWidget w={w} tasks={tasks} env={env} />;
        case 'pivot': return <PivotWidget w={w} tasks={tasks} env={env} />;
        case 'burnup': return <BurnupWidget w={w} tasks={tasks} env={env} />;
        case 'team': return <TeamWidget w={w} tasks={tasks} env={env} />;
        case 'deadlines': return <DeadlinesWidget w={w} tasks={tasks} env={env} />;
        case 'risks': return <RisksWidget w={w} env={env} />;
        case 'sprint': return <SprintWidget env={env} />;
        case 'worklog': return <WorklogWidget w={w} tasks={tasks} env={env} />;
        case 'jiraBottlenecks': return <JiraBottlenecks tasks={tasks} env={env} />;
        case 'effortStatus': return <EffortStatusWidget tasks={tasks} env={env} />;
        case 'activity': return <ActivityWidget w={w} tasks={tasks} env={env} />;
        case 'note': return <NoteWidget w={w} />;
    }
};

/** Bileşenin varsayılan başlığı (kullanıcı başlık vermediyse) */
export const widgetTitle = (w: DashboardWidget, project: Project): string => {
    if (w.title?.trim()) return w.title.trim();
    const c = w.config || {};
    switch (w.type) {
        case 'metric': return METRIC_BY_KEY.get(c.metric || 'progress')?.label || 'Gösterge';
        case 'kpi': return (project.kpis || []).find(k => k.id === c.kpiId)?.name || (project.kpis || [])[0]?.name || 'Projeye özel gösterge';
        case 'progress': return 'İlerleme';
        case 'statusMix': return 'Durum dağılımı';
        case 'breakdown': return c.dim ? `${dimLabel(c.dim)} kırılımı` : 'Kırılım';
        case 'milestones': return c.dim ? `Kilometre taşları · ${dimLabel(c.dim).replace(/^Etiket: /, '')}` : 'Kilometre taşları';
        case 'workPackages': return 'İş paketleri';
        case 'pivot': return `${dimLabel(c.dim || { kind: 'priority' }).replace(/^Etiket: /, '')} × ${dimLabel(c.dim2 || { kind: 'category' }).replace(/^Etiket: /, '')}`;
        case 'burnup': return 'Plan / gerçekleşen';
        case 'team': return c.dim?.kind === 'unit' ? 'Birim yükü' : 'Ekip yükü';
        case 'deadlines': return 'Geciken ve yaklaşan';
        case 'risks': return 'Riskler';
        case 'sprint': return 'Şu anki sprint';
        case 'worklog': return 'Kim ne kadar çalıştı';
        case 'jiraBottlenecks': return 'Jira darboğazları';
        case 'effortStatus': return 'Efor durumu';
        case 'activity': return 'Son değişiklikler';
        case 'note': return 'Not';
    }
};

export { isDone };
