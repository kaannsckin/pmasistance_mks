import React, { useMemo, useState } from 'react';
import { CustomerMeeting, MeetingLocation, MeetingStatus, WorkspaceData } from '../../types';
import { ROLE_LABELS } from '../../utils/allocations';
import {
    awaitingOutcome, canEditMeeting, canPlanMeeting, canReviewMeeting, filterMeetings, isOwnMeeting, LOCATION_LABELS, MEETING_STATUS_LABELS, MeetingDraft,
    MeetingScope, visibleMeetings,
} from '../../utils/customerMeetings';
import { Identity, managedDepartmentCode, ownsProject } from '../../utils/rbac';
import { relativeTime } from '../../utils/recentChanges';
import { projectDepartment } from '../../utils/weeklyReport';
import { Icon } from './icons';
import { Field, rowSep, Sheet } from './ui';
import { EmptyState, Pill } from './weekly/shared';

/**
 * Planlanan müşteri görüşmeleri. PY ya da bölüm sorumlusu görüşmeyi
 * (zaman, yer, katılımcılar, gündem, beklenen karar) planlayıp yönetici
 * onayına gönderir; müdür / PYB sorumlusu onaylar ya da notla reddeder.
 * Görüşme yapılınca alınan kararlar yazılır ve haftalık rapora toplantı
 * maddesi olarak eklenebilir.
 */

export const MEETING_STATUS_TONE: Record<MeetingStatus, string> = {
    draft: 'm-tone-hold',
    pending: 'm-tone-warn',
    approved: 'm-tone-accent',
    rejected: 'm-tone-bad',
    held: 'm-tone-ok',
    cancelled: 'm-tone-hold',
};

const LOCATIONS: MeetingLocation[] = ['bilgem', 'customer', 'online', 'other'];

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('tr-TR', o);
};
const whenLabel = (iso: string) => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const emptyDraft = (projectId = ''): MeetingDraft => ({
    title: '', customer: '', projectId, date: '', locationType: 'bilgem', location: '', ourParticipants: '', customerParticipants: '',
    agenda: '', expectedOutcome: '', needs: '', managementAttendance: false,
});

const toDraft = (m: CustomerMeeting): MeetingDraft => ({
    title: m.title, customer: m.customer, projectId: m.projectId || '', date: m.date, locationType: m.locationType, location: m.location,
    ourParticipants: m.ourParticipants, customerParticipants: m.customerParticipants, agenda: m.agenda, expectedOutcome: m.expectedOutcome,
    needs: m.needs || '', managementAttendance: m.managementAttendance,
});

// ---------------------------------------------------------------- form

const MeetingForm: React.FC<{
    initial?: CustomerMeeting;
    projects: { id: string; name: string }[];
    onClose: () => void;
    onSave: (d: MeetingDraft, submit: boolean) => void;
}> = ({ initial, projects, onClose, onSave }) => {
    const [d, setD] = useState<MeetingDraft>(() => (initial ? toDraft(initial) : emptyDraft(projects.length === 1 ? projects[0].id : '')));
    const set = (p: Partial<MeetingDraft>) => setD(x => ({ ...x, ...p }));
    const valid = !!(d.title.trim() && d.customer.trim() && d.date && d.agenda.trim() && d.ourParticipants.trim());
    const reapproval = initial?.status === 'approved';
    return (
        <Sheet
            wide
            title={initial ? 'Görüşmeyi düzenle' : 'Yeni müşteri görüşmesi'}
            onClose={onClose}
            footer={<>
                <span className="flex-1 text-[13px] m-text-3">{reapproval ? 'Onaylı görüşme değişirse yeniden onaya düşer.' : 'Zorunlu: konu, müşteri, zaman, gündem, katılımcılarımız.'}</span>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
                {!reapproval && initial?.status !== 'pending' && <button type="button" className="m-btn m-btn-gray" disabled={!d.title.trim()} onClick={() => onSave(d, false)}>Taslak kaydet</button>}
                <button type="button" className="m-btn m-btn-primary" disabled={!valid} onClick={() => onSave(d, true)}>{reapproval || initial?.status === 'pending' ? 'Kaydet ve onaya gönder' : 'Onaya gönder'}</button>
            </>}
        >
            <Field label="Konu / amaç" htmlFor="mt-title">
                <input id="mt-title" className="m-input" autoFocus value={d.title} placeholder="Ör. Safir Posta tanıtım demosu" onChange={e => set({ title: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Müşteri / paydaş kurum" htmlFor="mt-customer">
                    <input id="mt-customer" className="m-input" value={d.customer} placeholder="Ör. Gebze Belediyesi" onChange={e => set({ customer: e.target.value })} />
                </Field>
                <Field label="Proje" htmlFor="mt-project">
                    <select id="mt-project" className="m-input" value={d.projectId || ''} onChange={e => set({ projectId: e.target.value })}>
                        <option value="">Projeye bağlı değil (bölüm / İG)</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </Field>
                <Field label="Zaman" htmlFor="mt-date">
                    <input id="mt-date" type="datetime-local" className="m-input" value={d.date} onChange={e => set({ date: e.target.value })} />
                </Field>
                <Field label="Yer">
                    <div className="m-segmented" role="group" aria-label="Yer türü">
                        {LOCATIONS.map(l => <button key={l} type="button" className="m-segment !px-3" aria-pressed={d.locationType === l} onClick={() => set({ locationType: l })}>{LOCATION_LABELS[l]}</button>)}
                    </div>
                </Field>
            </div>
            <Field label={d.locationType === 'online' ? 'Bağlantı / platform' : 'Adres / salon'} htmlFor="mt-loc">
                <input id="mt-loc" className="m-input" value={d.location} placeholder={d.locationType === 'online' ? 'Ör. Teams' : d.locationType === 'bilgem' ? 'Ör. BİLGEM A Blok toplantı salonu' : 'Ör. Gebze Belediyesi hizmet binası'} onChange={e => set({ location: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Katılımcılarımız" htmlFor="mt-ours">
                    <input id="mt-ours" className="m-input" value={d.ourParticipants} placeholder="Ör. Ürün Yönetimi, Proje Yönetimi" onChange={e => set({ ourParticipants: e.target.value })} />
                </Field>
                <Field label="Müşteri katılımcıları" htmlFor="mt-theirs">
                    <input id="mt-theirs" className="m-input" value={d.customerParticipants} placeholder="Ör. Bilgi İşlem Müdürü" onChange={e => set({ customerParticipants: e.target.value })} />
                </Field>
            </div>
            <Field label="Gündem" htmlFor="mt-agenda">
                <textarea id="mt-agenda" className="m-input py-2.5" rows={2} value={d.agenda} placeholder="Ör. Safir Posta tanıtım demosu, pilot kurulum kapsamı" onChange={e => set({ agenda: e.target.value })} />
            </Field>
            <Field label="Beklenen karar / çıktı" htmlFor="mt-outcome">
                <textarea id="mt-outcome" className="m-input py-2.5" rows={2} value={d.expectedOutcome} placeholder="Ör. 50 kişilik on-prem pilot kurulum kararı" onChange={e => set({ expectedOutcome: e.target.value })} />
            </Field>
            <Field label="İhtiyaçlar (isteğe bağlı)" htmlFor="mt-needs">
                <input id="mt-needs" className="m-input" value={d.needs || ''} placeholder="Ör. demo ortamı, sunum, araç" onChange={e => set({ needs: e.target.value })} />
            </Field>
            <label className="inline-flex items-center gap-2 text-[15px] m-text">
                <input type="checkbox" checked={d.managementAttendance} onChange={e => set({ managementAttendance: e.target.checked })} />
                Yönetimin katılımı isteniyor
            </label>
        </Sheet>
    );
};

// ---------------------------------------------------------------- ayrıntı

const MeetingDetail: React.FC<{
    m: CustomerMeeting;
    identity: Identity;
    projectName?: string;
    canOutcome: boolean;
    onClose: () => void;
    onEdit: () => void;
    onSubmit: () => void;
    onReview: (approve: boolean, note: string) => void;
    onHeld: (decisions: string) => void;
    onCancel: () => void;
    onDelete: () => void;
}> = ({ m, identity, projectName, canOutcome, onClose, onEdit, onSubmit, onReview, onHeld, onCancel, onDelete }) => {
    const [note, setNote] = useState('');
    const [decisions, setDecisions] = useState(m.decisions || '');
    const reviewer = canReviewMeeting(identity) && m.status === 'pending';
    const own = isOwnMeeting(m, identity);
    const outcome = canOutcome && (m.status === 'approved' || m.status === 'held');
    const rows: [string, string][] = [
        ['Zaman', whenLabel(m.date)],
        ['Yer', [LOCATION_LABELS[m.locationType], m.location].filter(Boolean).join(' — ')],
        ['Müşteri', m.customer],
        ['Proje', projectName || 'Projeye bağlı değil'],
        ['Katılımcılarımız', m.ourParticipants],
        ['Müşteri katılımcıları', m.customerParticipants || '—'],
        ['Gündem', m.agenda],
        ['Beklenen karar', m.expectedOutcome || '—'],
        ...(m.needs ? [['İhtiyaçlar', m.needs] as [string, string]] : []),
        ['Yönetim katılımı', m.managementAttendance ? 'İsteniyor' : 'Gerekmiyor'],
        ['Planlayan', [m.createdByName, ROLE_LABELS[m.createdByRole]].filter(Boolean).join(' · ')],
    ];
    return (
        <Sheet
            wide
            title={m.title}
            onClose={onClose}
            footer={<>
                {own && m.status === 'draft' && <button type="button" className="m-btn m-btn-danger" onClick={onDelete}>Sil</button>}
                {own && (m.status === 'pending' || m.status === 'approved') && <button type="button" className="m-btn m-btn-danger" onClick={onCancel}>İptal et</button>}
                <span className="flex-1"></span>
                {canEditMeeting(m, identity) && <button type="button" className="m-btn m-btn-gray" onClick={onEdit}><Icon name="pencil" size={16} />Düzenle</button>}
                {own && (m.status === 'draft' || m.status === 'rejected') && <button type="button" className="m-btn m-btn-primary" onClick={onSubmit}><Icon name="send" size={16} />Onaya gönder</button>}
                {reviewer && <button type="button" className="m-btn m-btn-danger" onClick={() => onReview(false, note)} disabled={!note.trim()} title={note.trim() ? undefined : 'Ret gerekçesi yazın'}>Reddet</button>}
                {reviewer && <button type="button" className="m-btn m-btn-primary" onClick={() => onReview(true, note)}><Icon name="check" size={16} />Onayla</button>}
                {outcome && <button type="button" className="m-btn m-btn-primary" disabled={!decisions.trim() || decisions.trim() === (m.decisions || '')} onClick={() => onHeld(decisions)}>{m.status === 'held' ? 'Kararları güncelle' : 'Gerçekleşti olarak kaydet'}</button>}
            </>}
        >
            <div className="flex flex-wrap items-center gap-2">
                <Pill tone={MEETING_STATUS_TONE[m.status]}>{MEETING_STATUS_LABELS[m.status]}</Pill>
                {m.managementAttendance && <Pill tone="m-tone-warn">Yönetim katılımı</Pill>}
                {awaitingOutcome(m) && <Pill tone="m-tone-bad">Sonuç bekleniyor</Pill>}
                <span className="text-[13px] m-text-3">Güncellendi {relativeTime(m.updatedAt)}</span>
            </div>
            <dl className="m-0 grid gap-x-4 gap-y-2 text-[15px]" style={{ gridTemplateColumns: 'minmax(120px,auto) 1fr' }}>
                {rows.map(([k, v]) => <React.Fragment key={k}><dt className="m-text-3">{k}</dt><dd className="m-0 m-text whitespace-pre-line">{v}</dd></React.Fragment>)}
            </dl>
            {m.reviewNote || m.reviewedAt ? (
                <div className={`rounded-xl px-4 py-3 flex flex-col gap-1 ${m.status === 'rejected' ? 'm-tone-bad' : 'm-fill-2'}`}>
                    <span className="text-[13px] font-semibold">{m.status === 'rejected' ? 'Ret gerekçesi' : 'Yönetici notu'}</span>
                    {m.reviewNote && <p className="m-0 text-[15px] whitespace-pre-line">{m.reviewNote}</p>}
                    {m.reviewedAt && <span className="text-[13px] opacity-80">{m.reviewedByName} · {relativeTime(m.reviewedAt)}</span>}
                </div>
            ) : null}
            {reviewer && (
                <Field label="Not (ret için zorunlu)" htmlFor="mt-note" hint="Planlayan kişi bu notu görür.">
                    <textarea id="mt-note" className="m-input py-2.5" rows={2} value={note} placeholder="Ör. Görüşmeye ben de katılacağım; sunumu önceden paylaşın." onChange={e => setNote(e.target.value)} />
                </Field>
            )}
            {outcome && (
                <Field label="Alınan en önemli kararlar" htmlFor="mt-decisions" hint="Haftalık rapora toplantı maddesi olarak eklenir.">
                    <textarea id="mt-decisions" className="m-input py-2.5" rows={3} value={decisions} placeholder="Ör. Belediyede on-prem 50 kişilik bir pilot kurulum yapılması kararlaştırıldı." onChange={e => setDecisions(e.target.value)} />
                </Field>
            )}
            {!outcome && m.decisions && (
                <div className="rounded-xl m-tone-ok px-4 py-3">
                    <span className="text-[13px] font-semibold">Alınan kararlar</span>
                    <p className="m-0 text-[15px] whitespace-pre-line">{m.decisions}</p>
                </div>
            )}
        </Sheet>
    );
};

// ---------------------------------------------------------------- sayfa

export interface ModernMeetingsProps {
    workspace: WorkspaceData;
    identity: Identity;
    onCreate: (d: MeetingDraft, submit: boolean) => void;
    onUpdate: (id: string, d: MeetingDraft, submit: boolean) => void;
    onReview: (id: string, approve: boolean, note: string) => void;
    onMarkHeld: (id: string, decisions: string) => void;
    onSetStatus: (id: string, status: MeetingStatus) => void;
    onDelete: (id: string) => void;
}

const ModernMeetings: React.FC<ModernMeetingsProps> = ({ workspace, identity, onCreate, onUpdate, onReview, onMarkHeld, onSetStatus, onDelete }) => {
    const now = new Date();
    const reviewer = canReviewMeeting(identity);
    const planner = canPlanMeeting(identity);
    const list = useMemo(() => visibleMeetings(workspace, identity), [workspace, identity]);
    const [scope, setScope] = useState<MeetingScope>(reviewer && list.some(m => m.status === 'pending') ? 'pending' : 'upcoming');
    const [query, setQuery] = useState('');
    const [projectId, setProjectId] = useState('all');
    const [form, setForm] = useState<{ edit?: CustomerMeeting } | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const open = openId ? list.find(m => m.id === openId) : undefined;

    const projectName = useMemo(() => new Map(workspace.projects.map(p => [p.id, p.name])), [workspace.projects]);
    const formProjects = useMemo(() => {
        if (identity.role === 'py') return workspace.projects.filter(p => ownsProject(p, identity));
        const dept = managedDepartmentCode(workspace, identity);
        return dept ? workspace.projects.filter(p => projectDepartment(workspace, p) === dept) : [];
    }, [workspace, identity]).filter(p => p.status === 'devam').map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const referenced = useMemo(() => [...new Set(list.map(m => m.projectId).filter((x): x is string => !!x))].map(id => ({ id, name: projectName.get(id) || 'Silinmiş proje' })).sort((a, b) => a.name.localeCompare(b.name, 'tr')), [list, projectName]);

    const q = query.trim().toLocaleLowerCase('tr-TR');
    const filtered = list.filter(m => (projectId === 'all' || (projectId === 'none' ? !m.projectId : m.projectId === projectId))
        && (!q || [m.title, m.customer, m.agenda, m.createdByName, m.projectId ? projectName.get(m.projectId) : ''].some(s => (s || '').toLocaleLowerCase('tr-TR').includes(q))));
    const shown = filterMeetings(filtered, scope, now);
    const count = (s: MeetingScope) => filterMeetings(filtered, s, now).length;
    const pendingCount = list.filter(m => m.status === 'pending').length;
    const outcomeCount = list.filter(m => awaitingOutcome(m, now) && isOwnMeeting(m, identity)).length;
    const canOutcome = (m: CustomerMeeting) => isOwnMeeting(m, identity) || (!!m.projectId && workspace.projects.some(p => p.id === m.projectId && ownsProject(p, identity)));

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-[70ch]">
                    <h1 className="m-0 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">Müşteri görüşmeleri</h1>
                    <p className="m-0 mt-1 text-[15px] m-text-3">
                        {reviewer
                            ? 'Proje yöneticileri ve bölüm sorumlularının planladığı müşteri görüşmeleri; onaylayın ya da notla geri çevirin.'
                            : 'Müşteri görüşmelerini planlayıp yönetici onayına gönderin; gerçekleşince kararları yazın, haftalık rapora eklensin.'}
                    </p>
                </div>
                {planner && (
                    <button type="button" className="m-btn m-btn-primary" onClick={() => setForm({})}>
                        <Icon name="plus" size={18} strokeWidth={2.2} />Yeni görüşme
                    </button>
                )}
            </header>

            {(reviewer && pendingCount > 0) || outcomeCount > 0 ? (
                <div className="flex flex-wrap gap-3">
                    {reviewer && pendingCount > 0 && (
                        <button type="button" className="m-surface m-row-link !w-auto rounded-2xl px-4 py-3 flex items-center gap-3" onClick={() => setScope('pending')}>
                            <span className="w-9 h-9 rounded-full m-tone-warn flex items-center justify-center"><Icon name="clock" size={18} /></span>
                            <span className="flex flex-col"><span className="text-[22px] font-bold m-tabular m-ink-warn leading-tight">{pendingCount}</span><span className="text-[13px] m-text-3">onayınızı bekliyor</span></span>
                        </button>
                    )}
                    {outcomeCount > 0 && (
                        <button type="button" className="m-surface m-row-link !w-auto rounded-2xl px-4 py-3 flex items-center gap-3" onClick={() => setScope('upcoming')}>
                            <span className="w-9 h-9 rounded-full m-tone-bad flex items-center justify-center"><Icon name="pen" size={18} /></span>
                            <span className="flex flex-col"><span className="text-[22px] font-bold m-tabular m-ink-bad leading-tight">{outcomeCount}</span><span className="text-[13px] m-text-3">görüşmenin sonucu yazılmadı</span></span>
                        </button>
                    )}
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
                <div className="m-segmented" role="group" aria-label="Kapsam">
                    {([['upcoming', 'Yaklaşan'], ['pending', 'Onay bekleyen'], ['past', 'Geçmiş'], ['all', 'Tümü']] as const).map(([k, label]) => (
                        <button key={k} type="button" className="m-segment" aria-pressed={scope === k} onClick={() => setScope(k)}>{label}<span className="m-text-3 m-tabular">{count(k)}</span></button>
                    ))}
                </div>
                {referenced.length > 0 && (
                    <select aria-label="Proje" className={`m-pill ${projectId !== 'all' ? 'is-active' : ''}`} value={projectId} onChange={e => setProjectId(e.target.value)}>
                        <option value="all">Tüm projeler</option>
                        <option value="none">Projeye bağlı olmayan</option>
                        {referenced.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                )}
                <label className="m-search flex items-center gap-2 min-h-[40px] px-3 rounded-[10px] m-text-3 ml-auto">
                    <Icon name="search" size={16} />
                    <input aria-label="Görüşmelerde ara" className="bg-transparent border-0 outline-none text-[15px] m-text w-44" placeholder="Konu, müşteri, kişi" value={query} onChange={e => setQuery(e.target.value)} />
                </label>
            </div>

            {shown.length === 0 ? (
                <EmptyState icon="calendarCheck" title={list.length === 0 ? 'Henüz görüşme yok' : 'Bu süzgeçte görüşme yok'}>
                    {list.length === 0 && planner && <span className="text-[15px] m-text-3 max-w-[52ch]">Müşteri ya da paydaşlarla planladığınız tanıtım, demo, sözleşme ve kabul görüşmelerini ekleyin; yönetici onayına düşer.</span>}
                    {list.length === 0 && planner && <button type="button" className="m-btn m-btn-primary mt-1" onClick={() => setForm({})}><Icon name="plus" size={18} strokeWidth={2.2} />İlk görüşmeyi planla</button>}
                </EmptyState>
            ) : (
                <div className="m-surface rounded-2xl p-1.5">
                    {shown.map((m, i) => {
                        const sep = rowSep(i);
                        const muted = m.status === 'cancelled' || m.status === 'rejected';
                        return (
                            <button key={m.id} type="button" onClick={() => setOpenId(m.id)} className={`m-row-link flex items-center gap-3 px-3 py-3 min-h-[72px] ${sep.className}`} style={sep.style}>
                                <span className="w-12 flex-none flex flex-col items-center rounded-xl m-fill-2 py-1.5" aria-hidden="true">
                                    <span className="text-[11px] font-semibold m-ink-bad">{fmt(m.date, { month: 'short' }).toLocaleUpperCase('tr-TR')}</span>
                                    <span className="text-[20px] font-bold m-text leading-none m-tabular">{fmt(m.date, { day: 'numeric' })}</span>
                                </span>
                                <span className={`flex-1 min-w-0 flex flex-col gap-0.5 ${muted ? 'opacity-70' : ''}`}>
                                    <span className="text-[16px] font-semibold m-text truncate">{m.title}</span>
                                    <span className="text-[13px] m-text-3 truncate">
                                        {[fmt(m.date, { weekday: 'short', hour: '2-digit', minute: '2-digit' }), m.customer, m.projectId ? projectName.get(m.projectId) || 'Silinmiş proje' : 'Bölüm / İG', LOCATION_LABELS[m.locationType], m.createdByName].filter(Boolean).join(' · ')}
                                    </span>
                                </span>
                                <span className="hidden sm:flex items-center gap-1.5">
                                    {m.managementAttendance && m.status !== 'held' && m.status !== 'cancelled' && <Pill tone="m-tone-warn">Yönetim katılımı</Pill>}
                                    {awaitingOutcome(m, now) ? <Pill tone="m-tone-bad">Sonuç bekleniyor</Pill> : <Pill tone={MEETING_STATUS_TONE[m.status]}>{MEETING_STATUS_LABELS[m.status]}</Pill>}
                                </span>
                                <span style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>
                            </button>
                        );
                    })}
                </div>
            )}

            {form && (
                <MeetingForm
                    initial={form.edit}
                    projects={form.edit?.projectId && !formProjects.some(p => p.id === form.edit!.projectId) ? [...formProjects, { id: form.edit.projectId, name: projectName.get(form.edit.projectId) || 'Silinmiş proje' }] : formProjects}
                    onClose={() => setForm(null)}
                    onSave={(d: MeetingDraft, submit: boolean) => {
                        if (form.edit) onUpdate(form.edit.id, d, submit); else onCreate(d, submit);
                        setForm(null);
                        if (submit) setScope('upcoming');
                    }}
                />
            )}
            {open && !form && (
                <MeetingDetail
                    key={open.id}
                    m={open}
                    identity={identity}
                    projectName={open.projectId ? projectName.get(open.projectId) || 'Silinmiş proje' : undefined}
                    canOutcome={canOutcome(open)}
                    onClose={() => setOpenId(null)}
                    onEdit={() => setForm({ edit: open })}
                    onSubmit={() => { onUpdate(open.id, toDraft(open), true); setOpenId(null); }}
                    onReview={(approve: boolean, note: string) => { onReview(open.id, approve, note); setOpenId(null); }}
                    onHeld={(decisions: string) => { onMarkHeld(open.id, decisions); setOpenId(null); }}
                    onCancel={() => { if (window.confirm('Görüşme iptal edilsin mi?')) { onSetStatus(open.id, 'cancelled'); setOpenId(null); } }}
                    onDelete={() => { if (window.confirm('Taslak silinsin mi?')) { onDelete(open.id); setOpenId(null); } }}
                />
            )}
        </div>
    );
};

export default ModernMeetings;
