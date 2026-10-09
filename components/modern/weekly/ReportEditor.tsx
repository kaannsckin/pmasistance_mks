import React, { useMemo, useRef, useState } from 'react';
import { Abbreviation, CustomerMeeting, MeetingDetails, ProjectAiProfile, ReportAiLogEntry, ReportCategory, ReportItem, WeeklyReport, WorklogEntry, WorkspaceData } from '../../../types';
import { cleanProjectProfile, PROFILE_LIMITS } from '../../../utils/ai/projectProfile';
import { suggestionLogEntry } from '../../../utils/ai/reportAiStats';
import { ROLE_LABELS } from '../../../utils/allocations';
import { reportGateWarning } from '../../../utils/ai/reportEval';
import { buildVariantRequest, PRODUCTION_VARIANT } from '../../../utils/ai/reportVariants';
import { buildReportInput, parseReportSuggestion, ReportSuggestion } from '../../../utils/ai/weeklyReportPrompt';
import { reportPromptVersion } from '../../../utils/ai/reportGuide';
import { meetingsHeldInWeek, meetingsPlannedInWeek, meetingToDetails, visibleMeetings } from '../../../utils/customerMeetings';
import { fetchJiraWorklogs, IntegrationHealth } from '../../../utils/integrations';
import { Identity, ownsProject } from '../../../utils/rbac';
import { relativeTime } from '../../../utils/recentChanges';
import {
    canEditReport, CATEGORY_META, findAbbreviations, findReport, glossaryFor, itemDisplay, lintCounts, LintIssue, lintReport, locative, meetingSentence,
    flowBlockers, newItem, nextStage, PLAN_REVIEW_LABELS, PLAN_REVIEW_STATUSES, reportFlowOf, returnStage, setPlanReview, shiftWeek, STAGE_LABELS, THIS_WEEK_CATEGORIES, weekLabel, weekStart,
} from '../../../utils/weeklyReport';
import { parseWorklogRows, summarizeWorklog, worklogInWeek } from '../../../utils/worklog';
import { useAiRun } from '../../assistant/AiButton';
import { Icon } from '../icons';
import { readRows } from '../readRows';
import ScoreScale from '../ScoreScale';
import { Card, Field, Sheet } from '../ui';
import { Notice, NoticeState, Pill, StagePill } from './shared';

/**
 * Tek bir haftalık raporun yazımı ve incelemesi. Aşamanın sahibi (PY →
 * bölüm sorumlusu → PYB destek) düzenler; diğerleri salt okur. Kaynaklar
 * paneli haftalık notlar, worklog (dosya ya da Jira), kayıtlı müşteri
 * görüşmeleri ve AI önerisinden madde eklemeyi sağlar; format denetimi kurum
 * rapor kılavuzunu canlı uygular.
 */

type ListKey = 'thisWeek' | 'nextWeek';

const SOURCE_LABEL: Record<NonNullable<ReportItem['source']>, string> = {
    ai: 'AI', note: 'Not', worklog: 'Worklog', meeting: 'Görüşme', task: 'Görev', manual: '',
};

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const longDay = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const mergeAbbr = (a: Abbreviation[], b: Abbreviation[]): Abbreviation[] => {
    const m = new Map(a.map(x => [x.abbr.toLocaleUpperCase('tr-TR'), x]));
    b.forEach(x => { if (!m.has(x.abbr.toLocaleUpperCase('tr-TR'))) m.set(x.abbr.toLocaleUpperCase('tr-TR'), x); });
    return [...m.values()];
};

// ---------------------------------------------------------------- madde düzenleyici

const IssueList: React.FC<{ issues: LintIssue[] }> = ({ issues }) =>
    issues.length ? (
        <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {issues.map((i, k) => (
                <li key={k} className={`flex items-start gap-1.5 text-[13px] ${i.level === 'error' ? 'm-ink-bad' : 'm-ink-warn'}`}>
                    <Icon name={i.level === 'error' ? 'alert' : 'info'} size={14} style={{ marginTop: 2 }} />
                    <span>{i.message}</span>
                </li>
            ))}
        </ul>
    ) : null;

const MeetingFields: React.FC<{ id: string; m: MeetingDetails; onChange: (m: MeetingDetails) => void }> = ({ id, m, onChange }) => (
    <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Zaman" htmlFor={`${id}-date`}>
            <input id={`${id}-date`} type="date" className="m-input" value={m.date} onChange={e => onChange({ ...m, date: e.target.value })} />
        </Field>
        <Field label="Yer" htmlFor={`${id}-place`}>
            <input id={`${id}-place`} className="m-input" value={m.place} placeholder="Ör. BİLGEM, Gebze Belediyesi, çevrim içi" onChange={e => onChange({ ...m, place: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
            <Field label="Katılımcılar" htmlFor={`${id}-who`}>
                <input id={`${id}-who`} className="m-input" value={m.participants} placeholder="Ör. Gebze Belediyesi; Ürün Yönetimi, Proje Yönetimi ve Mesajlaşma birimleri" onChange={e => onChange({ ...m, participants: e.target.value })} />
            </Field>
        </div>
        <div className="sm:col-span-2">
            <Field label="Gündem" htmlFor={`${id}-agenda`}>
                <input id={`${id}-agenda`} className="m-input" value={m.agenda} placeholder="Ör. Safir Posta tanıtım demosu" onChange={e => onChange({ ...m, agenda: e.target.value })} />
            </Field>
        </div>
        <div className="sm:col-span-2">
            <Field label="Alınan en önemli kararlar" htmlFor={`${id}-dec`}>
                <textarea id={`${id}-dec`} className="m-input py-2.5" rows={2} value={m.decisions} placeholder="Ör. Belediyede on-prem 50 kişilik bir pilot kurulum yapılması kararlaştırıldı." onChange={e => onChange({ ...m, decisions: e.target.value })} />
            </Field>
        </div>
    </div>
);

const ItemEditor: React.FC<{
    item: ReportItem;
    index: number;
    count: number;
    list: ListKey;
    issues: LintIssue[];
    defaultDate: string;
    onChange: (item: ReportItem) => void;
    onMove: (delta: number) => void;
    onRemove: () => void;
}> = ({ item, index, count, list, issues, defaultDate, onChange, onMove, onRemove }) => {
    const meta = CATEGORY_META[item.category];
    const setCategory = (category: ReportCategory) =>
        onChange({ ...item, category, meeting: category === 'meeting' ? (item.meeting || { date: defaultDate, place: '', participants: '', agenda: '', decisions: '' }) : undefined });
    const src = item.source ? SOURCE_LABEL[item.source] : '';
    return (
        <div id={`ri-${item.id}`} className="rounded-xl m-fill-2 p-3 flex flex-col gap-2.5" style={issues.some(i => i.level === 'error') ? { boxShadow: 'inset 0 0 0 1.5px var(--m-bad)' } : undefined}>
            <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold m-text-3 m-tabular w-5 text-right">{index + 1}.</span>
                {list === 'thisWeek' ? (
                    <select aria-label="Madde türü" className="m-input !min-h-[36px] !w-auto max-w-[70%] text-[14px]" value={item.category} onChange={e => setCategory(e.target.value as ReportCategory)}>
                        {THIS_WEEK_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
                    </select>
                ) : <span className="text-[14px] m-text-2">Plan</span>}
                {src && <Pill tone="m-tone-accent">{src}</Pill>}
                <span className="flex-1"></span>
                <button type="button" className="m-icon-btn !w-9 !h-9" aria-label="Yukarı taşı" disabled={index === 0} onClick={() => onMove(-1)}><Icon name="arrowUp" size={16} /></button>
                <button type="button" className="m-icon-btn !w-9 !h-9" aria-label="Aşağı taşı" disabled={index === count - 1} onClick={() => onMove(1)}><Icon name="arrowDown" size={16} /></button>
                <button type="button" className="m-icon-btn !w-9 !h-9" aria-label="Maddeyi sil" onClick={onRemove}><Icon name="trash" size={16} /></button>
            </div>
            {item.category === 'meeting' && item.meeting && (
                <>
                    <MeetingFields id={item.id} m={item.meeting} onChange={meeting => onChange({ ...item, meeting })} />
                    <div className="rounded-lg m-surface px-3 py-2 text-[14px] m-text-2"><span className="font-semibold">Rapordaki hâli: </span>{itemDisplay(item)}</div>
                </>
            )}
            <textarea
                aria-label={item.category === 'meeting' && item.meeting ? 'Ek açıklama' : 'Madde metni'}
                className="m-input py-2.5"
                rows={item.category === 'meeting' && item.meeting ? 1 : 2}
                value={item.text}
                placeholder={item.category === 'meeting' && item.meeting ? 'Ek açıklama (isteğe bağlı)' : meta.hint}
                onChange={e => onChange({ ...item, text: e.target.value })}
            />
            <IssueList issues={issues} />
        </div>
    );
};

const ReadOnlyList: React.FC<{ items: ReportItem[]; withCategory?: boolean }> = ({ items, withCategory }) =>
    items.length ? (
        <ul className="m-0 pl-5 flex flex-col gap-1.5">
            {items.map(i => (
                <li key={i.id} className="text-[15px] leading-relaxed m-text">
                    {withCategory && <span className="text-[13px] font-semibold m-text-3">{CATEGORY_META[i.category].label}: </span>}
                    {itemDisplay(i)}
                </li>
            ))}
        </ul>
    ) : <p className="m-0 text-[15px] m-text-3">Madde yok.</p>;

// ---------------------------------------------------------------- kaynaklar

const SourceRow: React.FC<{ title: string; sub?: string; action: string; onAdd: () => void; added?: boolean }> = ({ title, sub, action, onAdd, added }) => (
    <div className="flex items-start gap-2 py-2">
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-[14px] m-text leading-snug">{title}</span>
            {sub && <span className="text-[12.5px] m-text-3">{sub}</span>}
        </div>
        <button type="button" className="m-btn m-btn-plain !min-h-[34px] !px-2.5 text-[14px] flex-none" disabled={added} onClick={onAdd}>
            {added ? <><Icon name="check" size={15} />Eklendi</> : <><Icon name="plus" size={15} />{action}</>}
        </button>
    </div>
);

const SubHead: React.FC<{ children: React.ReactNode; count?: number }> = ({ children, count }) => (
    <h3 className="m-0 mt-1 text-[13px] font-semibold m-text-2 flex items-center gap-1.5">{children}{count !== undefined && <span className="m-text-3 font-normal m-tabular">{count}</span>}</h3>
);

// ---------------------------------------------------------------- düzenleyici

export interface ReportEditorProps {
    workspace: WorkspaceData;
    identity: Identity;
    report: WeeklyReport;
    isNew: boolean;
    dictionary: Abbreviation[];
    health: IntegrationHealth | null;
    onBack: () => void;
    onSave: (r: WeeklyReport) => boolean;
    onAdvance: (r: WeeklyReport) => boolean;
    onReturn: (note: string) => boolean;
    onSetJiraKey: (projectId: string, key: string) => void;
    onOpenMeetings: () => void;
    /** AI önerisi günlüğü (uygulandı / vazgeçildi / hata; metin yazılmaz) */
    onLogAi?: (entry: ReportAiLogEntry) => void;
    /** Proje kartı (yalnız proje sahibi PY) */
    onSaveProjectProfile?: (projectId: string, profile: ProjectAiProfile | undefined) => boolean;
}

// ---------------------------------------------------------------- proje kartı

const emptyProfile = (): ProjectAiProfile => ({ summary: '', customers: '', product: '', stakeholders: '', reportHints: '', glossary: [] });

const ProjectCardSheet: React.FC<{ profile?: ProjectAiProfile; canEdit: boolean; onClose: () => void; onSave: (p: ProjectAiProfile | undefined) => boolean }> = ({ profile, canEdit, onClose, onSave }) => {
    const [d, setD] = useState<ProjectAiProfile>(() => ({ ...emptyProfile(), ...(profile || {}), glossary: [...(profile?.glossary || [])] }));
    const [error, setError] = useState<string | null>(null);
    const set = (patch: Partial<ProjectAiProfile>) => setD(x => ({ ...x, ...patch }));
    const terms = d.glossary || [];
    const setTerm = (i: number, patch: Partial<{ term: string; explanation: string }>) => set({ glossary: terms.map((t, k) => (k === i ? { ...t, ...patch } : t)) });
    const text = (key: 'customers' | 'product' | 'stakeholders' | 'reportHints', label: string, placeholder: string) => (
        <Field label={label} htmlFor={`pc-${key}`}>
            <input id={`pc-${key}`} className="m-input" maxLength={PROFILE_LIMITS.text} disabled={!canEdit} value={d[key] || ''} placeholder={placeholder} onChange={e => set({ [key]: e.target.value })} />
        </Field>
    );
    const save = () => { if (onSave(cleanProjectProfile(d))) onClose(); else setError('Kaydedilemedi: proje kartını yalnız projenin yöneticisi düzenleyebilir.'); };
    return (
        <Sheet
            wide
            title="Proje kartı"
            subtitle="AI taslağı, konuya yabancı okurun anlaması için bu bilgileri kısa açıklama olarak kullanır; kartta olmayan teknik ayrıntıyı uydurmaz."
            onClose={onClose}
            footer={<>
                <span className="flex-1 text-[12.5px] m-text-3">Kart proje kaydıyla birlikte paylaşılır (haftalık notlar gibi özel değildir).</span>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>{canEdit ? 'Vazgeç' : 'Kapat'}</button>
                {canEdit && <button type="button" className="m-btn m-btn-primary" onClick={save}>Kaydet</button>}
            </>}
        >
            {!canEdit && <p className="m-0 text-[14px] m-text-3">Kartı projenin yöneticisi düzenler.</p>}
            <Field label="Proje ne yapıyor?" htmlFor="pc-summary" hint={`En çok ${PROFILE_LIMITS.summary} karakter. Ör. "Belediyeler için kurum içi e-posta ve takvim ürünü; 2026'da 3 belediyede pilot."`}>
                <textarea id="pc-summary" className="m-input py-2.5" rows={3} maxLength={PROFILE_LIMITS.summary} disabled={!canEdit} value={d.summary || ''} onChange={e => set({ summary: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
                {text('customers', 'Müşteriler', 'Ör. Gebze Belediyesi, Kocaeli Valiliği')}
                {text('product', 'Ürün / çıktı', 'Ör. Safir Posta 3.2')}
                {text('stakeholders', 'Paydaşlar', 'Ör. İG, Ürün Yönetimi, Mesajlaşma birimi')}
                {text('reportHints', 'Rapor ipuçları', 'Ör. Hakediş tutarlarını KDV hariç yazın')}
            </div>
            <div className="flex flex-col gap-2">
                <h3 className="m-0 text-[15px] font-semibold m-text">Terimler <span className="m-text-3 font-normal m-tabular">{terms.length}/{PROFILE_LIMITS.terms}</span></h3>
                {terms.map((t, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                        <input aria-label={`Terim ${i + 1}`} className="m-input !w-40" maxLength={PROFILE_LIMITS.term} disabled={!canEdit} value={t.term} placeholder="Terim" onChange={e => setTerm(i, { term: e.target.value })} />
                        <input aria-label={`Terim ${i + 1} açıklaması`} className="m-input flex-1 min-w-[200px]" maxLength={PROFILE_LIMITS.explanation} disabled={!canEdit} value={t.explanation} placeholder="Kısa açıklama" onChange={e => setTerm(i, { explanation: e.target.value })} />
                        {canEdit && <button type="button" className="m-icon-btn" aria-label={`Terim ${i + 1} sil`} onClick={() => set({ glossary: terms.filter((_, k) => k !== i) })}><Icon name="trash" size={16} /></button>}
                    </div>
                ))}
                {canEdit && terms.length < PROFILE_LIMITS.terms && (
                    <button type="button" className="m-btn m-btn-plain self-start" onClick={() => set({ glossary: [...terms, { term: '', explanation: '' }] })}><Icon name="plus" size={16} />Terim ekle</button>
                )}
            </div>
            {error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{error}</p>}
        </Sheet>
    );
};

const ReportEditor: React.FC<ReportEditorProps> = ({ workspace, identity, report, isNew, dictionary, health, onBack, onSave, onAdvance, onReturn, onSetJiraKey, onOpenMeetings, onLogAi, onSaveProjectProfile }) => {
    const [draft, setDraft] = useState<WeeklyReport>(report);
    const [dirty, setDirty] = useState(false);
    const [notice, setNotice] = useState<NoticeState>(null);
    const [addMenu, setAddMenu] = useState(false);
    const [returning, setReturning] = useState(false);
    const [returnNote, setReturnNote] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [abbrInputs, setAbbrInputs] = useState<Record<string, string>>({});
    const [jiraKey, setJiraKey] = useState('');
    const [busy, setBusy] = useState<'file' | 'jira' | null>(null);
    const [suggestion, setSuggestion] = useState<{ s: ReportSuggestion; raw: string; input: string; promptVersion: string; model?: string } | null>(null);
    const [missingQs, setMissingQs] = useState<string[]>([]);
    const [cardOpen, setCardOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const ai = useAiRun();

    const { year, week } = draft;
    const editable = canEditReport(workspace, identity, report);
    // PY puanını yalnız proje sahibi PY taslakta verir (kayıt sırasında da doğrulanır)
    const pmCanRate = editable && draft.kind === 'project' && report.stage === 'draft';
    const project = draft.projectId ? workspace.projects.find(p => p.id === draft.projectId) : undefined;
    const pm = project?.pmPersonId ? workspace.people.find(p => p.id === project.pmPersonId) : undefined;
    const deptName = workspace.departments.find(d => d.code === draft.departmentCode)?.name || draft.departmentCode;
    const title = draft.kind === 'department' ? `Bölüm eklemeleri — ${deptName}` : project?.name || 'Silinmiş proje';
    const flow = reportFlowOf(workspace);
    const next = nextStage(report, flow);
    const returnTo = returnStage(report, flow);
    const canReturn = editable && report.stage !== 'draft' && !!returnTo;
    const defaultDate = isoDay(weekStart(year, week));

    const issues = useMemo(() => lintReport(draft, dictionary), [draft, dictionary]);
    const counts = lintCounts(issues);
    const byItem = useMemo(() => {
        const m = new Map<string, LintIssue[]>();
        issues.forEach(i => { if (i.itemId) m.set(i.itemId, [...(m.get(i.itemId) || []), i]); });
        return m;
    }, [issues]);
    const general = issues.filter(i => !i.itemId);

    // Kaynaklar
    const nextWk = shiftWeek(year, week, 1);
    const prevWk = shiftWeek(year, week, -1);
    const meetings = useMemo(() => {
        const all = visibleMeetings(workspace, identity);
        return draft.kind === 'department' ? all.filter(m => !m.projectId && m.departmentCode === draft.departmentCode) : all;
    }, [workspace, identity, draft.kind, draft.departmentCode]);
    const held = useMemo(() => meetingsHeldInWeek(meetings, draft.projectId, year, week), [meetings, draft.projectId, year, week]);
    const awaiting = useMemo(() => meetings.filter(m => m.status === 'approved' && (!draft.projectId || m.projectId === draft.projectId) && new Date(m.date) < new Date() && (() => {
        const s = weekStart(year, week).getTime();
        const t = new Date(m.date).getTime();
        return t >= s && t < s + 7 * 86_400_000;
    })()), [meetings, draft.projectId, year, week]);
    const planned = useMemo(() => meetingsPlannedInWeek(meetings, draft.projectId, nextWk.year, nextWk.week), [meetings, draft.projectId, nextWk.year, nextWk.week]);
    const prevReport = findReport(workspace.weeklyReports || [], prevWk.year, prevWk.week, draft.projectId, draft.kind, draft.departmentCode);
    // Geçen haftanın planı ne oldu? (söz tutma oranı — sağlık skorunun girdisi)
    const prevPlans = draft.kind === 'project' ? prevReport?.nextWeek || [] : [];
    const reviewOf = (id: string) => draft.planReview?.find(p => p.itemId === id)?.status;
    const unreviewed = prevPlans.filter(p => !reviewOf(p.id)).length;
    // Admin'in gönderim kuralları (PY puanı / plan değerlendirmesi zorunlu)
    const blockers = editable ? flowBlockers({ ...draft, stage: report.stage }, flow, prevPlans) : [];
    const notes = useMemo(() => (project?.notes || []).filter(n => n.year === year && n.weekNumber === week), [project, year, week]);
    const worklog = useMemo(() => summarizeWorklog(draft.worklog || []), [draft.worklog]);
    const worklogHours = Math.round((draft.worklog || []).reduce((s, e) => s + e.hours, 0) * 10) / 10;
    const gateWarning = useMemo(() => reportGateWarning(workspace, ai.model), [workspace, ai.model]);

    // Kısaltmalar
    const knownAbbr = useMemo(() => new Set([...dictionary, ...draft.abbreviations].map(a => a.abbr.toLocaleUpperCase('tr-TR'))), [dictionary, draft.abbreviations]);
    const unknownAbbr = useMemo(() => {
        const used = [...draft.thisWeek, ...draft.nextWeek].flatMap(i => findAbbreviations([itemDisplay(i), i.text].join(' ')));
        return [...new Set(used)].filter(a => !knownAbbr.has(a.toLocaleUpperCase('tr-TR')));
    }, [draft.thisWeek, draft.nextWeek, knownAbbr]);
    const glossary = useMemo(() => glossaryFor([draft], dictionary).filter(g => !draft.abbreviations.some(a => a.abbr.toLocaleUpperCase('tr-TR') === g.abbr.toLocaleUpperCase('tr-TR'))), [draft, dictionary]);

    // ---- değişiklik yardımcıları
    const update = (fn: (d: WeeklyReport) => WeeklyReport) => { setDraft(fn); setDirty(true); };
    const setItem = (list: ListKey, item: ReportItem) => update(d => ({ ...d, [list]: d[list].map(i => (i.id === item.id ? item : i)) }));
    const removeItem = (list: ListKey, id: string) => update(d => ({ ...d, [list]: d[list].filter(i => i.id !== id) }));
    const moveItem = (list: ListKey, id: string, delta: number) => update(d => {
        const arr = [...d[list]];
        const i = arr.findIndex(x => x.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= arr.length) return d;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        return { ...d, [list]: arr };
    });
    const addItem = (list: ListKey, item: ReportItem) => {
        update(d => ({ ...d, [list]: [...d[list], item] }));
        setTimeout(() => document.getElementById(`ri-${item.id}`)?.querySelector<HTMLElement>('textarea, input')?.focus(), 50);
    };
    const addCategory = (c: ReportCategory) => {
        setAddMenu(false);
        addItem('thisWeek', newItem(c, '', { source: 'manual', ...(c === 'meeting' ? { meeting: { date: defaultDate, place: '', participants: '', agenda: '', decisions: '' } } : {}) }));
    };
    const addedText = (t: string) => [...draft.thisWeek, ...draft.nextWeek].some(i => i.text.trim() === t.trim());

    const addMeeting = (m: CustomerMeeting) => {
        const details = meetingToDetails(m);
        addItem('thisWeek', newItem('meeting', '', { source: 'meeting', meeting: details }));
    };
    const meetingAdded = (m: CustomerMeeting) => draft.thisWeek.some(i => i.meeting && i.meeting.date === m.date.slice(0, 10) && i.meeting.agenda === (m.agenda || m.title));
    const planText = (m: CustomerMeeting) => `${longDay(m.date)} tarihinde ${m.customer} ile ${m.title.replace(/\.$/, '')} görüşmesi yapılacak.`;
    const worklogText = (w: { issueKey?: string; summary: string }) =>
        `Bu hafta ${project ? `${locative(project.name)} ` : ''}${w.summary || w.issueKey}${w.issueKey && w.summary ? ` (${w.issueKey})` : ''} geliştirmesine devam edildi.`;

    // ---- worklog
    const setWorklog = (entries: WorklogEntry[], source: WorklogEntry['source']) =>
        update(d => ({ ...d, worklog: [...(d.worklog || []).filter(e => e.source !== source), ...entries] }));
    const importFile = async (file: File) => {
        setBusy('file');
        setNotice(null);
        try {
            const { entries, error } = parseWorklogRows(await readRows(file));
            if (error) { setNotice({ kind: 'error', text: error }); return; }
            const inWeek = worklogInWeek(entries, year, week);
            if (!inWeek.length) { setNotice({ kind: 'error', text: `Dosyadaki ${entries.length} kaydın hiçbiri ${weekLabel(year, week)} haftasına ait değil.` }); return; }
            setWorklog(inWeek, 'file');
            setNotice({ kind: 'ok', text: `${inWeek.length} worklog kaydı alındı${entries.length > inWeek.length ? ` (${entries.length - inWeek.length} kayıt başka haftalara ait olduğu için atlandı)` : ''}.` });
        } catch (e) {
            setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Dosya okunamadı.' });
        } finally {
            setBusy(null);
        }
    };
    const pullJira = async () => {
        if (!project?.jiraProjectKey || !health) return;
        setBusy('jira');
        setNotice(null);
        try {
            const s = weekStart(year, week);
            const e = new Date(s); e.setDate(s.getDate() + 6);
            const entries = await fetchJiraWorklogs({ projectKey: project.jiraProjectKey, from: isoDay(s), to: isoDay(e) }, health.authMode);
            setWorklog(entries, 'jira');
            setNotice({ kind: entries.length ? 'ok' : 'info', text: entries.length ? `Jira'dan ${entries.length} worklog kaydı alındı.` : 'Jira\'da bu hafta için worklog kaydı yok.' });
        } catch (err) {
            setNotice({ kind: 'error', text: (err as Error).message });
        } finally {
            setBusy(null);
        }
    };

    // ---- AI
    const logAi = (outcome: Exclude<ReportAiLogEntry['outcome'], 'submitted'>, sug?: { s: ReportSuggestion; promptVersion: string; model?: string }, promptVersion = reportPromptVersion(workspace.reportSettings, draft.departmentCode), model = ai.model) =>
        onLogAi?.(suggestionLogEntry({ report: draft, promptVersion: sug?.promptVersion || promptVersion, variant: 'full', model: sug ? sug.model : model, outcome, suggestion: sug?.s, dictionary }));
    const suggest = async () => {
        if (!project) return;
        setMissingQs([]);
        const input = buildReportInput({ project, year, week, worklog: draft.worklog, heldMeetings: held, plannedMeetings: planned, previous: prevReport, planReview: draft.planReview, dictionary });
        const req = buildVariantRequest({ variant: PRODUCTION_VARIANT, ws: workspace, report: draft, input });
        const { promptVersion } = req;
        const model = ai.model;
        const res = await ai.run(req.system, req.prompt, t => ({ s: parseReportSuggestion(t), raw: t }), { onError: () => logAi('error', undefined, promptVersion, model) });
        if (res) setSuggestion({ ...res, input, promptVersion, model });
    };
    const discardSuggestion = () => {
        if (suggestion) logAi('discarded', suggestion);
        setSuggestion(null);
    };
    const applySuggestion = (mode: 'append' | 'replace') => {
        if (!suggestion) return;
        const { s, raw, input, promptVersion, model } = suggestion;
        // Özgün hâl maddede saklanır: gönderimde aynen kalan / düzenlenen / silinen ölçülür
        const tag = (i: ReportItem): ReportItem => ({ ...i, aiOriginal: { text: itemDisplay(i), category: i.category } });
        const thisWeek = s.thisWeek.map(tag), nextWeek = s.nextWeek.map(tag);
        const newIds = [...thisWeek, ...nextWeek].map(i => i.id);
        update(d => ({
            ...d,
            thisWeek: mode === 'replace' ? thisWeek : [...d.thisWeek, ...thisWeek],
            nextWeek: mode === 'replace' ? nextWeek : [...d.nextWeek, ...nextWeek],
            abbreviations: mergeAbbr(d.abbreviations, s.abbreviations),
            aiDraft: {
                generatedAt: new Date().toISOString(), input, output: raw, promptVersion, variant: 'full', ...(model ? { model } : {}), mode,
                proposed: { thisWeek: s.thisWeek.length, nextWeek: s.nextWeek.length },
                // Sonuna eklemede önceki AI maddeleri de ölçülmeye devam eder; yerine koymada yalnız son öneri
                itemIds: mode === 'replace' ? newIds : [...(d.aiDraft?.itemIds || []), ...newIds],
            },
        }));
        logAi(mode === 'replace' ? 'applied_replace' : 'applied_append', suggestion);
        setMissingQs(s.missing);
        setSuggestion(null);
    };

    // ---- eylemler
    const back = () => {
        if (dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Çıkılsın mı?')) return;
        onBack();
    };
    const save = () => {
        if (onSave(draft)) { setDirty(false); setNotice({ kind: 'ok', text: 'Kaydedildi.' }); } else setNotice({ kind: 'error', text: 'Kaydedilemedi: rapor başka bir aşamaya geçmiş ya da yetkiniz yok.' });
    };
    const advance = () => {
        if (counts.errors || blockers.length) return;
        if (!onAdvance(draft)) setNotice({ kind: 'error', text: 'Gönderilemedi: rapor başka bir aşamaya geçmiş ya da yetkiniz yok.' });
    };
    const doReturn = () => {
        if (onReturn(returnNote)) setReturning(false);
        else setNotice({ kind: 'error', text: 'İade edilemedi.' });
    };
    const focusIssue = (i: LintIssue) => {
        const el = i.itemId ? document.getElementById(`ri-${i.itemId}`) : null;
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.querySelector<HTMLElement>('textarea, input, select')?.focus({ preventScroll: true }); }
    };

    const returnedTo = report.returnNote && editable;
    const lastReturn = [...report.history].reverse().find(h => h.action === 'return');

    return (
        <div className="flex flex-col gap-5">
            <header className="flex flex-col gap-2">
                <button type="button" onClick={back} className="self-start inline-flex items-center gap-0.5 min-h-[44px] -ml-2 px-2 rounded-xl text-[15px] font-semibold m-accent bg-transparent border-0 cursor-pointer">
                    <Icon name="chevronLeft" size={18} strokeWidth={2.2} />Haftalık raporlar
                </button>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="m-0 text-[28px] leading-tight font-bold tracking-[-0.02em] m-text">{title}</h1>
                        <p className="m-0 mt-1 text-[15px] m-text-3">
                            {[weekLabel(year, week, true), project?.code, pm ? `PY: ${pm.firstName} ${pm.lastName}` : draft.authorName].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {dirty && <span className="text-[13px] m-text-3">Kaydedilmedi</span>}
                        {isNew && !dirty ? null : <StagePill stage={report.stage} returned={!!report.returnNote} />}
                    </div>
                </div>
            </header>

            {returnedTo && (
                <div role="status" className="rounded-2xl px-4 py-3 m-tone-bad flex items-start gap-3">
                    <Icon name="undo" size={18} style={{ marginTop: 2 }} />
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[15px] font-semibold">İade edildi{lastReturn?.byName ? ` — ${lastReturn.byName}` : ''}</span>
                        <span className="text-[15px]">{report.returnNote}</span>
                    </div>
                </div>
            )}
            {!editable && (
                <div role="status" className="rounded-2xl px-4 py-3 m-tone-accent flex items-center gap-3 text-[15px]">
                    <Icon name="eye" size={18} />
                    Salt okunur: rapor şu an “{STAGE_LABELS[report.stage]}” aşamasında{report.stage === 'approved' ? '' : '; aşamanın sahibi düzenleyebilir'}.
                </div>
            )}
            <Notice notice={notice} onClose={() => setNotice(null)} />

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
                <div className="flex flex-col gap-5 min-w-0">
                    {prevPlans.length > 0 && (
                        <Card
                            title="Geçen haftanın planı"
                            subtitle={editable ? 'Geçen hafta planladıklarınız ne oldu? Söz tutma oranı sağlık skorunun girdilerinden biridir; iptal edilenler orana girmez.' : 'Geçen hafta planlananların bu haftaki durumu.'}
                        >
                            <div className="-mx-1 flex flex-col">
                                {prevPlans.map((plan, i) => {
                                    const status = reviewOf(plan.id);
                                    return (
                                        <div key={plan.id} className={`flex flex-col gap-2 px-1 py-2.5 ${i > 0 ? 'border-t m-sep' : ''}`} style={i > 0 ? { borderTopStyle: 'solid', borderTopWidth: 1 } : undefined}>
                                            <span className="text-[15px] leading-relaxed m-text">{itemDisplay(plan)}</span>
                                            {editable ? (
                                                <div className="m-segmented self-start" role="group" aria-label={`Plan ${i + 1} durumu`}>
                                                    {PLAN_REVIEW_STATUSES.map(st => (
                                                        <button key={st} type="button" className="m-segment !min-h-[34px] !px-3" aria-pressed={status === st}
                                                            onClick={() => update(d => ({ ...d, planReview: setPlanReview(d.planReview, plan, status === st ? null : st) }))}>
                                                            {PLAN_REVIEW_LABELS[st]}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className={`self-start text-[13px] font-semibold ${status === 'done' ? 'm-ink-ok' : status === 'partial' ? 'm-ink-warn' : status === 'slipped' ? 'm-ink-bad' : 'm-text-3'}`}>
                                                    {status ? PLAN_REVIEW_LABELS[status] : 'Değerlendirilmedi'}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    )}

                    <Card
                        title="Bu hafta gelişmeler"
                        subtitle="Takvim, bütçe ve risk açısından önemli gelişmeler — her gelişme ayrı madde, kısa cümlelerle."
                        action={editable && (
                            <div className="relative">
                                <button type="button" className="m-btn m-btn-gray whitespace-nowrap" aria-haspopup="menu" aria-expanded={addMenu} onClick={() => setAddMenu(o => !o)}>
                                    <Icon name="plus" size={18} strokeWidth={2.2} />Madde ekle
                                </button>
                                {addMenu && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setAddMenu(false)} aria-hidden="true"></div>
                                        <div role="menu" className="absolute right-0 top-full mt-1 w-[320px] max-h-[60vh] overflow-y-auto m-surface m-pop rounded-2xl py-1.5 z-50">
                                            {THIS_WEEK_CATEGORIES.map(c => (
                                                <button key={c} type="button" role="menuitem" className="m-row-link w-full flex flex-col items-start px-3.5 py-2 min-h-[44px]" onClick={() => addCategory(c)}>
                                                    <span className="text-[15px] m-text">{CATEGORY_META[c].label}</span>
                                                    <span className="text-[12.5px] m-text-3">{CATEGORY_META[c].hint}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    >
                        {editable ? (
                            draft.thisWeek.length ? (
                                <div className="flex flex-col gap-2.5">
                                    {draft.thisWeek.map((item, i) => (
                                        <ItemEditor
                                            key={item.id}
                                            item={item}
                                            index={i}
                                            count={draft.thisWeek.length}
                                            list="thisWeek"
                                            issues={byItem.get(item.id) || []}
                                            defaultDate={defaultDate}
                                            onChange={(it: ReportItem) => setItem('thisWeek', it)}
                                            onMove={(d: number) => moveItem('thisWeek', item.id, d)}
                                            onRemove={() => removeItem('thisWeek', item.id)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="m-0 text-[15px] m-text-3">
                                    Henüz madde yok. “Madde ekle” ile türünü seçerek yazın{draft.kind === 'project' ? ', ya da sağdaki kaynaklardan (AI önerisi, notlar, worklog, görüşmeler) ekleyin' : ''}.
                                </p>
                            )
                        ) : <ReadOnlyList items={draft.thisWeek} withCategory />}
                    </Card>

                    <Card
                        title="Gelecek hafta planlanan"
                        subtitle="Tarihli ve somut planlar."
                        action={editable && (
                            <button type="button" className="m-btn m-btn-gray whitespace-nowrap" onClick={() => addItem('nextWeek', newItem('plan', '', { source: 'manual' }))}>
                                <Icon name="plus" size={18} strokeWidth={2.2} />Plan ekle
                            </button>
                        )}
                    >
                        {editable ? (
                            draft.nextWeek.length ? (
                                <div className="flex flex-col gap-2.5">
                                    {draft.nextWeek.map((item, i) => (
                                        <ItemEditor
                                            key={item.id}
                                            item={item}
                                            index={i}
                                            count={draft.nextWeek.length}
                                            list="nextWeek"
                                            issues={byItem.get(item.id) || []}
                                            defaultDate={defaultDate}
                                            onChange={(it: ReportItem) => setItem('nextWeek', it)}
                                            onMove={(d: number) => moveItem('nextWeek', item.id, d)}
                                            onRemove={() => removeItem('nextWeek', item.id)}
                                        />
                                    ))}
                                </div>
                            ) : <p className="m-0 text-[15px] m-text-3">Gelecek hafta için plan yazılmamış.</p>
                        ) : <ReadOnlyList items={draft.nextWeek} />}
                    </Card>

                    {draft.kind === 'project' && (
                        <Card title="Proje sağlığı puanı" subtitle={pmCanRate ? 'Bu hafta projenin genel durumuna 1–10 arası puanınız. Sağlık skorunun girdilerinden biridir.' : 'Proje yöneticisinin bu haftaki değerlendirmesi.'}>
                            {pmCanRate ? (
                                <div className="flex flex-col gap-3">
                                    <ScoreScale label="Proje sağlığı puanı" value={draft.pmScore} onChange={v => update(d => ({ ...d, pmScore: v, pmScoreNote: v === undefined ? undefined : d.pmScoreNote }))} />
                                    {draft.pmScore !== undefined && (
                                        <Field label="Tek cümlelik gerekçe (isteğe bağlı)" htmlFor="wr-pm-note">
                                            <input id="wr-pm-note" className="m-input" maxLength={200} value={draft.pmScoreNote || ''} placeholder="Ör. Entegrasyon testleri planın bir hafta gerisinde." onChange={e => update(d => ({ ...d, pmScoreNote: e.target.value }))} />
                                        </Field>
                                    )}
                                </div>
                            ) : draft.pmScore !== undefined ? (
                                <p className="m-0 text-[15px] m-text">
                                    <span className="text-[22px] font-bold m-tabular">{draft.pmScore}</span><span className="m-text-3"> / 10</span>
                                    {draft.pmScoreNote && <span className="m-text-2"> — {draft.pmScoreNote}</span>}
                                </p>
                            ) : <p className="m-0 text-[15px] m-text-3">Proje yöneticisi bu hafta puan vermedi.</p>}
                        </Card>
                    )}

                    <Card title="Kısaltmalar" subtitle="Raporda geçen her kısaltmanın açılımı yazılır; kurum sözlüğündekiler otomatik açılır.">
                        {editable && unknownAbbr.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <span className="text-[13px] font-semibold m-ink-bad">Açılımı bilinmeyen kısaltmalar</span>
                                {unknownAbbr.map(a => (
                                    <form key={a} className="flex items-center gap-2" onSubmit={e => {
                                        e.preventDefault();
                                        const exp = (abbrInputs[a] || '').trim();
                                        if (!exp) return;
                                        update(d => ({ ...d, abbreviations: mergeAbbr(d.abbreviations, [{ abbr: a, expansion: exp }]) }));
                                        setAbbrInputs(x => ({ ...x, [a]: '' }));
                                    }}>
                                        <span className="w-24 flex-none text-[15px] font-semibold m-text">{a}</span>
                                        <input aria-label={`${a} açılımı`} className="m-input" value={abbrInputs[a] || ''} placeholder="Açılımı" onChange={e => setAbbrInputs(x => ({ ...x, [a]: e.target.value }))} />
                                        <button type="submit" className="m-btn m-btn-gray flex-none" disabled={!(abbrInputs[a] || '').trim()}>Ekle</button>
                                    </form>
                                ))}
                            </div>
                        )}
                        {draft.abbreviations.length > 0 && (
                            <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
                                {draft.abbreviations.map(a => (
                                    <li key={a.abbr} className="inline-flex items-center gap-1 pl-3 pr-1 h-8 rounded-full m-fill-2 text-[14px] m-text">
                                        <span><b>{a.abbr}</b>: {a.expansion}</span>
                                        {editable && <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${a.abbr} kısaltmasını kaldır`} onClick={() => update(d => ({ ...d, abbreviations: d.abbreviations.filter(x => x.abbr !== a.abbr) }))}><Icon name="x" size={14} /></button>}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {glossary.length > 0 && <p className="m-0 text-[13px] m-text-3">Sözlükten: {glossary.map(g => `${g.abbr} (${g.expansion})`).join(', ')}</p>}
                        {!unknownAbbr.length && !draft.abbreviations.length && !glossary.length && <p className="m-0 text-[15px] m-text-3">Raporda kısaltma yok.</p>}
                    </Card>

                    <section className="flex flex-col gap-2">
                        <button type="button" className="self-start inline-flex items-center gap-1 bg-transparent border-0 p-0 text-[15px] font-semibold m-accent cursor-pointer" aria-expanded={showHistory} onClick={() => setShowHistory(s => !s)}>
                            <Icon name="history" size={17} />Akış geçmişi ({report.history.length})
                            <Icon name={showHistory ? 'chevronDown' : 'chevronRight'} size={16} />
                        </button>
                        {showHistory && (
                            <ol className="m-0 m-surface rounded-2xl px-5 py-3 flex flex-col gap-2 list-none">
                                {report.history.map((h, i) => (
                                    <li key={i} className="text-[14px] m-text-2">
                                        <span className="font-semibold m-text">{({ create: 'Oluşturuldu', submit: 'Gönderildi', bs_approve: 'Bölüm sorumlusu onayladı', pyds_approve: 'PYB destek onayladı', return: 'İade edildi', edit: 'Düzenlendi', reopen: 'Yeniden açıldı' } as Record<string, string>)[h.action]}</span>
                                        {' · '}{h.byName || ROLE_LABELS[h.byRole]} · {relativeTime(h.at)}{h.note ? ` — “${h.note}”` : ''}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                </div>

                <aside className="flex flex-col gap-5 min-w-0">
                    <section aria-label="Format denetimi" className="m-surface rounded-2xl p-5 flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="m-0 text-[17px] font-semibold m-text">Format denetimi</h2>
                            {counts.errors === 0 && counts.warnings === 0
                                ? <Pill tone="m-tone-ok"><Icon name="check" size={13} strokeWidth={2.4} />Uygun</Pill>
                                : <span className="flex gap-1.5">{counts.errors > 0 && <Pill tone="m-tone-bad">{counts.errors} hata</Pill>}{counts.warnings > 0 && <Pill tone="m-tone-warn">{counts.warnings} uyarı</Pill>}</span>}
                        </div>
                        <p className="m-0 text-[13px] m-text-3">Kurum rapor kılavuzu: kısaltmalar açık, ifadeler net (tarih, rakam, müşteri adı), rutin iç çalışmalar yok, kısa cümleler, toplantılar özet.</p>
                        {issues.length > 0 && (
                            <ul className="m-0 p-0 list-none flex flex-col max-h-[40vh] overflow-y-auto">
                                {general.map((i, k) => (
                                    <li key={`g${k}`} className={`flex items-start gap-1.5 py-1.5 text-[14px] ${i.level === 'error' ? 'm-ink-bad' : 'm-ink-warn'}`}><Icon name={i.level === 'error' ? 'alert' : 'info'} size={15} style={{ marginTop: 2 }} />{i.message}</li>
                                ))}
                                {issues.filter(i => i.itemId).map((i, k) => {
                                    const inThis = draft.thisWeek.findIndex(x => x.id === i.itemId);
                                    const where = inThis >= 0 ? `Bu hafta ${inThis + 1}` : `Plan ${draft.nextWeek.findIndex(x => x.id === i.itemId) + 1}`;
                                    return (
                                        <li key={k}>
                                            <button type="button" className={`m-row-link flex items-start gap-1.5 py-1.5 px-1 rounded-lg text-[14px] ${i.level === 'error' ? 'm-ink-bad' : 'm-ink-warn'}`} onClick={() => focusIssue(i)} disabled={!editable}>
                                                <Icon name={i.level === 'error' ? 'alert' : 'info'} size={15} style={{ marginTop: 2 }} />
                                                <span><b>{where}:</b> {i.message}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    {editable && draft.kind === 'project' && project && (
                        <section aria-label="AI önerisi" className="m-surface rounded-2xl p-5 flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="m-0 text-[17px] font-semibold m-text flex items-center gap-2"><Icon name="sparkles" size={18} />AI önerisi</h2>
                                {draft.aiDraft && <span className="text-[12.5px] m-text-3">Son öneri {relativeTime(draft.aiDraft.generatedAt)}</span>}
                            </div>
                            {ai.available ? (
                                <>
                                    <p className="m-0 text-[13px] m-text-3">Haftalık notlar ({notes.length}), worklog ({worklog.length} konu), görüşmeler ({held.length}), bu hafta kapanan işler, proje kartı ve geçen haftanın planından kılavuza uygun taslak çıkarır. Taslağı mutlaka gözden geçirin.</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {!cleanProjectProfile(project.aiProfile) && <span className="flex-1 min-w-[180px] text-[13px] m-ink-warn">Proje kartını doldurursanız öneriler konuya yabancı okur için daha anlaşılır olur.</span>}
                                        <button type="button" className="m-btn m-btn-plain !min-h-[44px]" onClick={() => setCardOpen(true)}><Icon name="book" size={17} />Proje kartı</button>
                                    </div>
                                    <button type="button" className="m-btn m-btn-primary" disabled={ai.loading} onClick={suggest}>
                                        <Icon name="sparkles" size={18} />{ai.loading ? 'Öneri hazırlanıyor…' : 'Taslak öner'}
                                    </button>
                                    {gateWarning && <div role="status" className="rounded-xl m-tone-warn px-3 py-2 text-[13px]">{gateWarning}</div>}
                                    {ai.error && <div role="alert" className="rounded-xl m-tone-bad px-3 py-2 text-[14px]">{ai.error}</div>}
                                </>
                            ) : (
                                <p className="m-0 text-[14px] m-text-3">AI kapalı ya da sunucuda yapılandırılmamış. Maddeleri aşağıdaki kaynaklardan ekleyebilirsiniz.</p>
                            )}
                            {missingQs.length > 0 && (
                                <div className="rounded-xl m-tone-warn px-3 py-2.5 flex flex-col gap-1">
                                    <span className="text-[13px] font-semibold">AI'nın netleştirilmesini istediği bilgiler</span>
                                    <ul className="m-0 pl-4 text-[14px]">{missingQs.map((q, i) => <li key={i}>{q}</li>)}</ul>
                                </div>
                            )}
                        </section>
                    )}

                    {editable && (
                        <section aria-label="Kaynaklar" className="m-surface rounded-2xl p-5 flex flex-col gap-1">
                            <h2 className="m-0 mb-1 text-[17px] font-semibold m-text">Kaynaklar</h2>

                            {draft.kind === 'project' && (
                                <>
                                    <SubHead count={notes.length}>Bu haftanın notları</SubHead>
                                    {notes.length ? notes.map(n => (
                                        <SourceRow key={n.id} title={clip(n.content.replace(/\s+/g, ' '), 160)} sub={new Date(n.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} action="Madde" added={addedText(n.content)} onAdd={() => addItem('thisWeek', newItem('ongoing', n.content.trim(), { source: 'note' }))} />
                                    )) : <p className="m-0 py-1 text-[13px] m-text-3">Bu hafta Günlük'e not girilmemiş.</p>}

                                    <SubHead count={worklog.length}>Worklog{worklogHours ? ` · ${worklogHours} saat` : ''}</SubHead>
                                    {worklog.slice(0, 8).map(w => (
                                        <SourceRow key={w.issueKey || w.summary} title={`${w.issueKey ? `${w.issueKey} ` : ''}${w.summary}`} sub={`${w.hours} sa · ${w.authors.slice(0, 3).join(', ')}`} action="Madde" added={addedText(worklogText(w))} onAdd={() => addItem('thisWeek', newItem('ongoing', worklogText(w), { source: 'worklog' }))} />
                                    ))}
                                    <div className="flex flex-wrap items-center gap-2 py-1.5">
                                        <button type="button" className="m-btn m-btn-gray !min-h-[38px] text-[14px]" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
                                            <Icon name="upload" size={16} />{busy === 'file' ? 'Okunuyor…' : 'Excel/CSV içe aktar'}
                                        </button>
                                        {project?.jiraProjectKey ? (
                                            <button type="button" className="m-btn m-btn-gray !min-h-[38px] text-[14px]" disabled={busy !== null || !health?.jira} title={health?.jira ? undefined : 'Jira bağlantısı sunucuda yapılandırılmadı'} onClick={pullJira}>
                                                <Icon name="download" size={16} />{busy === 'jira' ? 'Çekiliyor…' : `Jira'dan çek (${project.jiraProjectKey})`}
                                            </button>
                                        ) : null}
                                        {(draft.worklog?.length || 0) > 0 && <button type="button" className="m-btn m-btn-plain !min-h-[38px] text-[14px]" onClick={() => update(d => ({ ...d, worklog: [] }))}>Temizle</button>}
                                        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
                                    </div>
                                    {project && !project.jiraProjectKey && (
                                        <form className="flex items-end gap-2 py-1" onSubmit={e => { e.preventDefault(); if (jiraKey.trim()) onSetJiraKey(project.id, jiraKey.trim().toUpperCase()); }}>
                                            <div className="flex-1"><Field label="Jira proje anahtarı" htmlFor="wr-jira"><input id="wr-jira" className="m-input" value={jiraKey} placeholder="Ör. MKS" onChange={e => setJiraKey(e.target.value)} /></Field></div>
                                            <button type="submit" className="m-btn m-btn-gray" disabled={!/^[A-Za-z][A-Za-z0-9_]{1,19}$/.test(jiraKey.trim())}>Kaydet</button>
                                        </form>
                                    )}
                                    <p className="m-0 pb-1 text-[12.5px] m-text-3">
                                        {health?.jira
                                            ? 'Jira bağlantısı etkin: worklog doğrudan Jira\'dan çekilebilir.'
                                            : 'Jira\'nın “Work log” ya da Tempo dışa aktarımını yükleyin. Kurum izniyle Jira bağlantısı sunucuda açıldığında worklog buradan doğrudan çekilecek.'}
                                    </p>
                                </>
                            )}

                            <SubHead count={held.length}>Bu hafta yapılan görüşmeler</SubHead>
                            {held.map(m => (
                                <SourceRow key={m.id} title={meetingSentence(meetingToDetails(m))} action="Madde" added={meetingAdded(m)} onAdd={() => addMeeting(m)} />
                            ))}
                            {awaiting.length > 0 && (
                                <p className="m-0 py-1 text-[13px] m-ink-warn">
                                    {awaiting.length} görüşmenin sonucu yazılmamış.{' '}
                                    <button type="button" className="bg-transparent border-0 p-0 font-semibold m-accent cursor-pointer" onClick={onOpenMeetings}>Sonucu yaz</button>
                                </p>
                            )}
                            {!held.length && !awaiting.length && <p className="m-0 py-1 text-[13px] m-text-3">Bu hafta kayıtlı görüşme yok.</p>}

                            <SubHead count={planned.length}>Gelecek hafta planlanan görüşmeler</SubHead>
                            {planned.map(m => (
                                <SourceRow key={m.id} title={planText(m)} sub={m.status === 'pending' ? 'Onay bekliyor' : 'Onaylı'} action="Plan" added={addedText(planText(m))} onAdd={() => addItem('nextWeek', newItem('plan', planText(m), { source: 'meeting' }))} />
                            ))}
                            {!planned.length && <p className="m-0 py-1 text-[13px] m-text-3">Planlanmış görüşme yok.</p>}

                            {prevReport && prevReport.nextWeek.length > 0 && (
                                <>
                                    <SubHead count={prevReport.nextWeek.length}>Geçen hafta planlananlar</SubHead>
                                    <p className="m-0 text-[12.5px] m-text-3">Ne oldu? Gerçekleşenleri bu haftanın maddesi olarak yazın.</p>
                                    {prevReport.nextWeek.map(i => (
                                        <SourceRow key={i.id} title={itemDisplay(i)} action="Madde" added={addedText(itemDisplay(i))} onAdd={() => addItem('thisWeek', newItem('ongoing', itemDisplay(i), { source: 'manual' }))} />
                                    ))}
                                </>
                            )}
                        </section>
                    )}
                </aside>
            </div>

            {(editable || canReturn) && (
                <div className="sticky bottom-3 z-30 m-surface m-pop rounded-2xl">
                    <div className="px-4 py-3 flex flex-wrap items-center gap-2">
                        <span className="text-[14px] m-text-3 flex-1 min-w-[180px]">
                            {(counts.errors > 0 || blockers.length > 0) && next
                                ? `Göndermeden önce: ${[...(counts.errors ? [`${counts.errors} format hatası düzeltilmeli`] : []), ...blockers].join(' · ')}.`
                                : next ? `Sonraki aşama: ${STAGE_LABELS[next.stage]}` : 'Onaylandı — yayınlanmayı bekliyor.'}
                            {!blockers.length && pmCanRate && draft.pmScore === undefined && ' · Proje sağlığı puanı verilmedi'}
                            {!blockers.length && editable && unreviewed > 0 && ` · Geçen haftanın planından ${unreviewed} madde değerlendirilmedi`}
                        </span>
                        {canReturn && (
                            <button type="button" className="m-btn m-btn-danger" onClick={() => { setReturnNote(''); setReturning(true); }}>
                                <Icon name="undo" size={18} />{report.stage === 'approved' ? 'Onayı geri al' : 'İade et'}
                            </button>
                        )}
                        {editable && <button type="button" className="m-btn m-btn-gray" disabled={!dirty && !isNew} onClick={save}>Kaydet</button>}
                        {editable && next && (
                            <button type="button" className="m-btn m-btn-primary" disabled={counts.errors > 0 || blockers.length > 0} onClick={advance}>
                                <Icon name={next.stage === 'approved' ? 'check' : 'send'} size={18} />{next.label}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {suggestion && (
                <Sheet
                    wide
                    title="AI taslak önerisi"
                    onClose={discardSuggestion}
                    footer={<>
                        <span className="flex-1 text-[13px] m-text-3">Uygulayınca maddeleri düzenleyebilirsiniz.</span>
                        <button type="button" className="m-btn m-btn-plain" onClick={discardSuggestion}>Vazgeç</button>
                        {(draft.thisWeek.length > 0 || draft.nextWeek.length > 0) && <button type="button" className="m-btn m-btn-gray" onClick={() => applySuggestion('replace')}>Mevcutların yerine koy</button>}
                        <button type="button" className="m-btn m-btn-primary" onClick={() => applySuggestion('append')}>{draft.thisWeek.length || draft.nextWeek.length ? 'Sonuna ekle' : 'Taslağa uygula'}</button>
                    </>}
                >
                    <div className="flex flex-col gap-1.5">
                        <h3 className="m-0 text-[15px] font-semibold m-text">Bu hafta</h3>
                        <ReadOnlyList items={suggestion.s.thisWeek} withCategory />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <h3 className="m-0 text-[15px] font-semibold m-text">Gelecek hafta</h3>
                        <ReadOnlyList items={suggestion.s.nextWeek} />
                    </div>
                    {suggestion.s.abbreviations.length > 0 && <p className="m-0 text-[14px] m-text-2">Kısaltmalar: {suggestion.s.abbreviations.map(a => `${a.abbr} (${a.expansion})`).join(', ')}</p>}
                    {suggestion.s.missing.length > 0 && (
                        <div className="rounded-xl m-tone-warn px-3 py-2.5">
                            <span className="text-[13px] font-semibold">Netleştirilmesi gereken bilgiler</span>
                            <ul className="m-0 pl-4 text-[14px]">{suggestion.s.missing.map((q, i) => <li key={i}>{q}</li>)}</ul>
                        </div>
                    )}
                </Sheet>
            )}

            {cardOpen && project && (
                <ProjectCardSheet
                    profile={project.aiProfile}
                    canEdit={!!onSaveProjectProfile && ownsProject(project, identity)}
                    onClose={() => setCardOpen(false)}
                    onSave={p => !!onSaveProjectProfile?.(project.id, p)}
                />
            )}

            {returning && (
                <Sheet
                    title={report.stage === 'approved' ? 'Onayı geri al' : 'Raporu iade et'}
                    onClose={() => setReturning(false)}
                    footer={<>
                        <span className="flex-1"></span>
                        <button type="button" className="m-btn m-btn-plain" onClick={() => setReturning(false)}>Vazgeç</button>
                        <button type="button" className="m-btn m-btn-primary" disabled={report.stage !== 'approved' && !returnNote.trim()} onClick={doReturn}>{report.stage === 'approved' ? 'Geri al' : 'İade et'}</button>
                    </>}
                >
                    <p className="m-0 text-[15px] m-text-2">
                        Rapor “{returnTo ? STAGE_LABELS[returnTo] : ''}” aşamasına döner{report.stage !== 'approved' ? ' ve sahibine iade notu gösterilir' : ''}.
                    </p>
                    <Field label={report.stage === 'approved' ? 'Not (isteğe bağlı)' : 'İade gerekçesi'} htmlFor="wr-return">
                        <textarea id="wr-return" className="m-input py-2.5" rows={3} autoFocus value={returnNote} placeholder="Ör. Fatura tutarı ve tarihi eksik; “KYS” kısaltmasını açın." onChange={e => setReturnNote(e.target.value)} />
                    </Field>
                </Sheet>
            )}
        </div>
    );
};

export default ReportEditor;
