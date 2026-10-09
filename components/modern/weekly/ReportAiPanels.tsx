import React, { useMemo, useState } from 'react';
import { WorkspaceData } from '../../../types';
import { GROUP_BY_LABELS, ReportAiGroupBy, reportAiStats } from '../../../utils/ai/reportAiStats';
import { Card, rowSep } from '../ui';

/**
 * Haftalık rapor › Ayarlar › rapor AI kartları (yalnız PYB destek): öneri
 * günlüğünden kabul oranı ve gruplu ölçüler.
 */

const pct = (v: number | null) => (v === null ? '—' : `%${Math.round(v * 100)}`);
const dec = (v: number | null) => (v === null ? '—' : String(v).replace('.', ','));

const PERIODS: { key: string; label: string; days: number | null }[] = [
    { key: '30', label: 'Son 30 gün', days: 30 },
    { key: '90', label: 'Son 90 gün', days: 90 },
    { key: 'all', label: 'Tümü', days: null },
];

/** F1: öneri günlüğünden gruplu kabul ölçüleri */
export const ReportAiQualityCard: React.FC<{ workspace: WorkspaceData }> = ({ workspace }) => {
    const [by, setBy] = useState<ReportAiGroupBy>('department');
    const [period, setPeriod] = useState('90');
    const days = PERIODS.find(p => p.key === period)?.days ?? null;
    const from = days === null ? undefined : new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const rows = useMemo(() => reportAiStats(workspace, { by, from }), [workspace, by, from]);
    return (
        <Card title="Rapor AI kalitesi" subtitle="AI taslak önerilerinin ne kadarının uygulandığı, gönderime kadar aynen kaldığı, düzenlendiği ya da silindiği; AI'lı raporların iade oranı ve format sorunları." labelledBy="wr-aiq">
            <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-[14px] m-text-2">Gruplama
                    <select className="m-input !w-auto" value={by} onChange={e => setBy(e.target.value as ReportAiGroupBy)}>
                        {(Object.keys(GROUP_BY_LABELS) as ReportAiGroupBy[]).map(k => <option key={k} value={k}>{GROUP_BY_LABELS[k]}</option>)}
                    </select>
                </label>
                <select aria-label="Dönem" className="m-input !w-auto" value={period} onChange={e => setPeriod(e.target.value)}>
                    {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
            </div>
            {rows.length === 0 ? (
                <p className="m-0 text-[14px] m-text-3">Bu dönemde AI önerisi kullanılmadı. PY'ler rapor düzenleyicide "Taslak öner"i kullandıkça ölçüler burada birikir.</p>
            ) : (
                <div className="relative overflow-x-auto -mx-1">
                    <table className="w-full min-w-[760px] text-[14px] border-collapse">
                        <thead><tr className="text-left m-text-3 text-[13px]">
                            <th className="font-semibold py-2 px-1">{GROUP_BY_LABELS[by]}</th>
                            <th className="font-semibold py-2 px-1 text-right" title="Uygulanan + vazgeçilen + hatalı">Öneri</th>
                            <th className="font-semibold py-2 px-1 text-right">Uygulandı</th>
                            <th className="font-semibold py-2 px-1 text-right">Vazgeçildi</th>
                            <th className="font-semibold py-2 px-1 text-right" title="AI taslaklı gönderilen rapor">Gönderim</th>
                            <th className="font-semibold py-2 px-1 text-right" title="AI maddelerinin gönderimde aynen kalma oranı">Aynen kaldı</th>
                            <th className="font-semibold py-2 px-1 text-right">Düzenlendi</th>
                            <th className="font-semibold py-2 px-1 text-right">Silindi</th>
                            <th className="font-semibold py-2 px-1 text-right">İade</th>
                            <th className="font-semibold py-2 px-1 text-right" title="Gönderimde rapor başına ortalama format hatası · uyarısı">Hata · uyarı</th>
                        </tr></thead>
                        <tbody>{rows.map((r, i) => { const sep = rowSep(i); return (
                            <tr key={r.key || 'none'} className={sep.className} style={sep.style}>
                                <td className="py-2 px-1 m-text">{r.label}</td>
                                <td className="py-2 px-1 text-right m-tabular">{r.suggestions}</td>
                                <td className="py-2 px-1 text-right m-tabular">{pct(r.applyRate)}</td>
                                <td className="py-2 px-1 text-right m-tabular">{pct(r.discardRate)}{r.errorRate ? <span className="m-ink-bad"> · {pct(r.errorRate)} hata</span> : null}</td>
                                <td className="py-2 px-1 text-right m-tabular">{r.submitted}</td>
                                <td className="py-2 px-1 text-right m-tabular font-semibold">{pct(r.keptRate)}</td>
                                <td className="py-2 px-1 text-right m-tabular">{pct(r.editedRate)}</td>
                                <td className="py-2 px-1 text-right m-tabular">{pct(r.deletedRate)}</td>
                                <td className={`py-2 px-1 text-right m-tabular ${r.returnRate ? 'm-ink-warn' : ''}`}>{pct(r.returnRate)}</td>
                                <td className="py-2 px-1 text-right m-tabular">{dec(r.avgLintErrors)} · {dec(r.avgLintWarnings)}</td>
                            </tr>
                        ); })}</tbody>
                    </table>
                </div>
            )}
            <p className="m-0 text-[12.5px] m-text-3">Günlükte rapor metni tutulmaz; yalnız sayılar. Aynı rapor iade sonrası yeniden gönderildiyse son gönderimi sayılır.</p>
        </Card>
    );
};
