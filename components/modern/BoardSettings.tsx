import React, { useMemo, useState } from 'react';
import { BoardColumnConfig, BoardConfig, BoardQuickFilter, BoardStatusKey, BoardSwimlane, Task, TaskStatus } from '../../types';
import {
    APP_STATUS_LABELS, boardId, defaultBoardConfig, isJiraKey, jiraKey, statusKeyLabel, statusUsage, topLabels, unmappedStatuses, validateBoardConfig,
} from '../../utils/board';
import { Icon } from './icons';
import { Sheet } from './ui';

/**
 * Pano yapılandırması (Jira "Board settings → Columns" benzeri): kolon ekle /
 * sil / sırala, durumları kolonlar arasında sürükle, eşlenmemiş durumlar,
 * min/max (WIP), etiket kuralı ve kural önceliği; hızlı filtreler; kulvarlar.
 */

type Tab = 'columns' | 'filters' | 'lanes';
const PRIORITIES: Task['priority'][] = ['Blocker', 'High', 'Medium', 'Low'];
const PRIORITY_TR: Record<Task['priority'], string> = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' };
const splitList = (s: string) => [...new Set(s.split(',').map(x => x.trim()).filter(Boolean))];
const numOrUndef = (v: string) => { const n = Math.round(Number(v)); return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined; };

const StatusChip: React.FC<{ k: BoardStatusKey; count?: number; onRemove?: () => void }> = ({ k, count, onRemove }) => (
    <span draggable onDragStart={e => { e.dataTransfer.setData('application/x-board-status', k); e.dataTransfer.effectAllowed = 'move'; }}
        title={`${isJiraKey(k) ? 'Jira durumu' : 'Uygulama durumu'} · sürükleyerek taşıyın`}
        className="m-surface rounded-lg pl-2 pr-1 h-9 flex items-center gap-2 cursor-grab active:cursor-grabbing" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
        <span className={`inline-flex items-center h-5 px-1.5 rounded text-[11.5px] font-bold truncate max-w-[130px] ${isJiraKey(k) ? 'm-accent-tint' : 'm-fill-2 m-text-2'}`} style={isJiraKey(k) ? { textTransform: 'uppercase' } : undefined}>{statusKeyLabel(k)}</span>
        <span className="flex-1 text-[12px] m-text-3 m-tabular whitespace-nowrap">{count ? `${count} görev` : '—'}</span>
        {onRemove && <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${statusKeyLabel(k)} durumunu kolondan çıkar`} onClick={onRemove}><Icon name="x" size={13} /></button>}
    </span>
);

const BoardSettings: React.FC<{
    tasks: Task[];
    config: BoardConfig;
    isCustom: boolean;
    people: string[];
    onClose: () => void;
    onSave: (cfg: BoardConfig | undefined) => void;
}> = ({ tasks, config, isCustom, people, onClose, onSave }) => {
    const [cfg, setCfg] = useState<BoardConfig>(() => JSON.parse(JSON.stringify(config)));
    const [tab, setTab] = useState<Tab>('columns');
    const [hover, setHover] = useState<string | null>(null);
    const [newJira, setNewJira] = useState('');
    const usage = useMemo(() => statusUsage(tasks), [tasks]);
    const extraKeys = useMemo(() => cfg.columns.flatMap(c => c.statuses).filter(k => !usage.has(k)), [cfg, usage]);
    const [manual, setManual] = useState<BoardStatusKey[]>([]);
    const allUsage = useMemo(() => { const m = new Map(usage); [...extraKeys, ...manual].forEach(k => { if (!m.has(k)) m.set(k, 0); }); return m; }, [usage, extraKeys, manual]);
    const unmapped = unmappedStatuses(cfg, allUsage);
    const errors = validateBoardConfig(cfg);
    const labels = useMemo(() => topLabels(tasks, 16), [tasks]);

    const setCol = (id: string, patch: Partial<BoardColumnConfig>) => setCfg(c => ({ ...c, columns: c.columns.map(x => (x.id === id ? { ...x, ...patch } : x)) }));
    const moveStatus = (k: BoardStatusKey, toColumn: string | null) => setCfg(c => ({
        ...c,
        columns: c.columns.map(x => {
            const without = x.statuses.filter(s => s !== k);
            return x.id === toColumn ? { ...x, statuses: [...without, k] } : { ...x, statuses: without };
        }),
    }));
    const moveCol = (i: number, d: -1 | 1) => setCfg(c => {
        const cols = [...c.columns];
        const j = i + d;
        if (j < 0 || j >= cols.length) return c;
        [cols[i], cols[j]] = [cols[j], cols[i]];
        return { ...c, columns: cols };
    });
    const addColumn = () => setCfg(c => ({ ...c, columns: [...c.columns, { id: boardId('col'), name: 'Yeni kolon', statuses: [], targetStatus: TaskStatus.InProgress }] }));
    const removeColumn = (col: BoardColumnConfig) => {
        if (cfg.columns.length <= 1) return;
        setCfg(c => ({ ...c, columns: c.columns.filter(x => x.id !== col.id) }));
    };
    const addJiraStatus = () => {
        const name = newJira.trim();
        if (!name) return;
        const k = jiraKey(name);
        if (!allUsage.has(k)) setManual(m => [...m, k]);
        setNewJira('');
    };
    const dropProps = (target: string | null) => ({
        onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('application/x-board-status')) { e.preventDefault(); setHover(target ?? '__unmapped'); } },
        onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(null); },
        onDrop: (e: React.DragEvent) => { const k = e.dataTransfer.getData('application/x-board-status') as BoardStatusKey; setHover(null); if (k) { e.preventDefault(); moveStatus(k, target); } },
    });

    // ---------------- hızlı filtreler
    const [qf, setQf] = useState<{ name: string; assignee: string; labels: string; priorities: Task['priority'][]; overdue: boolean; recentDays: string }>({ name: '', assignee: '', labels: '', priorities: [], overdue: false, recentDays: '' });
    const qfValid = qf.name.trim() && (qf.assignee || qf.labels.trim() || qf.priorities.length || qf.overdue || numOrUndef(qf.recentDays));
    const addFilter = (f: Omit<BoardQuickFilter, 'id'>) => setCfg(c => ({ ...c, quickFilters: [...c.quickFilters, { id: boardId('qf'), ...f }] }));
    const describe = (f: BoardQuickFilter) => [
        f.assignee ? (f.assignee === 'me' ? 'atanan: ben' : `atanan: ${f.assignee}`) : '',
        f.labels?.length ? `etiket: ${f.labels.join(', ')}` : '',
        f.priorities?.length ? `öncelik: ${f.priorities.map(p => PRIORITY_TR[p]).join(', ')}` : '',
        f.overdue ? 'geciken' : '',
        f.recentDays ? `son ${f.recentDays} günde güncellenen` : '',
    ].filter(Boolean).join(' · ');
    const moveFilter = (i: number, d: -1 | 1) => setCfg(c => {
        const list = [...c.quickFilters];
        const j = i + d;
        if (j < 0 || j >= list.length) return c;
        [list[i], list[j]] = [list[j], list[i]];
        return { ...c, quickFilters: list };
    });

    const tabs: { key: Tab; label: string }[] = [{ key: 'columns', label: 'Kolonlar ve kurallar' }, { key: 'filters', label: `Hızlı filtreler (${cfg.quickFilters.length})` }, { key: 'lanes', label: 'Kulvarlar ve görünüm' }];

    return (
        <Sheet xl title="Panoyu yapılandır" subtitle="Jira'daki gibi: durumları kolonlara sürükleyin; etiket kuralı ve WIP sınırı tanımlayın." onClose={onClose}
            footer={(
                <>
                    {isCustom && <button type="button" className="m-btn m-btn-plain" onClick={() => { if (window.confirm('Pano varsayılan ayarlara dönsün mü?')) onSave(undefined); }}>Varsayılana dön</button>}
                    <span className="flex-1"></span>
                    <button type="button" className="m-btn m-btn-gray" onClick={onClose}>Vazgeç</button>
                    <button type="button" className="m-btn m-btn-primary" disabled={errors.length > 0} onClick={() => onSave(cfg)}><Icon name="check" size={16} />Kaydet</button>
                </>
            )}>
            <div role="tablist" className="flex gap-1 p-1 rounded-xl m-fill-2 self-start">
                {tabs.map(t => (
                    <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                        className={`h-8 px-3 rounded-lg border-0 cursor-pointer text-[14px] ${tab === t.key ? 'm-surface font-semibold m-text' : 'bg-transparent m-text-2'}`}>{t.label}</button>
                ))}
            </div>
            {errors.length > 0 && <div role="alert" className="m-tone-bad rounded-xl px-3 py-2 text-[13.5px]">{errors.map(e => <div key={e}>{e}</div>)}</div>}

            {tab === 'columns' && (
                <>
                    <div className="flex flex-wrap items-center gap-3 text-[14px]">
                        <span className="m-text-2 font-semibold">Kural önceliği:</span>
                        <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="rp" checked={cfg.rulePriority === 'status'} onChange={() => setCfg(c => ({ ...c, rulePriority: 'status' }))} />Önce durum (süreç), etiket aynı durumun kolonları arasında seçer</label>
                        <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="rp" checked={cfg.rulePriority === 'label'} onChange={() => setCfg(c => ({ ...c, rulePriority: 'label' }))} />Önce etiket</label>
                        <button type="button" className="m-btn m-btn-gray !min-h-[34px] !px-3 text-[14px] ml-auto" onClick={addColumn}><Icon name="plus" size={15} />Kolon ekle</button>
                    </div>
                    <section aria-label="Eşlenmemiş durumlar" {...dropProps(null)} className={`rounded-xl p-2.5 flex flex-col gap-2 transition-colors ${hover === '__unmapped' ? 'm-accent-tint' : 'm-fill-2'}`}>
                        <div className="flex flex-wrap items-baseline gap-x-2">
                            <h3 className="m-0 text-[15px] font-semibold m-text">Eşlenmemiş durumlar <span className="m-text-3 font-normal m-tabular">{unmapped.length}</span></h3>
                            <span className="text-[12.5px] m-text-3">Bu durumdaki görevler panoda görünmez — bir kolona sürükleyin ya da seçin. Kolondaki durumu buraya sürükleyerek çıkarabilirsiniz.</span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-start">
                            {unmapped.map(k => (
                                <div key={k} className="flex items-center gap-1.5">
                                    <StatusChip k={k} count={allUsage.get(k)} />
                                    <select aria-label={`${statusKeyLabel(k)} durumunu kolona ekle`} className="m-input !h-8 !py-0 !w-auto text-[12.5px]" value="" onChange={e => e.target.value && moveStatus(k, e.target.value)}>
                                        <option value="">→ Kolon…</option>
                                        {cfg.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            ))}
                            {unmapped.length === 0 && <span className="text-[13px] m-ink-ok py-1">Tüm durumlar bir kolona eşlendi.</span>}
                            <form className="flex gap-1 ml-auto" onSubmit={e => { e.preventDefault(); addJiraStatus(); }}>
                                <input className="m-input !h-8 !py-0 !w-[210px] text-[13px]" aria-label="Jira durum adı" placeholder="Jira durumu ekle (ör. ANALYSIS)" value={newJira} onChange={e => setNewJira(e.target.value)} />
                                <button type="submit" className="m-btn m-btn-gray !min-h-[32px] !px-2" aria-label="Jira durumu ekle" disabled={!newJira.trim()}><Icon name="plus" size={14} /></button>
                            </form>
                        </div>
                    </section>
                    <div className="overflow-x-auto pb-2">
                        <div className="flex gap-3 items-start" style={{ minWidth: 'max-content' }}>
                            {cfg.columns.map((c, i) => (
                                <section key={c.id} aria-label={`Kolon: ${c.name}`} className="w-[230px] flex-none m-surface rounded-xl p-2.5 flex flex-col gap-2" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
                                    <div className="flex items-center gap-0.5">
                                        <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${c.name} kolonunu sola taşı`} disabled={i === 0} onClick={() => moveCol(i, -1)}><Icon name="chevronLeft" size={15} /></button>
                                        <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${c.name} kolonunu sağa taşı`} disabled={i === cfg.columns.length - 1} onClick={() => moveCol(i, 1)}><Icon name="chevronRight" size={15} /></button>
                                        <span className="flex-1"></span>
                                        <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${c.name} kolonunu sil`} disabled={cfg.columns.length <= 1} onClick={() => removeColumn(c)}><Icon name="trash" size={15} /></button>
                                    </div>
                                    <input aria-label="Kolon adı" className="m-input !h-9 !py-0 text-[15px] font-semibold" value={c.name} maxLength={40} onChange={e => setCol(c.id, { name: e.target.value })} />
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <input aria-label={`${c.name} en az`} className="m-input !h-8 !py-0 text-[13px]" inputMode="numeric" placeholder="En az" value={c.min ?? ''} onChange={e => setCol(c.id, { min: numOrUndef(e.target.value) })} />
                                        <input aria-label={`${c.name} en çok`} className="m-input !h-8 !py-0 text-[13px]" inputMode="numeric" placeholder="En çok" value={c.max ?? ''} onChange={e => setCol(c.id, { max: numOrUndef(e.target.value) })} />
                                    </div>
                                    <label className="flex flex-col gap-0.5 text-[12px] m-text-3">Taşınınca durum
                                        <select className="m-input !h-8 !py-0 text-[13px]" value={c.targetStatus} onChange={e => setCol(c.id, { targetStatus: e.target.value as TaskStatus })}>
                                            {Object.values(TaskStatus).map(s => <option key={s} value={s}>{APP_STATUS_LABELS[s]}</option>)}
                                        </select>
                                    </label>
                                    <label className="flex flex-col gap-0.5 text-[12px] m-text-3">Etiket kuralı (virgülle)
                                        <input className="m-input !h-8 !py-0 text-[13px]" placeholder="ör. test, analiz" defaultValue={(c.labels || []).join(', ')} onBlur={e => setCol(c.id, { labels: splitList(e.target.value) })} />
                                    </label>
                                    <div {...dropProps(c.id)} className={`flex flex-col gap-1.5 min-h-[64px] rounded-lg p-1 transition-colors ${hover === c.id ? 'm-accent-tint' : ''}`} style={{ outline: '1px dashed var(--m-sep)' }}>
                                        {c.statuses.map(k => <StatusChip key={k} k={k} count={allUsage.get(k)} onRemove={() => moveStatus(k, null)} />)}
                                        {c.statuses.length === 0 && <span className="text-[12.5px] m-text-3 text-center py-3">Durumu buraya sürükleyin</span>}
                                    </div>
                                </section>
                            ))}

                        </div>
                    </div>
                    <p className="m-0 text-[12.5px] m-text-3">Jira durumları (mavi) Jira'dan aktarılan/eşitlenen kayıtlardan gelir ve uygulama durumundan önceliklidir. Etiket kuralı süreç içinde ayırır: durum eklemeden yalnız etiket verdiğiniz kolon, "taşınınca durum" aşamasının alt kolonu olur (ör. taşınınca durum Devam Ediyor + "test" etiketi → devam eden ve "test" etiketli kartlar Test kolonunda). Kart o kolona taşınınca etiket eklenir, çıkınca kaldırılır.</p>
                </>
            )}

            {tab === 'filters' && (
                <>
                    <div className="flex flex-col">
                        {cfg.quickFilters.length === 0 && <p className="m-0 py-3 text-[14px] m-text-3">Hızlı filtre yok.</p>}
                        {cfg.quickFilters.map((f, i) => (
                            <div key={f.id} className="flex items-center gap-2 py-2 border-b m-sep" style={{ borderBottomStyle: 'solid', borderBottomWidth: 1 }}>
                                <input aria-label="Filtre adı" className="m-input !h-8 !py-0 text-[14px] font-semibold w-[200px]" value={f.name} onChange={e => setCfg(c => ({ ...c, quickFilters: c.quickFilters.map(x => (x.id === f.id ? { ...x, name: e.target.value } : x)) }))} />
                                <span className="flex-1 text-[13px] m-text-3 truncate">{describe(f)}</span>
                                <button type="button" className="m-icon-btn !w-7 !h-7" aria-label="Yukarı" disabled={i === 0} onClick={() => moveFilter(i, -1)}><Icon name="arrowUp" size={14} /></button>
                                <button type="button" className="m-icon-btn !w-7 !h-7" aria-label="Aşağı" disabled={i === cfg.quickFilters.length - 1} onClick={() => moveFilter(i, 1)}><Icon name="arrowDown" size={14} /></button>
                                <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${f.name} filtresini sil`} onClick={() => setCfg(c => ({ ...c, quickFilters: c.quickFilters.filter(x => x.id !== f.id) }))}><Icon name="trash" size={14} /></button>
                            </div>
                        ))}
                    </div>
                    {labels.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[13px] m-text-3 mr-1">Etiketten tek tıkla:</span>
                            {labels.filter(l => !cfg.quickFilters.some(f => f.labels?.length === 1 && f.labels[0] === l.label)).map(l => (
                                <button key={l.label} type="button" className="m-pill" onClick={() => addFilter({ name: l.label, labels: [l.label] })}><Icon name="plus" size={12} />{l.label} <span className="m-text-3">{l.count}</span></button>
                            ))}
                        </div>
                    )}
                    <form className="m-surface rounded-xl p-3 flex flex-col gap-2" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}
                        onSubmit={e => {
                            e.preventDefault();
                            if (!qfValid) return;
                            addFilter({
                                name: qf.name.trim(),
                                ...(qf.assignee ? { assignee: qf.assignee } : {}),
                                ...(splitList(qf.labels).length ? { labels: splitList(qf.labels) } : {}),
                                ...(qf.priorities.length ? { priorities: qf.priorities } : {}),
                                ...(qf.overdue ? { overdue: true } : {}),
                                ...(numOrUndef(qf.recentDays) ? { recentDays: numOrUndef(qf.recentDays) } : {}),
                            });
                            setQf({ name: '', assignee: '', labels: '', priorities: [], overdue: false, recentDays: '' });
                        }}>
                        <h3 className="m-0 text-[15px] font-semibold m-text">Yeni hızlı filtre</h3>
                        <div className="grid gap-2 sm:grid-cols-3">
                            <input aria-label="Filtre adı" className="m-input !h-9 !py-0 text-[14px]" placeholder="Ad (ör. MEB ticket)" value={qf.name} onChange={e => setQf({ ...qf, name: e.target.value })} />
                            <select aria-label="Atanan" className="m-input !h-9 !py-0 text-[14px]" value={qf.assignee} onChange={e => setQf({ ...qf, assignee: e.target.value })}>
                                <option value="">Atanan: herkes</option>
                                <option value="me">Atanan: ben</option>
                                {people.map(p => <option key={p} value={p}>Atanan: {p}</option>)}
                            </select>
                            <input aria-label="Etiketler" className="m-input !h-9 !py-0 text-[14px]" placeholder="Etiketler (virgülle, biri yeter)" value={qf.labels} onChange={e => setQf({ ...qf, labels: e.target.value })} />
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[14px]">
                            <span className="m-text-3">Öncelik:</span>
                            {PRIORITIES.map(p => (
                                <label key={p} className="flex items-center gap-1 cursor-pointer">
                                    <input type="checkbox" checked={qf.priorities.includes(p)} onChange={e => setQf({ ...qf, priorities: e.target.checked ? [...qf.priorities, p] : qf.priorities.filter(x => x !== p) })} />{PRIORITY_TR[p]}
                                </label>
                            ))}
                            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={qf.overdue} onChange={e => setQf({ ...qf, overdue: e.target.checked })} />Geciken</label>
                            <label className="flex items-center gap-1">Son <input aria-label="Son kaç gün" className="m-input !h-8 !py-0 !w-16 text-[14px]" inputMode="numeric" value={qf.recentDays} onChange={e => setQf({ ...qf, recentDays: e.target.value })} /> günde güncellenen</label>
                            <button type="submit" className="m-btn m-btn-primary !min-h-[34px] !px-3 text-[14px] ml-auto" disabled={!qfValid}><Icon name="plus" size={14} />Ekle</button>
                        </div>
                        <p className="m-0 text-[12.5px] m-text-3">Bir filtredeki koşullar ve panoda birlikte seçilen filtreler VE ile birleşir (Jira'daki gibi).</p>
                    </form>
                </>
            )}

            {tab === 'lanes' && (
                <div className="flex flex-col gap-4 text-[14px]">
                    <label className="flex flex-col gap-1 max-w-sm"><span className="font-semibold m-text-2">Varsayılan kulvar</span>
                        <select className="m-input" value={cfg.swimlane} onChange={e => setCfg(c => ({ ...c, swimlane: e.target.value as BoardSwimlane }))}>
                            <option value="none">Kulvar yok</option>
                            <option value="expedite">Expedite (acil işler üstte)</option>
                            <option value="assignee">Kişiye göre</option>
                            <option value="priority">Önceliğe göre</option>
                            <option value="workPackage">İş paketine göre</option>
                        </select>
                    </label>
                    <fieldset className="m-surface rounded-xl p-3 flex flex-col gap-2 border-0" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
                        <legend className="font-semibold m-text-2 px-1">Expedite kuralı</legend>
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="m-text-3">Öncelik:</span>
                            {PRIORITIES.map(p => (
                                <label key={p} className="flex items-center gap-1 cursor-pointer">
                                    <input type="checkbox" checked={!!cfg.expedite?.priorities?.includes(p)} onChange={e => setCfg(c => {
                                        const cur = c.expedite?.priorities || [];
                                        return { ...c, expedite: { ...c.expedite, priorities: e.target.checked ? [...cur, p] : cur.filter(x => x !== p) } };
                                    })} />{PRIORITY_TR[p]}
                                </label>
                            ))}
                        </div>
                        <label className="flex flex-col gap-1 max-w-md"><span className="m-text-3">ya da etiketlerden biri (virgülle)</span>
                            <input className="m-input !h-9 !py-0" placeholder="ör. acil, expedite" defaultValue={(cfg.expedite?.labels || []).join(', ')} onBlur={e => setCfg(c => ({ ...c, expedite: { ...c.expedite, labels: splitList(e.target.value) } }))} />
                        </label>
                    </fieldset>
                    <label className="flex items-center gap-2"><span className="font-semibold m-text-2">Tamamlanma kolonlarında yalnız son</span>
                        <input aria-label="Tamamlanma gün sınırı" className="m-input !h-9 !py-0 !w-20" inputMode="numeric" placeholder="tümü" value={cfg.doneDays ?? ''} onChange={e => setCfg(c => ({ ...c, doneDays: numOrUndef(e.target.value) }))} />
                        <span className="m-text-2">günde kapananları göster</span>
                    </label>
                    <p className="m-0 text-[12.5px] m-text-3">Kolon başlığında Jira'daki gibi "15 / 109" (gösterilen / toplam) görünür. Kulvar, panoda geçici olarak da değiştirilebilir.</p>
                    <button type="button" className="m-btn m-btn-plain self-start" onClick={() => { const d = defaultBoardConfig(); setCfg(c => ({ ...c, quickFilters: [...c.quickFilters, ...d.quickFilters.filter(x => !c.quickFilters.some(y => y.id === x.id))] })); }}>Hazır hızlı filtreleri geri ekle</button>
                </div>
            )}
        </Sheet>
    );
};

export default BoardSettings;
