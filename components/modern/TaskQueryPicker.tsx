import React, { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Task } from '../../types';
import { pertDays } from '../../utils/planning/lifecycle';
import { compileTaskQuery, QUERY_EXAMPLES, QUERY_FIELDS, QuerySuggestion, suggestTaskQuery, TaskQueryContext } from '../../utils/taskQuery';
import { Icon } from './icons';
import SavedTaskQueries from './SavedTaskQueries';
import { PRIORITY_META, sprintLabel, TASK_STATUS_LABELS } from './taskMeta';
import { rowSep } from './ui';

/**
 * Sorguyla görev bulma ve toplu seçme. JQL benzeri sorgu dili
 * (utils/taskQuery.ts) otomatik tamamlamayla yazılır; eşleşenler tek
 * tıkla seçilir, seçime eklenir ya da seçimden çıkarılır, satırlar tek tek
 * işaretlenir. Seçim dışarıda tutulur (ekran ne yapacağına kendi karar verir).
 */

interface Props {
    projectId: string;
    /** Aday görevler (sorgu bunların içinde çalışır) */
    tasks: Task[];
    ctx: TaskQueryContext;
    selected: ReadonlySet<string>;
    onChange: (next: Set<string>) => void;
    initialQuery?: string;
    disabled?: boolean;
    /** Tabloda en çok kaç satır çizilir (toplu seçim hepsine uygulanır) */
    maxRows?: number;
    /** Tablonun en büyük yüksekliği */
    maxHeight?: number;
    onViewTask?: (task: Task) => void;
    /** Erişilebilir ad öneki (aynı sayfada birden çok seçici olursa) */
    label?: string;
}

const RECENT_KEY = 'pa-task-query-recent';
const readRecent = (): string[] => {
    try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 6) : []; } catch { return []; }
};
const pushRecent = (q: string): string[] => {
    const next = [q, ...readRecent().filter(x => x !== q)].slice(0, 6);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* tarayıcı depolaması kapalı olabilir */ }
    return next;
};

const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

const TaskQueryPicker: React.FC<Props> = ({ projectId, tasks, ctx, selected, onChange, initialQuery = '', disabled = false, maxRows = 300, maxHeight = 360, onViewTask, label = 'Görev sorgusu' }) => {
    const [query, setQuery] = useState(initialQuery);
    const [caret, setCaret] = useState(initialQuery.length);
    const [focused, setFocused] = useState(false);
    const [active, setActive] = useState(0);
    const [onlySelected, setOnlySelected] = useState(false);
    const [recent, setRecent] = useState<string[]>(readRecent);
    const [helpOpen, setHelpOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const helpButtonRef = useRef<HTMLButtonElement>(null);
    const pendingCaret = useRef<number | null>(null);
    const listId = useId();
    const helpId = useId();
    const deferred = useDeferredValue(query);

    const compiled = useMemo(() => compileTaskQuery(deferred, ctx), [deferred, ctx]);
    const matches = useMemo<Task[]>(() => {
        if (!compiled.ok) return [];
        const out = tasks.filter(compiled.query.test);
        if (compiled.query.compare) out.sort(compiled.query.compare);
        return out;
    }, [compiled, tasks]);
    const shown = onlySelected ? matches.filter(t => selected.has(t.id)) : matches;
    const rows = shown.slice(0, maxRows);
    const selectedInMatches = matches.reduce((n, t) => n + (selected.has(t.id) ? 1 : 0), 0);
    const selectedOutside = selected.size - selectedInMatches;
    const allRowsOn = rows.length > 0 && rows.every(t => selected.has(t.id));
    const pending = deferred !== query;
    const selectionDisabled = disabled || pending;

    const sugg = useMemo(() => (focused && !disabled ? suggestTaskQuery(query, caret, tasks, ctx) : { from: 0, to: 0, items: [] as QuerySuggestion[] }), [focused, disabled, query, caret, tasks, ctx]);
    const items = sugg.items.slice(0, 12);
    const open = items.length > 0;
    useEffect(() => { setActive(0); }, [query, caret]);
    useEffect(() => {
        if (pendingCaret.current === null || !inputRef.current) return;
        inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
        pendingCaret.current = null;
    });

    const apply = (s: QuerySuggestion) => {
        const next = query.slice(0, sugg.from) + s.insert + query.slice(sugg.to);
        const pos = sugg.from + s.insert.length;
        pendingCaret.current = pos;
        setQuery(next);
        setCaret(pos);
        inputRef.current?.focus();
    };
    const remember = () => { if (!pending && compiled.ok && query.trim()) setRecent(pushRecent(query.trim())); };
    const setAll = (q: string) => { setQuery(q); setCaret(q.length); pendingCaret.current = q.length; inputRef.current?.focus(); };
    const useQuery = (value: string) => {
        setHelpOpen(false);
        setAll(value);
        setFocused(false);
    };

    const replaceWithMatches = () => { remember(); onChange(new Set(matches.map(t => t.id))); };
    const addMatches = () => { remember(); const n = new Set(selected); matches.forEach(t => n.add(t.id)); onChange(n); };
    const removeMatches = () => { remember(); const n = new Set(selected); matches.forEach(t => n.delete(t.id)); onChange(n); };
    const toggle = (id: string) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); onChange(n); };
    const toggleRows = () => { const n = new Set(selected); rows.forEach(t => (allRowsOn ? n.delete(t.id) : n.add(t.id))); onChange(n); };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setActive(a => (a + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
            return;
        }
        if (open && e.key === 'Enter' && items[active]) {
            e.preventDefault();
            apply(items[active]);
            return;
        }
        if (e.key === 'Enter') { e.preventDefault(); remember(); setFocused(false); }
        if (e.key === 'Escape' && open) { e.preventDefault(); setFocused(false); }
    };

    const err = compiled.ok === false && !pending ? compiled : null;

    return (
        <div className="flex flex-col gap-2.5">
            <div onKeyDown={e => {
                if (e.key !== 'Escape' || !helpOpen || e.defaultPrevented) return;
                e.preventDefault();
                setHelpOpen(false);
                helpButtonRef.current?.focus();
            }}>
                <div className="flex items-center gap-2">
                    <label className="flex flex-1 min-w-0 items-center gap-2 min-h-[44px] px-3.5 rounded-xl m-input !py-0" style={err ? { boxShadow: '0 0 0 2px var(--m-bad)' } : undefined}>
                        <Icon name="search" size={18} strokeWidth={2} />
                        <input
                            ref={inputRef}
                            role="combobox"
                            aria-label={label}
                            aria-expanded={open}
                            aria-controls={listId}
                            aria-autocomplete="list"
                            aria-activedescendant={open ? `${listId}-${active}` : undefined}
                            aria-invalid={!!err}
                            aria-describedby={err ? `${listId}-err` : undefined}
                            spellCheck={false}
                            autoComplete="off"
                            disabled={disabled}
                            className="flex-1 min-w-0 border-0 bg-transparent outline-none text-[15px] m-text font-mono"
                            placeholder='Ör. durum = Açık AND öncelik >= Yüksek ORDER BY termin'
                            value={query}
                            onChange={e => { setQuery(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); setFocused(true); }}
                            onSelect={e => setCaret((e.target as HTMLInputElement).selectionStart ?? query.length)}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setTimeout(() => {
                                if (inputRef.current && document.activeElement !== inputRef.current) setFocused(false);
                            }, 120)}
                            onKeyDown={onKeyDown}
                        />
                        {query && !disabled && <button type="button" className="m-icon-btn !w-8 !h-8" aria-label="Sorguyu temizle" onClick={() => setAll('')}><Icon name="x" size={16} /></button>}
                    </label>
                    <button
                        ref={helpButtonRef}
                        type="button"
                        aria-label="Sorgu örnekleri"
                        aria-expanded={helpOpen}
                        aria-controls={helpId}
                        title="Sorgu örnekleri"
                        className={`m-icon-btn shrink-0 !w-9 !h-9 ${helpOpen ? 'm-fill-2 m-accent' : ''}`}
                        onClick={() => { setHelpOpen(value => !value); setFocused(false); }}
                    >
                        <Icon name="info" size={18} />
                    </button>
                </div>
                <section id={helpId} aria-labelledby={`${helpId}-title`} hidden={!helpOpen} className="ml-auto mt-2 w-full max-w-2xl m-surface m-pop rounded-xl border m-sep p-3.5">
                    <h3 id={`${helpId}-title`} className="m-0 text-[15px] font-semibold m-text">Sorgu örnekleri</h3>
                    <p className="mt-1 mb-2.5 text-[13px] m-text-2">Sonuçları süzmek için bir örnek seçin. Kayıtları işaretlemek için “Eşleşenleri seç” düğmesini kullanın.</p>
                    <ul className="m-0 p-0 list-none grid gap-1.5 sm:grid-cols-2">
                        {QUERY_EXAMPLES.map(({ query: example, text }) => (
                            <li key={example} className="min-w-0">
                                <button type="button" disabled={disabled} className="m-row-link h-full rounded-lg px-2.5 py-2 disabled:opacity-50 disabled:cursor-default" onClick={() => useQuery(example)}>
                                    <span className="block text-[13px] font-semibold">{text}</span>
                                    <code className="block mt-0.5 text-[12px] m-accent break-words">{example}</code>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <details className="mt-2 text-[13px] m-text-2">
                        <summary className="cursor-pointer font-semibold m-accent py-1">Sorgu dili ve alanlar</summary>
                        <div className="flex flex-col gap-2 mt-1">
                            <p className="m-0">Koşulları <code>AND</code>, <code>OR</code>, <code>NOT</code> ve parantezle birleştirin. Yan yana yazılan koşullar VE sayılır. <code>~</code> içerir, <code>!~</code> içermez. Listeler için <code>IN (a, b)</code> veya <code>NOT IN</code>, boş alanlar için <code>IS EMPTY</code> veya <code>IS NOT EMPTY</code> kullanın.</p>
                            <p className="m-0">Boşluk içeren değerleri tırnak içine alın. Düz metin başlık, açıklama, anahtar ve etiketlerde aranır. <code>*</code> joker karakterdir. <code>ORDER BY termin DESC</code> bitiş tarihine göre azalan sıralar. Tarihlerde <code>2026-12-31</code>, <code>today()</code>, <code>-7d</code> ve <code>+2w</code> kullanılabilir.</p>
                            <ul className="m-0 p-0 list-none grid gap-x-4 gap-y-1 sm:grid-cols-2">
                                {QUERY_FIELDS.map(f => <li key={f.key}><code className="m-text">{f.label}</code>{f.key !== f.label ? <span className="m-text-3"> ({f.key})</span> : null} · {f.hint}</li>)}
                            </ul>
                        </div>
                    </details>
                </section>
                {open && (
                    <ul id={listId} role="listbox" aria-label="Öneriler" className="mt-1 m-0 p-1 list-none rounded-xl m-surface max-h-[240px] overflow-y-auto" style={{ border: '1px solid var(--m-separator)' }}>
                        {items.map((s, i) => (
                            <li
                                key={`${s.kind}-${s.label}-${i}`}
                                id={`${listId}-${i}`}
                                role="option"
                                aria-selected={i === active}
                                className="flex items-center gap-3 px-3 min-h-[36px] rounded-lg cursor-pointer text-[14px]"
                                style={{ background: i === active ? 'var(--m-accent-tint)' : undefined }}
                                onMouseDown={e => { e.preventDefault(); apply(s); }}
                                onMouseEnter={() => setActive(i)}
                            >
                                <span className={`font-mono ${s.kind === 'op' || s.kind === 'keyword' ? 'm-accent font-semibold' : 'm-text'}`}>{s.label}</span>
                                {s.hint && <span className="ml-auto m-text-3 text-[13px] truncate">{s.hint}</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {err && <p id={`${listId}-err`} role="alert" className="m-0 text-[13px] m-ink-bad">{err.error}</p>}
            <SavedTaskQueries key={projectId} projectId={projectId} query={query} canSave={compiled.ok && !compiled.query.empty && !pending} disabled={disabled} onUse={useQuery} />
            {!query && recent.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] m-text-3">Son sorgular:</span>
                    {recent.map(r => <button key={r} type="button" disabled={disabled} className="inline-flex items-center h-7 px-2.5 rounded-full m-fill-2 text-[12px] m-text font-mono max-w-[320px] truncate border-0 cursor-pointer" onClick={() => setAll(r)}>{r}</button>)}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
                <span className="text-[14px] m-text-2 mr-1" aria-live="polite">
                    <b className="m-text">{num(matches.length)}</b> eşleşme · <b className="m-text">{num(selected.size)}</b> seçili{selectedOutside > 0 ? ` (${num(selectedOutside)} tanesi bu sorgunun dışında)` : ''}
                </span>
                <button type="button" className="m-btn m-btn-gray !min-h-[36px]" disabled={selectionDisabled || !matches.length} onClick={replaceWithMatches} title="Seçimi eşleşenlerle değiştirir">Eşleşenleri seç</button>
                <button type="button" className="m-btn m-btn-plain !min-h-[36px]" disabled={selectionDisabled || !matches.length || selectedInMatches === matches.length} onClick={addMatches}>Seçime ekle</button>
                <button type="button" className="m-btn m-btn-plain !min-h-[36px]" disabled={selectionDisabled || !selectedInMatches} onClick={removeMatches}>Seçimden çıkar</button>
                <button type="button" className="m-btn m-btn-plain !min-h-[36px]" disabled={disabled || !selected.size} onClick={() => onChange(new Set())}>Temizle</button>
                <label className="ml-auto flex items-center gap-2 min-h-[36px] text-[14px] m-text-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4" checked={onlySelected} onChange={e => setOnlySelected(e.target.checked)} />Yalnız seçilenler
                </label>
            </div>

            <div className="relative overflow-x-auto overflow-y-auto -mx-1 rounded-xl" style={{ maxHeight }}>
                {!rows.length ? (
                    <p className="m-0 px-1 py-3 text-[14px] m-text-3">{err ? 'Sorgu düzeltilince sonuçlar burada görünür.' : tasks.length ? 'Sorguya uyan kayıt yok.' : 'Aday kayıt yok.'}</p>
                ) : (
                    <table className="w-full min-w-[640px] text-[14px] border-collapse">
                        <thead className="sticky top-0 z-10 m-surface">
                            <tr className="text-left m-text-3 text-[13px]">
                                <th className="py-2 px-1 w-8"><input type="checkbox" aria-label="Görünen satırların tümünü seç" checked={allRowsOn} disabled={selectionDisabled} onChange={toggleRows} /></th>
                                <th className="font-semibold py-2 px-1">Kayıt</th>
                                <th className="font-semibold py-2 px-1">Durum</th>
                                <th className="font-semibold py-2 px-1">Öncelik</th>
                                <th className="font-semibold py-2 px-1">Atanan</th>
                                <th className="font-semibold py-2 px-1">Sprint</th>
                                <th className="font-semibold py-2 px-1 text-right">Tahmin</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((t, i) => {
                                const sep = rowSep(i);
                                const d = pertDays(t);
                                return (
                                    <tr key={t.id} className={sep.className} style={sep.style}>
                                        <td className="py-1.5 px-1"><input type="checkbox" aria-label={`${t.name} seç`} checked={selected.has(t.id)} disabled={selectionDisabled} onChange={() => toggle(t.id)} /></td>
                                        <td className="py-1.5 px-1 max-w-[340px]">
                                            {onViewTask
                                                ? <button type="button" className="m-0 p-0 bg-transparent border-0 text-left cursor-pointer m-text truncate max-w-full block" onClick={() => onViewTask(t)}>{t.name}</button>
                                                : <span className="m-text truncate block">{t.name}</span>}
                                            {t.jiraId && <span className="block text-[12px] m-text-3">{t.jiraId}</span>}
                                        </td>
                                        <td className="py-1.5 px-1 m-text-2 whitespace-nowrap">{t.jiraStatus || TASK_STATUS_LABELS[t.status]}</td>
                                        <td className={`py-1.5 px-1 whitespace-nowrap ${PRIORITY_META[t.priority].ink}`}>{PRIORITY_META[t.priority].label}</td>
                                        <td className="py-1.5 px-1 m-text-2 whitespace-nowrap max-w-[160px] truncate">{t.resourceName || '—'}</td>
                                        <td className="py-1.5 px-1 m-text-2 whitespace-nowrap">{sprintLabel(t.version || 0, ctx.sprintNames)}</td>
                                        <td className="py-1.5 px-1 text-right m-tabular whitespace-nowrap">{d ? `${num(d)} gün` : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
            {shown.length > rows.length && <p className="m-0 text-[13px] m-text-3">İlk {num(rows.length)} satır gösteriliyor; düğmeler {num(matches.length)} eşleşmenin tümüne uygulanır.</p>}

        </div>
    );
};

export default TaskQueryPicker;
