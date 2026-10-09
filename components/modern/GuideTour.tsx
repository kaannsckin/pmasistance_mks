import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Guide, GuideId, GUIDES, guideSeen, markGuideSeen } from '../../utils/guides';
import { Icon } from './icons';

/**
 * Sayfa rehberi: adım adım, kaydırmalı bilgilendirme penceresi. Her adımda
 * ne işe yaradığı, nasıl kullanıldığı ve örnek bir senaryo. Sayfa ilk
 * açıldığında bir kez kendiliğinden açılır; sonra "?" düğmesiyle.
 * Gezinme: İleri / Geri, nokta göstergeleri, ← → tuşları (pencere
 * odaktayken), dokunmatik kaydırma; Esc kapatır.
 */

/** Rehberin açık/kapalı durumu; `auto` doğruysa ve bu tarayıcıda görülmediyse kendiliğinden açılır */
export const useGuide = (id: GuideId, auto = true) => {
    const [state, setState] = useState<{ open: boolean; start: number }>({ open: false, start: 0 });
    useEffect(() => {
        if (auto && !guideSeen(id)) setState({ open: true, start: 0 });
    }, [id, auto]);
    const show = useCallback((start = 0) => setState({ open: true, start }), []);
    const close = useCallback(() => { markGuideSeen(id); setState(s => ({ ...s, open: false })); }, [id]);
    return { guide: GUIDES[id], open: state.open, start: state.start, show, close };
};

/** Sayfa başlığındaki "?" düğmesi */
export const GuideButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'Bu sayfa nasıl kullanılır?' }) => (
    <button type="button" className="m-icon-btn" aria-label={label} title={label} onClick={onClick}>
        <Icon name="help" size={22} />
    </button>
);

const SWIPE = 50;

export const GuideTour: React.FC<{ guide: Guide; start?: number; onClose: () => void }> = ({ guide, start = 0, onClose }) => {
    const n = guide.steps.length;
    const [i, setI] = useState(Math.min(Math.max(0, start), n - 1));
    const dialog = useRef<HTMLDivElement | null>(null);
    const touch = useRef<{ x: number; y: number } | null>(null);
    const go = useCallback((k: number) => setI(Math.min(n - 1, Math.max(0, k))), [n]);

    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        dialog.current?.focus();
        return () => { before?.focus?.(); };
    }, []);
    // Tuşlar yalnız pencerenin içindeyken (komut paleti gibi üstte açılan alanlardaki
    // yazımı çalmaz); Tab pencerenin içinde döner (aria-modal)
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); setI(k => Math.min(n - 1, k + 1)); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); setI(k => Math.max(0, k - 1)); }
        else if (e.key === 'Tab' && dialog.current) {
            const nodes = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.closest('[inert]'));
            if (!nodes.length) return;
            const first = nodes[0], last = nodes[nodes.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && (active === first || active === dialog.current)) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
        }
    };

    const onPointerDown = (e: React.PointerEvent) => { touch.current = { x: e.clientX, y: e.clientY }; };
    const onPointerUp = (e: React.PointerEvent) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.clientX - t.x, dy = e.clientY - t.y;
        // Yatay kaydırma (dikey okuma kaydırmasıyla karışmasın)
        if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.5) go(i + (dx < 0 ? 1 : -1));
    };
    const last = i === n - 1;
    const step = guide.steps[i];

    return (
        <div className="fixed inset-0 z-[90] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div
                ref={dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="guide-title"
                aria-describedby={`guide-step-${step.id}`}
                tabIndex={-1}
                className="m-bg w-full sm:max-w-[640px] rounded-t-2xl sm:rounded-2xl m-pop flex flex-col outline-none"
                style={{ height: 'min(760px, 90vh)' }}
                onClick={e => e.stopPropagation()}
                onKeyDown={onKeyDown}
            >
                <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
                    <div className="min-w-0">
                        <h2 id="guide-title" className="m-0 text-[17px] font-bold m-text truncate">{guide.title}</h2>
                        <p className="m-0 text-[13px] m-text-3 m-tabular" aria-live="polite">Adım {i + 1} / {n}</p>
                    </div>
                    <button type="button" className="m-icon-btn" aria-label="Rehberi kapat" onClick={onClose}><Icon name="x" /></button>
                </div>
                <div className="h-1 mx-5 rounded-full m-fill-2 overflow-hidden" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${((i + 1) / n) * 100}%`, background: 'var(--m-accent)', transition: 'width .3s ease' }} />
                </div>

                <div className="flex-1 min-h-0 overflow-hidden mt-3" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { touch.current = null; }} style={{ touchAction: 'pan-y' }}>
                    <div className="flex h-full transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${i * 100}%)` }}>
                        {guide.steps.map((s, k) => (
                            <section
                                key={s.id}
                                id={`guide-step-${s.id}`}
                                role="group"
                                aria-roledescription="adım"
                                aria-label={`${k + 1} / ${n}: ${s.title}`}
                                aria-hidden={k !== i}
                                inert={k !== i}
                                className="w-full flex-none h-full overflow-y-auto px-5 pb-4 flex flex-col gap-4"
                            >
                                <div className="flex items-start gap-3">
                                    <span className="flex-none inline-flex items-center justify-center w-11 h-11 rounded-2xl m-accent" style={{ background: 'var(--m-accent-tint)' }}><Icon name={s.icon} size={22} /></span>
                                    <div className="min-w-0">
                                        <h3 className="m-0 text-[20px] font-bold leading-tight m-text">{s.title}</h3>
                                        <p className="m-0 mt-1 text-[15px] leading-relaxed m-text-2">{s.summary}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <h4 className="m-0 text-[13px] font-semibold m-text-3">Nasıl kullanılır</h4>
                                    <ol className="m-0 p-0 list-none flex flex-col gap-2">
                                        {s.how.map((h, j) => (
                                            <li key={h} className="flex items-start gap-2.5 text-[15px] leading-relaxed m-text">
                                                <span className="flex-none mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full m-fill-2 text-[12px] font-bold m-tabular m-text-2">{j + 1}</span>
                                                <span className="min-w-0">{h}</span>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                                <div className="rounded-xl p-3.5 flex flex-col gap-1" style={{ background: 'var(--m-accent-tint)' }}>
                                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold m-accent"><Icon name="book" size={16} />{s.scenario.title}</span>
                                    <p className="m-0 text-[15px] leading-relaxed m-text">{s.scenario.text}</p>
                                </div>
                                {s.tip && (
                                    <p className="m-0 text-[14px] leading-relaxed m-text-2 flex items-start gap-2"><span className="m-accent flex-none" style={{ marginTop: 2 }}><Icon name="info" size={16} /></span>{s.tip}</p>
                                )}
                            </section>
                        ))}
                    </div>
                </div>

                <div className="px-5 py-3.5 border-t m-sep flex items-center justify-between gap-3" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                    <button type="button" className="m-btn m-btn-plain !px-2 sm:!px-3" aria-label="Geri" disabled={i === 0} onClick={() => go(i - 1)}><Icon name="chevronLeft" size={18} /><span className="hidden sm:inline">Geri</span></button>
                    <div className="flex items-center gap-1 flex-wrap justify-center" role="group" aria-label="Adımlar">
                        {guide.steps.map((s, k) => (
                            <button
                                key={s.id}
                                type="button"
                                aria-label={`${k + 1}. adım: ${s.title}`}
                                aria-current={k === i ? 'step' : undefined}
                                onClick={() => go(k)}
                                className="inline-flex items-center justify-center w-5 h-6 sm:w-6 rounded-full border-0 bg-transparent cursor-pointer p-0"
                            >
                                <span className="block rounded-full" style={{ width: k === i ? 18 : 8, height: 8, background: k === i ? 'var(--m-accent)' : 'var(--m-fill)', transition: 'width .2s ease' }} />
                            </button>
                        ))}
                    </div>
                    {last
                        ? <button type="button" className="m-btn m-btn-primary" onClick={onClose}>Başla<Icon name="check" size={18} /></button>
                        : <button type="button" className="m-btn m-btn-primary" onClick={() => go(i + 1)}>İleri<Icon name="chevronRight" size={18} /></button>}
                </div>
            </div>
        </div>
    );
};
