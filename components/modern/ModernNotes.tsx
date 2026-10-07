import React, { useMemo, useRef, useState } from 'react';
import { Note } from '../../types';
import {
    allTags, createNote, editNoteContent, filterNotes, groupNotesByWeek, isDoneLine, NoteToken, reminderLines, tokenizeLine, todoLines, toggleTodo, updateLine,
} from '../../utils/notes';
import { isoWeekOf, shiftWeek, weekLabel } from '../../utils/weeklyReport';
import { Icon } from './icons';
import { rowSep } from './ui';

/**
 * Modern Günlük: proje notlarının haftalık akışı. Yazım alanı (#etiket,
 * @kişi, [ ] görev, #anımsatıcı, biçimlendirme), haftalara ve günlere göre
 * akış, satır bazında gelişme notu, yapılacaklar ve anımsatıcılar.
 * Bu haftanın notları haftalık rapor taslağına kaynak olur.
 */

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DEFAULT_TAG_COLOR = '#8E8E93';

// ---------------------------------------------------------------- yazım alanı

const NoteInput: React.FC<{
    value: string;
    onChange: (v: string) => void;
    onSubmit?: () => void;
    mentionNames: string[];
    tags: string[];
    rows?: number;
    autoFocus?: boolean;
    placeholder?: string;
    label: string;
    compact?: boolean;
}> = ({ value, onChange, onSubmit, mentionNames, tags, rows = 4, autoFocus, placeholder, label, compact }) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    const [suggest, setSuggest] = useState<{ type: '@' | '#'; query: string } | null>(null);

    const detect = (v: string, cursor: number) => {
        const before = v.slice(0, cursor);
        const m = /(^|\s)([@#])([\wğüşöçİĞÜŞÖÇı-]*)$/.exec(before);
        setSuggest(m ? { type: m[2] as '@' | '#', query: m[3] } : null);
    };
    const wrap = (prefix: string, suffix = '') => {
        const el = ref.current;
        if (!el) return;
        const { selectionStart: s, selectionEnd: e } = el;
        const next = value.slice(0, s) + prefix + value.slice(s, e) + suffix + value.slice(e);
        onChange(next);
        setTimeout(() => { el.focus(); el.setSelectionRange(s + prefix.length, e + prefix.length); }, 0);
    };
    const linePrefix = (prefix: string) => {
        const el = ref.current;
        if (!el) return;
        const s = el.selectionStart;
        const lineStart = value.lastIndexOf('\n', s - 1) + 1;
        if (value.slice(lineStart).startsWith(prefix)) return;
        onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart));
        setTimeout(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length); }, 0);
    };
    const insert = (text: string) => {
        const el = ref.current;
        if (!el || !suggest) return;
        const cursor = el.selectionStart;
        const start = value.lastIndexOf(suggest.type, cursor - 1);
        const next = `${value.slice(0, start)}${suggest.type}${text} ${value.slice(cursor)}`;
        onChange(next);
        setSuggest(null);
        const pos = start + text.length + 2;
        setTimeout(() => { el.focus(); el.setSelectionRange(pos, pos); }, 0);
    };
    const q = (suggest?.query || '').toLocaleLowerCase('tr-TR');
    const options = !suggest ? [] : (suggest.type === '@' ? mentionNames : tags).filter(o => o.toLocaleLowerCase('tr-TR').includes(q)).slice(0, 8);

    const tool = (lbl: string, icon: React.ReactNode, onClick: () => void) => (
        <button type="button" className="m-icon-btn !w-9 !h-9 text-[14px]" aria-label={lbl} title={lbl} onMouseDown={e => e.preventDefault()} onClick={onClick}>{icon}</button>
    );

    return (
        <div className="relative flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-0.5 -ml-1.5">
                {tool('Kalın', <b>B</b>, () => wrap('**', '**'))}
                {tool('İtalik', <i className="font-serif">I</i>, () => wrap('*', '*'))}
                {tool('Vurgula', <span className="px-1 rounded" style={{ background: 'var(--m-warn-tint)', color: 'var(--m-warn-ink)' }}>V</span>, () => wrap('==', '=='))}
                <span className="w-px h-5 m-fill mx-1" aria-hidden="true"></span>
                <button type="button" aria-label="Görev satırı ekle" className="m-btn m-btn-plain !min-h-[34px] !px-2.5 text-[14px]" onMouseDown={e => e.preventDefault()} onClick={() => linePrefix('[ ] ')}><Icon name="check" size={15} />Görev</button>
                <button type="button" aria-label="Anımsatıcı ekle" className="m-btn m-btn-plain !min-h-[34px] !px-2.5 text-[14px]" onMouseDown={e => e.preventDefault()} onClick={() => wrap('#anımsatıcı ')}><Icon name="bell" size={15} />Anımsatıcı</button>
            </div>
            <textarea
                ref={ref}
                aria-label={label}
                className={`m-input py-2.5 leading-relaxed ${compact ? '' : 'text-[16px]'}`}
                rows={rows}
                autoFocus={autoFocus}
                value={value}
                placeholder={placeholder}
                onChange={e => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
                onKeyDown={e => {
                    if (e.key === 'Escape' && suggest) { e.preventDefault(); setSuggest(null); }
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmit) { e.preventDefault(); onSubmit(); }
                }}
                onBlur={() => setTimeout(() => setSuggest(null), 150)}
            />
            {options.length > 0 && (
                <ul role="listbox" aria-label={suggest?.type === '@' ? 'Kişiler' : 'Etiketler'} className="absolute left-0 top-full mt-1 z-50 w-64 m-0 p-1.5 list-none m-surface m-pop rounded-2xl max-h-64 overflow-y-auto">
                    {options.map(o => (
                        <li key={o}>
                            <button type="button" role="option" aria-selected="false" className="m-row-link flex items-center gap-2 min-h-[40px] px-3 rounded-xl text-[15px]" onMouseDown={e => e.preventDefault()} onClick={() => insert(suggest!.type === '@' ? o.replace(/\s+/g, '') : o)}>
                                <span className="m-text-3">{suggest?.type}</span>{o}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// ---------------------------------------------------------------- satır

const Tokens: React.FC<{ tokens: NoteToken[]; tagColors: Record<string, string>; onTag: (t: string) => void; onToggle?: () => void }> = ({ tokens, tagColors, onTag, onToggle }) => (
    <>
        {tokens.map((t, i) => {
            switch (t.kind) {
                case 'todo':
                    return (
                        <button key={i} type="button" disabled={!onToggle} onClick={onToggle} aria-label={t.done ? 'Görevi geri al' : 'Görevi tamamla'} aria-pressed={t.done}
                            className="inline-flex items-center justify-center w-5 h-5 mr-2 -mb-1 rounded-md align-baseline border-0 cursor-pointer disabled:cursor-default"
                            style={t.done ? { background: 'var(--m-ok)', color: '#fff' } : { boxShadow: 'inset 0 0 0 1.5px var(--m-label-3)', background: 'transparent' }}>
                            {t.done && <Icon name="check" size={13} strokeWidth={3} />}
                        </button>
                    );
                case 'bold': return <strong key={i} style={t.color ? { color: t.color } : undefined}>{t.text}</strong>;
                case 'italic': return <em key={i} style={t.color ? { color: t.color } : undefined}>{t.text}</em>;
                case 'mark': return <mark key={i} className="px-1 rounded" style={{ background: 'var(--m-warn-tint)', color: 'var(--m-warn-ink)' }}>{t.text}</mark>;
                case 'tag': {
                    const c = tagColors[t.tag];
                    return (
                        <button key={i} type="button" onClick={() => onTag(t.tag)} className="inline-flex items-center h-6 px-2 mx-0.5 rounded-full text-[13px] font-semibold border-0 cursor-pointer align-baseline"
                            style={c ? { color: c, background: `${c}1f` } : { color: 'var(--m-label-2)', background: 'var(--m-fill)' }}>#{t.tag}</button>
                    );
                }
                case 'mention': return <span key={i} className="inline-flex items-center h-6 px-2 mx-0.5 rounded-full text-[13px] font-semibold m-tone-accent align-baseline">@{t.name}</span>;
                default: return <span key={i} style={t.color ? { color: t.color } : undefined}>{t.text}</span>;
            }
        })}
    </>
);

const NoteCard: React.FC<{
    note: Note;
    canEdit: boolean;
    tagColors: Record<string, string>;
    mentionNames: string[];
    tags: string[];
    onTag: (t: string) => void;
    onSave: (n: Note) => void;
    onDelete: () => void;
}> = ({ note, canEdit, tagColors, mentionNames, tags, onTag, onSave, onDelete }) => {
    const [editing, setEditing] = useState<string | null>(null);
    const [lineEdit, setLineEdit] = useState<{ index: number; text: string; update: string } | null>(null);
    const [menu, setMenu] = useState(false);
    const lines = (note.content || '').split('\n');
    const time = new Date(note.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    if (editing !== null) {
        return (
            <article className="m-surface rounded-2xl p-4 flex flex-col gap-3">
                <NoteInput label="Notu düzenle" value={editing} onChange={setEditing} onSubmit={() => { onSave(editNoteContent(note, editing)); setEditing(null); }} mentionNames={mentionNames} tags={tags} rows={6} autoFocus compact />
                <div className="flex justify-end gap-2">
                    <button type="button" className="m-btn m-btn-plain" onClick={() => setEditing(null)}>Vazgeç</button>
                    <button type="button" className="m-btn m-btn-primary" disabled={!editing.trim()} onClick={() => { onSave(editNoteContent(note, editing)); setEditing(null); }}>Kaydet</button>
                </div>
            </article>
        );
    }

    return (
        <article className="m-surface rounded-2xl px-4 py-3 flex flex-col gap-1">
            {lines.map((line, i) => {
                if (!line.trim() && i !== lines.length - 1) return <div key={i} className="h-2" aria-hidden="true"></div>;
                const update = note.lineUpdates?.[i];
                const done = isDoneLine(line);
                if (lineEdit?.index === i) {
                    return (
                        <div key={i} className="rounded-xl m-fill-2 p-3 my-1 flex flex-col gap-2">
                            <label className="text-[13px] font-semibold m-text-2" htmlFor={`ln-${note.id}-${i}`}>Satır</label>
                            <textarea id={`ln-${note.id}-${i}`} className="m-input py-2" rows={2} value={lineEdit.text} onChange={e => setLineEdit({ ...lineEdit, text: e.target.value })} />
                            <label className="text-[13px] font-semibold m-text-2" htmlFor={`lu-${note.id}-${i}`}>Gelişme notu</label>
                            <textarea id={`lu-${note.id}-${i}`} className="m-input py-2" rows={2} autoFocus value={lineEdit.update} placeholder="Bu madde için kısa bir ilerleme notu" onChange={e => setLineEdit({ ...lineEdit, update: e.target.value })} />
                            <div className="flex justify-end gap-2">
                                <button type="button" className="m-btn m-btn-plain !min-h-[38px]" onClick={() => setLineEdit(null)}>Vazgeç</button>
                                <button type="button" className="m-btn m-btn-primary !min-h-[38px]" onClick={() => { onSave(updateLine(note, i, lineEdit.text, lineEdit.update)); setLineEdit(null); }}>Kaydet</button>
                            </div>
                        </div>
                    );
                }
                return (
                    <div key={i} className="group flex flex-col">
                        <div className="flex items-start gap-2">
                            <p className={`m-0 flex-1 min-w-0 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${done ? 'line-through m-text-3' : 'm-text'}`}>
                                <Tokens tokens={tokenizeLine(line)} tagColors={tagColors} onTag={onTag} onToggle={canEdit ? () => onSave(toggleTodo(note, i)) : undefined} />
                            </p>
                            {canEdit && line.trim() && (
                                <button type="button" className={`m-icon-btn !w-8 !h-8 flex-none ${update ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`} aria-label="Gelişme notu ekle / düzenle" title="Gelişme notu"
                                    onClick={() => setLineEdit({ index: i, text: line, update: update || '' })}>
                                    <Icon name="message" size={15} />
                                </button>
                            )}
                        </div>
                        {update && (
                            <p className="m-0 ml-4 mb-1 pl-3 text-[14px] leading-relaxed m-ink-warn border-l-2" style={{ borderColor: 'var(--m-warn)', borderLeftStyle: 'solid' }}>{update}</p>
                        )}
                    </div>
                );
            })}
            <div className="flex items-center gap-2 pt-1">
                <span className="text-[13px] m-text-3 m-tabular">{time}</span>
                <span className="flex-1"></span>
                {canEdit && (
                    <div className="relative">
                        <button type="button" className="m-icon-btn !w-9 !h-9" aria-label="Not işlemleri" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}><Icon name="more" size={18} /></button>
                        {menu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} aria-hidden="true"></div>
                                <div role="menu" className="absolute right-0 bottom-full mb-1 w-44 m-surface m-pop rounded-2xl py-1.5 z-50">
                                    <button type="button" role="menuitem" className="m-row-link w-full flex items-center gap-2 min-h-[44px] px-3.5 text-[15px]" onClick={() => { setMenu(false); setEditing(note.content); }}><Icon name="pencil" size={16} />Düzenle</button>
                                    <button type="button" role="menuitem" className="m-row-link w-full flex items-center gap-2 min-h-[44px] px-3.5 text-[15px] m-ink-bad" onClick={() => { setMenu(false); if (window.confirm('Bu not silinsin mi?')) onDelete(); }}><Icon name="trash" size={16} />Sil</button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
};

// ---------------------------------------------------------------- sayfa

export interface ModernNotesProps {
    notes: Note[];
    mentionNames: string[];
    tagColors: Record<string, string>;
    canEdit: boolean;
    onAdd: (n: Note) => void;
    onUpdate: (n: Note) => void;
    onDelete: (id: string) => void;
    onSetTagColors: (colors: Record<string, string>) => void;
    onOpenWeeklyReport?: () => void;
}

type Mode = 'feed' | 'todos' | 'reminders';

const ModernNotes: React.FC<ModernNotesProps> = ({ notes, mentionNames, tagColors, canEdit, onAdd, onUpdate, onDelete, onSetTagColors, onOpenWeeklyReport }) => {
    const [draft, setDraft] = useState('');
    const [day, setDay] = useState(today());
    const [mode, setMode] = useState<Mode>('feed');
    const [tag, setTag] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const tags = useMemo(() => allTags(notes), [notes]);
    const tagNames = useMemo(() => tags.map(t => t.tag), [tags]);
    const todos = useMemo(() => todoLines(notes), [notes]);
    const reminders = useMemo(() => reminderLines(notes), [notes]);
    const openTodos = todos.filter(t => !t.done).length;
    const filtered = useMemo(() => filterNotes(notes, { tag, query }), [notes, tag, query]);
    const weeks = useMemo(() => groupNotesByWeek(filtered), [filtered]);
    const shownWeeks = showAll || tag || query ? weeks : weeks.slice(0, 4);
    const now = isoWeekOf(new Date());
    const prev = shiftWeek(now.year, now.week, -1);
    const thisWeekCount = notes.filter(n => isoWeekOf(new Date(n.createdAt)).week === now.week && isoWeekOf(new Date(n.createdAt)).year === now.year).length;
    const byId = useMemo(() => new Map(notes.map(n => [n.id, n])), [notes]);

    const add = () => {
        if (!draft.trim()) return;
        onAdd(createNote(draft.trim(), day));
        setDraft('');
        setMode('feed');
    };
    const pickTag = (t: string) => { setTag(cur => (cur === t ? null : t)); setMode('feed'); };

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
            <div className="flex flex-col gap-5 min-w-0">
                {canEdit && (
                    <section aria-label="Not yazma alanı" className="m-surface rounded-2xl p-4 sm:p-5 flex flex-col gap-3">
                        <NoteInput
                            label="Yeni not"
                            value={draft}
                            onChange={setDraft}
                            onSubmit={add}
                            mentionNames={mentionNames}
                            tags={tagNames}
                            placeholder="Bugün projede neler oldu? #etiket, @kişi, [ ] görev"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-2 text-[14px] m-text-2">
                                <Icon name="calendar" size={16} />
                                <span className="sr-only">Not tarihi</span>
                                <input type="date" aria-label="Not tarihi" className="m-input !min-h-[38px] !w-auto" value={day} max={today()} onChange={e => setDay(e.target.value || today())} />
                            </label>
                            <span className="flex-1 text-[13px] m-text-3 hidden sm:block">Ctrl + Enter ile kaydet</span>
                            <button type="button" className="m-btn m-btn-primary" disabled={!draft.trim()} onClick={add}>Not ekle</button>
                        </div>
                    </section>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    <div className="m-segmented" role="group" aria-label="Görünüm">
                        <button type="button" className="m-segment" aria-pressed={mode === 'feed'} onClick={() => setMode('feed')}>Akış<span className="m-text-3 m-tabular">{notes.length}</span></button>
                        <button type="button" className="m-segment" aria-pressed={mode === 'todos'} onClick={() => setMode('todos')}>Yapılacaklar<span className="m-text-3 m-tabular">{openTodos}</span></button>
                        <button type="button" className="m-segment" aria-pressed={mode === 'reminders'} onClick={() => setMode('reminders')}>Anımsatıcılar<span className="m-text-3 m-tabular">{reminders.length}</span></button>
                    </div>
                    {tag && mode === 'feed' && (
                        <button type="button" className="m-pill is-active" onClick={() => setTag(null)} aria-label={`#${tag} süzgecini kaldır`}>#{tag}<Icon name="x" size={14} /></button>
                    )}
                    {mode === 'feed' && (
                        <label className="m-search flex items-center gap-2 min-h-[40px] px-3 rounded-[10px] m-text-3 ml-auto">
                            <Icon name="search" size={16} />
                            <input aria-label="Notlarda ara" className="bg-transparent border-0 outline-none text-[15px] m-text w-44" placeholder="Notlarda ara" value={query} onChange={e => setQuery(e.target.value)} />
                        </label>
                    )}
                </div>

                {mode === 'feed' && (
                    weeks.length === 0 ? (
                        <div className="m-surface rounded-2xl px-5 py-12 flex flex-col items-center gap-2 text-center">
                            <span className="w-11 h-11 rounded-full m-tone-accent flex items-center justify-center"><Icon name="pen" size={20} /></span>
                            <span className="text-[17px] font-semibold m-text">{notes.length ? 'Bu süzgeçte not yok' : 'Günlük boş'}</span>
                            {!notes.length && <span className="text-[15px] m-text-3 max-w-[52ch]">Toplantıları, kararları ve gelişmeleri kısa notlarla yazın; haftalık rapor taslağı bu notlardan hazırlanır.</span>}
                        </div>
                    ) : (
                        <>
                            {shownWeeks.map(w => {
                                const key = `${w.year}-${w.week}`;
                                const isRecent = (w.year === now.year && w.week === now.week) || (w.year === prev.year && w.week === prev.week);
                                const closed = collapsed[key] ?? false;
                                return (
                                    <section key={key} aria-label={weekLabel(w.year, w.week)} className="flex flex-col gap-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button type="button" className="inline-flex items-center gap-1.5 bg-transparent border-0 p-0 text-[17px] font-semibold m-text cursor-pointer" aria-expanded={!closed} onClick={() => setCollapsed(c => ({ ...c, [key]: !closed }))}>
                                                <Icon name={closed ? 'chevronRight' : 'chevronDown'} size={18} />
                                                {weekLabel(w.year, w.week)}
                                                <span className="text-[14px] font-normal m-text-3 m-tabular">{w.count} not</span>
                                            </button>
                                            <span className="flex-1"></span>
                                            {isRecent && onOpenWeeklyReport && (
                                                <button type="button" className="inline-flex items-center gap-1 bg-transparent border-0 p-0 text-[14px] font-semibold m-accent cursor-pointer" onClick={onOpenWeeklyReport}>
                                                    <Icon name="report" size={15} />Haftalık rapora git
                                                </button>
                                            )}
                                        </div>
                                        {!closed && w.days.map(d => (
                                            <div key={d.key} className="flex flex-col gap-2">
                                                <h3 className="m-0 text-[13px] font-semibold m-text-3">{d.label}</h3>
                                                {d.notes.map(n => (
                                                    <NoteCard key={n.id} note={n} canEdit={canEdit} tagColors={tagColors} mentionNames={mentionNames} tags={tagNames} onTag={pickTag} onSave={onUpdate} onDelete={() => onDelete(n.id)} />
                                                ))}
                                            </div>
                                        ))}
                                    </section>
                                );
                            })}
                            {!showAll && !tag && !query && weeks.length > shownWeeks.length && (
                                <button type="button" className="m-btn m-btn-gray self-start" onClick={() => setShowAll(true)}>Daha eski haftalar ({weeks.length - shownWeeks.length})</button>
                            )}
                        </>
                    )
                )}

                {mode === 'todos' && (
                    todos.length === 0 ? (
                        <div className="m-surface rounded-2xl px-5 py-10 text-center text-[15px] m-text-3">Notlarda görev yok. Bir satırın başına “[ ] ” yazarak görev ekleyin.</div>
                    ) : (
                        <div className="m-surface rounded-2xl p-1.5">
                            {todos.map((t, i) => {
                                const sep = rowSep(i);
                                const note = byId.get(t.noteId);
                                return (
                                    <div key={`${t.noteId}-${t.lineIndex}`} className={`flex items-center gap-3 px-3 py-2.5 min-h-[52px] ${sep.className}`} style={sep.style}>
                                        <button type="button" disabled={!canEdit || !note} aria-label={t.done ? 'Görevi geri al' : 'Görevi tamamla'} aria-pressed={t.done}
                                            onClick={() => note && onUpdate(toggleTodo(note, t.lineIndex))}
                                            className="w-6 h-6 flex-none rounded-lg border-0 inline-flex items-center justify-center cursor-pointer disabled:cursor-default"
                                            style={t.done ? { background: 'var(--m-ok)', color: '#fff' } : { boxShadow: 'inset 0 0 0 1.5px var(--m-label-3)', background: 'transparent' }}>
                                            {t.done && <Icon name="check" size={14} strokeWidth={3} />}
                                        </button>
                                        <span className={`flex-1 min-w-0 text-[15px] ${t.done ? 'line-through m-text-3' : 'm-text'}`}>{t.text || '(boş görev)'}</span>
                                        <span className="text-[13px] m-text-3 whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}

                {mode === 'reminders' && (
                    reminders.length === 0 ? (
                        <div className="m-surface rounded-2xl px-5 py-10 text-center text-[15px] m-text-3">Anımsatıcı yok. Satıra “#anımsatıcı” ekleyerek hatırlatma bırakın.</div>
                    ) : (
                        <div className="m-surface rounded-2xl p-1.5">
                            {reminders.map((r, i) => {
                                const sep = rowSep(i);
                                return (
                                    <div key={`${r.noteId}-${r.lineIndex}`} className={`flex items-center gap-3 px-3 py-2.5 min-h-[52px] ${sep.className}`} style={sep.style}>
                                        <span className="w-8 h-8 rounded-full m-tone-warn flex items-center justify-center flex-none"><Icon name="bell" size={16} /></span>
                                        <span className="flex-1 min-w-0 text-[15px] m-text">{r.text || '(boş)'}</span>
                                        <span className="text-[13px] m-text-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}
            </div>

            <aside className="flex flex-col gap-5 min-w-0">
                <section aria-label="Bu hafta" className="m-surface rounded-2xl p-5 flex flex-col gap-3">
                    <h2 className="m-0 text-[17px] font-semibold m-text">Bu hafta</h2>
                    <div className="grid grid-cols-3 gap-2 text-center">
                        {[['Not', thisWeekCount], ['Açık görev', openTodos], ['Anımsatıcı', reminders.length]].map(([l, v]) => (
                            <div key={l as string} className="rounded-xl m-fill-2 py-2.5 flex flex-col">
                                <span className="text-[22px] font-bold m-text m-tabular leading-tight">{v}</span>
                                <span className="text-[12.5px] m-text-3">{l}</span>
                            </div>
                        ))}
                    </div>
                    {onOpenWeeklyReport && (
                        <p className="m-0 text-[13px] m-text-3">
                            Bu haftanın notları haftalık rapor taslağına kaynak olur.{' '}
                            <button type="button" className="bg-transparent border-0 p-0 font-semibold m-accent cursor-pointer" onClick={onOpenWeeklyReport}>Raporu aç</button>
                        </p>
                    )}
                </section>

                <section aria-label="Etiketler" className="m-surface rounded-2xl p-5 flex flex-col gap-2">
                    <h2 className="m-0 text-[17px] font-semibold m-text">Etiketler</h2>
                    <ul className="m-0 p-0 list-none flex flex-col">
                        {tags.map(t => {
                            const c = tagColors[t.tag];
                            const active = tag?.toLocaleLowerCase('tr-TR') === t.tag.toLocaleLowerCase('tr-TR');
                            return (
                                <li key={t.tag} className="flex items-center gap-2">
                                    <label className="relative w-6 h-6 flex-none rounded-full cursor-pointer" style={{ background: c || DEFAULT_TAG_COLOR }} title={canEdit ? 'Renk seç' : undefined}>
                                        {canEdit && <input type="color" aria-label={`#${t.tag} rengi`} className="absolute inset-0 opacity-0 cursor-pointer" value={c || DEFAULT_TAG_COLOR} onChange={e => onSetTagColors({ ...tagColors, [t.tag]: e.target.value })} />}
                                    </label>
                                    <button type="button" aria-pressed={active} onClick={() => pickTag(t.tag)} className={`m-row-link flex-1 flex items-center gap-2 min-h-[40px] px-2 rounded-xl text-[15px] ${active ? 'font-semibold' : ''}`}>
                                        <span className="flex-1 truncate">#{t.tag}</span>
                                        <span className="text-[13px] m-text-3 m-tabular">{t.count}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            </aside>
        </div>
    );
};

export default ModernNotes;
