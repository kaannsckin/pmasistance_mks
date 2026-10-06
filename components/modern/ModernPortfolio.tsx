import React, { useEffect, useMemo, useState } from 'react';
import { Person, Project, ProjectStatus, RagStatus, TaskStatus } from '../../types';
import { canAssignProjectOwner, canCreateProject, canEditProjectContent, Identity } from '../../utils/rbac';
import { timeGreeting } from '../../utils/easterEggs';
import { TodoItem } from '../../utils/todoItems';
import { Icon, IconName } from './icons';
import { PROJECT_STATUS_LABEL, RAG_TONE } from './ModernProjectHeader';
import { RAG_DOT } from './ModernSidebar';

interface ModernPortfolioProps {
    projects: Project[];
    people: Person[];
    identity: Identity;
    needsPerson: boolean;
    todoItems: TodoItem[];
    onTodoNavigate: (item: TodoItem) => void;
    onOpenProject: (id: string) => void;
    onCreateProject: (name: string) => void;
    onDeleteProject: (id: string) => void;
    onRenameProject: (id: string, name: string) => void;
    onSetRag: (id: string, rag: RagStatus | undefined, note?: string) => void;
    onSetStatus: (id: string, status: ProjectStatus) => void;
    onSetOwner: (id: string, personId: string | undefined) => void;
    /** Kenar çubuğundaki "+" her basıldığında artar → yeni proje penceresi açılır */
    createRequest: number;
}

type Filter = 'all' | 'active' | 'waiting' | 'done';
const FILTERS: { id: Filter; label: string; match: (s: ProjectStatus) => boolean }[] = [
    { id: 'all', label: 'Tümü', match: () => true },
    { id: 'active', label: 'Devam eden', match: s => s === 'devam' },
    { id: 'waiting', label: 'Beklemede', match: s => s === 'beklemede' || s === 'teklif' },
    { id: 'done', label: 'Tamamlanan', match: s => s === 'tamamlandi' },
];

const SEVERITY: Record<TodoItem['severity'], { tone: string; icon: IconName }> = {
    danger: { tone: 'm-tone-bad', icon: 'alert' },
    warn: { tone: 'm-tone-warn', icon: 'clock' },
    info: { tone: 'm-tone-hold', icon: 'info' },
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const personName = (p?: Person) => (p ? `${p.firstName} ${p.lastName}`.trim() : undefined);

const isOverdue = (dueDate: string | undefined, status: TaskStatus, today: string) =>
    !!dueDate && status !== TaskStatus.Done && dueDate.slice(0, 10) < today;

/** Modal pencere (iOS sayfası benzeri) */
const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({ title, onClose, children, footer }) => {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-label={title} className="m-bg w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl m-pop max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <h2 className="m-0 text-[20px] font-bold m-text">{title}</h2>
                    <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={onClose}><Icon name="x" /></button>
                </div>
                <div className="px-5 pb-4 overflow-y-auto flex flex-col gap-4">{children}</div>
                <div className="px-5 py-4 border-t m-sep flex flex-wrap items-center gap-2">{footer}</div>
            </div>
        </div>
    );
};

const Field: React.FC<{ label: string; htmlFor?: string; children: React.ReactNode; hint?: string }> = ({ label, htmlFor, children, hint }) => (
    <div className="flex flex-col gap-1.5">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold m-text-2">{label}</label>
        {children}
        {hint && <span className="text-[13px] m-text-3">{hint}</span>}
    </div>
);

const ProjectSheet: React.FC<{
    project: Project;
    people: Person[];
    canEdit: boolean;
    canManage: boolean;
    onClose: () => void;
    onSave: (changes: { name?: string; status?: ProjectStatus; rag?: RagStatus | undefined; ragNote?: string; owner?: string | undefined; ragChanged: boolean; ownerChanged: boolean }) => void;
    onDelete: () => void;
}> = ({ project, people, canEdit, canManage, onClose, onSave, onDelete }) => {
    const [name, setName] = useState(project.name);
    const [status, setStatus] = useState<ProjectStatus>(project.status);
    const [rag, setRag] = useState<RagStatus | undefined>(project.rag);
    const [note, setNote] = useState(project.ragNote || '');
    const [owner, setOwner] = useState<string>(project.pmPersonId || '');
    const sorted = useMemo(() => [...people].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')), [people]);

    const save = () => {
        onSave({
            name: name.trim() && name.trim() !== project.name ? name.trim() : undefined,
            status: status !== project.status ? status : undefined,
            rag,
            ragNote: note,
            ragChanged: rag !== project.rag || note !== (project.ragNote || ''),
            owner: owner || undefined,
            ownerChanged: (owner || undefined) !== project.pmPersonId,
        });
    };
    const readOnly = !canEdit;

    return (
        <Sheet
            title="Proje bilgileri"
            onClose={onClose}
            footer={<>
                {canManage && (
                    <button type="button" className="m-btn m-btn-danger" onClick={() => { if (window.confirm(`"${project.name}" projesi ve tüm verileri silinecek. Emin misiniz?`)) onDelete(); }}>
                        <Icon name="trash" size={18} />Sil
                    </button>
                )}
                <span className="flex-1"></span>
                <button type="button" className="m-btn m-btn-gray" onClick={onClose}>Vazgeç</button>
                {(canEdit || canManage) && <button type="button" className="m-btn m-btn-primary" onClick={save}>Kaydet</button>}
            </>}
        >
            {readOnly && !canManage && <p className="m-0 text-[14px] m-text-3">Bu projeyi yalnızca sahibi düzenleyebilir.</p>}
            <Field label="Proje adı" htmlFor="mp-name">
                <input id="mp-name" className="m-input" value={name} disabled={readOnly} onChange={e => setName(e.target.value)} />
            </Field>
            <Field label="Durum" htmlFor="mp-status">
                <select id="mp-status" className="m-input" value={status} disabled={readOnly} onChange={e => setStatus(e.target.value as ProjectStatus)}>
                    {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map(s => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
                </select>
            </Field>
            <Field label="Haftalık durum" hint="Yönetim ekranında ve raporlarda görünür.">
                <div className="m-segmented self-start" role="group" aria-label="Haftalık durum">
                    {([undefined, 'green', 'amber', 'red'] as (RagStatus | undefined)[]).map(r => (
                        <button key={r || 'none'} type="button" className="m-segment" aria-pressed={rag === r} disabled={readOnly} onClick={() => setRag(r)}>
                            {r && <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full" style={{ background: RAG_DOT[r] }}></span>}
                            {r ? RAG_TONE[r].label : 'Belirtilmedi'}
                        </button>
                    ))}
                </div>
                <textarea
                    aria-label="Haftalık durum notu"
                    className="m-input py-2.5 min-h-[72px]"
                    value={note}
                    disabled={readOnly}
                    placeholder="Bu haftanın kısa özeti"
                    onChange={e => setNote(e.target.value)}
                />
            </Field>
            <Field label="Proje yöneticisi" htmlFor="mp-owner">
                <select id="mp-owner" className="m-input" value={owner} disabled={!canManage} onChange={e => setOwner(e.target.value)}>
                    <option value="">Sahip atanmadı</option>
                    {sorted.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.departmentCode ? ` (${p.departmentCode})` : ''}</option>)}
                </select>
            </Field>
        </Sheet>
    );
};

const ModernPortfolio: React.FC<ModernPortfolioProps> = (props) => {
    const { projects, people, identity, needsPerson, todoItems, onTodoNavigate, onOpenProject, onCreateProject, createRequest } = props;
    const [filter, setFilter] = useState<Filter>('all');
    const [showAllTodos, setShowAllTodos] = useState(false);
    const [sheetId, setSheetId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');

    const wsLike = useMemo(() => ({ people, projects, allocations: [] }), [people, projects]);
    const canCreate = canCreateProject(identity);
    const today = todayIso();

    useEffect(() => { if (createRequest > 0 && canCreate) setCreating(true); }, [createRequest, canCreate]);

    const rows = useMemo(() => projects.map(p => {
        const total = p.tasks.length;
        const done = p.tasks.filter(t => t.status === TaskStatus.Done).length;
        const overdue = p.tasks.filter(t => isOverdue(t.dueDate, t.status, today)).length;
        return {
            project: p,
            total,
            done,
            overdue,
            pct: total ? Math.round((done / total) * 100) : 0,
            owner: personName(people.find(x => x.id === p.pmPersonId)),
        };
    }), [projects, people, today]);

    const stats = useMemo(() => {
        const active = projects.filter(p => p.status === 'devam').length;
        const waiting = projects.filter(p => p.status === 'beklemede' || p.status === 'teklif').length;
        const total = rows.reduce((a, r) => a + r.total, 0);
        const done = rows.reduce((a, r) => a + r.done, 0);
        const overdue = rows.reduce((a, r) => a + r.overdue, 0);
        const worst = [...rows].sort((a, b) => b.overdue - a.overdue)[0];
        const critical = projects.filter(p => p.rag === 'red').length;
        const atRisk = projects.filter(p => p.rag === 'red' || p.rag === 'amber').length;
        return [
            { label: 'Aktif projeler', value: String(active), note: waiting ? `${waiting} proje beklemede` : 'Bekleyen proje yok', tone: 'm-text-3' },
            { label: 'Geciken görevler', value: String(overdue), note: overdue && worst ? `En çok: ${worst.project.name}` : 'Geciken görev yok', tone: overdue ? 'm-ink-bad' : 'm-text-3' },
            { label: 'Tamamlanma', value: `%${total ? Math.round((done / total) * 100) : 0}`, note: `${done}/${total} görev bitti`, tone: 'm-text-3' },
            { label: 'Dikkat isteyen proje', value: String(atRisk), note: critical ? `${critical} proje kritik` : 'Kritik proje yok', tone: critical ? 'm-ink-bad' : atRisk ? 'm-ink-warn' : 'm-text-3' },
        ];
    }, [projects, rows]);

    const filtered = rows.filter(r => FILTERS.find(f => f.id === filter)!.match(r.project.status));
    const todos = showAllTodos ? todoItems : todoItems.slice(0, 5);

    const now = new Date();
    const dateLine = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
    const greeting = timeGreeting(now);
    const sheetRow = rows.find(r => r.project.id === sheetId);

    const create = () => {
        const name = newName.trim();
        if (!name) return;
        onCreateProject(name);
        setNewName('');
        setCreating(false);
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="m-0 text-[15px] m-text-3">{dateLine}{greeting ? ` · ${greeting}` : ''}</p>
                    <h1 className="m-0 mt-0.5 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">Portföy</h1>
                </div>
                {canCreate && (
                    <button type="button" className="m-btn m-btn-primary" onClick={() => setCreating(true)}>
                        <Icon name="plus" size={18} strokeWidth={2.2} />Yeni proje
                    </button>
                )}
            </header>

            {needsPerson && (
                <div className="m-tone-warn rounded-2xl px-5 py-4 flex items-start gap-3">
                    <Icon name="users" />
                    <div>
                        <p className="m-0 text-[15px] font-semibold">Kapsam için kişi seçin</p>
                        <p className="m-0 mt-0.5 text-[14px]">Bu rol kişi bazlı çalışır. Sol alttaki profil menüsünden kendinizi seçin; yalnızca size ait projeler görünür.</p>
                    </div>
                </div>
            )}

            <section aria-label="Özet" className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                {stats.map(s => (
                    <div key={s.label} className="m-surface rounded-2xl px-5 py-4 flex flex-col gap-1">
                        <span className="text-[15px] m-text-3">{s.label}</span>
                        <span className="text-[32px] leading-tight font-bold tracking-[-0.02em] m-tabular m-text">{s.value}</span>
                        <span className={`text-[14px] ${s.tone}`}>{s.note}</span>
                    </div>
                ))}
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="mp-attn">
                <div className="flex items-center justify-between gap-3">
                    <h2 id="mp-attn" className="m-0 text-[22px] font-bold tracking-[-0.01em] m-text">Dikkat gerektirenler</h2>
                    {todoItems.length > 5 && (
                        <button type="button" className="m-btn m-btn-plain" onClick={() => setShowAllTodos(v => !v)}>
                            {showAllTodos ? 'Daha az göster' : `Tümünü göster (${todoItems.length})`}
                        </button>
                    )}
                </div>
                <div className="m-surface rounded-2xl overflow-hidden">
                    {todos.length === 0 && (
                        <div className="flex items-center gap-3.5 px-4 min-h-[64px]">
                            <span className="w-9 h-9 rounded-[10px] m-tone-ok flex items-center justify-center flex-none"><Icon name="check" strokeWidth={2.2} /></span>
                            <span className="text-[16px] font-semibold m-text">Her şey yolunda; bekleyen uyarı yok.</span>
                        </div>
                    )}
                    {todos.map((t, i) => (
                        <button key={t.id} type="button" onClick={() => onTodoNavigate(t)} className="m-row-link flex items-center gap-3.5 px-4">
                            <span className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-none ${SEVERITY[t.severity].tone}`}><Icon name={SEVERITY[t.severity].icon} strokeWidth={2} /></span>
                            <span className={`flex-1 min-w-0 py-3.5 text-[16px] m-text ${i > 0 ? 'border-t m-sep' : ''}`}>{t.text}</span>
                            <span className="m-text-3" style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={18} strokeWidth={2} /></span>
                        </button>
                    ))}
                </div>
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="mp-projects">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="mp-projects" className="m-0 text-[22px] font-bold tracking-[-0.01em] m-text">Projeler</h2>
                    <div className="m-segmented" role="group" aria-label="Duruma göre süz">
                        {FILTERS.map(f => (
                            <button key={f.id} type="button" className="m-segment" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
                        ))}
                    </div>
                </div>
                <div className="m-surface rounded-2xl overflow-hidden">
                    {filtered.length === 0 && (
                        <p className="m-0 px-5 py-6 text-[15px] m-text-3">
                            {projects.length === 0 ? (canCreate ? 'Henüz proje yok. "Yeni proje" ile başlayın.' : 'Kapsamınızda görüntülenecek proje yok.') : 'Bu filtrede proje yok.'}
                        </p>
                    )}
                    {filtered.map((r, i) => {
                        const p = r.project;
                        const pill = p.rag ? RAG_TONE[p.rag] : { label: PROJECT_STATUS_LABEL[p.status], tone: p.status === 'tamamlandi' ? 'm-tone-ok' : p.status === 'devam' ? 'm-tone-accent' : 'm-tone-hold' };
                        return (
                            <div key={p.id} className={`flex items-center gap-2 pr-2 ${i > 0 ? 'border-t m-sep' : ''}`}>
                                <button type="button" onClick={() => onOpenProject(p.id)} className="m-row-link flex-1 min-w-0 flex flex-wrap items-center gap-x-7 gap-y-3 px-5 py-3.5 min-h-[76px]">
                                    <span className="flex items-center gap-3.5 min-w-0" style={{ flex: '1 1 260px' }}>
                                        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: RAG_DOT[p.rag || 'none'] }}></span>
                                        <span className="min-w-0 flex flex-col gap-0.5">
                                            <span className="text-[17px] font-semibold m-text truncate">{p.name}</span>
                                            <span className="text-[14px] m-text-3">
                                                {r.owner || 'Sahip atanmadı'} · {r.total} görev
                                                {r.overdue > 0 && <span className="m-ink-bad font-semibold"> · {r.overdue} gecikmiş</span>}
                                            </span>
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-2.5" style={{ flex: '0 1 200px' }} aria-label={`İlerleme yüzde ${r.pct}`}>
                                        <span aria-hidden="true" className="flex-1 h-1.5 rounded-full m-fill overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${r.pct}%`, background: 'var(--m-accent)' }}></span></span>
                                        <span className="w-11 text-right text-[14px] m-tabular m-text">%{r.pct}</span>
                                    </span>
                                    <span className="flex-none min-w-[124px]">
                                        <span className={`inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold whitespace-nowrap ${pill.tone}`}>{pill.label}</span>
                                    </span>
                                </button>
                                <button type="button" className="m-icon-btn" aria-label={`${p.name}: proje bilgileri`} onClick={() => setSheetId(p.id)}><Icon name="more" /></button>
                            </div>
                        );
                    })}
                </div>
            </section>

            {creating && (
                <Sheet
                    title="Yeni proje"
                    onClose={() => setCreating(false)}
                    footer={<>
                        <span className="flex-1"></span>
                        <button type="button" className="m-btn m-btn-gray" onClick={() => setCreating(false)}>Vazgeç</button>
                        <button type="button" className="m-btn m-btn-primary" disabled={!newName.trim()} onClick={create}>Oluştur</button>
                    </>}
                >
                    <Field label="Proje adı" htmlFor="mp-new">
                        <input id="mp-new" autoFocus className="m-input" value={newName} placeholder="Örn. Kurumsal portal yenileme" onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} />
                    </Field>
                </Sheet>
            )}

            {sheetRow && (
                <ProjectSheet
                    project={sheetRow.project}
                    people={people}
                    canEdit={canEditProjectContent(wsLike, identity, sheetRow.project.id)}
                    canManage={canAssignProjectOwner(wsLike, identity, sheetRow.project.id)}
                    onClose={() => setSheetId(null)}
                    onDelete={() => { props.onDeleteProject(sheetRow.project.id); setSheetId(null); }}
                    onSave={(c) => {
                        const id = sheetRow.project.id;
                        if (c.name) props.onRenameProject(id, c.name);
                        if (c.status) props.onSetStatus(id, c.status);
                        if (c.ragChanged) props.onSetRag(id, c.rag, c.ragNote);
                        if (c.ownerChanged) props.onSetOwner(id, c.owner);
                        setSheetId(null);
                    }}
                />
            )}
        </div>
    );
};

export default ModernPortfolio;
