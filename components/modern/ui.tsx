import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { HealthBand } from '../../utils/executive';
import { Icon } from './icons';
import { animateGlassLens, LensBounds, paintedLensBounds, sameLensBounds } from './glassSelectionMotion';

/** Modern ekranların ortak küçük yapı taşları */

export const ToggleSwitch: React.FC<{
    label: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
}> = ({ label, checked, disabled, onChange }) => (
    <label className="m-switch">
        <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
        <span className="m-switch-track" aria-hidden="true"><span /></span>
    </label>
);

/** Seçili düğmenin yerini, sekmeler farklı genişlikte veya birden çok satırda olsa da korur. */
export const SelectionStrip: React.FC<{
    selection: string | number;
    role: 'tablist' | 'radiogroup' | 'group';
    label: string;
    className: string;
    children: React.ReactNode;
}> = ({ selection, role, label, className, children }) => {
    const groupRef = useRef<HTMLDivElement>(null);
    const indicatorRef = useRef<HTMLSpanElement>(null);
    const reflectionRef = useRef<HTMLSpanElement>(null);
    const targetRef = useRef<{ element: HTMLButtonElement; bounds: LensBounds } | null>(null);
    const animations = useRef<Animation[]>([]);

    useLayoutEffect(() => () => animations.current.forEach(animation => animation.cancel()), []);

    useLayoutEffect(() => {
        const group = groupRef.current;
        const indicator = indicatorRef.current;
        const reflection = reflectionRef.current;
        if (!group || !indicator || !reflection) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const stop = () => {
            animations.current.forEach(animation => animation.cancel());
            animations.current = [];
        };
        const placeIndicator = () => {
            const selected = group.querySelector<HTMLButtonElement>(
                'button[aria-selected="true"], button[aria-checked="true"], button[aria-pressed="true"]',
            );
            indicator.hidden = !selected?.offsetWidth;
            if (!selected || indicator.hidden) {
                stop();
                targetRef.current = null;
                return;
            }

            let x = selected.offsetLeft;
            let y = selected.offsetTop;
            for (let parent = selected.offsetParent; parent instanceof HTMLElement && parent !== group; parent = parent.offsetParent) {
                x += parent.offsetLeft;
                y += parent.offsetTop;
            }
            const bounds = { x, y, width: selected.offsetWidth, height: selected.offsetHeight };
            const previous = targetRef.current;
            if (previous?.element === selected && sameLensBounds(previous.bounds, bounds)) return;

            const shouldAnimate = previous && previous.element !== selected && !reduceMotion.matches
                && typeof indicator.animate === 'function' && group.closest('.ui-modern.mt-bubble');
            const source = shouldAnimate && animations.current.some(animation => animation.playState === 'running')
                ? paintedLensBounds(indicator) : previous?.bounds;
            stop();
            indicator.style.setProperty('--m-selection-x', `${bounds.x}px`);
            indicator.style.setProperty('--m-selection-y', `${bounds.y}px`);
            indicator.style.setProperty('--m-selection-width', `${bounds.width}px`);
            indicator.style.setProperty('--m-selection-height', `${bounds.height}px`);
            targetRef.current = { element: selected, bounds };
            if (shouldAnimate && source) animations.current = animateGlassLens(indicator, reflection, source, bounds);
        };
        const onMotionChange = () => { if (reduceMotion.matches) stop(); };
        reduceMotion.addEventListener('change', onMotionChange);
        placeIndicator();
        const resize = new ResizeObserver(placeIndicator);
        resize.observe(group);
        group.querySelectorAll<HTMLButtonElement>('button').forEach(button => resize.observe(button));
        return () => {
            resize.disconnect();
            reduceMotion.removeEventListener('change', onMotionChange);
        };
    }, [selection]);

    return (
        <div ref={groupRef} className={`m-selection-strip ${className}`} role={role} aria-label={label}
            onKeyDown={role !== 'radiogroup' ? undefined : event => {
                const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
                if (!keys.includes(event.key)) return;
                const group = event.currentTarget as HTMLDivElement;
                const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('button[role="radio"]:not(:disabled)'));
                const current = buttons.findIndex(button => button === event.target);
                if (current < 0) return;
                event.preventDefault();
                const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
                const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + step + buttons.length) % buttons.length;
                buttons[index].focus();
                buttons[index].click();
            }}>
            <span className="m-selection-lane" aria-hidden="true">
                <span ref={indicatorRef} className="m-selection-indicator" hidden>
                    <span ref={reflectionRef} className="m-selection-reflection" />
                </span>
            </span>
            {children}
        </div>
    );
};

export const Card: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode; labelledBy?: string; subtitle?: string }> = ({ title, action, children, labelledBy, subtitle }) => (
    <section aria-labelledby={labelledBy} className="m-surface rounded-2xl p-5 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <h2 id={labelledBy} className="m-0 text-[17px] font-semibold m-text">{title}</h2>
                {subtitle && <p className="m-0 mt-0.5 text-[14px] m-text-3">{subtitle}</p>}
            </div>
            {action}
        </div>
        {children}
    </section>
);

export const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-0.5 min-h-[44px] -my-2 px-2 -mr-2 rounded-xl text-[15px] font-semibold m-accent bg-transparent border-0 cursor-pointer whitespace-nowrap">
        {children}
        <Icon name="chevronRight" size={18} strokeWidth={2.2} />
    </button>
);

/** Liste satırları arasındaki ince ayırıcı (ilk satırda yok) */
export const rowSep = (i: number): { className: string; style?: React.CSSProperties } =>
    i > 0 ? { className: 'border-t m-sep', style: { borderTopStyle: 'solid', borderTopWidth: 1 } } : { className: '' };

/** Sağlık bandı (yönetim ve proje genel bakış ekranları) */
export const BAND_META: Record<HealthBand, { label: string; dot: string; tone: string; ink: string }> = {
    bad: { label: 'Sorunlu', dot: 'var(--m-bad)', tone: 'm-tone-bad', ink: 'm-ink-bad' },
    warn: { label: 'İzlemede', dot: 'var(--m-warn)', tone: 'm-tone-warn', ink: 'm-ink-warn' },
    good: { label: 'Sağlıklı', dot: 'var(--m-ok)', tone: 'm-tone-ok', ink: 'm-ink-ok' },
};

/** Alt sayfa (dar ekranda alttan, genişte ortada) — Esc ile kapanır */
export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; xl?: boolean; xxl?: boolean; subtitle?: string; headerAction?: React.ReactNode }> = ({ title, onClose, children, footer, wide, xl, xxl, subtitle, headerAction }) => {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="m-sheet-backdrop fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-label={title} className={`m-sheet m-bg w-full ${xxl ? 'sm:max-w-6xl' : xl ? 'sm:max-w-4xl' : wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl m-pop max-h-[92vh] flex flex-col`} onClick={e => e.stopPropagation()}>
                <div className="m-sheet-header flex items-start justify-between gap-3 px-5 pt-4 pb-2">
                    <div className="min-w-0">
                        <h2 className="m-0 text-[20px] font-bold m-text">{title}</h2>
                        {subtitle && <p className="m-0 mt-0.5 text-[14px] m-text-3">{subtitle}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-none">
                        {headerAction}
                        <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={onClose}><Icon name="x" /></button>
                    </div>
                </div>
                <div className="px-5 pb-4 overflow-y-auto flex flex-col gap-4">{children}</div>
                {footer && <div className="m-sheet-footer px-5 py-4 border-t m-sep flex flex-wrap items-center gap-2">{footer}</div>}
            </div>
        </div>
    );
};

export const Field: React.FC<{ label: string; htmlFor?: string; children: React.ReactNode; hint?: string }> = ({ label, htmlFor, children, hint }) => (
    <div className="flex flex-col gap-1.5">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold m-text-2">{label}</label>
        {children}
        {hint && <span className="text-[13px] m-text-3">{hint}</span>}
    </div>
);

/** Admin görünüm ayarının listeyi daralttığını belirten ince not */
export const ViewFilterNote: React.FC<{ text: string }> = ({ text }) => (
    <p role="note" className="m-0 self-start inline-flex items-center gap-2 min-h-[32px] px-3 rounded-full m-fill-2 text-[13px] m-text-2">
        <Icon name="eye" size={15} />{text}
    </p>
);
