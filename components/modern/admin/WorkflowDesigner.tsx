import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Person, TaskStatus, WorkflowConfig, WorkflowStatusDef } from '../../../types';
import { dropRuleKeys, edgeRuleKey, entryRuleKey, renameRuleKeys, ruleIsEmpty, setRule } from '../../../utils/transitions';
import TransitionRuleEditor from './TransitionRuleEditor';
import { linearTransitions } from '../../../utils/projectScheme';
import { CATEGORY_LABELS, CATEGORY_ORDER, WORKFLOW_STATUSES, workflowKey } from '../../../utils/workflow';
import { Icon } from '../icons';

/**
 * Görsel iş akışı tasarımcısı (Jira workflow designer benzeri):
 *  - Durumlar tuvalde kutudur; sürükleyerek yerleştirilir (konum şemayla kaydedilir).
 *  - Kutunun sağındaki tutamaçtan başka kutuya sürükleyince koyu ok = geçiş çizilir.
 *  - Oka tıklayıp silinir; kutuya tıklayıp adı, Jira adı, kategorisi, başlangıç
 *    durumu ve "her durumdan gelinebilir" (Jira global geçişi) ayarlanır.
 * `pool` verilirse (proje sahibinin özel akışı) yalnız bu durumlar eklenebilir ve
 * durum tanımları (ad, anahtar, kategori) değiştirilemez.
 */

const NODE_W = 152;
const NODE_H = 46;
const CANVAS_W = 1120;
const CANVAS_H = 560;

const CAT_STYLE: Record<TaskStatus, { bg: string; ink: string; ring: string }> = {
    [TaskStatus.Backlog]: { bg: 'var(--m-fill-2)', ink: 'var(--m-label-2, #3c3c43)', ring: 'var(--m-hold)' },
    [TaskStatus.ToDo]: { bg: 'var(--m-surface)', ink: 'var(--m-label)', ring: 'var(--m-hold)' },
    [TaskStatus.InProgress]: { bg: 'var(--m-accent-tint)', ink: 'var(--m-accent-ink)', ring: 'var(--m-accent)' },
    [TaskStatus.Done]: { bg: 'var(--m-ok-tint)', ink: 'var(--m-ok-ink)', ring: 'var(--m-ok)' },
};

type Pt = { x: number; y: number };

/** Konumu olmayan durumlar için kategori sütunlarına yerleşim */
export const autoLayout = (wf: WorkflowConfig, keep = true): Record<string, Pt> => {
    const out: Record<string, Pt> = {};
    const cols = CATEGORY_ORDER.filter(c => wf.statuses.some(s => s.category === c));
    const used = new Map<number, number>();
    wf.statuses.forEach(s => {
        const prev = keep ? wf.layout?.[s.key] : undefined;
        if (prev) { out[s.key] = prev; return; }
        const ci = Math.max(0, cols.indexOf(s.category));
        const row = used.get(ci) || 0;
        used.set(ci, row + 1);
        out[s.key] = { x: 60 + ci * 250, y: 40 + row * 84 };
    });
    return out;
};

/** Kutu kenarında, merkezden hedefe giden doğrunun çıktığı nokta */
const edgePoint = (c: Pt, toward: Pt): Pt => {
    const dx = toward.x - c.x;
    const dy = toward.y - c.y;
    if (!dx && !dy) return c;
    const sx = (NODE_W / 2 + 4) / Math.abs(dx || 1e-9);
    const sy = (NODE_H / 2 + 4) / Math.abs(dy || 1e-9);
    const k = Math.min(sx, sy);
    return { x: c.x + dx * k, y: c.y + dy * k };
};

interface Props {
    value: WorkflowConfig;
    onChange: (wf: WorkflowConfig) => void;
    /** Kısıtlı mod: yalnız bu durumlar eklenebilir, tanımlar değişmez */
    pool?: WorkflowStatusDef[];
    /** Her durumda kaç görev var (bilgi) */
    usage?: (key: string) => number;
    /** Geçiş kuralları (koşul/doğrulayıcı/sonrası işlem) için kişi havuzu; verilmezse kural düzenleme gizli */
    people?: Person[];
    /** Kurallar yalnız okunur (projeye özel akışta kuralları yönetici tanımlar) */
    rulesReadOnly?: boolean;
}

const WorkflowDesigner: React.FC<Props> = ({ value: wf, onChange, pool, usage, people, rulesReadOnly }) => {
    const restricted = !!pool;
    const layout = useMemo(() => autoLayout(wf), [wf]);
    const [drag, setDrag] = useState<{ key: string; dx: number; dy: number; pos: Pt } | null>(null);
    const [link, setLink] = useState<{ from: string; to: Pt; over?: string } | null>(null);
    const [sel, setSel] = useState<{ kind: 'node'; key: string } | { kind: 'edge'; from: string; to: string } | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    const pos = (k: string): Pt => (drag?.key === k ? drag.pos : layout[k] || { x: 40, y: 40 });
    const center = (k: string): Pt => { const p = pos(k); return { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 }; };
    const local = (e: { clientX: number; clientY: number }): Pt => {
        const r = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - r.left + canvasRef.current!.scrollLeft, y: e.clientY - r.top + canvasRef.current!.scrollTop };
    };
    const keyAt = (e: { clientX: number; clientY: number }): string | undefined =>
        (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-wf-node]') as HTMLElement | null)?.dataset.wfNode;

    const edges = useMemo(() => wf.transitions
        ? Object.entries(wf.transitions as Record<string, string[]>).flatMap(([from, tos]) => tos.filter(to => wf.statuses.some(s => s.key === to)).map(to => ({ from, to })))
        : [], [wf]);
    const hasEdge = (a: string, b: string) => edges.some(e => e.from === a && e.to === b);

    const commit = (patch: Partial<WorkflowConfig>) => onChange({ ...wf, ...patch });
    const addEdge = (from: string, to: string) => {
        if (from === to || !wf.transitions) return;
        const list = wf.transitions[from] || [];
        if (list.includes(to)) return;
        commit({ transitions: { ...wf.transitions, [from]: [...list, to] } });
        setSel({ kind: 'edge', from, to });
    };
    const removeEdge = (from: string, to: string) => {
        if (!wf.transitions) return;
        const rules = wf.rules ? { ...wf.rules } : undefined;
        if (rules) delete rules[edgeRuleKey(from, to)];
        commit({ transitions: { ...wf.transitions, [from]: (wf.transitions[from] || []).filter(x => x !== to) }, ...(rules ? { rules: Object.keys(rules).length ? rules : undefined } : {}) });
        setSel(null);
    };
    const removeNode = (key: string) => {
        if (wf.statuses.length <= 1) return;
        const statuses = wf.statuses.filter(s => s.key !== key);
        const transitions = wf.transitions ? Object.fromEntries(Object.entries(wf.transitions as Record<string, string[]>).filter(([f]) => f !== key).map(([f, t]) => [f, t.filter(x => x !== key)])) : undefined;
        const lay = { ...(wf.layout || layout) };
        delete lay[key];
        commit({ statuses, initial: wf.initial === key ? statuses[0].key : wf.initial, layout: lay, ...(transitions ? { transitions } : {}), rules: dropRuleKeys(wf.rules, key) });
        setSel(null);
    };
    const addNode = (def: WorkflowStatusDef) => {
        if (wf.statuses.some(s => s.key === def.key)) return;
        // Görünür alanın sol üstüne yakın, boş bir yere
        const occupied: Pt[] = Object.values(layout);
        let p: Pt = { x: 40, y: 470 };
        for (let i = 0; i < 40; i++) {
            const c = { x: 40 + (i % 6) * 180, y: 470 - Math.floor(i / 6) * 70 };
            if (!occupied.some(o => Math.abs(o.x - c.x) < NODE_W && Math.abs(o.y - c.y) < NODE_H + 10)) { p = c; break; }
        }
        commit({
            statuses: [...wf.statuses, { ...def }],
            layout: { ...layout, [def.key]: p },
            ...(wf.transitions ? { transitions: { ...wf.transitions, [def.key]: [] } } : {}),
        });
        setSel({ kind: 'node', key: def.key });
    };
    const updateNode = (key: string, patch: Partial<WorkflowStatusDef>) => {
        const nk = patch.key !== undefined ? workflowKey(patch.key) || key : key;
        const statuses = wf.statuses.map(s => (s.key === key ? { ...s, ...patch, key: nk } : s));
        if (nk === key) { commit({ statuses }); return; }
        if (wf.statuses.some(s => s.key === nk)) return; // çakışma: anahtar değişmez
        const transitions = wf.transitions ? Object.fromEntries(Object.entries(wf.transitions as Record<string, string[]>).map(([f, t]) => [f === key ? nk : f, t.map(x => (x === key ? nk : x))])) : undefined;
        const lay = { ...layout, [nk]: layout[key] };
        delete lay[key];
        commit({ statuses, initial: wf.initial === key ? nk : wf.initial, layout: lay, ...(transitions ? { transitions } : {}), rules: renameRuleKeys(wf.rules, key, nk) });
        setSel({ kind: 'node', key: nk });
    };
    const fromAll = (key: string) => {
        if (!wf.transitions) return;
        const tr = { ...wf.transitions };
        wf.statuses.forEach(s => { if (s.key !== key && !(tr[s.key] || []).includes(key)) tr[s.key] = [...(tr[s.key] || []), key]; });
        commit({ transitions: tr });
    };

    // Sürükleme (kutu taşıma ve ok çizme) pencere düzeyinde izlenir
    useEffect(() => {
        if (!drag && !link) return;
        const move = (e: PointerEvent) => {
            const p = local(e);
            if (drag) setDrag(d => (d ? { ...d, pos: { x: Math.max(0, Math.min(CANVAS_W - NODE_W, p.x - d.dx)), y: Math.max(0, Math.min(CANVAS_H - NODE_H, p.y - d.dy)) } } : d));
            if (link) setLink(l => (l ? { ...l, to: p, over: keyAt(e) } : l));
        };
        const up = (e: PointerEvent) => {
            if (drag) {
                const moved = drag.pos.x !== layout[drag.key]?.x || drag.pos.y !== layout[drag.key]?.y;
                if (moved) commit({ layout: { ...layout, [drag.key]: { x: Math.round(drag.pos.x), y: Math.round(drag.pos.y) } } });
                setDrag(null);
            }
            if (link) {
                const target = keyAt(e);
                if (target && target !== link.from) addEdge(link.from, target);
                setLink(null);
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    });

    // Seçili oku/kutuyu klavyeyle silme
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!sel || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            e.preventDefault();
            if (sel.kind === 'edge') removeEdge(sel.from, sel.to);
            else if (!restricted || wf.statuses.length > 1) removeNode(sel.key);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const palette = (pool || WORKFLOW_STATUSES).filter(s => !wf.statuses.some(x => x.key === s.key));
    const selNode = sel?.kind === 'node' ? wf.statuses.find(s => s.key === sel.key) : undefined;
    const selEdge = sel?.kind === 'edge' ? sel : undefined;
    const label = (k: string) => wf.statuses.find(s => s.key === k)?.label || k;
    const ink = 'var(--m-label, #1c1c1e)';

    const pathFor = (from: string, to: string): { d: string; mid: Pt } => {
        const a = center(from);
        const b = center(to);
        const curved = hasEdge(to, from);
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const len = Math.hypot(nx, ny) || 1;
        const off = curved ? 26 : 0;
        const ctrl = { x: (a.x + b.x) / 2 + (nx / len) * off, y: (a.y + b.y) / 2 + (ny / len) * off };
        const p1 = edgePoint(a, curved ? ctrl : b);
        const p2 = edgePoint(b, curved ? ctrl : a);
        const mid = { x: (p1.x + 2 * ctrl.x + p2.x) / 4, y: (p1.y + 2 * ctrl.y + p2.y) / 4 };
        return { d: curved ? `M${p1.x},${p1.y} Q${ctrl.x},${ctrl.y} ${p2.x},${p2.y}` : `M${p1.x},${p1.y} L${p2.x},${p2.y}`, mid };
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Araç çubuğu */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="m-segmented" role="group" aria-label="Geçiş modu">
                    <button type="button" className="m-segment" aria-pressed={!wf.transitions} onClick={() => { const { transitions: _t, ...rest } = wf; onChange(rest); setSel(null); }}>Serbest geçiş</button>
                    <button type="button" className="m-segment" aria-pressed={!!wf.transitions} onClick={() => !wf.transitions && commit({ transitions: Object.fromEntries(wf.statuses.map(s => [s.key, []])) })}>Oklarla çiz</button>
                </div>
                {wf.transitions && <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2.5 text-[13px]" onClick={() => commit({ transitions: linearTransitions(wf) })}>Doğrusal akış</button>}
                {wf.transitions && <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2.5 text-[13px]" onClick={() => { commit({ transitions: Object.fromEntries(wf.statuses.map(s => [s.key, []])) }); setSel(null); }}>Okları temizle</button>}
                <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2.5 text-[13px]" onClick={() => commit({ layout: autoLayout({ ...wf, layout: undefined }, false) })}>Otomatik yerleştir</button>
                <span className="ml-auto text-[12.5px] m-text-3">{wf.transitions ? `${edges.length} geçiş · tutamaçtan (●) sürükleyerek ok çizin, oka tıklayıp Delete ile silin` : 'Serbest: her durumdan her duruma geçilebilir. Kuralları çizmek için "Oklarla çiz".'}</span>
            </div>

            <div className="flex gap-3 items-stretch flex-col">
                {/* Tuval */}
                <div ref={canvasRef} className="relative flex-1 w-full overflow-auto rounded-2xl m-fill-2" style={{ height: Math.max(260, Math.min(460, Math.max(...(Object.values(layout) as Pt[]).map(p => p.y), 0) + NODE_H + 90)), touchAction: 'none' }}
                    onPointerDown={e => { if (e.target === e.currentTarget || (e.target as Element).tagName === 'svg') setSel(null); }}>
                    <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H, backgroundImage: 'radial-gradient(var(--m-sep) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                        <svg width={CANVAS_W} height={CANVAS_H} className="absolute inset-0" role="img" aria-label="Geçiş okları">
                            <defs>
                                <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={ink} /></marker>
                                <marker id="wf-arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--m-accent)" /></marker>
                            </defs>
                            {/* Başlangıç oku */}
                            {wf.statuses.some(s => s.key === wf.initial) && (() => {
                                const p = pos(wf.initial);
                                return <g aria-label="Başlangıç"><circle cx={p.x - 34} cy={p.y + NODE_H / 2} r={6} fill={ink} /><path d={`M${p.x - 28},${p.y + NODE_H / 2} L${p.x - 5},${p.y + NODE_H / 2}`} stroke={ink} strokeWidth={2.2} markerEnd="url(#wf-arrow)" /></g>;
                            })()}
                            {edges.map(e => {
                                const { d } = pathFor(e.from, e.to);
                                const on = selEdge && selEdge.from === e.from && selEdge.to === e.to;
                                return (
                                    <g key={`${e.from}>${e.to}`} style={{ cursor: 'pointer' }} onPointerDown={ev => { ev.stopPropagation(); setSel({ kind: 'edge', from: e.from, to: e.to }); }}>
                                        <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
                                        <path d={d} stroke={on ? 'var(--m-accent)' : ink} strokeWidth={on ? 3 : 2.2} fill="none" markerEnd={`url(#${on ? 'wf-arrow-sel' : 'wf-arrow'})`}>
                                            <title>{`${label(e.from)} → ${label(e.to)}`}</title>
                                        </path>
                                        {!ruleIsEmpty(wf.rules?.[edgeRuleKey(e.from, e.to)]) && (() => {
                                            const { mid } = pathFor(e.from, e.to);
                                            return <g aria-label="Geçiş kuralı var"><circle cx={mid.x} cy={mid.y} r={8} fill="var(--m-warn)" stroke="var(--m-bg)" strokeWidth={2} /><text x={mid.x} y={mid.y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">K</text></g>;
                                        })()}
                                    </g>
                                );
                            })}
                            {link && (() => {
                                const a = center(link.from);
                                const p1 = edgePoint(a, link.to);
                                return <path d={`M${p1.x},${p1.y} L${link.to.x},${link.to.y}`} stroke="var(--m-accent)" strokeWidth={2.4} strokeDasharray="6 4" fill="none" markerEnd="url(#wf-arrow-sel)" />;
                            })()}
                        </svg>
                        {wf.statuses.map(s => {
                            const p = pos(s.key);
                            const st = CAT_STYLE[s.category];
                            const on = sel?.kind === 'node' && sel.key === s.key;
                            const target = link && link.over === s.key && link.from !== s.key;
                            return (
                                <div key={s.key} data-wf-node={s.key} role="button" tabIndex={0} aria-label={`${s.label} (${CATEGORY_LABELS[s.category]})`}
                                    className="absolute rounded-xl flex items-center gap-1.5 pl-3 pr-6 select-none"
                                    style={{
                                        left: p.x, top: p.y, width: NODE_W, height: NODE_H, background: st.bg, color: st.ink, cursor: drag?.key === s.key ? 'grabbing' : 'grab',
                                        boxShadow: `inset 0 0 0 ${on || target ? 2.5 : 1.5}px ${on || target ? 'var(--m-accent)' : st.ring}, 0 1px 3px rgba(0,0,0,.08)`,
                                    }}
                                    onKeyDown={e => { if (e.key === 'Enter') setSel({ kind: 'node', key: s.key }); }}
                                    onPointerDown={e => {
                                        e.stopPropagation();
                                        setSel({ kind: 'node', key: s.key });
                                        const l = local(e);
                                        setDrag({ key: s.key, dx: l.x - p.x, dy: l.y - p.y, pos: p });
                                    }}>
                                    <span className="flex flex-col min-w-0 leading-tight">
                                        <span className="text-[13px] font-bold truncate">{s.label}</span>
                                        <span className="text-[10.5px] opacity-75 truncate">{s.key}{usage && usage(s.key) ? ` · ${usage(s.key)} görev` : ''}</span>
                                    </span>
                                    {!ruleIsEmpty(wf.rules?.[entryRuleKey(s.key)]) && <span title="Bu duruma girişte kural var" className="absolute -top-2 -left-2 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ background: 'var(--m-warn)', color: '#fff' }}>K</span>}
                                    {wf.transitions && (
                                        <span title="Sürükleyerek geçiş oku çizin" aria-label={`${s.label} durumundan ok çiz`} role="button"
                                            className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center"
                                            style={{ background: ink, cursor: 'crosshair', boxShadow: '0 0 0 3px var(--m-bg)' }}
                                            onPointerDown={e => { e.stopPropagation(); setSel(null); setLink({ from: s.key, to: local(e) }); }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Yan panel: seçim ve eklenebilir durumlar */}
                <aside className="w-full grid gap-3 items-start" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                    {selNode && (
                        <section className="m-surface rounded-xl p-3 flex flex-col gap-2" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }} aria-label="Seçili durum">
                            <span className="text-[12px] font-semibold m-text-3">Seçili durum</span>
                            <input aria-label="Durum adı" className="m-input !h-9 !py-0 text-[14px]" value={selNode.label} disabled={restricted} maxLength={40} onChange={e => updateNode(selNode.key, { label: e.target.value })} />
                            <input aria-label="Jira adı" className="m-input !h-9 !py-0 text-[13px]" style={{ textTransform: 'uppercase' }} defaultValue={selNode.key} key={selNode.key} disabled={restricted} maxLength={40}
                                onBlur={e => updateNode(selNode.key, { key: e.target.value })} />
                            <select aria-label="Kategori" className="m-input !h-9 !py-0 text-[13px]" value={selNode.category} disabled={restricted} onChange={e => updateNode(selNode.key, { category: e.target.value as TaskStatus })}>
                                {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                            </select>
                            <button type="button" className="m-btn m-btn-gray !min-h-[32px] text-[13px]" disabled={wf.initial === selNode.key} onClick={() => commit({ initial: selNode.key })}>{wf.initial === selNode.key ? '● Başlangıç durumu' : 'Başlangıç yap'}</button>
                            {wf.transitions && <button type="button" className="m-btn m-btn-gray !min-h-[32px] text-[13px]" onClick={() => fromAll(selNode.key)} title="Jira global geçişi: tüm durumlardan bu duruma ok">Her durumdan gelinebilir</button>}
                            {wf.transitions && (
                                <span className="text-[12px] m-text-3">
                                    Giden: {(wf.transitions[selNode.key] || []).map(label).join(', ') || 'yok'}<br />
                                    Gelen: {edges.filter(e => e.to === selNode.key).map(e => label(e.from)).join(', ') || 'yok'}
                                </span>
                            )}
                            <button type="button" className="m-btn m-btn-plain !min-h-[32px] text-[13px] m-ink-bad" disabled={wf.statuses.length <= 1} onClick={() => removeNode(selNode.key)}><Icon name="trash" size={14} />Durumu akıştan çıkar</button>
                        </section>
                    )}
                    {selEdge && (
                        <section className="m-surface rounded-xl p-3 flex flex-col gap-2" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }} aria-label="Seçili geçiş">
                            <span className="text-[12px] font-semibold m-text-3">Seçili geçiş</span>
                            <span className="text-[14px] font-semibold m-text">{label(selEdge.from)} → {label(selEdge.to)}</span>
                            {!hasEdge(selEdge.to, selEdge.from) && <button type="button" className="m-btn m-btn-gray !min-h-[32px] text-[13px]" onClick={() => addEdge(selEdge.to, selEdge.from)}>Ters yönü de ekle</button>}
                            <button type="button" className="m-btn m-btn-plain !min-h-[32px] text-[13px] m-ink-bad" onClick={() => removeEdge(selEdge.from, selEdge.to)}><Icon name="trash" size={14} />Oku sil</button>
                        </section>
                    )}
                    <section className="flex flex-col gap-1.5" aria-label="Durum ekle">
                        <span className="text-[12px] font-semibold m-text-3">{restricted ? 'Yapılandırmadaki diğer durumlar' : 'Durum ekle'}</span>
                        <div className="flex flex-wrap gap-1.5">
                            {palette.map(s => <button key={s.key} type="button" className="m-pill" title={`${s.key} · ${CATEGORY_LABELS[s.category]}`} onClick={() => addNode(s)}><Icon name="plus" size={12} />{s.label}</button>)}
                            {!restricted && <button type="button" className="m-pill" onClick={() => {
                                let n = 1;
                                while (wf.statuses.some(s => s.key === `YENI DURUM ${n}`)) n++;
                                addNode({ key: `YENI DURUM ${n}`, label: `Yeni durum ${n}`, category: TaskStatus.InProgress });
                            }}><Icon name="plus" size={12} />Özel durum</button>}
                            {palette.length === 0 && restricted && <span className="text-[12.5px] m-text-3">Tüm durumlar akışta.</span>}
                        </div>
                    </section>
                    <p className="m-0 text-[12px] m-text-3">Renk kategoriyi gösterir: gri Yapılacak/Bekleyen, mavi Süreçte, yeşil Tamamlandı. Soldaki ● ok başlangıç durumudur. "K" rozeti: geçiş kuralı (koşul/doğrulayıcı/sonrası işlem) var.</p>
                </aside>
                {people && selEdge && (
                    <TransitionRuleEditor key={`e:${selEdge.from}>${selEdge.to}`} title={`Geçiş kuralı: ${label(selEdge.from)} → ${label(selEdge.to)}`} people={people} readOnly={rulesReadOnly}
                        rule={wf.rules?.[edgeRuleKey(selEdge.from, selEdge.to)] || {}} onChange={r => commit({ rules: setRule(wf.rules, edgeRuleKey(selEdge.from, selEdge.to), r) })} />
                )}
                {people && selNode && (
                    <TransitionRuleEditor key={`n:${selNode.key}`} title={`"${selNode.label}" durumuna girişte (bu duruma gelen tüm geçişler)`} people={people} readOnly={rulesReadOnly}
                        rule={wf.rules?.[entryRuleKey(selNode.key)] || {}} onChange={r => commit({ rules: setRule(wf.rules, entryRuleKey(selNode.key), r) })} />
                )}
            </div>
        </div>
    );
};

export default WorkflowDesigner;
