import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRapidClickDetector, prefersReducedMotion } from '../../utils/easterEggs';
import { Icon } from './icons';

/**
 * Sürprizler: roket logosu, hiper sürüş, kutlama ve uzay modu.
 * Animasyon sınıfları styles/modern.css'tedir; "hareketi azalt" açıksa
 * yalnızca kısa bir mesaj gösterilir.
 */

export type EggEvent =
    | { kind: 'hyper' }
    | { kind: 'space' }
    | { kind: 'celebrate'; message: string };

/** Ekranın altında kısa süreli, ekran okuyucuya da okunan mesaj */
const EggToast: React.FC<{ text: string; icon?: 'rocket' | 'check' }> = ({ text, icon = 'rocket' }) => (
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
