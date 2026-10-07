import React from 'react';
import { SimResult } from '../../../utils/planning/monteCarlo';
import { quantileSorted } from '../../../utils/planning/random';
import { dateAtOffset } from '../../../utils/planning/simulationInput';

/**
 * Teslim günü dağılımı: sütunlar her teslim gününün kaç tekrarda çıktığını,
 * çizgi birikimli olasılığı (o güne kadar bitme) gösterir. P80 sonrası açık
 * renkte (taahhüt için riskli bölge). Metinler HTML'de kalır; dar ekranda da
 * okunur.
 */

export interface ChartMarker {
    key: string;
    label: string;
    offset: number;
    tone: 'accent' | 'ok' | 'warn' | 'bad' | 'hold';
}

const fmt = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

const SimChart: React.FC<{ result: SimResult; start: string; markers: ChartMarker[] }> = ({ result, start, markers }) => {
    const { sorted, release } = result;
    if (!sorted.length) return null;
    // Görüntü aralığı: en erken → %99'luk dilim; ötesindeki birkaç uç tekrar son sütunda toplanır
    const first = sorted[0];
    const cap = Math.max(first, Math.ceil(quantileSorted(sorted, 0.99)));
    const binWidth = Math.max(1, Math.ceil((cap - first + 1) / 40));
    const nBins = Math.floor((cap - first) / binWidth) + 1;
    const bins: { day: number; count: number }[] = Array.from({ length: nBins }, (_, i) => ({ day: first + i * binWidth, count: 0 }));
    for (let i = 0; i < sorted.length; i++) bins[Math.min(nBins - 1, Math.floor((sorted[i] - first) / binWidth))].count++;
    const tailFrom = first + nBins * binWidth;
    let tail = 0;
    for (let i = sorted.length - 1; i >= 0 && sorted[i] >= tailFrom; i--) tail++;
    const span = nBins * binWidth;
    const max = Math.max(...bins.map(b => b.count));
    const total = bins.reduce((s, b) => s + b.count, 0);
    let acc = 0;
    const cum = bins.map((b, i) => {
        acc += b.count;
        return `${((i + 1) / bins.length) * 100},${100 - (acc / total) * 100}`;
    });
    const x = (offset: number) => Math.min(100, Math.max(0, ((offset - first + 0.5) / span) * 100));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(q => Math.round(first + q * (span - 1)));
    const lastLabel = tail > 0 ? `Son sütun ${fmt(dateAtOffset(start, bins[nBins - 1].day))} ve sonrasını da içerir (${tail} tekrar)` : '';
    const p80 = release.p80;
    const summary = `Teslim dağılımı: en erken ${fmt(dateAtOffset(start, release.min))}, en geç ${fmt(dateAtOffset(start, release.max))}`;

    return (
        <figure className="m-0 flex flex-col gap-2" aria-label={summary}>
            <div className="relative h-[180px] mt-6" role="img" aria-label={summary}>
                <div className="absolute inset-0 flex items-end gap-[2px]">
                    {bins.map(b => (
                        <div
                            key={b.day}
                            className="flex-1 rounded-t-[3px]"
                            title={`${fmt(dateAtOffset(start, b.day))}${b === bins[nBins - 1] && tail ? ' ve sonrası' : ''}: ${b.count} tekrar`}
                            style={{ height: `${max ? (b.count / max) * 100 : 0}%`, minHeight: b.count ? 2 : 0, background: b.day <= p80 ? 'var(--m-accent)' : 'var(--m-accent-tint)' }}
                        />
                    ))}
                </div>
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <polyline points={`0,100 ${cum.join(' ')}`} fill="none" stroke="var(--m-label-2)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                </svg>
                {markers.map(m => (
                    <div key={m.key} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${x(m.offset)}%` }}>
                        <div className="absolute top-0 bottom-0 border-l-2 border-dashed" style={{ borderColor: `var(--m-${m.tone})` }} />
                        <span className={`absolute -top-6 -translate-x-1/2 whitespace-nowrap px-1.5 h-5 inline-flex items-center rounded-full text-[11px] font-semibold m-tone-${m.tone}`}>{m.label}</span>
                    </div>
                ))}
            </div>
            <div className="flex justify-between text-[12px] m-text-3 m-tabular" aria-hidden="true">
                {ticks.map((t, i) => <span key={i}>{fmt(dateAtOffset(start, t))}</span>)}
            </div>
            <figcaption className="text-[13px] m-text-3 flex flex-wrap gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: 'var(--m-accent)' }} />P80'e kadar</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: 'var(--m-accent-tint)' }} />P80 sonrası</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2" style={{ borderColor: 'var(--m-label-2)' }} />O güne kadar bitme olasılığı</span>
                {lastLabel && <span>{lastLabel}</span>}
            </figcaption>
        </figure>
    );
};

export default SimChart;
