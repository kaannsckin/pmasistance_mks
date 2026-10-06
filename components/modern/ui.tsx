import React from 'react';
import { HealthBand } from '../../utils/executive';
import { Icon } from './icons';

/** Modern ekranların ortak küçük yapı taşları */

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
