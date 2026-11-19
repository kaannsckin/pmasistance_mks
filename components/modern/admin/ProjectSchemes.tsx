import React, { useMemo, useState } from 'react';
import { BoardConfig, IssueType, ProjectScheme, SchemeRequiredField, TaskStatus, WorkflowConfig, WorkflowStatusDef, WorkspaceData } from '../../../types';
import { boardConfigOf, statusKeyLabel } from '../../../utils/board';
import {
    boardForProject, copyScheme, createScheme, DEFAULT_SCHEME_ID, ISSUE_TYPE_OPTIONS, linearTransitions, REQUIRED_FIELD_LABELS,
    SCHEME_TEMPLATES, SchemeTemplateKey, schemeOf, schemesOf, schemeUsage, validateScheme,
} from '../../../utils/projectScheme';
import { CATEGORY_LABELS, CATEGORY_ORDER, WORKFLOW_STATUSES, workflowKey } from '../../../utils/workflow';
import BoardSettings from '../BoardSettings';
import WorkflowDesigner from './WorkflowDesigner';
import { dropRuleKeys, renameRuleKeys } from '../../../utils/transitions';
import { Icon } from '../icons';
import { Sheet } from '../ui';

/**
 * Yönetici konsolu › Proje yapılandırması. Jira'nın şema modeli: iş akışı,
 * kayıt türleri, alan kuralları ve pano bir "yapılandırma"da toplanır;
 * yapılandırma projelere atanır ve paylaşılır (değişiklik hepsine yansır).
 */

interface Props {
    workspace: WorkspaceData;
    onSaveScheme: (s: ProjectScheme) => string | null;
    onDeleteScheme: (id: string) => void;
    onAssignScheme: (projectId: string, schemeId: string) => void;
    onSaveProjectBoard: (projectId: string, cfg: BoardConfig | undefined) => void;
    onOpenProjectWorkflow: (projectId: string) => void;
}

const CAT_TONE: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'm-fill-2 m-text-2',
    [TaskStatus.ToDo]: 'm-fill-2 m-text',
    [TaskStatus.InProgress]: 'm-accent-tint',
    [TaskStatus.Done]: 'm-tone-ok',
};
const REQUIRED_FIELDS = Object.keys(REQUIRED_FIELD_LABELS) as SchemeRequiredField[];

const Pill: React.FC<{ s: WorkflowStatusDef; initial?: boolean }> = ({ s, initial }) => (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[12px] font-bold whitespace-nowrap ${CAT_TONE[s.category]}`} title={`${s.key} · ${CATEGORY_LABELS[s.category]}${initial ? ' · başlangıç' : ''}`}>
        {initial && <span aria-label="başlangıç" className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }}></span>}{s.label}
    </span>
);

/** Kategori sütunlarında akış önizlemesi */
const FlowPreview: React.FC<{ wf: WorkflowConfig }> = ({ wf }) => (
    <div className="flex items-start gap-1.5 flex-wrap">
        {CATEGORY_ORDER.filter(c => wf.statuses.some(s => s.category === c)).map((c, i, arr) => (
            <React.Fragment key={c}>
                <div className="flex flex-col gap-1 items-start">
                    <span className="text-[11px] m-text-3 font-semibold">{CATEGORY_LABELS[c]}</span>
                    <div className="flex flex-wrap gap-1">{wf.statuses.filter(s => s.category === c).map(s => <Pill key={s.key} s={s} initial={s.key === wf.initial} />)}</div>
                </div>
                {i < arr.length - 1 && <span className="m-text-3 mt-5"><Icon name="chevronRight" size={14} /></span>}
            </React.Fragment>
        ))}
    </div>
);

type Tab = 'general' | 'workflow' | 'fields' | 'board';

const SchemeEditor: React.FC<{
    initial: ProjectScheme;
    workspace: WorkspaceData;
    isNew: boolean;
    onClose: () => void;
    onSave: (s: ProjectScheme) => string | null;
}> = ({ initial, workspace, isNew, onClose, onSave }) => {
    const [s, setS] = useState<ProjectScheme>(() => JSON.parse(JSON.stringify(initial)));
    const [tab, setTab] = useState<Tab>('general');
    const [wfView, setWfView] = useState<'diagram' | 'table'>('diagram');
    const [boardOpen, setBoardOpen] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const users = useMemo(() => schemeUsage(workspace, s.id), [workspace, s.id]);
    const usedTasks = useMemo(() => users.flatMap(p => p.tasks), [users]);
    const errors = validateScheme(s);
    const wf = s.workflow;
    const setWf = (patch: Partial<WorkflowConfig>) => setS(x => ({ ...x, workflow: { ...x.workflow, ...patch } }));
    const keys = wf.statuses.map(x => x.key);

    const updateStatus = (i: number, patch: Partial<WorkflowStatusDef>) => {
        const old = wf.statuses[i];
        const statuses = wf.statuses.map((x, j) => (j === i ? { ...x, ...patch } : x));
        // Anahtar değişirse başlangıç ve geçişlerdeki adı da güncellenir
        if (patch.key !== undefined && patch.key !== old.key) {
            const nk = patch.key;
            const tr = wf.transitions ? Object.fromEntries(Object.entries(wf.transitions as Record<string, string[]>).map(([f, tos]) => [f === old.key ? nk : f, tos.map(t => (t === old.key ? nk : t))])) : undefined;
            setWf({ statuses, initial: wf.initial === old.key ? nk : wf.initial, ...(tr ? { transitions: tr } : {}), rules: renameRuleKeys(wf.rules, old.key, nk) });
        } else setWf({ statuses });
    };
    const moveStatus = (i: number, d: -1 | 1) => {
        const j = i + d;
        if (j < 0 || j >= wf.statuses.length) return;
        const statuses = [...wf.statuses];
        [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
        setWf({ statuses });
    };
    const removeStatus = (i: number) => {
        const k = wf.statuses[i].key;
        const statuses = wf.statuses.filter((_, j) => j !== i);
        const tr = wf.transitions ? Object.fromEntries(Object.entries(wf.transitions as Record<string, string[]>).filter(([f]) => f !== k).map(([f, tos]) => [f, tos.filter(t => t !== k)])) : undefined;
        setWf({ statuses, initial: wf.initial === k ? statuses[0]?.key || '' : wf.initial, ...(tr ? { transitions: tr } : {}), rules: dropRuleKeys(wf.rules, k) });
    };
    const addStatus = (def?: WorkflowStatusDef) => {
        const d = def || { key: `DURUM ${wf.statuses.length + 1}`, label: 'Yeni durum', category: TaskStatus.InProgress };
        const tr = wf.transitions ? { ...wf.transitions, [d.key]: [] } : undefined;
        setWf({ statuses: [...wf.statuses, { ...d }], ...(tr ? { transitions: tr } : {}) });
    };
    const suggestions = WORKFLOW_STATUSES.filter(x => !keys.includes(x.key));
    const toggleTransition = (from: string, to: string) => {
        const tr = { ...(wf.transitions || {}) };
        const list = tr[from] || [];
        tr[from] = list.includes(to) ? list.filter(x => x !== to) : [...list, to];
        setWf({ transitions: tr });
    };
    const usage = (k: string) => usedTasks.filter(t => t.jiraStatus && workflowKey(t.jiraStatus) === k).length;

    const save = () => {
        const clean: ProjectScheme = { ...s, workflow: { ...wf, statuses: wf.statuses.map(x => ({ ...x, key: workflowKey(x.key), label: x.label.trim() })), initial: workflowKey(wf.initial) } };
        const err = onSave(clean);
        if (err) setSaveError(err);
        else onClose();
    };

    const board = s.board ? boardConfigOf(s.board, wf) : boardConfigOf(undefined, wf);
    const tabs: { key: Tab; label: string }[] = [
        { key: 'general', label: 'Genel' },
        { key: 'workflow', label: `İş akışı (${wf.statuses.length})` },
        { key: 'fields', label: 'Kayıt türleri ve alanlar' },
        { key: 'board', label: 'Pano' },
    ];

    return (
        <Sheet xxl title={isNew ? 'Yeni proje yapılandırması' : `Yapılandırma: ${initial.name}`}
            subtitle={users.length ? `${users.length} proje kullanıyor — değişiklik hepsine uygulanır: ${users.slice(0, 4).map(p => p.name).join(', ')}${users.length > 4 ? '…' : ''}` : 'Henüz hiçbir projeye atanmadı.'}
            onClose={onClose}
            footer={(
                <>
                    {(errors.length > 0 || saveError) ? <span role="alert" className="flex-1 text-[13px] m-ink-bad">{saveError || errors[0]}{errors.length > 1 ? ` (+${errors.length - 1})` : ''}</span> : <span className="flex-1 text-[13px] m-text-3">Kaydedilince projelerdeki yerel görevler yeni akışta olmayan durumlardan aynı kategorinin ilk durumuna taşınır; Jira'ya bağlı görevler Jira'nın durumunu korur.</span>}
                    <button type="button" className="m-btn m-btn-gray" onClick={onClose}>Vazgeç</button>
                    <button type="button" className="m-btn m-btn-primary" disabled={errors.length > 0} onClick={save}><Icon name="check" size={16} />Kaydet</button>
                </>
            )}>
            {boardOpen && (
                <BoardSettings tasks={usedTasks} config={board} isCustom={!!s.board} people={[...new Set(usedTasks.map(t => t.resourceName).filter(Boolean))]} workflow={wf}
                    resetLabel="İş akışından otomatik oluştur"
                    onClose={() => setBoardOpen(false)}
                    onSave={c => { setS(x => ({ ...x, board: c })); setBoardOpen(false); }} />
            )}
            <div role="tablist" className="flex gap-1 p-1 rounded-xl m-fill-2 self-start flex-wrap">
                {tabs.map(t => (
                    <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                        className={`h-8 px-3 rounded-lg border-0 cursor-pointer text-[14px] ${tab === t.key ? 'm-surface font-semibold m-text' : 'bg-transparent m-text-2'}`}>{t.label}</button>
                ))}
            </div>

            {tab === 'general' && (
                <div className="flex flex-col gap-4">
                    <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold m-text-2">Ad</span>
                        <input className="m-input" value={s.name} maxLength={60} onChange={e => setS(x => ({ ...x, name: e.target.value }))} />
                    </label>
                    <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold m-text-2">Açıklama</span>
                        <textarea className="m-input" rows={2} value={s.description || ''} maxLength={300} onChange={e => setS(x => ({ ...x, description: e.target.value }))} />
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={s.allowProjectBoard} onChange={e => setS(x => ({ ...x, allowProjectBoard: e.target.checked }))} />
                        <span className="flex flex-col"><span className="text-[15px] m-text font-semibold">Proje yöneticisi panoyu kendi projesi için özelleştirebilir</span>
                            <span className="text-[13px] m-text-3">Kapalıysa projeler bu yapılandırmanın panosunu kullanır, "Panoyu yapılandır" yalnız burada (admin) yapılır.</span></span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={!!s.allowProjectWorkflow} onChange={e => setS(x => ({ ...x, allowProjectWorkflow: e.target.checked }))} />
                        <span className="flex flex-col"><span className="text-[15px] m-text font-semibold">Proje yöneticisi kendi projesinin iş akışını özelleştirebilir</span>
                            <span className="text-[13px] m-text-3">Jira'daki "genişletilmiş proje yönetimi" gibi: yalnız bu yapılandırmanın durumlarını kullanır (yeni durum ekleyemez); okları/geçişleri ve başlangıcı değiştirebilir, durum çıkarabilir. Kapalıysa iş akışı yalnız buradan değişir.</span></span>
                    </label>
                    <div className="m-surface rounded-xl p-3 flex flex-col gap-2" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
                        <span className="text-[13px] font-semibold m-text-2">Özet</span>
                        <FlowPreview wf={wf} />
                        <span className="text-[13px] m-text-3">Geçişler: {wf.transitions ? `${Object.values(wf.transitions as Record<string, string[]>).reduce((n, l) => n + l.length, 0)} tanımlı geçiş` : 'serbest'} · Kayıt türleri: {s.issueTypes?.length ? s.issueTypes.map(t => ISSUE_TYPE_OPTIONS.find(o => o.value === t)?.label).join(', ') : 'hepsi'} · Zorunlu: {s.requiredFields?.length ? s.requiredFields.map(f => REQUIRED_FIELD_LABELS[f]).join(', ') : 'yok'} · Pano: {s.board ? `${board.columns.length} kolon (özel)` : `${board.columns.length} kolon (iş akışından)`}</span>
                    </div>
                </div>
            )}

            {tab === 'workflow' && (
                <div className="flex flex-col gap-4">
                    <div className="m-segmented self-start" role="group" aria-label="İş akışı görünümü">
                        <button type="button" className="m-segment" aria-pressed={wfView === 'diagram'} onClick={() => setWfView('diagram')}>Diyagram</button>
                        <button type="button" className="m-segment" aria-pressed={wfView === 'table'} onClick={() => setWfView('table')}>Tablo</button>
                    </div>
                    {wfView === 'diagram' ? <WorkflowDesigner value={wf} onChange={next => setS(x => ({ ...x, workflow: next }))} usage={usage} people={workspace.people} /> : (<>
                    <FlowPreview wf={wf} />
                    <div className="flex flex-col">
                        <div className="grid gap-2 px-1 pb-1 text-[12px] font-semibold m-text-3" style={{ gridTemplateColumns: '56px 1fr 1fr 150px 70px 70px 32px' }}>
                            <span></span><span>Ad (Türkçe)</span><span>Jira adı (eşleme)</span><span>Kategori</span><span>Başlangıç</span><span>Görev</span><span></span>
                        </div>
                        {wf.statuses.map((x, i) => (
                            <div key={i} className="grid gap-2 items-center py-1.5 border-t m-sep" style={{ gridTemplateColumns: '56px 1fr 1fr 150px 70px 70px 32px', borderTopStyle: 'solid', borderTopWidth: 1 }}>
                                <span className="flex">
                                    <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${x.label} yukarı`} disabled={i === 0} onClick={() => moveStatus(i, -1)}><Icon name="arrowUp" size={13} /></button>
                                    <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${x.label} aşağı`} disabled={i === wf.statuses.length - 1} onClick={() => moveStatus(i, 1)}><Icon name="arrowDown" size={13} /></button>
                                </span>
                                <input aria-label="Durum adı" className="m-input !h-9 !py-0 text-[14px]" value={x.label} maxLength={40} onChange={e => updateStatus(i, { label: e.target.value })} />
                                <input aria-label="Jira adı" className="m-input !h-9 !py-0 text-[13px]" style={{ textTransform: 'uppercase' }} value={x.key} maxLength={40} onChange={e => updateStatus(i, { key: e.target.value.toUpperCase() })} />
                                <select aria-label="Kategori" className="m-input !h-9 !py-0 text-[13px]" value={x.category} onChange={e => updateStatus(i, { category: e.target.value as TaskStatus })}>
                                    {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                                </select>
                                <input type="radio" name="initial" aria-label={`${x.label} başlangıç durumu`} className="justify-self-center" checked={wf.initial === x.key} onChange={() => setWf({ initial: x.key })} />
                                <span className="text-[13px] m-text-3 m-tabular text-center">{usage(x.key) || '—'}</span>
                                <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${x.label} durumunu sil`} disabled={wf.statuses.length <= 1} onClick={() => removeStatus(i)}><Icon name="trash" size={14} /></button>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" className="m-btn m-btn-gray !min-h-[34px] !px-3 text-[14px]" onClick={() => addStatus()}><Icon name="plus" size={14} />Durum ekle</button>
                        {suggestions.length > 0 && <span className="text-[13px] m-text-3 ml-2 mr-1">Hazır:</span>}
                        {suggestions.map(x => <button key={x.key} type="button" className="m-pill" onClick={() => addStatus(x)} title={`${x.key} · ${CATEGORY_LABELS[x.category]}`}><Icon name="plus" size={12} />{x.label}</button>)}
                    </div>

                    <fieldset className="m-surface rounded-xl p-3 flex flex-col gap-3 border-0" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
                        <legend className="px-1 text-[15px] font-semibold m-text">Geçişler</legend>
                        <div className="flex flex-wrap gap-4 text-[14px]">
                            <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="tr" checked={!wf.transitions} onChange={() => setS(x => ({ ...x, workflow: { statuses: x.workflow.statuses, initial: x.workflow.initial } }))} />Serbest — her durumdan her duruma (Jira "All" geçişi)</label>
                            <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="tr" checked={!!wf.transitions} onChange={() => setWf({ transitions: linearTransitions(wf) })} />Tanımlı geçişler</label>
                        </div>
                        {wf.transitions && (
                            <>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2.5 text-[13px]" onClick={() => setWf({ transitions: linearTransitions(wf) })}>Doğrusal akış (ileri + geri)</button>
                                    <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2.5 text-[13px]" onClick={() => setWf({ transitions: Object.fromEntries(keys.map(k => [k, keys.filter(t => t !== k)])) })}>Hepsini aç</button>
                                    <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2.5 text-[13px]" onClick={() => setWf({ transitions: Object.fromEntries(keys.map(k => [k, []])) })}>Temizle</button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="border-collapse text-[13px]">
                                        <thead>
                                            <tr>
                                                <th className="text-left p-1.5 m-text-3 font-semibold whitespace-nowrap">Nereden ↓ · Nereye →</th>
                                                {wf.statuses.map(x => <th key={x.key} className="p-1.5"><Pill s={x} /></th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {wf.statuses.map(f => (
                                                <tr key={f.key} className="border-t m-sep" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                                                    <th className="text-left p-1.5"><Pill s={f} initial={f.key === wf.initial} /></th>
                                                    {wf.statuses.map(t => (
                                                        <td key={t.key} className="p-1.5 text-center">
                                                            {f.key === t.key ? <span className="m-text-3">·</span> : (
                                                                <input type="checkbox" aria-label={`${f.label} → ${t.label}`} checked={!!wf.transitions![f.key]?.includes(t.key)} onChange={() => toggleTransition(f.key, t.key)} />
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="m-0 text-[12.5px] m-text-3">Kullanıcılar görev menüsünde, durum seçicide ve panoda yalnız işaretli geçişleri yapabilir. Jira eşitlemesi Jira'daki durumu her zaman uygular.</p>
                            </>
                        )}
                    </fieldset>
                    </>)}
                </div>
            )}

            {tab === 'fields' && (
                <div className="flex flex-col gap-5">
                    <fieldset className="border-0 p-0 m-0 flex flex-col gap-2">
                        <legend className="text-[15px] font-semibold m-text mb-1">Kayıt türleri</legend>
                        <div className="flex flex-wrap gap-4 text-[14px]">
                            {ISSUE_TYPE_OPTIONS.map(o => {
                                const on = !s.issueTypes?.length || s.issueTypes.includes(o.value);
                                return (
                                    <label key={o.value} className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="checkbox" checked={on} onChange={e => setS(x => {
                                            const cur: IssueType[] = x.issueTypes?.length ? x.issueTypes : ISSUE_TYPE_OPTIONS.map(y => y.value);
                                            const next = e.target.checked ? [...cur, o.value] : cur.filter(y => y !== o.value);
                                            return { ...x, issueTypes: next.length === ISSUE_TYPE_OPTIONS.length ? undefined : next };
                                        })} />{o.label}
                                    </label>
                                );
                            })}
                        </div>
                        <p className="m-0 text-[12.5px] m-text-3">Görev formunda yalnız seçili türler sunulur.</p>
                    </fieldset>
                    <fieldset className="border-0 p-0 m-0 flex flex-col gap-2">
                        <legend className="text-[15px] font-semibold m-text mb-1">Zorunlu alanlar</legend>
                        <div className="flex flex-wrap gap-4 text-[14px]">
                            {REQUIRED_FIELDS.map(f => (
                                <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" checked={!!s.requiredFields?.includes(f)} onChange={e => setS(x => ({ ...x, requiredFields: e.target.checked ? [...(x.requiredFields || []), f] : (x.requiredFields || []).filter(y => y !== f) }))} />{REQUIRED_FIELD_LABELS[f]}
                                </label>
                            ))}
                        </div>
                        <p className="m-0 text-[12.5px] m-text-3">Görev eklenirken ve düzenlenirken bu alanlar boşsa kaydedilmez (Jira alan yapılandırması gibi).</p>
                    </fieldset>
                </div>
            )}

            {tab === 'board' && (
                <div className="flex flex-col gap-3">
                    <p className="m-0 text-[14px] m-text-2">{s.board ? 'Bu yapılandırmanın özel bir panosu var.' : 'Pano iş akışından otomatik oluşturuluyor: Yapılacak · süreçteki her durum ayrı kolon · Tamamlandı.'} {s.allowProjectBoard ? 'Proje yöneticileri kendi projelerinde özelleştirebilir.' : 'Projeler bu panoyu kullanır.'}</p>
                    <div className="flex flex-wrap gap-2">
                        {board.columns.map(c => (
                            <div key={c.id} className="m-surface rounded-xl p-2.5 w-[180px] flex flex-col gap-1.5" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
                                <span className="text-[13px] font-bold m-text" style={{ textTransform: 'uppercase' }}>{c.name}</span>
                                <span className="flex flex-wrap gap-1">{c.statuses.filter(k => k.startsWith('jira:')).map(k => <span key={k} className="inline-flex h-5 px-1.5 rounded text-[11px] font-semibold m-fill-2 m-text-2">{statusKeyLabel(k, wf)}</span>)}</span>
                                {(c.min || c.max || c.labels?.length) ? <span className="text-[11.5px] m-text-3">{[c.min ? `en az ${c.min}` : '', c.max ? `en çok ${c.max}` : '', c.labels?.length ? `etiket: ${c.labels.join(', ')}` : ''].filter(Boolean).join(' · ')}</span> : null}
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="m-btn m-btn-primary !min-h-[36px] !px-3 text-[14px]" onClick={() => setBoardOpen(true)}><Icon name="sliders" size={15} />Panoyu düzenle</button>
                        {s.board && <button type="button" className="m-btn m-btn-plain !min-h-[36px] !px-3 text-[14px]" onClick={() => setS(x => ({ ...x, board: undefined }))}>İş akışından yeniden oluştur</button>}
                    </div>
                </div>
            )}
        </Sheet>
    );
};

const ProjectSchemes: React.FC<Props> = ({ workspace, onSaveScheme, onDeleteScheme, onAssignScheme, onSaveProjectBoard, onOpenProjectWorkflow }) => {
    const schemes = schemesOf(workspace);
    const [editing, setEditing] = useState<{ scheme: ProjectScheme; isNew: boolean } | null>(null);
    const [picking, setPicking] = useState(false);
    const [boardProject, setBoardProject] = useState<string | null>(null);
    const projects = [...workspace.projects].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const bp = boardProject ? workspace.projects.find(p => p.id === boardProject) : undefined;
    const bpScheme = bp ? schemeOf(workspace, bp) : undefined;

    return (
        <div className="flex flex-col gap-6">
            {editing && <SchemeEditor initial={editing.scheme} isNew={editing.isNew} workspace={workspace} onClose={() => setEditing(null)} onSave={onSaveScheme} />}
            {bp && bpScheme && (
                <BoardSettings tasks={bp.tasks} config={boardForProject(bpScheme, bp).config} isCustom={!!bp.boardConfig} people={[...new Set(bp.tasks.map(t => t.resourceName).filter(Boolean))]}
                    workflow={bpScheme.workflow} resetLabel={`Yapılandırmanın panosuna dön (${bpScheme.name})`}
                    onClose={() => setBoardProject(null)} onSave={c => { onSaveProjectBoard(bp.id, c); setBoardProject(null); }} />
            )}
            {picking && (
                <Sheet wide title="Yeni yapılandırma" subtitle="Bir şablonla başlayın; sonra durumları, geçişleri, alanları ve panoyu düzenleyin." onClose={() => setPicking(false)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {SCHEME_TEMPLATES.map(t => {
                            const preview = createScheme(t.key as SchemeTemplateKey, t.name);
                            return (
                                <button key={t.key} type="button" className="m-surface m-row-link rounded-2xl p-4 text-left flex flex-col gap-2 border-0 cursor-pointer" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)', font: 'inherit' }}
                                    onClick={() => { setPicking(false); setEditing({ scheme: createScheme(t.key as SchemeTemplateKey, t.name), isNew: true }); }}>
                                    <span className="text-[16px] font-semibold m-text">{t.name}</span>
                                    <span className="text-[13px] m-text-3">{t.description}</span>
                                    <FlowPreview wf={preview.workflow} />
                                </button>
                            );
                        })}
                    </div>
                    {schemes.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <h3 className="m-0 text-[15px] font-semibold m-text">ya da kayıtlı bir yapılandırmadan başla</h3>
                            <div className="flex flex-wrap gap-2">
                                {schemes.map(x => <button key={x.id} type="button" className="m-pill" onClick={() => { setPicking(false); setEditing({ scheme: copyScheme(x), isNew: true }); }}><Icon name="copy" size={12} />{x.name}</button>)}
                            </div>
                            <p className="m-0 text-[12.5px] m-text-3">Çizdiğiniz iş akışı (oklar ve kutu yerleşimi dahil) kopyalanır; yeni yapılandırmada değiştirebilirsiniz.</p>
                        </div>
                    )}
                </Sheet>
            )}

            <section className="m-surface rounded-2xl p-4 flex flex-col gap-2" aria-label="Nasıl çalışır">
                <p className="m-0 text-[14.5px] m-text-2 leading-relaxed">
                    <b className="m-text">Jira'daki şema mantığı:</b> bir <b>yapılandırma</b>; iş akışını (durumlar, başlangıç, izin verilen geçişler), kayıt türlerini, zorunlu alanları ve panoyu birlikte tanımlar.
                    Yapılandırmayı projelere atarsınız; birden çok proje aynı yapılandırmayı paylaşabilir ve değişiklik hepsine uygulanır. Atanmamış projeler <b>Varsayılan</b>'ı kullanır.
                    Hesaplar (ilerleme, EVM, tahmin) her durumun <b>kategorisini</b> (Bekleyen · Yapılacak · Süreçte · Tamamlandı) kullanır.
                </p>
            </section>

            <section aria-label="Yapılandırmalar" className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <h2 className="m-0 flex-1 text-[20px] font-semibold m-text">Yapılandırmalar <span className="text-[15px] font-normal m-text-3">{schemes.length}</span></h2>
                    <button type="button" className="m-btn m-btn-primary !min-h-[38px]" onClick={() => setPicking(true)}><Icon name="plus" size={16} />Yeni yapılandırma</button>
                </div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                    {schemes.map(sc => {
                        const users = schemeUsage(workspace, sc.id);
                        return (
                            <article key={sc.id} className="m-surface rounded-2xl p-4 flex flex-col gap-3">
                                <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="m-0 text-[16px] font-semibold m-text flex items-center gap-2">{sc.name}{sc.id === DEFAULT_SCHEME_ID && <span className="inline-flex h-5 px-1.5 rounded text-[11px] font-semibold m-fill-2 m-text-2">varsayılan</span>}</h3>
                                        {sc.description && <p className="m-0 mt-0.5 text-[13px] m-text-3">{sc.description}</p>}
                                    </div>
                                    <span className="inline-flex items-center h-6 px-2 rounded-full text-[12px] font-semibold m-tone-accent whitespace-nowrap">{users.length} proje</span>
                                </div>
                                <FlowPreview wf={sc.workflow} />
                                <p className="m-0 text-[12.5px] m-text-3">
                                    {sc.workflow.transitions ? 'Tanımlı geçişler' : 'Serbest geçiş'} · {sc.issueTypes?.length ? `${sc.issueTypes.length} kayıt türü` : 'tüm kayıt türleri'}
                                    {sc.requiredFields?.length ? ` · zorunlu: ${sc.requiredFields.map(f => REQUIRED_FIELD_LABELS[f].toLocaleLowerCase('tr-TR')).join(', ')}` : ''} · pano {sc.allowProjectBoard ? 'projede özelleştirilebilir' : 'yapılandırmadan'}
                                </p>
                                <div className="flex gap-1.5 flex-wrap">
                                    <button type="button" className="m-btn m-btn-gray !min-h-[34px] !px-3 text-[14px]" onClick={() => setEditing({ scheme: sc, isNew: false })}><Icon name="pencil" size={14} />Düzenle</button>
                                    <button type="button" className="m-btn m-btn-plain !min-h-[34px] !px-3 text-[14px]" onClick={() => setEditing({ scheme: copyScheme(sc), isNew: true })}><Icon name="copy" size={14} />Kopyala</button>
                                    {sc.id !== DEFAULT_SCHEME_ID && (
                                        <button type="button" className="m-btn m-btn-plain !min-h-[34px] !px-3 text-[14px] m-ink-bad"
                                            onClick={() => { if (window.confirm(`"${sc.name}" silinsin mi?${users.length ? ` ${users.length} proje Varsayılan yapılandırmaya döner.` : ''}`)) onDeleteScheme(sc.id); }}><Icon name="trash" size={14} />Sil</button>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section aria-label="Projeler" className="m-surface rounded-2xl p-4 flex flex-col gap-2">
                <h2 className="m-0 text-[20px] font-semibold m-text">Projeler <span className="text-[15px] font-normal m-text-3">{projects.length}</span></h2>
                {projects.length === 0 && <p className="m-0 text-[14px] m-text-3">Henüz proje yok.</p>}
                {projects.map(p => {
                    const sc = schemeOf(workspace, p);
                    const b = boardForProject(sc, p);
                    return (
                        <div key={p.id} className="grid items-center gap-3 py-2 border-t m-sep" style={{ gridTemplateColumns: 'minmax(160px, 1.4fr) minmax(180px, 1fr) auto', borderTopStyle: 'solid', borderTopWidth: 1 }}>
                            <span className="min-w-0 flex flex-col">
                                <span className="text-[15px] m-text truncate">{p.name}</span>
                                <span className="text-[12.5px] m-text-3">{p.tasks.length} görev{p.jiraProjectKey ? ` · Jira ${p.jiraProjectKey}` : ''}</span>
                            </span>
                            <select aria-label={`${p.name} yapılandırması`} className="m-input !h-9 !py-0 text-[14px]" value={sc.id}
                                onChange={e => { const next = schemes.find(x => x.id === e.target.value); if (next && window.confirm(`"${p.name}" projesine "${next.name}" yapılandırması atansın mı? Yeni akışta olmayan durumdaki yerel görevler aynı kategorinin ilk durumuna taşınır.`)) onAssignScheme(p.id, next.id); }}>
                                {schemes.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                            <span className="flex items-center gap-2 justify-end">
                                {sc.allowProjectWorkflow && p.workflowOverride && <span className="inline-flex items-center h-6 px-2 rounded-full text-[12px] font-semibold m-tone-warn">Özel akış</span>}
                                <span className={`inline-flex items-center h-6 px-2 rounded-full text-[12px] font-semibold ${b.source === 'project' ? 'm-tone-warn' : 'm-fill-2 m-text-2'}`}>{b.source === 'project' ? 'Özel pano' : 'Yapılandırmanın panosu'}</span>
                                {sc.allowProjectWorkflow && <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2.5 text-[13px]" onClick={() => onOpenProjectWorkflow(p.id)}><Icon name="activity" size={14} />Akış</button>}
                                <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2.5 text-[13px]" onClick={() => setBoardProject(p.id)}><Icon name="sliders" size={14} />Pano</button>
                            </span>
                        </div>
                    );
                })}
            </section>
        </div>
    );
};

export default ProjectSchemes;
