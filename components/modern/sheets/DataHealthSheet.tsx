import React, { useMemo, useState } from 'react';
import { WorkspaceData } from '../../../types';
import { analyzeDataHealth, CATEGORY_LABELS, HealthCategory, HealthFix, HealthSeverity } from '../../../utils/dataHealth';
import { Icon } from '../icons';
import { rowSep, Sheet } from '../ui';

const SEV: Record<HealthSeverity, { label: string; tone: string; ink: string; icon: string }> = {
    error: { label: 'Hata', tone: 'm-tone-bad', ink: 'm-ink-bad', icon: 'alert' },
    warn: { label: 'Uyarı', tone: 'm-tone-warn', ink: 'm-ink-warn', icon: 'info' },
    info: { label: 'Bilgi', tone: 'm-tone-hold', ink: 'm-text-2', icon: 'info' },
};
const ORDER: HealthSeverity[] = ['error', 'warn', 'info'];

/** Veri sağlığı denetimi: yetim tahsis, eşleşmeyen atama, mükerrer kayıt, eksik alan; tek tıkla düzeltme */
export const DataHealthPanel: React.FC<{ workspace: WorkspaceData; onApplyFix: (fix: HealthFix) => void }> = ({ workspace, onApplyFix }) => {
    const report = useMemo(() => analyzeDataHealth(workspace), [workspace]);
    const [sev, setSev] = useState<HealthSeverity | null>(null);
    const [cat, setCat] = useState<HealthCategory | null>(null);
    const cats = (Object.keys(CATEGORY_LABELS) as HealthCategory[]).filter(c => report.byCategory[c] > 0);
    const shown = report.issues.filter(i => (!sev || i.severity === sev) && (!cat || i.category === cat));

    return (
        <>
            <section aria-label="Özet" className="grid grid-cols-3 gap-3">
                {ORDER.map(s => {
                    const active = sev === s;
                    return (
                        <button key={s} type="button" aria-pressed={active} onClick={() => setSev(active ? null : s)}
                            className="m-surface m-row-link rounded-2xl px-4 py-3 flex flex-col items-start gap-0.5"
                            style={active ? { boxShadow: `inset 0 0 0 2px var(--m-${s === 'error' ? 'bad' : s === 'warn' ? 'warn' : 'hold'})` } : undefined}>
                            <span className="flex items-center gap-1.5 text-[14px] m-text-2"><Icon name={SEV[s].icon} size={15} />{SEV[s].label}</span>
                            <span className={`text-[28px] font-bold leading-tight m-tabular ${report.counts[s] ? SEV[s].ink : 'm-text'}`}>{report.counts[s]}</span>
                        </button>
                    );
                })}
            </section>

            {report.issues.length === 0 ? (
                <div className="m-surface rounded-2xl px-5 py-10 flex flex-col items-center gap-2 text-center">
                    <span className="w-11 h-11 rounded-full m-tone-ok flex items-center justify-center"><Icon name="check" size={22} strokeWidth={2.2} /></span>
                    <span className="text-[17px] font-semibold m-text">Veri temiz görünüyor</span>
                    <span className="text-[15px] m-text-3 max-w-[52ch]">Yetim tahsis, eşleşmeyen atama, mükerrer kayıt ya da eksik alan bulunamadı.</span>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2">
                        {cats.map(c => (
                            <button key={c} type="button" aria-pressed={cat === c} className={`m-pill !min-h-[36px] ${cat === c ? 'is-active' : ''}`} onClick={() => setCat(cat === c ? null : c)}>
                                {CATEGORY_LABELS[c]}<span className="m-text-3 m-tabular">{report.byCategory[c]}</span>
                            </button>
                        ))}
                    </div>
                    {shown.length === 0 ? <p className="m-0 py-6 text-center text-[15px] m-text-3">Bu süzgeçte sorun yok.</p> : (
                        <div className="m-surface rounded-2xl p-1.5">
                            {[...shown].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity)).map((i, k) => {
                                const sep = rowSep(k);
                                return (
                                    <div key={i.id} className={`flex items-start gap-3 px-3 py-3 ${sep.className}`} style={sep.style}>
                                        <span className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[12px] font-semibold flex-none mt-0.5 ${SEV[i.severity].tone}`}><Icon name={SEV[i.severity].icon} size={12} />{SEV[i.severity].label}</span>
                                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <span className="text-[15px] font-semibold m-text">{i.title}</span>
                                            <span className="text-[14px] m-text-3">{i.detail}</span>
                                        </div>
                                        {i.fix && <button type="button" className="m-btn m-btn-gray !min-h-[38px] flex-none" onClick={() => onApplyFix(i.fix!)}>{i.fixLabel || 'Düzelt'}</button>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </>
    );
};

const DataHealthSheet: React.FC<{ workspace: WorkspaceData; onApplyFix: (fix: HealthFix) => void; onClose: () => void }> = ({ workspace, onApplyFix, onClose }) => (
    <Sheet xl title="Veri sağlığı" subtitle="Gerçek veriyle çalışmadan önce tutarsızlıkları bulun ve düzeltin." onClose={onClose}>
        <DataHealthPanel workspace={workspace} onApplyFix={onApplyFix} />
    </Sheet>
);

export default DataHealthSheet;
