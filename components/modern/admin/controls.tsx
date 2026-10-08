import React from 'react';
import { Icon } from '../icons';
import { rowSep } from '../ui';

/** Yönetici konsolunun ortak denetimleri */

export const Switch: React.FC<{ on: boolean; label: string; disabled?: boolean; changed?: boolean; title?: string; onChange: (on: boolean) => void }> = ({ on, label, disabled, changed, title, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        title={title}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className="relative inline-flex flex-none w-[46px] h-7 rounded-full border-0 cursor-pointer disabled:cursor-not-allowed"
        style={{
            background: on ? 'var(--m-accent)' : 'var(--m-fill)',
            boxShadow: changed ? '0 0 0 2px var(--m-surface), 0 0 0 4px var(--m-warn)' : undefined,
            opacity: disabled ? 0.5 : 1,
            transition: 'background-color .15s ease',
        }}
    >
        <span aria-hidden="true" className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white" style={{ left: on ? 21 : 3, boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .15s ease' }}></span>
    </button>
);

/** Etiket + açıklama + anahtar satırı */
export const SwitchRow: React.FC<{ index: number; label: string; hint?: string; on: boolean; disabled?: boolean; title?: string; onChange: (on: boolean) => void }> = ({ index, label, hint, on, disabled, title, onChange }) => {
    const sep = rowSep(index);
    return (
        <div className={`flex items-center gap-3 py-2.5 ${sep.className}`} style={sep.style}>
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[15px] m-text">{label}</span>
                {hint && <span className="text-[13px] m-text-3">{hint}</span>}
            </span>
            <Switch on={on} label={label} disabled={disabled} title={title} onChange={onChange} />
        </div>
    );
};

export const Note: React.FC<{ children: React.ReactNode; tone?: 'info' | 'warn' }> = ({ children, tone = 'info' }) => (
    <div className={`rounded-2xl px-4 py-3 flex items-start gap-3 ${tone === 'warn' ? 'm-tone-warn' : 'm-surface'}`}>
        <span className={tone === 'warn' ? '' : 'm-accent'} style={{ marginTop: 2 }}><Icon name={tone === 'warn' ? 'alert' : 'info'} size={18} /></span>
        <p className="m-0 flex-1 text-[14px] leading-relaxed m-text-2">{children}</p>
    </div>
);

