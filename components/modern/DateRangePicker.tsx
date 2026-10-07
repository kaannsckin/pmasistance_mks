import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    DayRange, formatMonthRange, formatRange, inRange, IsoDay, MONTH_ABBR, MONTH_NAMES, MonthRange, monthGrid, orderMonths, orderRange, parseIsoDay, pickDay, rangePresets, toIsoDay,
    WEEKDAY_ABBR, weekRange,
} from '../../utils/calendarRange';
import { isoWeekOf } from '../../utils/weeklyReport';
import { Icon } from './icons';

/**
 * Takvim seçiciler: tetikleyiciye basınca açılan takvimden hafta, gün
 * aralığı ya da ay aralığı seçilir.
 *  - WeekPicker: önceki/sonraki ok + hafta etiketi; etikete basınca takvimde
 *    bir güne basmak o haftayı seçer (hafta numarası sütunuyla)
 *  - DateRangeField: form alanı; iki tıkla başlangıç–bitiş (hazır aralıklarla)
 *  - MonthRangeField: yıl içinde ay aralığı (iki tık)
 * Açılır pencere tetikleyiciye göre ekrana sığacak biçimde konumlanır, Esc ile
 * kapanır ve odağı tetikleyiciye geri verir; ok tuşlarıyla günler arasında
 * gezilir.
 */

type Mode = 'week' | 'range';

// ------------------------------------------------------------------ açılır pencere

const Popover: React.FC<{ anchor: HTMLElement | null; label: string; width: number; onClose: () => void; children: React.ReactNode }> = ({ anchor, label, width, onClose, children }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    useLayoutEffect(() => {
        const place = () => {
            if (!anchor) return;
            const r = anchor.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const w = Math.min(width, vw - 24);
            const h = ref.current?.offsetHeight || 380;
            const left = Math.max(12, Math.min(r.left, vw - w - 12));
            const below = r.bottom + 8;
            const top = below + h > vh - 8 && r.top - h - 8 > 8 ? r.top - h - 8 : Math.max(8, Math.min(below, vh - h - 8));
            setPos({ top, left, width: w });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }, [anchor, width]);

    useEffect(() => {
        // Açılınca seçili (ya da bugünkü) güne odaklan
        const t = setTimeout(() => (ref.current?.querySelector<HTMLElement>('[data-focus="true"]') || ref.current?.querySelector<HTMLElement>('button'))?.focus(), 0);
        return () => clearTimeout(t);
    }, []);

    const close = () => { onClose(); anchor?.focus(); };
    const host = (anchor?.closest('.ui-modern') as HTMLElement | null) || document.body;
    return createPortal(
        <>
            <div className="fixed inset-0 z-[90]" aria-hidden="true" onClick={e => { e.stopPropagation(); close(); }}></div>
            <div
                ref={ref}
                role="dialog"
                aria-label={label}
                className="fixed z-[91] m-surface m-pop rounded-2xl p-3"
                style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? width }}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } }}
            >
                {children}
            </div>
        </>,
        host,
    );
};

// ------------------------------------------------------------------ gün takvimi

interface CalendarProps {
    mode: Mode;
    value: DayRange | null;
    onPick: (r: DayRange) => void;
    min?: IsoDay;
    max?: IsoDay;
    workdays?: boolean;
    presets?: boolean;
}

const Calendar: React.FC<CalendarProps> = ({ mode, value, onPick, min, max, workdays = true, presets }) => {
    const today = toIsoDay(new Date());
    const initial = parseIsoDay(value?.start) || new Date();
    const [view, setView] = useState({ y: initial.getFullYear(), m: initial.getMonth() });
    const [anchor, setAnchor] = useState<IsoDay | null>(null);
    const [hover, setHover] = useState<IsoDay | null>(null);
    const [focusDay, setFocusDay] = useState<IsoDay>(value?.start || today);
    const gridRef = useRef<HTMLDivElement>(null);
    const rows = useMemo(() => monthGrid(view.y, view.m), [view]);

    const shift = (delta: number) => setView(v => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
    const disabled = (day: IsoDay) => (!!min && day < min) || (!!max && day > max);

    // Önizleme: hafta kipinde üzerine gelinen hafta, aralıkta ilk tıktan imlece kadar
    const hoverWeek = mode === 'week' && hover ? (() => { const w = isoWeekOf(parseIsoDay(hover)!); return weekRange(w.year, w.week, workdays); })() : null;
    const preview: DayRange | null = mode === 'range' && anchor ? orderRange(anchor, hover || anchor) : hoverWeek;
    const shown = preview || (anchor ? null : value);

    const choose = (day: IsoDay) => {
        if (disabled(day)) return;
        if (mode === 'week') {
            const w = isoWeekOf(parseIsoDay(day)!);
            onPick(weekRange(w.year, w.week, workdays));
            return;
        }
        const next = pickDay(anchor, day);
        setAnchor(next.anchor);
        if (next.done) onPick(next.range);
    };

    const moveFocus = (day: IsoDay) => {
        const d = parseIsoDay(day)!;
        if (d.getMonth() !== view.m || d.getFullYear() !== view.y) setView({ y: d.getFullYear(), m: d.getMonth() });
        setFocusDay(day);
        setHover(day);
        setTimeout(() => gridRef.current?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus(), 0);
    };
    const onKey = (e: React.KeyboardEvent, day: IsoDay) => {
        const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (e.key in step) {
            e.preventDefault();
            const d = parseIsoDay(day)!;
            d.setDate(d.getDate() + step[e.key]);
            moveFocus(toIsoDay(d));
        } else if (e.key === 'PageUp' || e.key === 'PageDown') {
            e.preventDefault();
            const d = parseIsoDay(day)!;
            d.setMonth(d.getMonth() + (e.key === 'PageUp' ? -1 : 1));
            moveFocus(toIsoDay(d));
        }
    };

    const status = mode === 'range'
        ? anchor ? 'Bitiş gününü seçin' : value ? formatRange(value) : 'Başlangıç gününü seçin'
        : value ? formatRange(value) : 'Bir haftanın gününe basın';

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
                <button type="button" className="m-icon-btn !w-9 !h-9" aria-label="Önceki ay" onClick={() => shift(-1)}><Icon name="chevronLeft" size={18} /></button>
                <span className="flex-1 text-center text-[15px] font-semibold m-text" aria-live="polite">{MONTH_NAMES[view.m]} {view.y}</span>
                <button type="button" className="m-icon-btn !w-9 !h-9" aria-label="Sonraki ay" onClick={() => shift(1)}><Icon name="chevronRight" size={18} /></button>
            </div>
            <div ref={gridRef} role="grid" aria-label={`${MONTH_NAMES[view.m]} ${view.y}`} className="grid gap-y-0.5" style={{ gridTemplateColumns: mode === 'week' ? '28px repeat(7, 1fr)' : 'repeat(7, 1fr)' }} onMouseLeave={() => setHover(null)}>
                {mode === 'week' && <span className="text-[11px] m-text-3 text-center self-center" aria-hidden="true">Hf</span>}
                {WEEKDAY_ABBR.map((w, i) => <span key={w} role="columnheader" className={`text-[12px] text-center py-1 ${i >= 5 ? 'm-text-3' : 'm-text-2'}`}>{w}</span>)}
                {rows.map(row => (
                    <React.Fragment key={`${row.year}-${row.week}`}>
                        {mode === 'week' && <span className="text-[11px] m-text-3 m-tabular text-center self-center" aria-hidden="true">{row.week}</span>}
                        {row.cells.map(c => {
                            const sel = inRange(c.day, shown);
                            const edge = !!shown && (c.day === shown.start || c.day === shown.end);
                            const off = disabled(c.day);
                            const isToday = c.day === today;
                            return (
                                <button
                                    key={c.day}
                                    type="button"
                                    role="gridcell"
                                    data-day={c.day}
                                    data-focus={c.day === focusDay ? 'true' : undefined}
                                    tabIndex={c.day === focusDay ? 0 : -1}
                                    aria-selected={sel}
                                    aria-current={isToday ? 'date' : undefined}
                                    aria-label={`${c.date} ${MONTH_NAMES[parseIsoDay(c.day)!.getMonth()]} ${parseIsoDay(c.day)!.getFullYear()}${isToday ? ', bugün' : ''}`}
                                    disabled={off}
                                    onClick={() => choose(c.day)}
                                    onMouseEnter={() => setHover(c.day)}
                                    onFocus={() => setFocusDay(c.day)}
                                    onKeyDown={e => onKey(e, c.day)}
                                    className="h-9 border-0 text-[14px] m-tabular cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                                    style={{
                                        background: edge ? 'var(--m-accent)' : sel ? 'var(--m-accent-tint)' : 'transparent',
                                        color: edge ? 'var(--m-on-accent)' : sel ? 'var(--m-accent-ink)' : c.inMonth ? (c.weekend ? 'var(--m-label-3)' : 'var(--m-label)') : 'var(--m-chevron)',
                                        fontWeight: edge || isToday ? 600 : 400,
                                        borderRadius: edge ? 10 : sel ? 0 : 10,
                                        boxShadow: isToday && !edge ? 'inset 0 0 0 1.5px var(--m-accent)' : undefined,
                                    }}
                                >
                                    {c.date}
                                </button>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
            <p className="m-0 text-[13px] m-text-3 text-center" aria-live="polite">{status}</p>
            {presets && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t m-sep" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                    {rangePresets().map(p => (
                        <button key={p.key} type="button" className="m-btn m-btn-plain !min-h-[34px] !px-2.5 !text-[13px]" onClick={() => { setAnchor(null); onPick(p.range); }}>{p.label}</button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ------------------------------------------------------------------ hafta seçici

/** Önceki/sonraki hafta + takvimden hafta seçimi (haftalık rapor, günlük) */
export const WeekPicker: React.FC<{
    year: number;
    week: number;
    label: string;
    onChange: (year: number, week: number) => void;
    workdays?: boolean;
    max?: IsoDay;
}> = ({ year, week, label, onChange, workdays = true, max }) => {
    const [open, setOpen] = useState(false);
    const btn = useRef<HTMLButtonElement>(null);
    const range = weekRange(year, week, workdays);
    const step = (delta: number) => {
        const d = parseIsoDay(range.start)!;
        d.setDate(d.getDate() + delta * 7);
        const w = isoWeekOf(d);
        onChange(w.year, w.week);
    };
    const nextBlocked = !!max && weekRange(year, week, false).end >= max;
    return (
        <div className="flex items-center gap-1">
            <button type="button" className="m-icon-btn" aria-label="Önceki hafta" onClick={() => step(-1)}><Icon name="chevronLeft" /></button>
            <button ref={btn} type="button" aria-haspopup="dialog" aria-expanded={open} title="Takvimden hafta seçin" onClick={() => setOpen(o => !o)}
                className="m-row-link !w-auto inline-flex items-center justify-center gap-2 min-h-[40px] min-w-[170px] px-3 rounded-xl text-[15px] font-semibold m-tabular">
                <span className="m-accent"><Icon name="calendar" size={17} /></span>{label}
            </button>
            <button type="button" className="m-icon-btn" aria-label="Sonraki hafta" disabled={nextBlocked} onClick={() => step(1)} style={nextBlocked ? { opacity: 0.35 } : undefined}><Icon name="chevronRight" /></button>
            {open && (
                <Popover anchor={btn.current} label="Hafta seçin" width={316} onClose={() => setOpen(false)}>
                    <Calendar mode="week" value={range} workdays={workdays} max={max} onPick={r => { const w = isoWeekOf(parseIsoDay(r.start)!); onChange(w.year, w.week); setOpen(false); btn.current?.focus(); }} />
                </Popover>
            )}
        </div>
    );
};

// ------------------------------------------------------------------ gün aralığı alanı

/** Form alanı: basınca açılan takvimden başlangıç–bitiş seçilir */
export const DateRangeField: React.FC<{
    id?: string;
    value: DayRange | null;
    onChange: (r: DayRange | null) => void;
    placeholder?: string;
    min?: IsoDay;
    max?: IsoDay;
    presets?: boolean;
    clearable?: boolean;
    ariaLabel?: string;
}> = ({ id, value, onChange, placeholder = 'Tarih aralığı seçin', min, max, presets = false, clearable = false, ariaLabel }) => {
    const [open, setOpen] = useState(false);
    const btn = useRef<HTMLButtonElement>(null);
    return (
        <div className="relative flex items-center gap-1.5">
            <button ref={btn} id={id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel ? `${ariaLabel}: ${value ? formatRange(value) : 'seçilmedi'}` : undefined} onClick={() => setOpen(o => !o)}
                className="m-input flex items-center gap-2 text-left cursor-pointer">
                <span className="m-accent flex-none"><Icon name="calendar" size={17} /></span>
                <span className={`flex-1 min-w-0 truncate ${value ? 'm-text' : 'm-text-3'}`}>{value ? formatRange(value) : placeholder}</span>
            </button>
            {clearable && value && <button type="button" className="m-icon-btn !w-9 !h-9 flex-none" aria-label="Aralığı temizle" onClick={() => onChange(null)}><Icon name="x" size={16} /></button>}
            {open && (
                <Popover anchor={btn.current} label="Tarih aralığı seçin" width={300} onClose={() => setOpen(false)}>
                    <Calendar mode="range" value={value} min={min} max={max} presets={presets} onPick={r => { onChange(r); setOpen(false); btn.current?.focus(); }} />
                </Popover>
            )}
        </div>
    );
};

// ------------------------------------------------------------------ ay aralığı alanı

/** Yıl içinde ay aralığı: ilk tık başlangıç, ikinci tık bitiş ayı */
export const MonthRangeField: React.FC<{
    id?: string;
    year: number;
    value: MonthRange;
    onChange: (r: MonthRange) => void;
    ariaLabel?: string;
}> = ({ id, year, value, onChange, ariaLabel }) => {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<number | null>(null);
    const [hover, setHover] = useState<number | null>(null);
    const btn = useRef<HTMLButtonElement>(null);
    const shown = anchor !== null ? orderMonths(anchor, hover ?? anchor) : value;
    const close = () => { setOpen(false); setAnchor(null); setHover(null); };
    const pick = (m: number) => {
        if (anchor === null) { setAnchor(m); return; }
        onChange(orderMonths(anchor, m));
        close();
        btn.current?.focus();
    };
    return (
        <>
            <button ref={btn} id={id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel ? `${ariaLabel}: ${formatMonthRange(value, year)}` : undefined} onClick={() => (open ? close() : setOpen(true))}
                className="m-input flex items-center gap-2 text-left cursor-pointer">
                <span className="m-accent flex-none"><Icon name="calendar" size={17} /></span>
                <span className="flex-1 min-w-0 truncate m-text">{formatMonthRange(value, year)}</span>
            </button>
            {open && (
                <Popover anchor={btn.current} label="Ay aralığı seçin" width={300} onClose={close}>
                    <div className="flex flex-col gap-2">
                        <span className="text-center text-[15px] font-semibold m-text">{year}</span>
                        <div className="grid grid-cols-3 gap-1" role="grid" aria-label={`${year} ayları`} onMouseLeave={() => setHover(null)}>
                            {MONTH_ABBR.map((label, i) => {
                                const m = i + 1;
                                const sel = m >= shown.from && m <= shown.to;
                                const edge = m === shown.from || m === shown.to;
                                return (
                                    <button key={m} type="button" role="gridcell" aria-selected={sel} aria-label={MONTH_NAMES[i]} data-focus={m === value.from ? 'true' : undefined}
                                        onClick={() => pick(m)} onMouseEnter={() => setHover(m)}
                                        className="h-10 rounded-xl border-0 text-[14px] cursor-pointer"
                                        style={{ background: edge ? 'var(--m-accent)' : sel ? 'var(--m-accent-tint)' : 'transparent', color: edge ? 'var(--m-on-accent)' : sel ? 'var(--m-accent-ink)' : 'var(--m-label)', fontWeight: edge ? 600 : 400 }}>
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="m-0 text-[13px] m-text-3 text-center" aria-live="polite">{anchor === null ? 'Başlangıç ayını seçin' : 'Bitiş ayını seçin'}</p>
                    </div>
                </Popover>
            )}
        </>
    );
};
