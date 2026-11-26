import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Project, Task } from '../../../types';
import { KIND_LABEL, searchProject, WbRefKind, WbSearchHit } from '../../../utils/whiteboard/model';
import { WB_TEMPLATES } from '../../../utils/whiteboard/templates';
import TaskKeyButton from '../TaskKeyButton';
import { Icon, IconName } from '../icons';

/**
 * "/" komut paleti (FigJam'in hızlı ekleme menüsü): proje kayıtlarını arar
 * (görev, sprint, iş paketi, risk, sürüm), nesne ve şablon ekler, oylama ve
 * zamanlayıcı başlatır. Metin yazarken "//" ile açılınca yalnız referans
 * ekler (görev anahtarı metne yazılır, panoda düğme olarak görünür).
 */

export type PaletteAction =
    | { kind: 'hit'; hit: WbSearchHit; withTasks?: boolean; keepOpen?: boolean }
    | { kind: 'create'; type: 'sticky' | 'text' | 'section' | 'shape' | 'stamp' }
    | { kind: 'template'; key: string }
    | { kind: 'vote' }
    | { kind: 'timer'; seconds: number };

interface Command { id: string; label: string; hint: string; icon: IconName; action: PaletteAction; words: string }

const COMMANDS: Command[] = [
    { id: 'c-sticky', label: 'Yapışkan not', hint: 'S', icon: 'sticky', action: { kind: 'create', type: 'sticky' }, words: 'not sticky yapiskan' },
    { id: 'c-text', label: 'Metin', hint: 'T', icon: 'type', action: { kind: 'create', type: 'text' }, words: 'metin yazi text baslik' },
    { id: 'c-section', label: 'Bölüm', hint: 'Shift+S', icon: 'frame', action: { kind: 'create', type: 'section' }, words: 'bolum section alan cerceve' },
    { id: 'c-shape', label: 'Şekil', hint: 'R', icon: 'square', action: { kind: 'create', type: 'shape' }, words: 'sekil kutu dikdortgen shape' },
    { id: 'c-stamp', label: 'Damga', hint: 'E', icon: 'smile', action: { kind: 'create', type: 'stamp' }, words: 'damga emoji tepki stamp' },
    { id: 'c-vote', label: 'Oylama', hint: 'Başlat / bitir', icon: 'thumbsUp', action: { kind: 'vote' }, words: 'oylama oy vote' },
    { id: 'c-t3', label: 'Zamanlayıcı 3 dk', hint: 'Ortak geri sayım', icon: 'clock', action: { kind: 'timer', seconds: 180 }, words: 'zamanlayici sayac timer sure 3' },
    { id: 'c-t5', label: 'Zamanlayıcı 5 dk', hint: 'Ortak geri sayım', icon: 'clock', action: { kind: 'timer', seconds: 300 }, words: 'zamanlayici sayac timer sure 5' },
    { id: 'c-t10', label: 'Zamanlayıcı 10 dk', hint: 'Ortak geri sayım', icon: 'clock', action: { kind: 'timer', seconds: 600 }, words: 'zamanlayici sayac timer sure 10' },
    ...WB_TEMPLATES.map(t => ({ id: `t-${t.key}`, label: `Şablon: ${t.label}`, hint: t.description, icon: t.icon as IconName, action: { kind: 'template' as const, key: t.key }, words: `sablon template ${t.label}` })),
];

const KIND_ICON: Record<WbRefKind, IconName> = { task: 'check', sprint: 'rocket', workPackage: 'briefcase', risk: 'shield', version: 'flag' };

const fold = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** "görev mps" → tür süzgeci + sorgu */
const KIND_WORDS: [string, WbRefKind][] = [['gorev', 'task'], ['task', 'task'], ['sprint', 'sprint'], ['epic', 'workPackage'], ['is paketi', 'workPackage'], ['risk', 'risk'], ['surum', 'version'], ['version', 'version']];
export const parseQuery = (q: string): { kinds?: WbRefKind[]; text: string } => {
    const f = fold(q.trim());
    for (const [w, k] of KIND_WORDS) {
        if (f === w || f.startsWith(`${w} `)) return { kinds: [k], text: q.trim().slice(w.length).trim() };
    }
    return { text: q };
};

type Row = { id: string; hit?: WbSearchHit; cmd?: Command };

export const WbPalette: React.FC<{
    project: Project;
    tasksById: Map<string, Task>;
    /** Ekran konumu (kapsayıcıya göre) */
    at: { x: number; y: number };
    mode: 'insert' | 'reference';
    canEdit: boolean;
    votingActive: boolean;
    onAction: (a: PaletteAction) => void;
    onViewTask: (t: Task) => void;
    onClose: () => void;
}> = ({ project, tasksById, at, mode, canEdit, votingActive, onAction, onViewTask, onClose }) => {
    const [q, setQ] = useState('');
    const [active, setActive] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLDivElement>(null);
    useEffect(() => { input.current?.focus(); }, []);

    const rows: Row[] = useMemo(() => {
        const pq = parseQuery(q);
        const hits = searchProject(project, pq.text, { kinds: pq.kinds, limit: 40 }).map(h => ({ id: `${h.kind}:${h.ref}`, hit: h }));
        if (mode === 'reference') return hits;
        const f = fold(q.trim());
        const cmds = canEdit && !pq.kinds ? COMMANDS.filter(c => !f || fold(`${c.label} ${c.words}`).includes(f)).map(c => ({ id: c.id, cmd: c })) : [];
        // Sorgu yokken önce ekleme komutları, yazınca önce kayıtlar
        return f ? [...hits, ...cmds] : [...cmds.slice(0, 5), ...hits, ...cmds.slice(5)];
    }, [q, project, mode, canEdit]);

    useEffect(() => { setActive(0); }, [q]);
    useEffect(() => {
        list.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    const choose = (r: Row | undefined, opts: { withTasks?: boolean; keepOpen?: boolean } = {}) => {
        if (!r) return;
        if (r.hit) onAction({ kind: 'hit', hit: r.hit, ...opts });
        else if (r.cmd) onAction(r.cmd.action);
        if (!opts.keepOpen) onClose();
    };

    const hasTasks = (h: WbSearchHit) => h.kind === 'sprint' || h.kind === 'workPackage' || h.kind === 'version';

    return (
        <div className="absolute z-40 w-[440px] max-w-[calc(100%-16px)] rounded-2xl m-surface m-pop shadow-2xl overflow-hidden" style={{ left: at.x, top: at.y, border: '1px solid var(--m-sep, #e5e7eb)' }}
            onPointerDown={e => e.stopPropagation()} role="dialog" aria-label={mode === 'reference' ? 'Referans ekle' : 'Panoya ekle'}>
            <div className="flex items-center gap-2 px-3 h-12 border-b m-sep" style={{ borderBottomStyle: 'solid', borderBottomWidth: 1 }}>
                <Icon name={mode === 'reference' ? 'slash' : 'search'} size={17} className="m-text-3" />
                <input ref={input} value={q} onChange={e => setQ(e.target.value)} className="flex-1 bg-transparent border-0 outline-none text-[15px] m-text"
                    placeholder={mode === 'reference' ? 'Görev, sprint, iş paketi ara…' : 'Görev anahtarı ya da ad, "sprint 3", "risk", komut…'}
                    role="combobox" aria-expanded="true" aria-controls="wb-palette-list" aria-activedescendant={rows[active] ? `wb-row-${active}` : undefined}
                    onKeyDown={e => {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(rows.length - 1, a + 1)); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
                        else if (e.key === 'Enter') { e.preventDefault(); choose(rows[active], { keepOpen: e.shiftKey && mode === 'insert', withTasks: e.altKey }); }
                        else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
                        e.stopPropagation();
                    }} />
                <kbd className="text-[11px] m-text-3 px-1.5 py-0.5 rounded m-fill-2">Esc</kbd>
            </div>
            <div ref={list} id="wb-palette-list" role="listbox" className="max-h-[360px] overflow-y-auto py-1">
                {rows.length === 0 && <p className="m-0 px-4 py-6 text-center text-[14px] m-text-3">Eşleşen kayıt yok.</p>}
                {rows.map((r, i) => {
                    const task = r.hit?.kind === 'task' ? tasksById.get(r.hit.ref) : undefined;
                    return (
                        <div key={r.id} id={`wb-row-${i}`} data-row={i} role="option" aria-selected={i === active}
                            className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer ${i === active ? 'm-fill-2' : ''}`}
                            onMouseEnter={() => setActive(i)} onClick={e => choose(r, { keepOpen: e.shiftKey && mode === 'insert' })}>
                            <span className="w-8 h-8 rounded-lg grid place-items-center flex-none m-fill-2 m-text-2">
                                <Icon name={r.hit ? KIND_ICON[r.hit.kind] : r.cmd!.icon} size={16} />
                            </span>
                            {task && <span onClick={e => e.stopPropagation()}><TaskKeyButton task={task} onOpen={() => onViewTask(task)} className="!min-h-[26px] !px-2 !text-[12px]" /></span>}
                            <span className="flex-1 min-w-0">
                                <span className="block text-[14px] m-text truncate">{r.hit ? r.hit.label : r.cmd!.label}</span>
                                <span className="block text-[12px] m-text-3 truncate">{r.hit ? `${KIND_LABEL[r.hit.kind]}${r.hit.sub ? ` · ${r.hit.sub}` : ''}` : r.cmd!.hint}{r.cmd?.action.kind === 'vote' && votingActive ? ' · şu an açık (bitir)' : ''}</span>
                            </span>
                            {r.hit && hasTasks(r.hit) && mode === 'insert' && canEdit && (
                                <button type="button" className="m-btn m-btn-plain !min-h-[28px] !px-2 text-[12.5px] flex-none" title="Kartı ve görevlerini bir bölüm içinde ekle (Alt+Enter)"
                                    onClick={e => { e.stopPropagation(); choose(r, { withTasks: true }); }}>+ görevleri</button>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="px-3 py-2 text-[11.5px] m-text-3 border-t m-sep" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                {mode === 'reference'
                    ? 'Enter: metne ekle · görev anahtarı panoda düğme olur'
                    : 'Enter: ekle · Shift+Enter: ekle ve açık kalsın · Alt+Enter: sprint / iş paketini görevleriyle · "görev", "sprint", "risk" ile süz'}
            </div>
        </div>
    );
};
