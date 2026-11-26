import React, { useMemo, useState } from 'react';
import { DashboardWidget, Task } from '../../../types';
import { categoryName, computePocScores, pct, scopeTaskIds, signedPoints, syncLabel } from '../../../utils/gibPoc';
import type { WidgetEnv } from './DashboardWidgets';

/**
 * PoC skoru: İlk · Doğrulanmış · Bugün · Olası ve kalan açığın kategorilere
 * dağılımı (katkı köprüsü). Katkılar sırasızdır; toplamları 100 − Olası.
 * "Bugün" görevlerin son Jira eşitlemesindeki durumundan hesaplanır.
 */

interface Step { key: string; label: string; value: number; color: string; hint: string; tasks?: Task[] }

const COLORS = {
    initial: 'var(--viz-1)',
    verified: 'var(--viz-2)',
    today: 'var(--viz-3)',
    scope: 'var(--viz-4)',
    cats: ['var(--viz-5)', 'var(--viz-6)', 'var(--viz-7)', 'var(--viz-8)'],
    other: 'var(--viz-track)',
};

export const PocScoreWidget: React.FC<{ w: DashboardWidget; env: WidgetEnv }> = ({ w, env }) => {
    const project = env.project;
    const s = useMemo(() => computePocScores(project, w.config?.pocScope), [project, w.config?.pocScope]);
    const [exporting, setExporting] = useState<string | null>(null);
    const exportPpt = async () => {
        setExporting('Sunum hazırlanıyor…');
        try {
            const { exportGibReportToPpt } = await import('../../../utils/gibReportPpt');
            await exportGibReportToPpt(project, { scope: w.config?.pocScope });
            setExporting(null);
        } catch (e) {
            setExporting(`Sunum oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`);
        }
    };
    if (!s) return <p className="m-0 py-6 text-center text-[14px] m-text-3">Bu projede PoC test listesi yok. PoC Bulgu Takip Excel'i aktarılınca İlk, Doğrulanmış, Bugün ve Olası skorlar burada görünür.</p>;

    const scopeName = s.scope.map(categoryName).join(' + ') || 'kapsam seçilmedi';
    const scopeIds = scopeTaskIds(project.tasks, s.scope);
    const tasksWith = (label: string) => project.tasks.filter(t => (t.labels || []).includes(label));
    const steps: Step[] = [
        { key: 'initial', label: 'İlk değerlendirme', value: s.initial, color: COLORS.initial, hint: 'GİB PoC sonucu' },
        { key: 'verified', label: 'GİB doğrulaması', value: s.verified - s.initial, color: COLORS.verified, hint: 'Güncel Sonuç ile değişen' },
        { key: 'today', label: 'Geliştirme süreci', value: s.today - s.verified, color: COLORS.today, hint: 'Jira durumu × katsayı' },
        { key: 'scope', label: scopeName, value: s.possible - s.today, color: COLORS.scope, hint: 'Olası kapsamı tamamlanınca', tasks: project.tasks.filter(t => scopeIds.has(t.id)) },
        ...s.contributions.map((c, i) => ({ key: c.label, label: c.name, value: c.value, color: COLORS.cats[i % COLORS.cats.length], hint: `${c.items} madde · tek başına ${signedPoints(c.alone)}`, tasks: tasksWith(c.label) })),
        ...(s.uncategorized > 0.005 ? [{ key: 'other', label: 'Kategorisiz', value: s.uncategorized, color: COLORS.other, hint: 'Planlama etiketi olmayan maddeler' }] : []),
    ];
    const tiles = [
        { label: 'İlk', value: s.initial, sub: 'GİB raporu' },
        { label: 'Doğrulanmış', value: s.verified, sub: signedPoints(s.verified - s.initial) },
        { label: 'Bugün', value: s.today, sub: signedPoints(s.today - s.verified) },
        { label: 'Olası', value: s.possible, sub: `${signedPoints(s.possible - s.today)} · ${scopeName}` },
    ];
    const bar = steps.filter(x => x.value > 0.005);
    return (
        <div className="flex flex-col gap-3">
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                {tiles.map(t => (
                    <div key={t.label} className="rounded-xl m-fill-2 px-3 py-2 min-w-0">
                        <div className="text-[12.5px] m-text-3">{t.label}</div>
                        <div className="text-[24px] leading-tight font-semibold m-tabular m-text">{pct(t.value)}</div>
                        <div className="text-[12px] m-text-3 truncate" title={t.sub}>{t.sub}</div>
                    </div>
                ))}
            </div>
            <div className="flex h-4 rounded-full overflow-hidden" style={{ background: 'var(--viz-track)' }} role="img"
                aria-label={`Skor köprüsü: ${steps.map(x => `${x.label} ${signedPoints(x.value)}`).join(', ')}; toplam 100`}>
                {bar.map(x => <span key={x.key} title={`${x.label}: ${signedPoints(x.value)} puan`} style={{ width: `${x.value}%`, background: x.color }} className="h-full border-r last:border-r-0" />)}
            </div>
            <ul className="m-0 p-0 list-none flex flex-col">
                {steps.map(x => (
                    <li key={x.key} className="flex items-center gap-2 py-1 text-[13.5px] border-t m-sep first:border-t-0" style={{ borderTopStyle: 'solid' }}>
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: x.color }} aria-hidden="true" />
                        {x.tasks?.length
                            ? <button type="button" className="m-link text-left truncate bg-transparent border-0 p-0 cursor-pointer m-text" onClick={() => env.onDrill(`PoC · ${x.label}`, x.tasks!)}>{x.label}</button>
                            : <span className="truncate m-text">{x.label}</span>}
                        <span className="text-[12px] m-text-3 truncate flex-1" title={x.hint}>{x.hint}</span>
                        <span className="m-tabular font-semibold m-text">{x.key === 'initial' ? pct(x.value) : signedPoints(x.value)}</span>
                    </li>
                ))}
            </ul>
            <div className="flex items-center gap-2 text-[12.5px] m-text-3">
                <span className="flex-1 min-w-0">Jira verisi: {syncLabel(s.syncAt)} · {s.tests} test, {s.evaluated} paydada · zorunlu açık {s.mandatoryOpen} · katkılar sırasız, toplamı {signedPoints(100 - s.possible)}{exporting ? ` · ${exporting}` : ''}</span>
                <button type="button" className="m-btn m-btn-plain !min-h-[30px] !px-2 text-[13px]" disabled={exporting === 'Sunum hazırlanıyor…'} onClick={() => { void exportPpt(); }}>GİB raporu (PPTX)</button>
            </div>
        </div>
    );
};
