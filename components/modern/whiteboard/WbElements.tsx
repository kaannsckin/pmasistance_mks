import React, { useState } from 'react';
import { WbShape } from '../../../types';
import { ELEMENT_GROUPS } from '../../../utils/whiteboard/model';
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
    onClose: () => void;
}> = ({ onShape, onEmoji, onClose }) => {
    const [group, setGroup] = useState(1);
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
                {ELEMENT_GROUPS.map((g, i) => (
                    <button key={g.label} type="button" role="tab" aria-selected={group === i} className={`h-7 px-2.5 rounded-full border-0 cursor-pointer text-[12.5px] ${group === i ? 'm-tone-accent font-semibold' : 'm-fill-2 m-text-2'}`} onClick={() => setGroup(i)}>{g.label}</button>
                ))}
            </div>
            <div className="grid grid-cols-8 gap-1 max-h-[180px] overflow-y-auto">
                {ELEMENT_GROUPS[group].items.map(e => (
                    <button key={e} type="button" aria-label={`Ekle ${e}`} className="h-11 rounded-xl border-0 cursor-pointer bg-transparent hover:m-fill-2 text-[26px] leading-none" onClick={() => onEmoji(e)}>{e}</button>
                ))}
            </div>
            <p className="m-0 text-[12px] m-text-3">Daha zengin bir çizim için Asistan'a yazın: ör. "çiçekli bir bahar sahnesi çiz", "sunucu ve veri tabanı ikonlarıyla mimari çiz".</p>
        </div>
    );
};

export default WbElements;
