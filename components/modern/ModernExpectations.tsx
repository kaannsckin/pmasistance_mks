import React, { useMemo, useState } from 'react';
import {
    ExpectationCategory, ExpectationLink, ExpectationStatus, ExpectationUrgency, ManagementExpectation, Task, TaskStatus, WorkspaceData,
} from '../../types';
import { ROLE_LABELS } from '../../utils/allocations';
import {
    canEditExpectation, canRaiseExpectation, canRespondExpectation, CATEGORY_LABELS, CATEGORY_ORDER, daysUntilNeed, ExpectationDraft,
    ExpectationFilter, expectationProjects, filterExpectations, isActiveExpectation, isOwnExpectation, resolveLink, ResolvedLink, safeUrl,
    sortExpectations, STATUS_LABELS, URGENCY_HINTS, URGENCY_LABELS, URGENCY_ORDER, urgencyCounts, visibleExpectations, waitingLabel,
} from '../../utils/expectations';
import { deadlineLabel } from '../../utils/projectOverview';
import { Identity } from '../../utils/rbac';
import { relativeTime } from '../../utils/recentChanges';
import { riskScore } from '../../utils/risks';
import { Icon, IconName } from './icons';
import { RiskScorePill, RiskSheet } from './RiskParts';
import { COLUMN_META, columnOf, sprintLabel } from './taskMeta';
import { Field, rowSep, Sheet } from './ui';

/**
 * Yönetimden beklentiler. PM ve bölüm sorumlusu yönetimden beklediği karar,
 * onay ya da desteği aciliyet ve kategoriyle kaydeder; görev/risk kaydı ya da
 * bağlantı ekleyerek ayrıntı verir. Yönetim aynı ekranda inceler, yanıtlar ve
 * kapatır; yönetim panelinde aciliyete göre sayılar hatırlatma olarak görünür.
 */

export const URGENCY_TONE: Record<ExpectationUrgency, { tone: string; dot: string; ink: string }> = {
    critical: { tone: 'm-tone-bad', dot: 'var(--m-bad)', ink: 'm-ink-bad' },
    important: { tone: 'm-tone-warn', dot: 'var(--m-warn)', ink: 'm-ink-warn' },
    normal: { tone: 'm-tone-accent', dot: 'var(--m-accent)', ink: 'm-accent' },
};

const STATUS_TONE: Record<ExpectationStatus, string> = {
    open: 'm-tone-warn',
    acknowledged: 'm-tone-accent',
    resolved: 'm-tone-ok',
    withdrawn: 'm-tone-hold',
};

const LINK_ICON: Record<ExpectationLink['kind'], IconName> = { task: 'list', risk: 'shield', url: 'send' };
const fmtDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const Pill: React.FC<{ tone: string; children: React.ReactNode }> = ({ tone, children }) => (
    <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${tone}`}>{children}</span>
);

const NeedByPill: React.FC<{ e: ManagementExpectation; now: Date }> = ({ e, now }) => {
    const d = daysUntilNeed(e, now);
    if (d === null || !isActiveExpectation(e)) return null;
    const tone = d < 0 ? 'm-tone-bad' : d <= 3 ? 'm-tone-warn' : 'm-tone-hold';
    return <Pill tone={tone}>{d > 3 ? `Termin ${new Date(e.needBy!).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}` : deadlineLabel(d)}</Pill>;
};

// ---------------------------------------------------------------- eklenti satırı

const linkSub = (r: ResolvedLink, sprintNames?: Record<number, string>): string => {
    if (r.link.kind === 'url') {
        try { return new URL(r.link.url || '').hostname; } catch { return r.link.url || ''; }
    }
    if (r.missing) return 'Kayıt silinmiş';
    if (r.task) return [COLUMN_META[columnOf(r.task.status)].label, r.task.resourceName || 'Atanmadı', sprintLabel(r.task.version, sprintNames), r.task.dueDate ? `Termin ${fmtDate(r.task.dueDate)}` : ''].filter(Boolean).join(' · ');
    if (r.risk) return `Olasılık ${r.risk.probability} × Etki ${r.risk.impact}${r.risk.mitigation ? ' · aksiyon var' : ' · aksiyon yok'}`;
    return '';
};

const LinkRow: React.FC<{ r: ResolvedLink; index: number; onOpen?: () => void; onRemove?: () => void }> = ({ r, index, onOpen, onRemove }) => {
    const sep = rowSep(index);
    const body = (
        <>
            <span className="w-8 h-8 rounded-[9px] m-fill-2 flex items-center justify-center flex-none m-text-2"><Icon name={LINK_ICON[r.link.kind]} size={16} /></span>
            <span className={`flex-1 min-w-0 flex flex-col gap-0.5 ${r.missing ? 'opacity-60' : ''}`}>
                <span className="text-[15px] m-text truncate">{r.task?.name || r.risk?.title || r.link.label}</span>
                <span className="text-[13px] m-text-3 truncate">{[r.project?.name && r.link.kind !== 'url' ? r.project.name : '', linkSub(r, r.project?.settings.sprintNames)].filter(Boolean).join(' · ')}</span>
            </span>
            {r.risk && <RiskScorePill score={riskScore(r.risk)} muted={r.risk.status === 'closed'} />}
        </>
    );
    return (
        <div className={`flex items-center gap-2 ${sep.className}`} style={sep.style}>
            {onOpen && !r.missing ? (
                <button type="button" onClick={onOpen} className="m-row-link flex-1 min-w-0 flex items-center gap-3 px-2 py-2 min-h-[52px] rounded-xl">{body}</button>
            ) : (
                <div className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 min-h-[52px]">{body}</div>
            )}
            {onRemove && <button type="button" className="m-icon-btn" aria-label={`${r.link.label} eklentisini kaldır`} onClick={onRemove}><Icon name="x" size={18} /></button>}
        </div>
    );
};

const TaskInfoSheet: React.FC<{ task: Task; projectName?: string; sprintNames?: Record<number, string>; onClose: () => void }> = ({ task, projectName, sprintNames, onClose }) => (
    <Sheet title="Görev ayrıntısı" onClose={onClose} footer={<><span className="flex-1"></span><button type="button" className="m-btn m-btn-primary" onClick={onClose}>Tamam</button></>}>
        <div className="flex flex-col gap-0.5">
            <span className="text-[17px] font-semibold m-text">{task.name}</span>
            <span className="text-[14px] m-text-3">{[projectName, sprintLabel(task.version, sprintNames)].filter(Boolean).join(' · ')}</span>
        </div>
        <dl className="m-0 grid gap-x-4 gap-y-2 text-[15px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
            <dt className="m-text-3">Durum</dt><dd className="m-0 m-text">{COLUMN_META[columnOf(task.status)].label}{task.status === TaskStatus.Backlog ? ' (havuz)' : ''}</dd>
            <dt className="m-text-3">Sorumlu</dt><dd className="m-0 m-text">{task.resourceName || 'Atanmadı'}</dd>
            <dt className="m-text-3">Termin</dt><dd className="m-0 m-text">{fmtDate(task.dueDate) || '—'}</dd>
            <dt className="m-text-3">Süre</dt><dd className="m-0 m-text m-tabular">{task.time?.avg ? `${task.time.avg} gün (ort.)` : 'Tahmin yok'}</dd>
        </dl>
        {task.notes && <p className="m-0 text-[15px] leading-relaxed m-text whitespace-pre-line">{task.notes}</p>}
    </Sheet>
);

// ---------------------------------------------------------------- oluştur / düzenle

const ExpectationForm: React.FC<{
    workspace: WorkspaceData;
    identity: Identity;
    initial?: ManagementExpectation;
    onClose: () => void;
    onSave: (draft: ExpectationDraft) => void;
}> = ({ workspace, identity, initial, onClose, onSave }) => {
    const projects = useMemo(() => expectationProjects(workspace, identity), [workspace, identity]);
    const [title, setTitle] = useState(initial?.title || '');
    const [urgency, setUrgency] = useState<ExpectationUrgency>(initial?.urgency || 'important');
    const [category, setCategory] = useState<ExpectationCategory>(initial?.category || 'approval');
    const [projectId, setProjectId] = useState(initial?.projectId || (projects.length === 1 && identity.role === 'py' ? projects[0].id : ''));
    const [needBy, setNeedBy] = useState(initial?.needBy || '');
    const [description, setDescription] = useState(initial?.description || '');
    const [links, setLinks] = useState<ExpectationLink[]>(initial?.links || []);
    const [url, setUrl] = useState('');
    const [urlLabel, setUrlLabel] = useState('');
    const [urlError, setUrlError] = useState('');
    const project = projects.find(p => p.id === projectId);
    const has = (kind: ExpectationLink['kind'], refId: string) => links.some(l => l.kind === kind && l.refId === refId);

    const addTask = (id: string) => {
        const t = project?.tasks.find(x => x.id === id);
        if (t && project && !has('task', id)) setLinks([...links, { kind: 'task', projectId: project.id, refId: id, label: t.name }]);
    };
    const addRisk = (id: string) => {
        const r = (project?.risks || []).find(x => x.id === id);
        if (r && project && !has('risk', id)) setLinks([...links, { kind: 'risk', projectId: project.id, refId: id, label: r.title }]);
    };
    const addUrl = () => {
        const safe = safeUrl(url);
        if (!safe) { setUrlError('Geçerli bir http(s) adresi girin.'); return; }
        setLinks([...links, { kind: 'url', url: safe, label: urlLabel.trim() || new URL(safe).hostname }]);
        setUrl(''); setUrlLabel(''); setUrlError('');
    };
    const save = () => {
        if (!title.trim()) return;
        onSave({ title, description, category, urgency, projectId: projectId || undefined, needBy: needBy || undefined, links });
    };

    return (
        <Sheet
            title={initial ? 'Beklentiyi düzenle' : 'Yeni beklenti'}
            onClose={onClose}
            wide
            footer={<>
                <span className="flex-1 text-[13px] m-text-3">{initial ? '' : 'Kaydedince yönetimin panelinde görünür.'}</span>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
                <button type="button" className="m-btn m-btn-primary" disabled={!title.trim()} onClick={save}>{initial ? 'Kaydet' : 'Yönetime ilet'}</button>
            </>}
        >
            <Field label="Yönetimden ne bekliyorsunuz?" htmlFor="ex-title">
                <input id="ex-title" className="m-input" autoFocus value={title} placeholder="Ör. Ek donanım bütçesi için onay" onChange={e => setTitle(e.target.value)} />
            </Field>

            <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold m-text-2">Aciliyet</span>
                <div className="m-segmented self-start" role="group" aria-label="Aciliyet">
                    {URGENCY_ORDER.map(u => (
                        <button key={u} type="button" aria-pressed={urgency === u} className="m-segment" onClick={() => setUrgency(u)}>
                            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full" style={{ background: URGENCY_TONE[u].dot }}></span>
                            {URGENCY_LABELS[u]}
                        </button>
                    ))}
                </div>
                <span className="text-[13px] m-text-3">{URGENCY_HINTS[urgency]}</span>
            </div>

            <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold m-text-2">Kategori</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Kategori">
                    {CATEGORY_ORDER.map(c => (
                        <button key={c} type="button" aria-pressed={category === c} className={`m-pill ${category === c ? 'is-active' : ''}`} onClick={() => setCategory(c)}>{CATEGORY_LABELS[c]}</button>
                    ))}
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Proje" htmlFor="ex-project">
                    <select id="ex-project" className="m-input" value={projectId} onChange={e => setProjectId(e.target.value)}>
                        <option value="">{identity.role === 'bolum_sorumlu' ? 'Bölüm geneli (projesiz)' : 'Projeye bağlı değil'}</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </Field>
                <Field label="En geç ne zamana kadar?" htmlFor="ex-needby">
                    <input id="ex-needby" type="date" className="m-input" value={needBy} onChange={e => setNeedBy(e.target.value)} />
                </Field>
            </div>

            <Field label="Ayrıntı" htmlFor="ex-desc" hint="Neden gerekli, karar verilmezse etkisi ne?">
                <textarea id="ex-desc" className="m-input py-2.5" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
            </Field>

            <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold m-text-2">Eklentiler <span className="font-normal m-text-3">— yönetici ayrıntıyı buradan görür</span></span>
                {links.length > 0 && (
                    <div className="m-surface rounded-xl px-1">
                        {links.map((l, idx) => (
                            <LinkRow key={`${l.kind}-${l.refId || l.url}-${idx}`} index={idx} r={resolveLink(workspace, l)} onRemove={() => setLinks(links.filter((_, j) => j !== idx))} />
                        ))}
                    </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                    <select aria-label="Görev ekle" className="m-input" value="" disabled={!project || project.tasks.length === 0} onChange={e => addTask(e.target.value)}>
                        <option value="">{project ? (project.tasks.length ? '+ Görev kaydı ekle' : 'Projede görev yok') : 'Görev için önce proje seçin'}</option>
                        {project?.tasks.filter(t => !has('task', t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <select aria-label="Risk ekle" className="m-input" value="" disabled={!project || !(project.risks || []).length} onChange={e => addRisk(e.target.value)}>
                        <option value="">{project ? ((project.risks || []).length ? '+ Risk kaydı ekle' : 'Projede risk yok') : 'Risk için önce proje seçin'}</option>
                        {(project?.risks || []).filter(r => !has('risk', r.id)).map(r => <option key={r.id} value={r.id}>{r.title} ({riskScore(r)})</option>)}
                    </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
                    <input aria-label="Bağlantı adresi" className="m-input" placeholder="Belge bağlantısı (https://…)" value={url} onChange={e => { setUrl(e.target.value); setUrlError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} />
                    <input aria-label="Bağlantı adı" className="m-input" placeholder="Ad (isteğe bağlı)" value={urlLabel} onChange={e => setUrlLabel(e.target.value)} />
                    <button type="button" className="m-btn m-btn-gray" disabled={!url.trim()} onClick={addUrl}>Bağlantı ekle</button>
                </div>
                {urlError && <span role="alert" className="text-[13px] m-ink-bad">{urlError}</span>}
            </div>
        </Sheet>
    );
};

// ---------------------------------------------------------------- ayrıntı ve yanıt

const ExpectationDetail: React.FC<{
    workspace: WorkspaceData;
    identity: Identity;
    e: ManagementExpectation;
    now: Date;
    onClose: () => void;
    onEdit: () => void;
    onRespond: (status: 'acknowledged' | 'resolved', response: string) => void;
    onSetStatus: (status: ExpectationStatus) => void;
    onOpenLink: (r: ResolvedLink) => void;
}> = ({ workspace, identity, e, now, onClose, onEdit, onRespond, onSetStatus, onOpenLink }) => {
    const [response, setResponse] = useState('');
    const project = e.projectId ? workspace.projects.find(p => p.id === e.projectId) : undefined;
    const responder = canRespondExpectation(identity);
    const own = isOwnExpectation(e, identity);
    const editable = canEditExpectation(e, identity);
    const active = isActiveExpectation(e);
    const links = (e.links || []).map(l => resolveLink(workspace, l));

    const footer = (
        <>
            {editable && <button type="button" className="m-btn m-btn-danger" onClick={() => { if (window.confirm('Beklenti geri çekilsin mi?')) onSetStatus('withdrawn'); }}>Geri çek</button>}
            {own && !active && <button type="button" className="m-btn m-btn-gray" onClick={() => onSetStatus('open')}>Yeniden aç</button>}
            <span className="flex-1"></span>
            {editable && <button type="button" className="m-btn m-btn-gray" onClick={onEdit}>Düzenle</button>}
            {responder && active ? (
                <>
                    {e.status === 'open' && <button type="button" className="m-btn m-btn-gray" onClick={() => onRespond('acknowledged', response)}>İnceleniyor</button>}
                    <button type="button" className="m-btn m-btn-primary" onClick={() => onRespond('resolved', response)}>Karşılandı</button>
                </>
            ) : (
                <button type="button" className="m-btn m-btn-primary" onClick={onClose}>Tamam</button>
            )}
        </>
    );

    return (
        <Sheet title="Beklenti" onClose={onClose} footer={footer} wide>
            <div className="flex flex-col gap-2">
                <span className="text-[20px] leading-snug font-semibold m-text">{e.title}</span>
                <div className="flex flex-wrap gap-1.5">
                    <Pill tone={URGENCY_TONE[e.urgency].tone}>{URGENCY_LABELS[e.urgency]}</Pill>
                    <Pill tone="m-fill-2 m-text-2">{CATEGORY_LABELS[e.category]}</Pill>
                    <Pill tone={STATUS_TONE[e.status]}>{STATUS_LABELS[e.status]}</Pill>
                    <NeedByPill e={e} now={now} />
                </div>
            </div>
            <dl className="m-0 grid gap-x-4 gap-y-2 text-[15px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
                <dt className="m-text-3">Proje</dt><dd className="m-0 m-text">{project?.name || (e.departmentCode ? `Bölüm geneli · ${e.departmentCode}` : '—')}</dd>
                <dt className="m-text-3">Açan</dt><dd className="m-0 m-text">{[e.createdByName, ROLE_LABELS[e.createdByRole]].filter(Boolean).join(' · ')}</dd>
                <dt className="m-text-3">Açılış</dt><dd className="m-0 m-text">{fmtDate(e.createdAt)}{active ? ` · ${waitingLabel(e, now)}` : ''}</dd>
                {e.needBy && <><dt className="m-text-3">Termin</dt><dd className="m-0 m-text">{fmtDate(e.needBy)}</dd></>}
            </dl>
            {e.description && <p className="m-0 text-[15px] leading-relaxed m-text whitespace-pre-line">{e.description}</p>}

            {links.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold m-text-2">Eklentiler</span>
                    <div className="m-surface rounded-xl px-1">
                        {links.map((r, idx) => <LinkRow key={idx} index={idx} r={r} onOpen={() => onOpenLink(r)} />)}
                    </div>
                </div>
            )}

            {e.response && (
                <div className="rounded-xl m-fill-2 px-4 py-3 flex flex-col gap-1">
                    <span className="text-[13px] font-semibold m-text-2">Yönetimin yanıtı</span>
                    <p className="m-0 text-[15px] leading-relaxed m-text whitespace-pre-line">{e.response}</p>
                    {e.respondedAt && <span className="text-[13px] m-text-3">{[e.respondedByName, e.respondedByRole ? ROLE_LABELS[e.respondedByRole] : ''].filter(Boolean).join(' · ')} · {relativeTime(e.respondedAt, now)}</span>}
                </div>
            )}

            {responder && active && (
                <Field label={e.response ? 'Yanıtı güncelle' : 'Yanıt / karar notu'} htmlFor="ex-response" hint="İsteğe bağlı; açan kişi bu notu görür.">
                    <textarea id="ex-response" className="m-input py-2.5" rows={2} value={response} placeholder="Ör. Bütçe kurulda görüşülecek, cuma bilgi verilecek" onChange={ev => setResponse(ev.target.value)} />
                </Field>
            )}
        </Sheet>
    );
};

// ---------------------------------------------------------------- sayfa

interface ModernExpectationsProps {
    workspace: WorkspaceData;
    identity: Identity;
    initialUrgency?: ExpectationUrgency;
    onCreate: (draft: ExpectationDraft) => void;
    onUpdate: (id: string, draft: ExpectationDraft) => void;
    onRespond: (id: string, status: 'acknowledged' | 'resolved', response: string) => void;
    onSetStatus: (id: string, status: ExpectationStatus) => void;
}

const ModernExpectations: React.FC<ModernExpectationsProps> = ({ workspace, identity, initialUrgency, onCreate, onUpdate, onRespond, onSetStatus }) => {
    const now = new Date();
    const list = useMemo(() => visibleExpectations(workspace, identity), [workspace, identity]);
    const counts = useMemo(() => urgencyCounts(list), [list]);
    const [filter, setFilter] = useState<ExpectationFilter>({ scope: 'active', urgency: initialUrgency || 'all', category: 'all', projectId: 'all', query: '' });
    const projectName = useMemo(() => {
        const m = new Map(workspace.projects.map(p => [p.id, p.name]));
        return (id: string) => m.get(id);
    }, [workspace.projects]);
    const shown = useMemo(() => sortExpectations(filterExpectations(list, filter, projectName), new Date()), [list, filter, projectName]);
    const scopeCount = (scope: ExpectationFilter['scope']) => filterExpectations(list, { scope }).length;
    const referencedProjects = useMemo(() => [...new Set(list.map(e => e.projectId).filter((id): id is string => !!id))].map(id => ({ id, name: projectName(id) || 'Silinmiş proje' })).sort((a, b) => a.name.localeCompare(b.name, 'tr')), [list, projectName]);

    const [form, setForm] = useState<{ edit?: ManagementExpectation } | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const [linkView, setLinkView] = useState<ResolvedLink | null>(null);
    const open = openId ? list.find(e => e.id === openId) : undefined;
    const raiser = canRaiseExpectation(identity);
    const responder = canRespondExpectation(identity);
    const set = (patch: Partial<ExpectationFilter>) => setFilter(f => ({ ...f, ...patch }));

    const openLink = (r: ResolvedLink) => {
        if (r.link.kind === 'url' && r.link.url) { window.open(r.link.url, '_blank', 'noopener,noreferrer'); return; }
        setLinkView(r);
    };

    const grouped = filter.scope === 'active' && filter.urgency === 'all'
        ? URGENCY_ORDER.map(u => ({ u, items: shown.filter(e => e.urgency === u) })).filter(g => g.items.length)
        : [{ u: null as ExpectationUrgency | null, items: shown }];

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-[70ch]">
                    <h1 className="m-0 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">Yönetimden beklentiler</h1>
                    <p className="m-0 mt-1 text-[15px] m-text-3">
                        {responder
                            ? 'Proje yöneticileri ve bölüm sorumlularının sizden beklediği karar, onay ve destekler.'
                            : 'Yönetimden beklediğiniz karar, onay ve destekleri aciliyetiyle iletin; yanıtı buradan izleyin.'}
                    </p>
                </div>
                {raiser && (
                    <button type="button" className="m-btn m-btn-primary" onClick={() => setForm({})}>
                        <Icon name="plus" size={18} strokeWidth={2.2} />
                        Yeni beklenti
                    </button>
                )}
            </header>

            <section aria-label="Aciliyete göre" className="grid gap-3 grid-cols-3">
                {URGENCY_ORDER.map(u => {
                    const selected = filter.urgency === u;
                    return (
                        <button
                            key={u}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => set({ urgency: selected ? 'all' : u, scope: 'active' })}
                            className="m-surface m-row-link rounded-2xl px-4 sm:px-5 py-4 flex flex-col items-start gap-1"
                            style={selected ? { boxShadow: `inset 0 0 0 2px ${URGENCY_TONE[u].dot}` } : undefined}
                        >
                            <span className="flex items-center gap-2 text-[15px] m-text-2">
                                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full" style={{ background: URGENCY_TONE[u].dot }}></span>
                                {URGENCY_LABELS[u]}
                            </span>
                            <span className={`text-[32px] leading-tight font-bold m-tabular ${counts[u] ? URGENCY_TONE[u].ink : 'm-text'}`}>{counts[u]}</span>
                            <span className="text-[13px] m-text-3 hidden sm:block">{URGENCY_HINTS[u]}</span>
                        </button>
                    );
                })}
            </section>

            <div className="flex flex-wrap items-center gap-2">
                <div className="m-segmented" role="group" aria-label="Kapsam">
                    {([['active', 'Aktif'], ['closed', 'Kapanan'], ['all', 'Tümü']] as const).map(([k, label]) => (
                        <button key={k} type="button" className="m-segment" aria-pressed={filter.scope === k} onClick={() => set({ scope: k })}>
                            {label}<span className="m-text-3 m-tabular">{scopeCount(k)}</span>
                        </button>
                    ))}
                </div>
                <select aria-label="Kategori" className={`m-pill ${filter.category !== 'all' ? 'is-active' : ''}`} value={filter.category} onChange={e => set({ category: e.target.value as ExpectationCategory | 'all' })}>
                    <option value="all">Tüm kategoriler</option>
                    {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
                {referencedProjects.length > 0 && (
                    <select aria-label="Proje" className={`m-pill ${filter.projectId !== 'all' ? 'is-active' : ''}`} value={filter.projectId} onChange={e => set({ projectId: e.target.value })}>
                        <option value="all">Tüm projeler</option>
                        {referencedProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                )}
                <label className="m-search flex items-center gap-2 min-h-[40px] px-3 rounded-[10px] m-text-3 ml-auto">
                    <Icon name="search" size={16} />
                    <input aria-label="Beklentilerde ara" className="bg-transparent border-0 outline-none text-[15px] m-text w-44" placeholder="Başlık, proje, kişi" value={filter.query} onChange={e => set({ query: e.target.value })} />
                </label>
            </div>

            {shown.length === 0 ? (
                <div className="m-surface rounded-2xl px-5 py-12 flex flex-col items-center gap-2 text-center">
                    <span className="w-11 h-11 rounded-full m-tone-ok flex items-center justify-center"><Icon name="check" size={22} strokeWidth={2.2} /></span>
                    <span className="text-[17px] font-semibold m-text">{list.length === 0 ? 'Henüz beklenti yok' : 'Bu süzgeçte beklenti yok'}</span>
                    {list.length === 0 && raiser && <span className="text-[15px] m-text-3 max-w-[52ch]">Bütçe onayı, takvim kararı, müşteri görüşmesi ya da personel desteği gibi yönetimden beklediklerinizi ekleyin.</span>}
                    {list.length === 0 && raiser && <button type="button" className="m-btn m-btn-primary mt-1" onClick={() => setForm({})}><Icon name="plus" size={18} strokeWidth={2.2} />İlk beklentiyi ekle</button>}
                </div>
            ) : grouped.map(g => (
                <section key={g.u || 'all'} aria-label={g.u ? URGENCY_LABELS[g.u] : 'Beklentiler'} className="flex flex-col gap-2">
                    {g.u && (
                        <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold m-text-2">
                            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full" style={{ background: URGENCY_TONE[g.u].dot }}></span>
                            {URGENCY_LABELS[g.u]} <span className="m-text-3 m-tabular font-normal">{g.items.length}</span>
                        </h2>
                    )}
                    <div className="m-surface rounded-2xl p-1.5">
                        {g.items.map((e, idx) => {
                            const sep = rowSep(idx);
                            const active = isActiveExpectation(e);
                            return (
                                <button key={e.id} type="button" onClick={() => setOpenId(e.id)} className={`m-row-link flex items-center gap-3 px-3 py-3 min-h-[68px] ${sep.className}`} style={sep.style}>
                                    <span aria-hidden="true" className="w-1 self-stretch rounded-full flex-none" style={{ background: active ? URGENCY_TONE[e.urgency].dot : 'var(--m-fill)' }}></span>
                                    <span className={`flex-1 min-w-0 flex flex-col gap-1 ${active ? '' : 'opacity-70'}`}>
                                        <span className="text-[16px] font-semibold m-text truncate">{e.title}</span>
                                        <span className="text-[13px] m-text-3 truncate">
                                            {[CATEGORY_LABELS[e.category], e.projectId ? projectName(e.projectId) || 'Silinmiş proje' : (e.departmentCode ? `Bölüm ${e.departmentCode}` : ''), e.createdByName, active ? waitingLabel(e, now) : `${relativeTime(e.updatedAt, now)} kapandı`].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    {(e.links?.length || 0) > 0 && <span className="hidden sm:inline-flex items-center gap-1 text-[13px] m-text-3 m-tabular" aria-label={`${e.links!.length} eklenti`}><Icon name="list" size={15} />{e.links!.length}</span>}
                                    <span className="hidden sm:flex items-center gap-1.5">
                                        <NeedByPill e={e} now={now} />
                                        {!g.u && <Pill tone={URGENCY_TONE[e.urgency].tone}>{URGENCY_LABELS[e.urgency]}</Pill>}
                                        <Pill tone={STATUS_TONE[e.status]}>{STATUS_LABELS[e.status]}</Pill>
                                    </span>
                                    <span style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            ))}

            {form && (
                <ExpectationForm
                    workspace={workspace}
                    identity={identity}
                    initial={form.edit}
                    onClose={() => setForm(null)}
                    onSave={draft => {
                        if (form.edit) onUpdate(form.edit.id, draft); else onCreate(draft);
                        setForm(null);
                    }}
                />
            )}
            {open && !form && !linkView && (
                <ExpectationDetail
                    key={open.id}
                    workspace={workspace}
                    identity={identity}
                    e={open}
                    now={now}
                    onClose={() => setOpenId(null)}
                    onEdit={() => setForm({ edit: open })}
                    onRespond={(status, response) => { onRespond(open.id, status, response); setOpenId(null); }}
                    onSetStatus={status => { onSetStatus(open.id, status); setOpenId(null); }}
                    onOpenLink={openLink}
                />
            )}
            {linkView?.task && <TaskInfoSheet task={linkView.task} projectName={linkView.project?.name} sprintNames={linkView.project?.settings.sprintNames} onClose={() => setLinkView(null)} />}
            {linkView?.risk && <RiskSheet risk={linkView.risk} projectName={linkView.project?.name} people={workspace.people} canEdit={false} onClose={() => setLinkView(null)} />}
        </div>
    );
};

export default ModernExpectations;
