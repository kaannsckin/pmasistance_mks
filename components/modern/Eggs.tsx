import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ModernTheme } from '../../types';
import { createRapidClickDetector, EGG_CATALOG, EggTrigger, prefersReducedMotion } from '../../utils/easterEggs';
import { MODERN_THEMES } from '../../utils/theme';
import { Icon, IconName } from './icons';

/**
 * Sürprizler: roket logosu, hiper sürüş, kutlama, uzay modu, temalara özel
 * dört sürpriz (pop, aurora, ship, boing) ve hepsini tanıtan rehber kartı.
 * Animasyon sınıfları styles/modern.css'tedir; "hareketi azalt" açıksa
 * yalnızca kısa bir mesaj gösterilir.
 */

export type EggEvent =
    | { kind: 'hyper' }
    | { kind: 'space' }
    | { kind: 'celebrate'; message: string }
    | { kind: 'pop' }
    | { kind: 'aurora' }
    | { kind: 'ship' }
    | { kind: 'boing' }
    | { kind: 'guide' };

/** Ekranın altında kısa süreli, ekran okuyucuya da okunan mesaj */
const EggToast: React.FC<{ text: string; icon?: IconName }> = ({ text, icon = 'rocket' }) => (
    <div
        role="status"
        aria-live="polite"
        className="fixed left-1/2 bottom-8 -translate-x-1/2 z-[1001] flex items-center gap-2.5 rounded-full px-5 py-3 text-[15px] font-semibold"
        style={{ background: 'rgba(28,28,30,0.92)', color: '#FFFFFF', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}
    >
        <Icon name={icon} size={18} />
        {text}
    </div>
);

const useAutoClose = (onDone: () => void, ms: number) => {
    const done = useRef(onDone);
    done.current = onDone;
    useEffect(() => {
        const t = window.setTimeout(() => done.current(), ms);
        return () => window.clearTimeout(t);
    }, [ms]);
};

export const HyperdriveOverlay: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    const reduced = useMemo(prefersReducedMotion, []);
    useAutoClose(onDone, reduced ? 2400 : 1800);
    const stars = useMemo(() => Array.from({ length: 48 }, (_, i) => ({
        key: i,
        tx: `${Math.round(Math.random() * 2400 - 1200)}px`,
        ty: `${Math.round(Math.random() * 2400 - 1200)}px`,
        delay: `${(Math.random() * 0.35).toFixed(2)}s`,
    })), []);
    return (
        <>
            {!reduced && (
                <div aria-hidden="true" className="fixed inset-0 z-[1000] pointer-events-none overflow-hidden flex items-center justify-center">
                    <div className="m-hyper-veil"></div>
                    <div className="m-hyper-ring"></div>
                    {stars.map(s => (
                        <div key={s.key} className="m-hyper-star" style={{ ['--tx' as string]: s.tx, ['--ty' as string]: s.ty, animationDelay: s.delay } as React.CSSProperties}></div>
                    ))}
                </div>
            )}
            <EggToast text="Hiper sürüş! Işık hızında planlama." />
        </>
    );
};

const CONFETTI_COLORS = ['#0066D6', '#1F7A35', '#E07800', '#D70015', '#5B3FD0', '#0F766E'];

export const Celebration: React.FC<{ message: string; onDone: () => void }> = ({ message, onDone }) => {
    const reduced = useMemo(prefersReducedMotion, []);
    useAutoClose(onDone, 3200);
    const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
        key: i,
        left: `${Math.random() * 100}%`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        dx: `${Math.round(Math.random() * 160 - 80)}px`,
        rot: `${Math.round(Math.random() * 720 + 180)}deg`,
        dur: `${(1.4 + Math.random() * 1.2).toFixed(2)}s`,
        delay: `${(Math.random() * 0.4).toFixed(2)}s`,
    })), []);
    return (
        <>
            {!reduced && (
                <div aria-hidden="true" className="fixed inset-0 z-[1000] pointer-events-none overflow-hidden">
                    {pieces.map(p => (
                        <span
                            key={p.key}
                            className="m-confetti"
                            style={{ left: p.left, background: p.color, ['--dx' as string]: p.dx, ['--rot' as string]: p.rot, ['--dur' as string]: p.dur, ['--delay' as string]: p.delay } as React.CSSProperties}
                        ></span>
                    ))}
                </div>
            )}
            <EggToast text={message} icon="check" />
        </>
    );
};

export const SpaceMode: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    const reduced = useMemo(prefersReducedMotion, []);
    useAutoClose(onDone, reduced ? 2600 : 4200);
    const stars = useMemo(() => Array.from({ length: 90 }, (_, i) => ({
        key: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: `${(Math.random() * 1.6).toFixed(2)}s`,
    })), []);
    return (
        <>
            {!reduced && (
                <div aria-hidden="true" className="m-space pointer-events-none">
                    {stars.map(s => <span key={s.key} className="m-space-star" style={{ left: s.left, top: s.top, ['--delay' as string]: s.delay } as React.CSSProperties}></span>)}
                    <span className="m-space-rocket"><Icon name="rocket" size={40} strokeWidth={1.6} /></span>
                </div>
            )}
            <EggToast text="Görev kontrol: tüm sistemler yolunda." />
        </>
    );
};

/** Baloncuk: ekranın altından sabun baloncukları yükselir ve tepede patlar */
export const BubblePop: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    const reduced = useMemo(prefersReducedMotion, []);
    useAutoClose(onDone, reduced ? 2400 : 4200);
    const bubbles = useMemo(() => Array.from({ length: 28 }, (_, i) => {
        const size = Math.round(18 + Math.random() * 54);
        return {
            key: i,
            left: `${Math.round(Math.random() * 96)}%`,
            size: `${size}px`,
            rise: `-${Math.round(45 + Math.random() * 50)}vh`,
            sway: `${Math.round(Math.random() * 80 - 40)}px`,
            dur: `${(2.2 + Math.random() * 1.4).toFixed(2)}s`,
            delay: `${(Math.random() * 0.9).toFixed(2)}s`,
        };
    }), []);
    return (
        <>
            {!reduced && (
                <div aria-hidden="true" className="fixed inset-0 z-[1000] pointer-events-none overflow-hidden">
                    {bubbles.map(b => (
                        <span
                            key={b.key}
                            className="m-bubble"
                            style={{ left: b.left, width: b.size, height: b.size, ['--rise' as string]: b.rise, ['--sway' as string]: b.sway, ['--dur' as string]: b.dur, ['--delay' as string]: b.delay } as React.CSSProperties}
                        ></span>
                    ))}
                </div>
            )}
            <EggToast text="Pop! Bütün baloncuklar patladı, bütün engeller kalktı." icon="message" />
        </>
    );
};

/** Aurora: ekranı kuzey ışığı şeritleri dalgalanarak geçer */
export const AuroraSweep: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    const reduced = useMemo(prefersReducedMotion, []);
    useAutoClose(onDone, reduced ? 2400 : 4400);
    const bands = [
        { top: '6%', c1: 'rgba(45,212,191,0.85)', c2: 'rgba(163,230,53,0.55)', delay: '0s' },
        { top: '22%', c1: 'rgba(139,92,246,0.75)', c2: 'rgba(56,189,248,0.6)', delay: '0.35s' },
        { top: '38%', c1: 'rgba(94,234,212,0.7)', c2: 'rgba(167,139,250,0.55)', delay: '0.7s' },
    ];
    const stars = useMemo(() => Array.from({ length: 40 }, (_, i) => ({ key: i, left: `${Math.random() * 100}%`, top: `${Math.random() * 70}%`, delay: `${(Math.random() * 1.6).toFixed(2)}s` })), []);
    return (
        <>
            {!reduced && (
                <div aria-hidden="true" className="fixed inset-0 z-[1000] pointer-events-none overflow-hidden">
                    <div className="m-aurora-veil"></div>
                    {stars.map(s => <span key={s.key} className="m-space-star" style={{ left: s.left, top: s.top, ['--delay' as string]: s.delay } as React.CSSProperties}></span>)}
                    {bands.map((b, i) => (
                        <div key={i} className="m-aurora-band" style={{ top: b.top, ['--c1' as string]: b.c1, ['--c2' as string]: b.c2, animationDelay: b.delay } as React.CSSProperties}></div>
                    ))}
                </div>
            )}
            <EggToast text="Kuzey ışıkları: bu gece gökyüzü açık, yol haritası net." icon="sparkles" />
        </>
    );
};

/** Pro: köşede satır satır ilerleyen "yayına al" kartı ve üstte ince ilerleme çizgisi */
export const ShipIt: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    const reduced = useMemo(prefersReducedMotion, []);
    useAutoClose(onDone, 3600);
    const steps = ['Derleme · 214 test geçti', 'Sürüm notları hazır', 'Etiketlendi · v2.0.0', 'Yayında'];
    return (
        <>
            {!reduced && <div aria-hidden="true" className="m-ship-bar"></div>}
            <div role="status" aria-live="polite" className="m-ship-card m-surface m-pop">
                <div className="flex items-center gap-2 text-[13px] font-semibold m-text-3"><Icon name="send" size={15} />ship</div>
                <ol className="m-0 p-0 list-none flex flex-col gap-1.5">
                    {steps.map((t, i) => (
                        <li key={t} className="m-ship-step flex items-center gap-2 text-[14px] m-text" style={{ animationDelay: `${0.25 + i * 0.45}s` }}>
                            <span className="m-ink-ok inline-flex"><Icon name="check" size={16} strokeWidth={2.4} /></span>{t}
                        </li>
                    ))}
                </ol>
            </div>
        </>
    );
};

/** Kil: kartlar ve düğmeler jöle gibi esner (kök kaba kısa süreli bir sınıf eklenir) */
export const Boing: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    const reduced = useMemo(prefersReducedMotion, []);
    useAutoClose(onDone, 2400);
    useEffect(() => {
        if (reduced) return;
        const root = document.querySelector('.ui-modern');
        root?.classList.add('m-boing');
        const t = window.setTimeout(() => root?.classList.remove('m-boing'), 1400);
        return () => { window.clearTimeout(t); root?.classList.remove('m-boing'); };
    }, [reduced]);
    return <EggToast text="Boing! Plan esnek, kartlar daha da esnek." icon="refresh" />;
};

const EGG_ICON: Record<string, IconName> = {
    rocket: 'rocket', hyper: 'rocket', space: 'key', celebrate: 'check', greeting: 'clock',
    pop: 'message', aurora: 'sparkles', ship: 'send', boing: 'refresh',
};

/**
 * Sürpriz rehberi: "egg" yazınca açılır. Yumurta sallanır, çatlar; sürprizler
 * sırayla belirir. Etkin temaya ait sürpriz öne çıkarılır, "Dene" ile çalışır.
 */
export const EggGuide: React.FC<{ theme: ModernTheme; onTry: (id: EggTrigger) => void; onClose: () => void }> = ({ theme, onTry, onClose }) => {
    const closeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    const themeName = (t?: ModernTheme) => MODERN_THEMES.find(m => m.id === t)?.name;
    const eggs = [...EGG_CATALOG].sort((a, b) => Number(b.theme === theme) - Number(a.theme === theme));
    return (
        <div className="fixed inset-0 z-[1002] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="egg-guide-title"
                className="m-egg-card m-bg m-pop w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-4 px-5 pt-5 pb-3">
                    <div className="m-egg" aria-hidden="true">
                        <span className="m-egg-glow"></span>
                        <span className="m-egg-prize"><Icon name="sparkles" size={26} strokeWidth={2} /></span>
                        <span className="m-egg-half m-egg-bottom"></span>
                        <span className="m-egg-half m-egg-top"></span>
                    </div>
                    <div className="flex-1 min-w-0 m-egg-head">
                        <h2 id="egg-guide-title" className="m-0 text-[20px] font-bold m-text">Sürpriz rehberi</h2>
                        <p className="m-0 mt-1 text-[14px] m-text-2">PlanAsistan'da saklı {EGG_CATALOG.length} küçük sürpriz. Hepsi zararsız; işinize dokunmaz.</p>
                    </div>
                    <button ref={closeRef} type="button" className="m-icon-btn -mr-2 -mt-1" aria-label="Kapat" onClick={onClose}><Icon name="x" /></button>
                </div>
                <ul className="m-0 px-5 pb-5 list-none flex flex-col gap-2 overflow-y-auto">
                    {eggs.map((e, i) => {
                        const mine = !!e.theme && e.theme === theme;
                        return (
                            <li
                                key={e.id}
                                className={`m-egg-item m-surface rounded-2xl flex items-center gap-3 px-3.5 py-3 ${mine ? 'm-egg-mine' : ''}`}
                                style={{ animationDelay: `${0.3 + i * 0.05}s` }}
                            >
                                <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-none ${mine ? 'm-accent-bg' : 'm-fill m-text-2'}`} aria-hidden="true">
                                    <Icon name={EGG_ICON[e.id]} size={19} />
                                </span>
                                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[15px] font-semibold m-text">{e.title}</span>
                                        {e.theme && (
                                            <span className={`inline-flex items-center h-5 px-2 rounded-full text-[12px] font-semibold ${mine ? 'm-tone-accent' : 'm-fill-2 m-text-2'}`}>
                                                {mine ? 'Temanızın sürprizi' : themeName(e.theme)}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-[13px] m-text-2">{e.how}</span>
                                </span>
                                {e.tryable && (
                                    <button type="button" className="m-btn m-btn-plain flex-none" style={{ minHeight: 36, padding: '0 12px' }} onClick={() => onTry(e.id as EggTrigger)}>
                                        Dene
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

/**
 * Logo: koyu kare içinde roket. Tık → roket ateşlenir ve fırlar, sonra
 * onLaunch (ana ekrana dönüş). 2 sn içinde 5 tık → hiper sürüş.
 */
export const RocketLogo: React.FC<{ onLaunch: () => void; onHyperdrive: () => void }> = ({ onLaunch, onHyperdrive }) => {
    const [phase, setPhase] = useState<'idle' | 'igniting' | 'launching'>('idle');
    const rapid = useRef(createRapidClickDetector(5, 2000));
    const timers = useRef<number[]>([]);
    useEffect(() => () => timers.current.forEach(t => window.clearTimeout(t)), []);

    const handleClick = () => {
        if (rapid.current()) {
            onHyperdrive();
            return;
        }
        if (phase !== 'idle') return;
        if (prefersReducedMotion()) {
            onLaunch();
            return;
        }
        setPhase('igniting');
        timers.current.push(window.setTimeout(() => setPhase('launching'), 450));
        timers.current.push(window.setTimeout(() => {
            setPhase('idle');
            onLaunch();
        }, 1250));
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className="m-logo flex items-center gap-2.5 min-h-[44px] px-2 rounded-xl text-left"
            aria-label="PlanAsistan — ana ekrana dön"
            title="PlanAsistan"
        >
            <span
                className="relative w-9 h-9 rounded-[10px] flex items-center justify-center flex-none overflow-visible"
                style={{ background: 'var(--m-label)', color: 'var(--m-bg)' }}
            >
                <span className={`m-rocket inline-flex ${phase === 'igniting' ? 'is-igniting' : phase === 'launching' ? 'is-launching' : ''}`}>
                    <Icon name="rocket" size={19} strokeWidth={1.9} />
                </span>
                {phase === 'launching' && <span className="m-trail" aria-hidden="true"></span>}
            </span>
            <span className="flex flex-col leading-tight">
                <span className="text-[17px] font-semibold m-text">PlanAsistan</span>
                <span className="text-[13px] m-text-3">{phase === 'igniting' ? 'Ateşleniyor…' : phase === 'launching' ? 'Kalkış!' : 'MKS çalışma alanı'}</span>
            </span>
        </button>
    );
};
