import {
    Abbreviation, AiReportAssessment, MeetingDetails, PlanReviewItem, PlanReviewStatus, Project, ReportCategory, ReportEvent, ReportFlow, ReportItem, ReportSettings, ReportStage, UserRole, WeeklyPublication,
    WeeklyReport, WorkspaceData,
} from '../types';
import { ROLE_LABELS } from './allocations';
import { can, PermissionHolder } from './permissions';
import { Identity, managedDepartmentCode, ownsProject } from './rbac';

/**
 * Haftalık rapor — kurum rapor kılavuzuna göre yazım, onay akışı ve
 * birleştirme (saf, test edilebilir).
 *
 * Akış: PY projesinin raporunu yazar → bölüm sorumlusu (BS) düzenler/onaylar
 * ve bölüm eklemelerini yazar → PYB destek (PYDS) formatı denetler/düzenler →
 * hafta yayınlanır; müdürler bölüm gruplu birleşik raporu görür (bilgilerine).
 * Admin onay adımlarını kapatabilir ve gönderim kuralları ekleyebilir
 * (reportSettings.flow); kapalı adım atlanır.
 */

// ---------------------------------------------------------------- haftalar

const DAY = 86_400_000;

/** ISO 8601 hafta ve hafta yılı (Pazartesi başlar) */
export const isoWeekOf = (d: Date): { year: number; week: number } => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7) };
};

/** Haftanın Pazartesi'si (yerel saat) */
export const weekStart = (year: number, week: number): Date => {
    const jan4 = new Date(year, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
    return monday;
};

export const shiftWeek = (year: number, week: number, delta: number): { year: number; week: number } => {
    const d = weekStart(year, week);
    d.setDate(d.getDate() + delta * 7);
    return isoWeekOf(d);
};

const fmtDay = (d: Date, withYear = false) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: withYear ? 'long' : 'short', ...(withYear ? { year: 'numeric' } : {}) });

/** "41. hafta · 5–9 Eki" (iş günleri) */
export const weekLabel = (year: number, week: number, long = false): string => {
    const s = weekStart(year, week);
    const e = new Date(s); e.setDate(s.getDate() + 4);
    const from = s.getMonth() === e.getMonth() ? String(s.getDate()) : s.toLocaleDateString('tr-TR', { day: 'numeric', month: long ? 'long' : 'short' });
    if (long) return `${week}. hafta (${from}–${fmtDay(e, true)})`;
    return `${week}. hafta · ${from}–${fmtDay(e)}`;
};

// ---------------------------------------------------------------- kategoriler

export const CATEGORY_META: Record<ReportCategory, { label: string; hint: string; needsFigure?: boolean }> = {
    contract: { label: 'Yeni sözleşme çalışmaları', hint: 'Taraf, kapsam, tutar ve aşama' },
    sales: { label: 'Ürün / lisans satışları', hint: 'Müşteri, ürün, adet/tutar', needsFigure: true },
    invoice: { label: 'Kesilen faturalar, hakedişler', hint: 'Müşteri, tutar, tarih', needsFigure: true },
    milestone: { label: 'Tamamlanan aşamalar / kabuller', hint: 'Aşama adı, kabul tarihi, onaylayan', needsFigure: true },
    delivery: { label: 'Müşteriye yapılan teslimatlar', hint: 'Ne, kime, hangi tarihte', needsFigure: true },
    meeting: { label: 'Toplantı, sunum, tanıtım (İG / müşteri)', hint: 'Zaman, yer, katılımcılar, gündem, kararlar' },
    schedule_budget: { label: 'Takvim ve bütçeyi etkileyen gelişmeler', hint: 'Etkisi: kaç gün / ne kadar tutar' },
    event: { label: 'Fuar, konferans, etkinlik katılımı', hint: 'Etkinlik, tarih, yer, katılım şekli' },
    customer_feature: { label: 'Müşteriyi etkileyen önemli geliştirmeler', hint: 'Müşteriye faydası; ör. sahadan gelen sorun giderildi' },
    ongoing: { label: 'Devam eden faaliyetler', hint: 'Hangi konuda çalışıldığı net olmalı' },
    plan: { label: 'Gelecek hafta planı', hint: 'Tarihli ve somut plan' },
};

export const THIS_WEEK_CATEGORIES: ReportCategory[] = ['contract', 'sales', 'invoice', 'milestone', 'delivery', 'meeting', 'schedule_budget', 'event', 'customer_feature', 'ongoing'];

export const STAGE_LABELS: Record<ReportStage, string> = {
    draft: 'Taslak',
    bs_review: 'Bölüm sorumlusunda',
    pyds_review: 'PYB destekte',
    approved: 'Onaylandı',
};

const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const newItem = (category: ReportCategory, text = '', extra: Partial<ReportItem> = {}): ReportItem => ({ id: newId('ri'), category, text, ...extra });

// ---------------------------------------------------------------- geçen haftanın planı

export const PLAN_REVIEW_STATUSES: PlanReviewStatus[] = ['done', 'partial', 'slipped', 'dropped'];
export const PLAN_REVIEW_LABELS: Record<PlanReviewStatus, string> = { done: 'Yapıldı', partial: 'Kısmen', slipped: 'Ertelendi', dropped: 'İptal' };

const cleanPlanReview = (items: PlanReviewItem[] | undefined): PlanReviewItem[] | undefined => {
    const seen = new Set<string>();
    const out = (items || []).filter(p => {
        if (!p || typeof p.itemId !== 'string' || !PLAN_REVIEW_STATUSES.includes(p.status) || seen.has(p.itemId)) return false;
        seen.add(p.itemId);
        return true;
    }).map(p => ({ itemId: p.itemId, text: String(p.text || '').slice(0, 500), status: p.status }));
    return out.length ? out : undefined;
};

/** Plan değerlendirmesini günceller; status = null maddeyi değerlendirmeden çıkarır */
export const setPlanReview = (items: PlanReviewItem[] | undefined, plan: ReportItem, status: PlanReviewStatus | null): PlanReviewItem[] | undefined => {
    const rest = (items || []).filter(p => p.itemId !== plan.id);
    const next = status ? [...rest, { itemId: plan.id, text: itemDisplay(plan), status }] : rest;
    return next.length ? next : undefined;
};

// ---------------------------------------------------------------- roller ve akış

type WsLike = Pick<WorkspaceData, 'people' | 'projects' | 'allocations'> & Partial<Pick<WorkspaceData, 'weeklyReports' | 'weeklyPublications' | 'reportSettings'>>;

export interface Actor {
    role: UserRole;
    personId?: string;
    name?: string;
}

/** Rapor denetçisi (varsayılan PYB destek): format denetimi, yayın, rapor ayarları, AI metin puanı */
export const isReportSteward = (id: PermissionHolder): boolean => can(id, 'report.review');

/** Projenin bölümü = proje yöneticisinin bölümü */
export const projectDepartment = (ws: Pick<WorkspaceData, 'people'>, project: Pick<Project, 'pmPersonId'>): string =>
    ws.people.find(p => p.id === project.pmPersonId)?.departmentCode || '';

const deptHeadOf = (ws: WsLike, id: Identity, dept: string): boolean =>
    id.role === 'bolum_sorumlu' && !!dept && managedDepartmentCode(ws, id) === dept;

export const isWeekPublished = (ws: WsLike, year: number, week: number): boolean =>
    (ws.weeklyPublications || []).some(p => p.year === year && p.week === week);

/** Raporun içeriğini şu an kim düzenleyebilir (aşamaya göre tek sahip) */
export const canEditReport = (ws: WsLike, id: Identity, r: WeeklyReport): boolean => {
    if (isWeekPublished(ws, r.year, r.week)) return false;
    switch (r.stage) {
        case 'draft': {
            if (r.kind === 'department') return deptHeadOf(ws, id, r.departmentCode);
            const p = ws.projects.find(x => x.id === r.projectId);
            return !!p && ownsProject(p, id);
        }
        case 'bs_review': return deptHeadOf(ws, id, r.departmentCode);
        case 'pyds_review':
        case 'approved': return isReportSteward(id);
    }
};

// ---------------------------------------------------------------- akış ayarları

/** Varsayılan akış: PY → BS → PYB destek → onaylı; gönderim kuralı yok, yayınlarken AI puanı */
export const DEFAULT_REPORT_FLOW: ReportFlow = { bsReview: true, pydsReview: true, requirePmScore: false, requirePlanReview: false, aiOnPublish: true };

export const reportFlowOf = (ws: Partial<Pick<WorkspaceData, 'reportSettings'>> | undefined): ReportFlow => ({ ...DEFAULT_REPORT_FLOW, ...(ws?.reportSettings?.flow || {}) });

/** Akışın aşamaları (ekranlardaki adım göstergesi için) */
export const flowStages = (flow: ReportFlow, kind: WeeklyReport['kind'] = 'project'): ReportStage[] =>
    ['draft', ...(kind === 'project' && flow.bsReview ? ['bs_review' as const] : []), ...(flow.pydsReview ? ['pyds_review' as const] : []), 'approved'];

/** Bir sonraki aşamaya gönderme / onaylama (düğme metni ile); kapalı adımlar atlanır */
export const nextStage = (r: WeeklyReport, flow: ReportFlow = DEFAULT_REPORT_FLOW): { stage: ReportStage; action: ReportEvent['action']; label: string } | null => {
    switch (r.stage) {
        case 'draft':
            if (r.kind === 'project' && flow.bsReview) return { stage: 'bs_review', action: 'submit', label: 'Bölüm sorumlusuna gönder' };
            return flow.pydsReview
                ? { stage: 'pyds_review', action: 'submit', label: 'PYB desteğe gönder' }
                : { stage: 'approved', action: 'submit', label: 'Raporu gönder' };
        case 'bs_review': return flow.pydsReview
            ? { stage: 'pyds_review', action: 'bs_approve', label: 'Onayla, PYB desteğe gönder' }
            : { stage: 'approved', action: 'bs_approve', label: 'Onayla' };
        case 'pyds_review': return { stage: 'approved', action: 'pyds_approve', label: 'Formatı onayla' };
        case 'approved': return null;
    }
};

/** İade edilecek aşama (bir önceki açık adımın sahibi) */
export const returnStage = (r: WeeklyReport, flow: ReportFlow = DEFAULT_REPORT_FLOW): ReportStage | null => {
    const bs = r.kind === 'project' && flow.bsReview;
    switch (r.stage) {
        case 'bs_review': return 'draft';
        case 'pyds_review': return bs ? 'bs_review' : 'draft';
        case 'approved': return flow.pydsReview ? 'pyds_review' : bs ? 'bs_review' : 'draft';
        default: return null;
    }
};

/**
 * Taslaktan göndermeyi engelleyen akış kuralları (yalnız proje raporları):
 * PY sağlık puanı ve geçen haftanın planının değerlendirilmesi.
 */
export const flowBlockers = (r: Pick<WeeklyReport, 'kind' | 'stage' | 'pmScore' | 'planReview'>, flow: ReportFlow, previousPlans: ReportItem[] = []): string[] => {
    if (r.kind !== 'project' || r.stage !== 'draft') return [];
    const out: string[] = [];
    if (flow.requirePmScore && r.pmScore === undefined) out.push('Proje sağlığı puanı verilmeli');
    if (flow.requirePlanReview) {
        const reviewed = new Set((r.planReview || []).map(p => p.itemId));
        const left = previousPlans.filter(p => !reviewed.has(p.id)).length;
        if (left) out.push(`Geçen haftanın planından ${left} madde değerlendirilmeli`);
    }
    return out;
};

/** Raporun bir önceki haftasındaki "gelecek hafta" planı (proje raporu) */
export const previousPlansOf = (reports: WeeklyReport[] | undefined, r: Pick<WeeklyReport, 'kind' | 'year' | 'week' | 'projectId' | 'departmentCode'>): ReportItem[] => {
    if (r.kind !== 'project') return [];
    const prev = shiftWeek(r.year, r.week, -1);
    return findReport(reports || [], prev.year, prev.week, r.projectId, 'project')?.nextWeek || [];
};

const event = (actor: Actor, action: ReportEvent['action'], now: Date, note?: string): ReportEvent => ({
    at: now.toISOString(), action, byRole: actor.role, byName: actor.name, ...(note ? { note } : {}),
});

export const createReport = (
    init: { kind: WeeklyReport['kind']; projectId?: string; departmentCode: string; year: number; week: number },
    actor: Actor,
    now: Date = new Date(),
): WeeklyReport => ({
    id: newId('wr'),
    ...init,
    thisWeek: [],
    nextWeek: [],
    abbreviations: [],
    stage: 'draft',
    authorPersonId: actor.personId,
    authorName: actor.name,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    history: [event(actor, 'create', now)],
});

/** İçerik düzenlemesi; yazar dışındaki aşamalarda kimin değiştirdiği kayda geçer */
export const editReport = (r: WeeklyReport, patch: Partial<Pick<WeeklyReport, 'thisWeek' | 'nextWeek' | 'abbreviations' | 'worklog' | 'aiDraft' | 'pmScore' | 'pmScoreNote' | 'planReview'>>, actor: Actor, now: Date = new Date()): WeeklyReport => {
    const last = r.history[r.history.length - 1];
    const sameEditor = last && last.byRole === actor.role && last.byName === actor.name && (last.action === 'edit' || last.action === 'create');
    return {
        ...r,
        ...patch,
        updatedAt: now.toISOString(),
        history: r.stage !== 'draft' && !sameEditor ? [...r.history, event(actor, 'edit', now)] : r.history,
    };
};

export const advanceReport = (r: WeeklyReport, actor: Actor, now: Date = new Date(), flow: ReportFlow = DEFAULT_REPORT_FLOW): WeeklyReport => {
    const next = nextStage(r, flow);
    if (!next) return r;
    return { ...r, stage: next.stage, returnNote: undefined, updatedAt: now.toISOString(), history: [...r.history, event(actor, next.action, now)] };
};

export const returnReport = (r: WeeklyReport, actor: Actor, note: string, now: Date = new Date(), flow: ReportFlow = DEFAULT_REPORT_FLOW): WeeklyReport => {
    const to = returnStage(r, flow);
    if (!to) return r;
    return { ...r, stage: to, returnNote: note.trim() || undefined, updatedAt: now.toISOString(), history: [...r.history, event(actor, 'return', now, note.trim() || undefined)] };
};

/**
 * Görünürlük: PY kendi projelerininkini; BS bölümününkileri; PYB destek
 * hepsini; müdür / PYB sorumlusu yalnız yayınlanmış haftaların onaylı
 * raporlarını (bilgilerine sunulan birleşik rapor).
 */
export const visibleReports = (ws: WsLike, id: Identity): WeeklyReport[] => {
    const all = ws.weeklyReports || [];
    if (isReportSteward(id)) return all;
    if (can(id, 'portfolio.viewAll')) return all.filter(r => r.stage === 'approved' && isWeekPublished(ws, r.year, r.week));
    if (id.role === 'py') {
        const mine = new Set(ws.projects.filter(p => ownsProject(p, id)).map(p => p.id));
        return all.filter(r => r.kind === 'project' && !!r.projectId && mine.has(r.projectId));
    }
    if (id.role === 'bolum_sorumlu') {
        const dept = managedDepartmentCode(ws, id);
        return dept ? all.filter(r => r.departmentCode === dept) : [];
    }
    return [];
};

export const findReport = (reports: WeeklyReport[], year: number, week: number, projectId?: string, kind: WeeklyReport['kind'] = 'project', departmentCode?: string): WeeklyReport | undefined =>
    reports.find(r => r.year === year && r.week === week && r.kind === kind && (kind === 'project' ? r.projectId === projectId : r.departmentCode === departmentCode));

/** Çalışma alanındaki aktif kimlik → akış kaydındaki kişi */
export const actorOf = (ws: Pick<WorkspaceData, 'people' | 'currentRole' | 'currentPersonId'>): Actor => {
    const role = ws.currentRole || 'py';
    const p = ws.people.find(x => x.id === ws.currentPersonId);
    return { role, personId: ws.currentPersonId, name: p ? `${p.firstName} ${p.lastName}`.trim() : ROLE_LABELS[role] };
};

/** Yeni rapor açabilir mi: PY kendi projesi için, BS kendi bölümünün eklemeleri için */
export const canCreateReport = (ws: WsLike, id: Identity, init: { kind: WeeklyReport['kind']; projectId?: string; departmentCode: string; year: number; week: number }): boolean => {
    if (isWeekPublished(ws, init.year, init.week)) return false;
    if (init.kind === 'department') return deptHeadOf(ws, id, init.departmentCode);
    const p = ws.projects.find(x => x.id === init.projectId);
    return !!p && ownsProject(p, id);
};

type SaveWs = WsLike & Pick<WorkspaceData, 'people'>;

/**
 * İçerik kaydı (yeni ya da mevcut) ve isteğe bağlı olarak sonraki aşamaya
 * gönderme. Yetki işlem anında doğrulanır; aynı proje/hafta için ikinci rapor
 * açılmaz; format hatası olan ya da akış kuralını karşılamayan rapor
 * ilerletilemez. Uygun değilse null.
 */
export const saveReport = (
    ws: SaveWs, id: Identity, draft: WeeklyReport, actor: Actor,
    o: { advance?: boolean; dictionary?: Abbreviation[]; now?: Date } = {},
): { reports: WeeklyReport[]; report: WeeklyReport; from: ReportStage } | null => {
    const now = o.now || new Date();
    const reports = ws.weeklyReports || [];
    const existing = reports.find(r => r.id === draft.id);
    if (existing) {
        if (!canEditReport(ws, id, existing)) return null;
    } else {
        if (findReport(reports, draft.year, draft.week, draft.projectId, draft.kind, draft.departmentCode)) return null;
        if (!canCreateReport(ws, id, draft)) return null;
    }
    // PY puanını yalnız proje sahibi PY taslak aşamasında verir; sonraki aşamalarda korunur
    const pmRates = draft.kind === 'project' && (existing?.stage ?? 'draft') === 'draft';
    const pmScore = pmRates ? (Number.isInteger(draft.pmScore) && draft.pmScore! >= 1 && draft.pmScore! <= 10 ? draft.pmScore : undefined) : existing?.pmScore;
    const pmScoreNote = pmRates ? (pmScore !== undefined ? draft.pmScoreNote?.trim() || undefined : undefined) : existing?.pmScoreNote;
    // Geçen haftanın planı rapor içeriğidir (aşamanın sahibi düzeltebilir); AI değerlendirmesi buradan yazılmaz
    const planReview = draft.kind === 'project' ? cleanPlanReview(draft.planReview) : undefined;
    const content = { thisWeek: draft.thisWeek, nextWeek: draft.nextWeek, abbreviations: draft.abbreviations, worklog: draft.worklog, aiDraft: draft.aiDraft, pmScore, pmScoreNote, planReview };
    let r: WeeklyReport = existing ? editReport(existing, content, actor, now) : { ...createReport({ kind: draft.kind, projectId: draft.projectId, departmentCode: draft.departmentCode, year: draft.year, week: draft.week }, actor, now), ...content, id: draft.id };
    if (o.advance) {
        const flow = reportFlowOf(ws);
        if (lintCounts(lintReport(r, o.dictionary)).errors > 0 || !nextStage(r, flow)) return null;
        if (flowBlockers(r, flow, previousPlansOf(reports, r)).length) return null;
        r = advanceReport(r, actor, now, flow);
    }
    return { reports: existing ? reports.map(x => (x.id === r.id ? r : x)) : [...reports, r], report: r, from: existing?.stage || 'draft' };
};

/**
 * AI metin değerlendirmesini rapora yazar. Sistem alanıdır: aşama ya da
 * yayın kilidinden bağımsızdır, yalnız PYB destek (haftayı yayınlayan) yazar.
 */
export const setReportAiAssessment = (ws: Pick<WorkspaceData, 'weeklyReports'>, id: Identity, reportId: string, assessment: AiReportAssessment): WeeklyReport[] | null => {
    const reports = ws.weeklyReports || [];
    if (!isReportSteward(id) || !reports.some(r => r.id === reportId && r.kind === 'project')) return null;
    return reports.map(r => (r.id === reportId ? { ...r, aiAssessment: assessment } : r));
};

/** Bir önceki sahibine iade (yalnız aşamanın sahibi) */
export const returnReportIn = (ws: SaveWs, id: Identity, reportId: string, actor: Actor, note: string, now: Date = new Date()): { reports: WeeklyReport[]; report: WeeklyReport } | null => {
    const reports = ws.weeklyReports || [];
    const r = reports.find(x => x.id === reportId);
    const flow = reportFlowOf(ws);
    if (!r || r.stage === 'draft' || !canEditReport(ws, id, r) || !returnStage(r, flow)) return null;
    const next = returnReport(r, actor, note, now, flow);
    return { reports: reports.map(x => (x.id === r.id ? next : x)), report: next };
};

/** Haftayı yayınla (PYB destek): en az bir onaylı rapor olmalı */
export const publishWeek = (ws: WsLike, id: Identity, year: number, week: number, byName: string | undefined, now: Date = new Date()): WeeklyPublication[] | null => {
    if (!isReportSteward(id) || isWeekPublished(ws, year, week)) return null;
    if (!(ws.weeklyReports || []).some(r => r.year === year && r.week === week && r.stage === 'approved')) return null;
    return [...(ws.weeklyPublications || []), { year, week, publishedAt: now.toISOString(), publishedByName: byName }];
};

/** Yayından kaldır (düzeltme için; PYB destek) */
export const unpublishWeek = (ws: WsLike, id: Identity, year: number, week: number): WeeklyPublication[] | null =>
    isReportSteward(id) && isWeekPublished(ws, year, week) ? (ws.weeklyPublications || []).filter(p => !(p.year === year && p.week === week)) : null;

export const markWeekEmailed = (pubs: WeeklyPublication[], year: number, week: number, now: Date = new Date()): WeeklyPublication[] =>
    pubs.map(p => (p.year === year && p.week === week ? { ...p, emailedAt: now.toISOString() } : p));

/** Son yayınlanan hafta (müdür ekranı için) */
export const latestPublication = (ws: Partial<Pick<WorkspaceData, 'weeklyPublications'>>): WeeklyPublication | undefined =>
    [...(ws.weeklyPublications || [])].sort((a, b) => b.year - a.year || b.week - a.week)[0];

export const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export const DEFAULT_REPORT_SETTINGS: ReportSettings = { directorEmails: [], abbreviations: [], dueWeekday: 4 };

export const reportSettingsOf = (ws: Partial<Pick<WorkspaceData, 'reportSettings'>>): ReportSettings => ({ ...DEFAULT_REPORT_SETTINGS, ...(ws.reportSettings || {}) });

/** Kurum sözlüğü = varsayılanlar + ayarlardan eklenenler (ayardaki açılım önceliklidir) */
export const reportDictionary = (s: ReportSettings): Abbreviation[] => {
    const m = new Map<string, Abbreviation>();
    [...DEFAULT_ABBREVIATIONS, ...s.abbreviations].forEach(a => { if (a.abbr.trim() && a.expansion.trim()) m.set(a.abbr.trim().toLocaleUpperCase('tr-TR'), { abbr: a.abbr.trim(), expansion: a.expansion.trim() }); });
    return [...m.values()].sort((a, b) => a.abbr.localeCompare(b.abbr, 'tr'));
};

/** Haftanın rapor son günü (ör. Perşembe 8 Ekim) */
export const dueDate = (year: number, week: number, weekday: number): Date => {
    const d = weekStart(year, week);
    d.setDate(d.getDate() + ((weekday + 6) % 7));
    return d;
};

/** Hatırlatma mesajı (Teams sohbeti / e-posta) */
export const reminderText = (year: number, week: number, weekday: number, projects: string[], appUrl?: string): { subject: string; text: string } => {
    const due = dueDate(year, week, weekday).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    return {
        subject: `Haftalık proje raporu hatırlatması — ${weekLabel(year, week)}`,
        text: [
            `Merhaba, ${weekLabel(year, week, true)} haftalık raporu${projects.length ? ` (${projects.join(', ')})` : ''} henüz gönderilmedi.`,
            `Lütfen ${due} mesai bitimine kadar PlanAsistan › Haftalık rapor sayfasından yazıp onaya gönderin. AI önerisi, haftalık notlarınız ve worklog'dan taslak çıkarabilir.`,
            appUrl ? `Rapor sayfası: ${appUrl}` : '',
        ].filter(Boolean).join('\n'),
    };
};

// ---------------------------------------------------------------- kısaltmalar

export const DEFAULT_ABBREVIATIONS: Abbreviation[] = [
    { abbr: 'TÜBİTAK', expansion: 'Türkiye Bilimsel ve Teknolojik Araştırma Kurumu' },
    { abbr: 'BİLGEM', expansion: 'Bilişim ve Bilgi Güvenliği İleri Teknolojiler Araştırma Merkezi' },
    { abbr: 'İG', expansion: 'İş Geliştirme' },
    { abbr: 'PY', expansion: 'Proje Yöneticisi' },
    { abbr: 'PYB', expansion: 'Proje Yönetim Birimi' },
    { abbr: 'AR-GE', expansion: 'Araştırma ve Geliştirme' },
    { abbr: 'TL', expansion: 'Türk Lirası' },
    { abbr: 'KDV', expansion: 'Katma Değer Vergisi' },
];

// Büyük harfle yazılmış 2+ harfli sözcükler (Türkçe harfler dahil, "AR-GE" gibi tireli)
const ABBR_RE = /(?<![\p{L}\p{N}-])\p{Lu}[\p{Lu}\p{N}]+(?:-[\p{Lu}\p{N}]+)*(?![\p{L}\p{N}-])/gu;

/** Metindeki kısaltma adayları (tekrarsız, sırayla). Rakam içerenler (MKS-12, SAP-42) kayıt/proje kodudur, sayılmaz. */
export const findAbbreviations = (text: string): string[] => [...new Set((text.match(ABBR_RE) || []).filter(t => !/\d/.test(t)))];

const definedInline = (text: string, abbr: string): boolean => {
    const esc = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // "-" u kipinde kaçırılmaz
    // "İG (İş Geliştirme)" ya da "İş Geliştirme (İG)"
    return new RegExp(`${esc}\\s*\\([^)]{3,}\\)|\\(\\s*${esc}\\s*\\)`, 'u').test(text);
};

const itemText = (i: ReportItem): string => [i.text, i.meeting && [i.meeting.place, i.meeting.participants, i.meeting.agenda, i.meeting.decisions].join(' ')].filter(Boolean).join(' ');

/** Raporda kullanılan ve açılımı bilinen kısaltmalar (rapor sonundaki sözlük için) */
export const glossaryFor = (reports: WeeklyReport[], dictionary: Abbreviation[]): Abbreviation[] => {
    const known = new Map<string, string>();
    [...dictionary, ...reports.flatMap(r => r.abbreviations)].forEach(a => { if (a.abbr && a.expansion) known.set(a.abbr.toLocaleUpperCase('tr-TR'), a.expansion); });
    const used = new Set(reports.flatMap(r => [...r.thisWeek, ...r.nextWeek]).flatMap(i => findAbbreviations(itemText(i))));
    return [...used].filter(a => known.has(a.toLocaleUpperCase('tr-TR'))).sort((a, b) => a.localeCompare(b, 'tr')).map(a => ({ abbr: a, expansion: known.get(a.toLocaleUpperCase('tr-TR'))! }));
};

// ---------------------------------------------------------------- format denetimi

export interface LintIssue {
    itemId?: string;
    level: 'error' | 'warn';
    code: 'empty' | 'abbr' | 'vague' | 'generic' | 'long' | 'paragraph' | 'routine' | 'meeting' | 'figure' | 'next-empty';
    message: string;
}

/** Türkçe harflerle çalışan sözcük sınırı (\b yalnız ASCII harfleri tanır: "bazı", "birkaç", "çeşitli" kaçardı) */
const word = (alts: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, 'iu');

const VAGUE: [RegExp, string][] = [
    [word('bazı'), '“bazı”'],
    [word('birkaç'), '“birkaç”'],
    [word('çeşitli'), '“çeşitli”'],
    [word('bir takım|birtakım'), '“birtakım”'],
    [word('yakında|yakın zamanda|önümüzdeki günlerde|ileriki|en kısa sürede|kısa süre(?:de|\\s?içinde)'), 'belirsiz zaman ifadesi'],
    [word('gerekli çalışmalar|ilgili birim(?:ler)?|ilgili kişi(?:ler)?'), 'belirsiz özne/nesne'],
    [/(?<![\p{L}\p{N}])(?:vb|vs)\.?(?=\s|$)/iu, '“vb./vs.”'],
];

const ROUTINE = word('bug ?fix|hata düzeltme|hata giderme çalışmaları|birim test|unit test|kod inceleme|code review|refactor\\p{L}*|sprint planlama|daily|stand-?up|retrospektif|iç toplantı|rutin|haftalık ekip toplantısı');
const GENERIC = /(çalışmalar(a|ına)?\s+devam\s+edil|çalışılmaya devam|geliştirmelere devam edildi\.?$)/iu;

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
const words = (t: string) => t.split(/\s+/).filter(Boolean);

/** Kurum rapor kılavuzuna göre denetim: hatalar düzeltilmeden ilerletilmemeli, uyarılar gözden geçirilmeli */
export const lintReport = (r: Pick<WeeklyReport, 'thisWeek' | 'nextWeek' | 'abbreviations'>, dictionary: Abbreviation[] = DEFAULT_ABBREVIATIONS): LintIssue[] => {
    const issues: LintIssue[] = [];
    const known = new Set([...dictionary, ...r.abbreviations].filter(a => a.abbr && a.expansion).map(a => a.abbr.toLocaleUpperCase('tr-TR')));
    if (!r.thisWeek.length) issues.push({ level: 'error', code: 'empty', message: 'Bu hafta gelişmeler bölümü boş.' });
    if (!r.nextWeek.length) issues.push({ level: 'warn', code: 'next-empty', message: 'Gelecek hafta planı yazılmamış.' });

    const all = [...r.thisWeek, ...r.nextWeek];
    const reportedAbbr = new Set<string>();
    all.forEach(item => {
        const t = item.text.trim();
        const full = itemText(item);
        if (!t && !item.meeting) { issues.push({ itemId: item.id, level: 'error', code: 'empty', message: 'Boş madde.' }); return; }

        findAbbreviations(full).forEach(a => {
            const key = a.toLocaleUpperCase('tr-TR');
            if (known.has(key) || reportedAbbr.has(key) || definedInline(full, a)) return;
            reportedAbbr.add(key);
            issues.push({ itemId: item.id, level: 'error', code: 'abbr', message: `“${a}” kısaltmasının açılımı yazılmalı (kısaltmalar listesine ekleyin ya da parantez içinde açın).` });
        });
        VAGUE.forEach(([re, what]) => {
            if (re.test(t)) issues.push({ itemId: item.id, level: 'warn', code: 'vague', message: `Belirsiz ifade (${what}): tarih, rakam, kişi/kurum adıyla netleştirin.` });
        });
        if (GENERIC.test(t) || (words(t).length < 6 && /devam/iu.test(t))) {
            issues.push({ itemId: item.id, level: 'warn', code: 'generic', message: 'Hangi konuda çalışıldığını yazın: ör. “Bu hafta Safir Posta’da multi-domain özelliğinin geliştirilmesine devam edildi.”' });
        }
        if (ROUTINE.test(t)) issues.push({ itemId: item.id, level: 'warn', code: 'routine', message: 'Rutin iç çalışma gibi görünüyor; müşteriye doğrudan etkisi yoksa çıkarın.' });
        const ss = sentences(t);
        if (ss.some(s => words(s).length > 25)) issues.push({ itemId: item.id, level: 'warn', code: 'long', message: 'Uzun cümle (25+ sözcük): daha kısa cümlelere bölün.' });
        if (ss.length > 3) issues.push({ itemId: item.id, level: 'warn', code: 'paragraph', message: 'Paragraf gibi yazılmış: ayrı maddelere bölün.' });
        if (item.category === 'meeting') {
            const m = item.meeting;
            if (!m) {
                // Serbest metinle yazılmış (ör. AI önerisi): alanları ayrı girmek önerilir
                issues.push({ itemId: item.id, level: 'warn', code: 'meeting', message: 'Toplantının zaman, yer, katılımcılar, gündem ve kararlarını ayrı alanlara girin (metinde hepsi açıkça yazılı olmalı).' });
            } else {
                const missing = [
                    !m.date && 'zaman', !m.place.trim() && 'yer', !m.participants.trim() && 'katılımcılar', !m.agenda.trim() && 'gündem', !m.decisions.trim() && 'kararlar',
                ].filter((x): x is string => !!x);
                if (missing.length) issues.push({ itemId: item.id, level: 'error', code: 'meeting', message: `Toplantı için eksik: ${missing.join(', ')}.` });
            }
        }
        if (CATEGORY_META[item.category].needsFigure && !/\d/.test(full)) {
            issues.push({ itemId: item.id, level: 'warn', code: 'figure', message: 'Tarih, tutar ya da sayı belirtin (belirsiz ifade olmasın).' });
        }
    });
    return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
};

export const lintCounts = (issues: LintIssue[]) => ({
    errors: issues.filter(i => i.level === 'error').length,
    warnings: issues.filter(i => i.level === 'warn').length,
});

// ---------------------------------------------------------------- toplantı cümlesi

const BACK = 'aıouAIOU';
const VOWELS = 'aeıioöuüAEIİOÖUÜ';
const HARD = 'çfhkpsştÇFHKPSŞT';

/** Türkçe bulunma eki: BİLGEM'de, Ankara'da, Paris'te, Gebze Belediyesi'nde; zaten ekliyse dokunmaz */
export const locative = (word: string): string => {
    const w = word.trim();
    if (!w) return w;
    const lower = w.toLocaleLowerCase('tr-TR');
    if (/(nde|nda|['’]n?[dt][ae])$/u.test(lower)) return w; // zaten bulunma ekli: "müşteri yerinde"
    if (/(s[ıiuü])$/u.test(lower)) {
        const v = BACK.toLocaleLowerCase('tr-TR').includes(lower[lower.length - 1]) ? 'a' : 'e';
        return `${w}'nd${v}`;
    }
    const lastVowel = [...lower].reverse().find(c => VOWELS.toLocaleLowerCase('tr-TR').includes(c)) || 'e';
    const vowel = BACK.toLocaleLowerCase('tr-TR').includes(lastVowel) ? 'a' : 'e';
    const cons = HARD.includes(w[w.length - 1]) ? 't' : 'd';
    return `${w}'${cons}${vowel}`;
};

const longDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Kısa toplantı özeti (kılavuzdaki örneğe yakın): "10 Eylül 2026 tarihinde
 * BİLGEM'de Safir Posta tanıtım demosu yapıldı (katılımcılar: …). Pilot
 * kurulum kararlaştırıldı."
 */
export const meetingSentence = (m: MeetingDetails): string => {
    const agenda = m.agenda.trim().replace(/\.$/, '');
    const head = [m.date ? `${longDate(m.date)} tarihinde` : '', m.place.trim() ? locative(m.place) : '', agenda].filter(Boolean).join(' ');
    const verb = /(yapıldı|gerçekleştirildi|düzenlendi|sunuldu|katılındı)$/iu.test(agenda) ? '' : ' yapıldı';
    const who = m.participants.trim() ? ` (katılımcılar: ${m.participants.trim()})` : '';
    const decision = m.decisions.trim() ? ` ${m.decisions.trim().replace(/\.?$/, '.')}` : '';
    return `${head}${verb}${who}.${decision}`;
};

export const itemDisplay = (i: ReportItem): string => (i.category === 'meeting' && i.meeting ? `${meetingSentence(i.meeting)}${i.text.trim() ? ` ${i.text.trim()}` : ''}` : i.text.trim());

// ---------------------------------------------------------------- birleştirme

export interface ProjectSection {
    projectId: string;
    name: string;
    code?: string;
    pmName?: string;
    report: WeeklyReport;
}

export interface DepartmentSection {
    code: string;
    name: string;
    projects: ProjectSection[];
    additions?: WeeklyReport;
}

/** Hafta raporu: bölüm → proje gruplu; varsayılan yalnız onaylı raporlar */
export const consolidate = (
    ws: Pick<WorkspaceData, 'projects' | 'people' | 'departments'> & { weeklyReports?: WeeklyReport[] },
    year: number,
    week: number,
    stages: ReportStage[] = ['approved'],
): DepartmentSection[] => {
    const reports = (ws.weeklyReports || []).filter(r => r.year === year && r.week === week && stages.includes(r.stage));
    const deptName = new Map((ws.departments || []).map(d => [d.code, d.name]));
    const people = new Map(ws.people.map(p => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
    const sections = new Map<string, DepartmentSection>();
    const sec = (code: string) => {
        if (!sections.has(code)) sections.set(code, { code, name: deptName.get(code) || code || 'Bölüm belirtilmemiş', projects: [] });
        return sections.get(code)!;
    };
    reports.forEach(r => {
        if (r.kind === 'department') { sec(r.departmentCode).additions = r; return; }
        const p = ws.projects.find(x => x.id === r.projectId);
        sec(r.departmentCode).projects.push({ projectId: r.projectId || '', name: p?.name || 'Silinmiş proje', code: p?.code, pmName: p?.pmPersonId ? people.get(p.pmPersonId) : undefined, report: r });
    });
    return [...sections.values()]
        .map(s => ({ ...s, projects: s.projects.sort((a, b) => a.name.localeCompare(b.name, 'tr')) }))
        .sort((a, b) => a.code.localeCompare(b.code, 'tr'));
};

export interface DepartmentProgress {
    code: string;
    name: string;
    expected: number; // aktif proje
    byStage: Record<ReportStage, number>;
    missing: { projectId: string; name: string; pmName?: string }[];
}

/** Hafta için bölüm bazında doluluk: hangi projelerin raporu yok / hangi aşamada */
export const weekProgress = (ws: Pick<WorkspaceData, 'projects' | 'people' | 'departments'> & { weeklyReports?: WeeklyReport[] }, year: number, week: number): DepartmentProgress[] => {
    const deptName = new Map((ws.departments || []).map(d => [d.code, d.name]));
    const people = new Map(ws.people.map(p => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
    const out = new Map<string, DepartmentProgress>();
    const get = (code: string) => {
        if (!out.has(code)) out.set(code, { code, name: deptName.get(code) || code || 'Bölüm belirtilmemiş', expected: 0, byStage: { draft: 0, bs_review: 0, pyds_review: 0, approved: 0 }, missing: [] });
        return out.get(code)!;
    };
    const reports = (ws.weeklyReports || []).filter(r => r.year === year && r.week === week && r.kind === 'project');
    ws.projects.filter(p => p.status === 'devam').forEach(p => {
        const dept = projectDepartment(ws, p);
        const d = get(dept);
        d.expected++;
        const r = reports.find(x => x.projectId === p.id);
        if (r) d.byStage[r.stage]++;
        else d.missing.push({ projectId: p.id, name: p.name, pmName: p.pmPersonId ? people.get(p.pmPersonId) : undefined });
    });
    return [...out.values()].sort((a, b) => a.code.localeCompare(b.code, 'tr'));
};

/** Raporu henüz göndermemiş PY'ler (taslakta ya da hiç yok) — hatırlatma için */
export const pendingAuthors = (ws: Pick<WorkspaceData, 'projects' | 'people'> & { weeklyReports?: WeeklyReport[] }, year: number, week: number): { personId: string; name: string; email?: string; projects: string[] }[] => {
    const reports = (ws.weeklyReports || []).filter(r => r.year === year && r.week === week && r.kind === 'project');
    const byPm = new Map<string, string[]>();
    ws.projects.filter(p => p.status === 'devam' && p.pmPersonId).forEach(p => {
        const r = reports.find(x => x.projectId === p.id);
        if (r && r.stage !== 'draft') return;
        byPm.set(p.pmPersonId!, [...(byPm.get(p.pmPersonId!) || []), p.name]);
    });
    return [...byPm.entries()].map(([personId, projects]) => {
        const person = ws.people.find(p => p.id === personId);
        return { personId, name: person ? `${person.firstName} ${person.lastName}`.trim() : personId, email: person?.email, projects };
    }).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
};

// ---------------------------------------------------------------- çıktılar

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const reportLines = (r: WeeklyReport, indent: string): string[] => {
    const L: string[] = [];
    if (r.thisWeek.length) {
        L.push(`${indent}Bu hafta:`);
        r.thisWeek.forEach(i => L.push(`${indent}  • ${itemDisplay(i)}`));
    }
    if (r.nextWeek.length) {
        L.push(`${indent}Gelecek hafta:`);
        r.nextWeek.forEach(i => L.push(`${indent}  • ${itemDisplay(i)}`));
    }
    return L;
};

export const reportTitle = (year: number, week: number) => `Haftalık Proje Raporu — ${weekLabel(year, week, true)}`;

/** Düz metin (Teams / kopyala) */
export const renderReportText = (sections: DepartmentSection[], glossary: Abbreviation[], year: number, week: number): string => {
    const L: string[] = [reportTitle(year, week), ''];
    sections.forEach(s => {
        L.push(`■ ${s.name}${s.name !== s.code && s.code ? ` (${s.code})` : ''}`);
        s.projects.forEach(p => {
            L.push(`  ▸ ${p.name}${p.code ? ` (${p.code})` : ''}${p.pmName ? ` — PY: ${p.pmName}` : ''}`);
            L.push(...reportLines(p.report, '    '));
        });
        if (s.additions && (s.additions.thisWeek.length || s.additions.nextWeek.length)) {
            L.push('  ▸ Bölüm genel');
            L.push(...reportLines(s.additions, '    '));
        }
        L.push('');
    });
    if (glossary.length) L.push(`Kısaltmalar: ${glossary.map(g => `${g.abbr}: ${g.expansion}`).join('; ')}`);
    return L.join('\n').trim();
};

/** E-posta gövdesi için satır içi stilli HTML */
export const renderReportHtml = (sections: DepartmentSection[], glossary: Abbreviation[], year: number, week: number): string => {
    const list = (title: string, items: ReportItem[]) => items.length
        ? `<p style="margin:8px 0 2px;font-weight:600;color:#48484a">${title}</p><ul style="margin:0 0 6px;padding-left:20px">${items.map(i => `<li style="margin:2px 0">${esc(itemDisplay(i))}</li>`).join('')}</ul>`
        : '';
    const block = (r: WeeklyReport) => list('Bu hafta', r.thisWeek) + list('Gelecek hafta', r.nextWeek);
    const body = sections.map(s => `
<h2 style="font-size:17px;margin:20px 0 6px;color:#1c1c1e;border-bottom:1px solid #e5e5ea;padding-bottom:4px">${esc(s.name)}${s.code && s.name !== s.code ? ` <span style="color:#6c6c70;font-weight:400">(${esc(s.code)})</span>` : ''}</h2>
${s.projects.map(p => `<h3 style="font-size:15px;margin:12px 0 2px;color:#1c1c1e">${esc(p.name)}${p.code ? ` <span style="color:#6c6c70;font-weight:400">${esc(p.code)}</span>` : ''}${p.pmName ? ` <span style="color:#6c6c70;font-weight:400">· PY: ${esc(p.pmName)}</span>` : ''}</h3>${block(p.report)}`).join('')}
${s.additions && (s.additions.thisWeek.length || s.additions.nextWeek.length) ? `<h3 style="font-size:15px;margin:12px 0 2px;color:#1c1c1e">Bölüm genel</h3>${block(s.additions)}` : ''}`).join('');
    const gl = glossary.length
        ? `<h2 style="font-size:15px;margin:24px 0 6px;color:#1c1c1e">Kısaltmalar</h2><ul style="margin:0;padding-left:20px">${glossary.map(g => `<li><b>${esc(g.abbr)}</b>: ${esc(g.expansion)}</li>`).join('')}</ul>`
        : '';
    return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(reportTitle(year, week))}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.45;color:#1c1c1e;max-width:860px">
<h1 style="font-size:20px;margin:0 0 4px">${esc(reportTitle(year, week))}</h1>${body}${gl}</body></html>`;
};

const b64 = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
};
const wrap76 = (s: string) => s.replace(/.{1,76}/g, m => `${m}\r\n`).trim();
const encodeHeader = (s: string) => `=?UTF-8?B?${b64(s)}?=`;

/**
 * Outlook'ta taslak olarak açılan e-posta (.eml, X-Unsent). Sunucu tarafı
 * e-posta yapılandırılmamışken "otomatik e-posta"nın yerine geçer.
 */
export const buildEml = (o: { to: string[]; cc?: string[]; subject: string; html: string; text: string }): string => {
    const boundary = `pa-${Math.random().toString(36).slice(2)}`;
    return [
        `To: ${o.to.join(', ')}`,
        ...(o.cc?.length ? [`Cc: ${o.cc.join(', ')}`] : []),
        `Subject: ${encodeHeader(o.subject)}`,
        'X-Unsent: 1',
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(b64(o.text)),
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(b64(o.html)),
        `--${boundary}--`,
        '',
    ].join('\r\n');
};

/** mailto: bağlantısı (gövde uzunsa kırpılır; uzun içerik için .eml kullanın) */
export const mailtoLink = (o: { to?: string[]; bcc?: string[]; subject: string; body: string }): string => {
    const q = [`subject=${encodeURIComponent(o.subject)}`, `body=${encodeURIComponent(o.body.length > 1800 ? `${o.body.slice(0, 1800)}…` : o.body)}`];
    if (o.bcc?.length) q.push(`bcc=${encodeURIComponent(o.bcc.join(','))}`);
    return `mailto:${(o.to || []).map(encodeURIComponent).join(',')}?${q.join('&')}`;
};

/** Teams sohbetini kişilerle ve hazır mesajla açar (kullanıcı gönderir) */
export const teamsChatLink = (emails: string[], message: string, topic?: string): string => {
    const q = [`users=${emails.map(encodeURIComponent).join(',')}`, `message=${encodeURIComponent(message)}`];
    if (topic && emails.length > 1) q.push(`topicName=${encodeURIComponent(topic)}`);
    return `https://teams.microsoft.com/l/chat/0/0?${q.join('&')}`;
};
