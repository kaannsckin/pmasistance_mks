import React, { useMemo, useState } from 'react';
import { Allocation, Person, Project, TitleDef } from '../types';
import { MONTHS_TR } from '../utils/allocations';
import { fmtTL } from '../utils/costing';
import {
    buildForecast,
    FORECAST_DIM_LABELS,
    FORECAST_METHOD_LABELS,
    ForecastDim,
    ForecastMethod,
    ForecastRow,
} from '../utils/forecast';

interface Props {
    allocations: Allocation[];
    people: Person[];
    projects: Project[];
    titles: TitleDef[];
    year: number;
}

const fmtAA = (v: number): string => (Math.round(v * 100) / 100).toString().replace('.', ',');

const ForecastView: React.FC<Props> = ({ allocations, people, projects, titles, year }) => {
    const [method, setMethod] = useState<ForecastMethod>('movingAvg');
    const [window, setWindow] = useState(3);
    const [dim, setDim] = useState<ForecastDim>('project');

    const fc = useMemo(
        () => buildForecast({ allocations, people, projects, titles }, { year, method, window, dim }),
        [allocations, people, projects, titles, year, method, window, dim],
    );

    const t = fc.total;
    const hasActual = fc.cutoffMonth > 0;
    const varPos = t.variance > 0.005; // EAC planı aşıyor mu

    return (
        <div className="space-y-4">
            {/* Kontroller */}
            <div className="flex flex-wrap items-end gap-3 bg-white dark:bg-gray-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-700">
                <label className="text-[11px] text-gray-500 dark:text-gray-300">
                    <span className="block mb-1 font-semibold">Yöntem</span>
                    <select value={method} onChange={e => setMethod(e.target.value as ForecastMethod)} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none">
                        {(Object.keys(FORECAST_METHOD_LABELS) as ForecastMethod[]).map(m => (
                            <option key={m} value={m}>{FORECAST_METHOD_LABELS[m]}</option>
                        ))}
                    </select>
                </label>
                {method === 'movingAvg' && (
                    <label className="text-[11px] text-gray-500 dark:text-gray-300">
                        <span className="block mb-1 font-semibold">Pencere (ay)</span>
                        <input type="number" min={2} max={6} value={window} onChange={e => setWindow(Math.max(2, Number(e.target.value) || 3))} className="w-20 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none" />
                    </label>
                )}
                <label className="text-[11px] text-gray-500 dark:text-gray-300">
                    <span className="block mb-1 font-semibold">Kırılım</span>
                    <select value={dim} onChange={e => setDim(e.target.value as ForecastDim)} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none">
                        {(Object.keys(FORECAST_DIM_LABELS) as ForecastDim[]).map(d => (
                            <option key={d} value={d}>{FORECAST_DIM_LABELS[d]}</option>
                        ))}
                    </select>
                </label>
                <p className="text-[11px] text-gray-400 ml-auto self-center max-w-md">
                    {hasActual
                        ? `Gerçekleşen ${MONTHS_TR[fc.cutoffMonth - 1]} ayına kadar; sonrası öngörü.`
                        : 'Gerçekleşen veri yok — öngörü plana göre yapılıyor.'}
                </p>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Gerçekleşen (bugüne dek)" value={`${fmtAA(t.ytd)} AA`} accent="#0ea5e9" />
                <Kpi label="Yıl Sonu Tahmini (EAC)" value={`${fmtAA(t.eac)} AA`} accent="var(--app-primary)" sub={`Öngörü kalan: ${fmtAA(t.remaining)} AA`} />
                <Kpi label="Plana Göre Sapma" value={`${varPos ? '+' : ''}${fmtAA(t.variance)} AA`} accent={varPos ? '#dc2626' : '#16a34a'} sub={`Plan: ${fmtAA(t.planTotal)} AA`} />
                <Kpi label="Yıl Sonu Tahmini Maliyet" value={t.costable ? fmtTL(t.costEac) : '—'} accent="#16a34a" sub={fc.uncostedEacAA > 0 ? `${fmtAA(fc.uncostedEacAA)} AA maliyetlenemedi` : 'ünvan oranlarıyla'} />
            </div>

            {/* Grafik */}
            <div className="bg-white dark:bg-gray-800/60 rounded-xl px-4 py-4 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Aylık İş Yükü — Gerçekleşen & Öngörü</h3>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400">
                        <span><i className="fa-solid fa-minus" style={{ color: 'var(--app-primary)' }}></i> Gerçekleşen</span>
                        <span><i className="fa-solid fa-ellipsis" style={{ color: 'var(--app-primary)' }}></i> Öngörü</span>
                        <span><i className="fa-solid fa-minus text-gray-400"></i> Plan</span>
                    </div>
                </div>
                <ForecastChart row={t} cutoffMonth={fc.cutoffMonth} />
            </div>

            {/* Kırılım tablosu */}
            <div className="bg-white dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{FORECAST_DIM_LABELS[dim]} Bazında Yıl Sonu Tahmini</h3>
                </div>
                <div className="overflow-x-auto max-h-[46vh]">
                    <table className="w-full">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">{FORECAST_DIM_LABELS[dim]}</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400">Gerçekleşen</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400">Öngörü (kalan)</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400">EAC (AA)</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400">Plan (AA)</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400">Δ</th>
                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400">EAC (₺)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                            {fc.rows.map(r => (
                                <tr key={r.key}>
                                    <td className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
                                        {r.label}
                                        {r.sublabel && <span className="ml-1 text-[10px] text-gray-400">{r.sublabel}</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums">{fmtAA(r.ytd)}</td>
                                    <td className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums">{fmtAA(r.remaining)}</td>
                                    <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums" style={{ color: 'var(--app-primary)' }}>{fmtAA(r.eac)}</td>
                                    <td className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums">{fmtAA(r.planTotal)}</td>
                                    <td className={`px-3 py-2 text-right text-xs font-semibold tabular-nums ${r.variance > 0.005 ? 'text-red-500' : r.variance < -0.005 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                        {r.variance > 0 ? '+' : ''}{fmtAA(r.variance)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-xs text-gray-600 dark:text-gray-300 tabular-nums">{r.costable ? fmtTL(r.costEac) : '—'}</td>
                                </tr>
                            ))}
                            {fc.rows.length === 0 && (
                                <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-gray-400">Bu yıl için tahsis verisi yok.</td></tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                                <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-200">Portföy</td>
                                <td className="px-3 py-2 text-right text-xs tabular-nums">{fmtAA(t.ytd)}</td>
                                <td className="px-3 py-2 text-right text-xs tabular-nums">{fmtAA(t.remaining)}</td>
                                <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: 'var(--app-primary)' }}>{fmtAA(t.eac)}</td>
                                <td className="px-3 py-2 text-right text-xs tabular-nums">{fmtAA(t.planTotal)}</td>
                                <td className={`px-3 py-2 text-right text-xs tabular-nums ${varPos ? 'text-red-500' : 'text-emerald-600'}`}>{t.variance > 0 ? '+' : ''}{fmtAA(t.variance)}</td>
                                <td className="px-3 py-2 text-right text-xs tabular-nums">{t.costable ? fmtTL(t.costEac) : '—'}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

const Kpi: React.FC<{ label: string; value: string; accent: string; sub?: string }> = ({ label, value, accent, sub }) => (
    <div className="bg-white dark:bg-gray-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-700 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accent }} />
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
        <div className="text-xl font-bold text-gray-800 dark:text-white mt-0.5">{value}</div>
        {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
);

/** 12 aylık gerçekleşen (düz) → öngörü (kesikli) + plan (ince) çizgi grafiği. */
const ForecastChart: React.FC<{ row: ForecastRow; cutoffMonth: number }> = ({ row, cutoffMonth }) => {
    const W = 720, H = 240, padL = 34, padR = 12, padT = 12, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    const vals = row.months.flatMap(m => [m.forecast, m.plan]);
    const maxY = Math.max(0.5, ...vals) * 1.1;
    const x = (i: number) => padL + (iw * i) / 11;
    const y = (v: number) => padT + ih - (ih * v) / maxY;
    const cutoffIdx = cutoffMonth - 1;

    const pts = row.months.map((m, i) => ({ i, fx: x(i), fy: y(m.forecast), py: y(m.plan) }));
    const line = (sel: (p: typeof pts[number]) => number, from: number, to: number) =>
        pts.slice(from, to + 1).map((p, k) => `${k === 0 ? 'M' : 'L'}${p.fx.toFixed(1)},${sel(p).toFixed(1)}`).join(' ');

    const solidEnd = cutoffIdx >= 0 ? cutoffIdx : 0;
    const yTicks = 4;

    return (
        <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 520 }} preserveAspectRatio="xMidYMid meet">
                {/* y gridlines */}
                {Array.from({ length: yTicks + 1 }).map((_, k) => {
                    const v = (maxY * k) / yTicks;
                    const yy = y(v);
                    return (
                        <g key={k}>
                            <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={0.5} />
                            <text x={padL - 6} y={yy + 3} textAnchor="end" className="fill-gray-400" fontSize={9}>{(Math.round(v * 10) / 10).toString().replace('.', ',')}</text>
                        </g>
                    );
                })}
                {/* cutoff divider */}
                {cutoffMonth > 0 && cutoffMonth < 12 && (
                    <line x1={x(cutoffIdx)} y1={padT} x2={x(cutoffIdx)} y2={padT + ih} stroke="currentColor" className="text-gray-300 dark:text-gray-600" strokeWidth={1} strokeDasharray="3 3" />
                )}
                {/* plan line */}
                <path d={line(p => p.py, 0, 11)} fill="none" stroke="currentColor" className="text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
                {/* actual (solid) */}
                {cutoffIdx >= 0 && (
                    <path d={line(p => p.fy, 0, solidEnd)} fill="none" stroke="var(--app-primary)" strokeWidth={2.5} strokeLinejoin="round" />
                )}
                {/* forecast (dashed) */}
                <path d={line(p => p.fy, solidEnd, 11)} fill="none" stroke="var(--app-primary)" strokeWidth={2.5} strokeDasharray="5 4" strokeLinejoin="round" opacity={0.85} />
                {/* actual points */}
                {pts.map(p => (
                    <circle key={p.i} cx={p.fx} cy={p.fy} r={2.6} fill={p.i <= cutoffIdx ? 'var(--app-primary)' : '#fff'} stroke="var(--app-primary)" strokeWidth={1.5} />
                ))}
                {/* month labels */}
                {pts.map(p => (
                    <text key={p.i} x={p.fx} y={H - 8} textAnchor="middle" className="fill-gray-400" fontSize={9}>{MONTHS_TR[p.i]}</text>
                ))}
            </svg>
        </div>
    );
};

export default ForecastView;
