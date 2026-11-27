import React, { useEffect, useMemo, useState } from 'react';
import { WbShape } from '../../../types';
import { ELEMENT_GROUPS } from '../../../utils/whiteboard/model';
import { iconSvg, IconLib, loadIconLib, searchIcons } from '../../../utils/whiteboard/icons';
import { svgDataUrl } from '../../../utils/whiteboard/svg';
import { Icon } from '../icons';
import { shapePath } from './WbNodeView';

/**
 * Öğeler paneli (Canva'daki gibi): tüm şekiller ve gruplanmış hazır çizimler
 * (emoji). Tıklanan öğe görünen alanın ortasına eklenir; şekiller sonradan
 * renk, yazı ve boyutla düzenlenir.
 */

export const ALL_SHAPES: { shape: WbShape; label: string }[] = [
    { shape: 'rect', label: 'Dikdörtgen' }, { shape: 'ellipse', label: 'Elips' }, { shape: 'diamond', label: 'Karar' }, { shape: 'triangle', label: 'Üçgen' },
    { shape: 'hexagon', label: 'Altıgen' }, { shape: 'parallelogram', label: 'Paralelkenar (giriş / çıkış)' }, { shape: 'cylinder', label: 'Veri tabanı' }, { shape: 'arrowRight', label: 'Blok ok' },
    { shape: 'callout', label: 'Konuşma balonu' }, { shape: 'cloud', label: 'Bulut' }, { shape: 'star', label: 'Yıldız' }, { shape: 'heart', label: 'Kalp' },
];

/** Şeklin küçük önizlemesi (araç çubukları ve panel) */
export const ShapePreview: React.FC<{ shape: WbShape; size?: number }> = ({ shape, size = 22 }) => {
    const w = size, h = shape === 'arrowRight' || shape === 'parallelogram' || shape === 'callout' ? size * 0.78 : size;
    const d = shapePath(shape, w, h, 1.5);
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ overflow: 'visible' }}>
            {shape === 'ellipse' && <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 1.5} ry={h / 2 - 1.5} fill="none" stroke="currentColor" strokeWidth={1.8} />}
            {shape === 'rect' && <rect x={1.5} y={1.5} width={w - 3} height={h - 3} rx={3} fill="none" stroke="currentColor" strokeWidth={1.8} />}
            {d && <path d={d} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />}
        </svg>
    );
};

export const WbElements: React.FC<{
    onShape: (shape: WbShape) => void;
    onEmoji: (emoji: string) => void;
    /** İkon (Lucide): SVG metni ve adı */
    onIcon: (svg: string, name: string) => void;
    onClose: () => void;
}> = ({ onShape, onEmoji, onIcon, onClose }) => {
    const [group, setGroup] = useState(1);
    const ICONS = ELEMENT_GROUPS.length;
    const [lib, setLib] = useState<IconLib | null>(null);
    const [libError, setLibError] = useState(false);
    const [q, setQ] = useState('');
    const [color, setColor] = useState('#334155');
    useEffect(() => {
        if (group !== ICONS || lib) return;
        let live = true;
        loadIconLib().then(l => { if (live) setLib(l); }).catch(() => { if (live) setLibError(true); });
        return () => { live = false; };
    }, [group, ICONS, lib]);
    const found = useMemo(() => (lib ? searchIcons(lib, q, 64) : []), [lib, q]);
    return (
        <div data-ui role="dialog" aria-label="Öğeler" className="w-[420px] max-w-[calc(100vw-24px)] p-3 flex flex-col gap-2.5 rounded-2xl m-surface m-pop shadow-2xl"
            style={{ border: '1px solid var(--m-sep, #e5e7eb)' }} onPointerDown={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
            <div className="flex items-center gap-2">
                <b className="text-[14.5px] m-text">Öğeler</b>
                <span className="text-[12.5px] m-text-3">Tıklayın, görünen alanın ortasına eklensin</span>
                <span className="flex-1" />
                <button type="button" aria-label="Kapat" className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer m-text-3" onClick={onClose}><Icon name="x" size={15} /></button>
            </div>
            <span className="text-[12.5px] font-semibold m-text-2">Şekiller</span>
            <div className="grid grid-cols-6 gap-1">
                {ALL_SHAPES.map(s => (
                    <button key={s.shape} type="button" title={s.label} aria-label={s.label} className="h-11 rounded-xl border-0 cursor-pointer grid place-items-center bg-transparent m-text-2 hover:m-fill-2" onClick={() => onShape(s.shape)}>
                        <ShapePreview shape={s.shape} />
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Çizim grupları">
                {[...ELEMENT_GROUPS.map(g => g.label), 'İkonlar'].map((label, i) => (
                    <button key={label} type="button" role="tab" aria-selected={group === i} className={`h-7 px-2.5 rounded-full border-0 cursor-pointer text-[12.5px] ${group === i ? 'm-tone-accent font-semibold' : 'm-fill-2 m-text-2'}`} onClick={() => setGroup(i)}>{label}</button>
                ))}
            </div>
            {group < ICONS ? (
                <div className="grid grid-cols-8 gap-1 max-h-[180px] overflow-y-auto">
                    {ELEMENT_GROUPS[group].items.map(e => (
                        <button key={e} type="button" aria-label={`Ekle ${e}`} className="h-11 rounded-xl border-0 cursor-pointer bg-transparent hover:m-fill-2 text-[26px] leading-none" onClick={() => onEmoji(e)}>{e}</button>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <input type="search" aria-label="İkon ara" className="m-input !h-9 !py-0 flex-1 text-[14px]" placeholder="İkon ara: veri tabanı, sunucu, kullanıcı, bulut…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
                        <label title="İkon rengi" className="w-8 h-8 rounded-lg cursor-pointer border m-sep flex-none" style={{ background: color, borderStyle: 'solid' }}>
                            <input type="color" className="opacity-0 w-full h-full cursor-pointer" value={color} onChange={e => setColor(e.target.value)} />
                        </label>
                    </div>
                    <div className="grid grid-cols-8 gap-1 max-h-[200px] overflow-y-auto">
                        {!lib && !libError && <span className="col-span-8 text-[13px] m-text-3 py-3 text-center">İkonlar yükleniyor…</span>}
                        {libError && <span className="col-span-8 text-[13px] m-ink-bad py-3 text-center">İkonlar yüklenemedi.</span>}
                        {lib && !found.length && <span className="col-span-8 text-[13px] m-text-3 py-3 text-center">Eşleşen ikon yok.</span>}
                        {lib && found.map(name => {
                            const svg = iconSvg(lib, name, color)!;
                            return (
                                <button key={name} type="button" title={name} aria-label={`İkon ${name}`} className="h-11 rounded-xl border-0 cursor-pointer bg-transparent hover:m-fill-2 grid place-items-center" onClick={() => onIcon(svg, name)}>
                                    <img src={svgDataUrl(svg)} alt="" width={24} height={24} draggable={false} />
                                </button>
                            );
                        })}
                    </div>
                    <span className="text-[11.5px] m-text-3">Lucide ikonları (ISC lisansı).</span>
                </div>
            )}
            <p className="m-0 text-[12px] m-text-3">Daha zengin bir çizim için Asistan'a yazın: ör. "çiçekli bir bahar sahnesi çiz", "sunucu ve veri tabanı ikonlarıyla mimari çiz".</p>
        </div>
    );
};

export default WbElements;
