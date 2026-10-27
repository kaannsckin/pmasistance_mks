import type { Abbreviation, MeetingDetails, PlanReviewItem, PlanReviewStatus, Project, ReportCategory, ReportItem, WeeklyReport, WorklogEntry, WorkspaceData } from '../../types.js';
import { appendAudit } from '../../utils/audit.js';
import { meetingsHeldInWeek, meetingsPlannedInWeek } from '../../utils/customerMeetings.js';
import { matchItems } from '../../utils/ai/reportEval.js';
import { checkSuggestion } from '../../utils/ai/reportRepair.js';
import { buildVariantRequest, PRODUCTION_VARIANT } from '../../utils/ai/reportVariants.js';
import { buildReportInput, parseReportSuggestion } from '../../utils/ai/weeklyReportPrompt.js';
import { resolveProject, ToolContext } from '../../utils/ai/scope.js';
import {
    actorOf, advanceReport, canEditReport, CATEGORY_META, createReport, dueDate, findReport, flowBlockers, isoWeekOf, isReportSteward, isWeekPublished, itemDisplay, lintCounts, lintReport,
    newItem, nextStage, PLAN_REVIEW_STATUSES, previousPlansOf, projectDepartment, publishWeek, reportDictionary, reportFlowOf, reportSettingsOf, returnReportIn,
    saveReport, shiftWeek, STAGE_LABELS, THIS_WEEK_CATEGORIES, visibleReports, weekLabel,
} from '../../utils/weeklyReport.js';
import type { McpTool } from './protocol.js';

/**
 * Haftalık rapor araçları (MCP): uygulamadaki rapor akışının aynısı.
 *
 *  - haftalik_rapor: haftanın raporu / raporları, aşama, geçen haftanın planı
 *  - haftalik_rapor_taslagi: "Taslak öner"in AI'ya gönderdiği paket (kurum
 *    kılavuzu + girdi). MCP istemcisi modelin yerini alır; yanıtını aynı JSON
 *    sözleşmesiyle verir.
 *  - oner_haftalik_rapor: PY raporu kaydeder ya da gönderir (biçim denetimi ve
 *    akış kuralları uygulamadaki gibi; dayanak denetimi uyarı olarak döner)
 *  - oner_rapor_karari: bölüm sorumlusu / PYB destek onaylar ya da iade eder
 *  - oner_hafta_yayinla: PYB destek haftayı yayınlar (müdür yayınlananı okur)
 *
 * Değişiklikler öneri + onay ile uygulanır (oneriyi_uygula); yetki ve aşama
 * uygulama anında güncel veriyle yeniden denetlenir (utils/weeklyReport).
 */

export const REPORT_READ_TOOL = 'haftalik_rapor';
export const REPORT_DRAFT_TOOL = 'haftalik_rapor_taslagi';
export const REPORT_SUBMIT_TOOL = 'oner_haftalik_rapor';
export const REPORT_DECIDE_TOOL = 'oner_rapor_karari';
export const REPORT_PUBLISH_TOOL = 'oner_hafta_yayinla';
export const REPORT_WRITE_TOOLS = new Set([REPORT_SUBMIT_TOOL, REPORT_DECIDE_TOOL, REPORT_PUBLISH_TOOL]);

const WEEK_PARAM = { type: 'string', description: 'Hafta: "2026-H42" ya da hafta numarası (42). Verilmezse bu hafta.' } as const;
const PROJECT_PARAM = { type: 'string', description: 'Proje adı ya da kodu. Verilmezse varsayılan proje.' } as const;

const READ_SPEC: McpTool = {
    name: REPORT_READ_TOOL,
    title: 'Haftalık rapor',
    description: 'Haftalık proje raporunu getirir: aşama (taslak → bölüm sorumlusu → PYB destek → onaylı), maddeler (kimlikleriyle), PY puanı, iade notu, geçen haftanın plan maddeleri (değerlendirme için kimlikleriyle), son gün ve bu kimliğin yapabileceği işlem. Proje verilmezse haftanın görülebilen raporlarını ve yayın durumunu listeler. Müdür yalnız yayınlanmış haftaların onaylı raporlarını görür.',
    inputSchema: { type: 'object', properties: { proje: PROJECT_PARAM, hafta: WEEK_PARAM } },
    annotations: { readOnlyHint: true, openWorldHint: false },
};

const DRAFT_SPEC: McpTool = {
    name: REPORT_DRAFT_TOOL,
    title: 'Haftalık rapor taslağı (AI paketi)',
    description: 'Uygulamadaki "Taslak öner"in AI modeline gönderdiği paketi döndürür: sistem istemi (kurum ve bölüm kılavuzu, öğrenilmiş kurallar) ve kullanıcı istemi (haftanın notları, Jira worklog\'u, bu hafta kapanan işler, görüşmeler, geçen haftanın planı, proje kartı). Paketi modelin yerine işle: yanıtı istemdeki JSON sözleşmesiyle üret; sonra PY olarak kaynaklarla karşılaştırıp düzelt ve oner_haftalik_rapor ile gönder (ilk JSON\'u ai_taslagi alanında ver).',
    inputSchema: { type: 'object', properties: { proje: PROJECT_PARAM, hafta: WEEK_PARAM } },
    annotations: { readOnlyHint: true, openWorldHint: true },
};

const SUBMIT_SPEC: McpTool = {
    name: REPORT_SUBMIT_TOOL,
    title: 'Haftalık rapor önerisi (kaydet / gönder)',
    description: `Projenin haftalık raporunu kaydetmeyi ya da bölüm sorumlusuna göndermeyi ÖNERİR (proje sahibi PY, taslak aşamasında). Maddeler kurum kılavuzuna göre denetlenir: biçim hatası varsa gönderilmez; girdide olmayan rakam, tarih ve adlar uyarı olarak döner. Madde türleri: ${THIS_WEEK_CATEGORIES.map(c => `${c} (${CATEGORY_META[c].label})`).join(', ')}. Öneri, oneriyi_uygula çağrılana kadar uygulanmaz.`,
    inputSchema: {
        type: 'object',
        properties: {
            proje: PROJECT_PARAM,
            hafta: WEEK_PARAM,
            bu_hafta: { type: 'array', description: 'Bu hafta gelişmeler: [{"kategori":"delivery","metin":"…"}]; toplantı maddesinde "toplanti": {"tarih","yer","katilimcilar","gundem","kararlar"}.' },
            gelecek_hafta: { type: 'array', description: 'Gelecek hafta planı: ["…", "…"] (ölçülebilir, tarihli).' },
            kisaltmalar: { type: 'array', description: 'Kullanılan kısaltmalar: [{"kisaltma":"İG","acilim":"İş Geliştirme"}].' },
            plan_degerlendirmesi: { type: 'array', description: 'Geçen haftanın plan maddeleri: [{"madde_id":"…","durum":"done|partial|slipped|dropped"}] (madde_id haftalik_rapor çıktısında).' },
            py_puani: { type: 'integer', description: 'Projenin bu haftaki genel sağlığına PY puanı (1–10).' },
            py_puani_notu: { type: 'string', description: 'Puanın tek cümlelik gerekçesi.' },
            ai_taslagi: { type: 'string', description: 'haftalik_rapor_taslagi paketine verdiğin İLK yanıt (JSON). Gönderilen hâlle karşılaştırılır: PY düzeltmeleri ölçülür.' },
            gonder: { type: 'boolean', description: 'true: bölüm sorumlusunun onayına gönder; false (varsayılan): taslak olarak kaydet.' },
        },
        required: ['bu_hafta'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
};

const DECIDE_SPEC: McpTool = {
    name: REPORT_DECIDE_TOOL,
    title: 'Rapor kararı önerisi (onay / iade)',
    description: 'Bölüm sorumlusunun (kendi bölümünün raporları, "bölüm sorumlusu onayı" aşaması) ya da PYB desteğin (biçim denetimi aşaması) kararını ÖNERİR: onay raporu bir sonraki aşamaya geçirir; iade, nottaki eksikleri yazarak raporu bir önceki sahibine döndürür. Öneri, oneriyi_uygula çağrılana kadar uygulanmaz.',
    inputSchema: {
        type: 'object',
        properties: {
            proje: PROJECT_PARAM,
            hafta: WEEK_PARAM,
            karar: { type: 'string', enum: ['onay', 'iade'], description: 'onay ya da iade.' },
            not: { type: 'string', description: 'İade gerekçesi (iade için zorunlu): eksikleri madde madde yazın.' },
        },
        required: ['karar'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
};

const PUBLISH_SPEC: McpTool = {
    name: REPORT_PUBLISH_TOOL,
    title: 'Haftayı yayınla önerisi',
    description: 'PYB destek: haftanın onaylı raporlarını müdürlüğe yayınlamayı ÖNERİR (en az bir onaylı rapor gerekir; müdür yalnız yayınlanmış haftayı görür). Öneri, oneriyi_uygula çağrılana kadar uygulanmaz.',
    inputSchema: { type: 'object', properties: { hafta: WEEK_PARAM } },
    annotations: { readOnlyHint: true, openWorldHint: false },
};

export const REPORT_SCHEMAS: [string, McpTool['inputSchema']][] = [READ_SPEC, DRAFT_SPEC, SUBMIT_SPEC, DECIDE_SPEC, PUBLISH_SPEC].map(t => [t.name, t.inputSchema]);

/** Kimliğe göre rapor araçları: okuma herkese (görünürlük filtreli); yazma rolüne göre ve değişiklik açıksa */
export const reportToolsFor = (ctx: ToolContext, canWrite: boolean): McpTool[] => {
    const role = ctx.identity.role;
    const steward = isReportSteward(ctx.identity);
    const out: McpTool[] = [READ_SPEC];
    if (role === 'py') out.push(DRAFT_SPEC);
    if (!canWrite) return out;
    if (role === 'py') out.push(SUBMIT_SPEC);
    if (role === 'bolum_sorumlu' || steward) out.push(DECIDE_SPEC);
    if (steward) out.push(PUBLISH_SPEC);
    return out;
};

// ---------------------------------------------------------------- yardımcılar

export const parseWeek = (arg: unknown, now: Date): { year: number; week: number } => {
    const cur = isoWeekOf(now);
    if (arg === undefined || arg === null || arg === '') return cur;
    const s = String(arg).trim().toUpperCase();
    const full = s.match(/^(\d{4})-?[HW](\d{1,2})$/);
    if (full) return { year: Number(full[1]), week: Number(full[2]) };
    if (/^\d{1,2}$/.test(s)) return { year: cur.year, week: Number(s) };
    throw new Error(`Hafta "${String(arg)}" anlaşılamadı; "2026-H42" ya da 42 biçiminde verin.`);
};

const weekKey = (w: { year: number; week: number }) => `${w.year}-H${String(w.week).padStart(2, '0')}`;
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const itemOut = (i: ReportItem) => ({ id: i.id, kategori: i.category, metin: itemDisplay(i), ...(i.source === 'ai' ? { kaynak: 'ai' } : {}) });

/** Kimliğin bu raporda yapabileceği işlem (aşamanın tek sahibi) */
const actionsFor = (ws: WorkspaceData, ctx: ToolContext, r: WeeklyReport | undefined, projectOwner: boolean): string => {
    if (!r) return projectOwner ? `rapor yok — ${REPORT_SUBMIT_TOOL} ile yazılır` : 'rapor henüz yazılmadı';
    if (isWeekPublished(ws, r.year, r.week)) return 'hafta yayınlandı; değişmez';
    switch (r.stage) {
        case 'draft': return projectOwner ? `taslak — düzenle ve gönder (${REPORT_SUBMIT_TOOL})` : 'PY\'de (taslak)';
        case 'bs_review': return ctx.identity.role === 'bolum_sorumlu' ? `onay ya da iade (${REPORT_DECIDE_TOOL})` : 'bölüm sorumlusunda';
        case 'pyds_review': return isReportSteward(ctx.identity) ? `biçim onayı ya da iade (${REPORT_DECIDE_TOOL})` : 'PYB destekte (biçim denetimi)';
        case 'approved': return isReportSteward(ctx.identity) ? `onaylı — haftayı yayınla (${REPORT_PUBLISH_TOOL})` : 'onaylı, yayın bekliyor';
    }
};

/**
 * Biçim denetiminin sözlüğü: kurum sözlüğü + proje adları. Büyük harfli proje
 * adı (NEHİR, ATLAS) kısaltma değildir; sözlükte yoksa denetim açılım ister.
 */
const lintDictionary = (ws: WorkspaceData): Abbreviation[] => [
    ...reportDictionary(reportSettingsOf(ws)),
    ...ws.projects.flatMap(p => {
        const first = p.name.split(/\s+/)[0] || '';
        return first.length >= 2 && first === first.toLocaleUpperCase('tr-TR') ? [{ abbr: first, expansion: p.name }] : [];
    }),
];

const ownsProject = (ctx: ToolContext, project: Project) => ctx.identity.role === 'py' && project.pmPersonId === ctx.identity.personId;

// ---------------------------------------------------------------- okuma

export const readReports = (ws: WorkspaceData, ctx: ToolContext, args: Record<string, unknown>, now: Date): unknown => {
    const w = parseWeek(args.hafta, now);
    const settings = reportSettingsOf(ws);
    const due = isoDate(dueDate(w.year, w.week, settings.dueWeekday ?? 4));
    const visible = visibleReports(ws, ctx.identity);
    if (args.proje === undefined) {
        const rows = visible.filter(r => r.kind === 'project' && r.year === w.year && r.week === w.week).map(r => {
            const p = ws.projects.find(x => x.id === r.projectId);
            return { proje: p?.name || r.projectId, asama: STAGE_LABELS[r.stage], py_puani: r.pmScore, iade_notu: r.returnNote, islem: actionsFor(ws, ctx, r, !!p && ownsProject(ctx, p)) };
        });
        const mine = ctx.scoped.projects.filter(p => ownsProject(ctx, p) && p.status === 'devam');
        return {
            hafta: weekKey(w), etiket: weekLabel(w.year, w.week, true), son_gun: due, yayinlandi: isWeekPublished(ws, w.year, w.week),
            raporlar: rows,
            ...(mine.length ? { yazilmamis: mine.filter(p => !findReport(ws.weeklyReports || [], w.year, w.week, p.id)).map(p => p.name) } : {}),
        };
    }
    const project = resolveProject(ctx, args.proje);
    const all = ws.weeklyReports || [];
    const r = findReport(all, w.year, w.week, project.id);
    const shown = r && visible.some(x => x.id === r.id) ? r : undefined;
    if (r && !shown) return { proje: project.name, hafta: weekKey(w), durum: 'Bu rapor bu rol için görünür değil (müdür yalnız yayınlanmış haftanın onaylı raporlarını görür).' };
    const prevPlans = previousPlansOf(all, { kind: 'project', year: w.year, week: w.week, projectId: project.id, departmentCode: projectDepartment(ws, project) });
    return {
        proje: project.name, hafta: weekKey(w), etiket: weekLabel(w.year, w.week, true), son_gun: due,
        islem: actionsFor(ws, ctx, shown, ownsProject(ctx, project)),
        ...(shown ? {
            asama: STAGE_LABELS[shown.stage],
            ...(shown.returnNote ? { iade_notu: shown.returnNote } : {}),
            bu_hafta: shown.thisWeek.map(itemOut),
            gelecek_hafta: shown.nextWeek.map(itemOut),
            kisaltmalar: shown.abbreviations.map(a => ({ kisaltma: a.abbr, acilim: a.expansion })),
            py_puani: shown.pmScore, py_puani_notu: shown.pmScoreNote,
            plan_degerlendirmesi: (shown.planReview || []).map(p => ({ madde_id: p.itemId, madde: p.text, durum: p.status })),
            bicim_denetimi: lintReport(shown, lintDictionary(ws)).map(l => `${l.level === 'error' ? 'HATA' : 'uyarı'}: ${l.message}`),
            gecmis: shown.history.map(h => `${h.at.slice(0, 16).replace('T', ' ')} ${h.action} — ${h.byName || h.byRole}${h.note ? `: ${h.note}` : ''}`),
        } : {}),
        gecen_haftanin_plani: prevPlans.map(p => ({ madde_id: p.id, madde: itemDisplay(p) })),
    };
};

// ---------------------------------------------------------------- taslak paketi

/** Raporun AI girdisi (uygulamadaki ReportEditor ile aynı kaynaklar) */
const reportInput = (ws: WorkspaceData, project: Project, w: { year: number; week: number }, worklog: WorklogEntry[], planReview?: PlanReviewItem[]): string => {
    const meetings = ws.customerMeetings || [];
    const next = shiftWeek(w.year, w.week, 1);
    const prevW = shiftWeek(w.year, w.week, -1);
    const previous = findReport(ws.weeklyReports || [], prevW.year, prevW.week, project.id);
    return buildReportInput({
        project, year: w.year, week: w.week, worklog,
        heldMeetings: meetingsHeldInWeek(meetings, project.id, w.year, w.week),
        plannedMeetings: meetingsPlannedInWeek(meetings, project.id, next.year, next.week),
        previous, planReview, dictionary: reportDictionary(reportSettingsOf(ws)),
    });
};

export const draftPackage = (ws: WorkspaceData, ctx: ToolContext, args: Record<string, unknown>, now: Date, worklog: WorklogEntry[]): unknown => {
    const w = parseWeek(args.hafta, now);
    const project = resolveProject(ctx, args.proje);
    if (!ownsProject(ctx, project)) throw new Error(`"${project.name}" projesinin raporunu yalnız proje sahibi PY yazar.`);
    const input = reportInput(ws, project, w, worklog);
    const report = findReport(ws.weeklyReports || [], w.year, w.week, project.id) || { id: 'yeni', year: w.year, week: w.week, projectId: project.id, departmentCode: projectDepartment(ws, project) };
    const req = buildVariantRequest({ variant: PRODUCTION_VARIANT, ws, report, input });
    return {
        proje: project.name, hafta: weekKey(w), istem_surumu: req.promptVersion,
        sistem: req.system,
        istem: req.prompt,
        yapilacak: 'Önce bu paketi uygulamanın AI modeli gibi işle ve yalnız JSON yanıtı üret (ai_taslagi). Sonra PY olarak: her rakamı, tarihi ve adı kaynaklarla doğrula, kaynaksız maddeyi sil, belirsizi somutlaştır, geçen haftanın planını değerlendir, puan ver ve oner_haftalik_rapor ile gönder.',
        worklog_saat: Math.round(worklog.reduce((s, x) => s + x.hours, 0) * 10) / 10,
    };
};

// ---------------------------------------------------------------- öneriler

export type ReportOp =
    | { op: 'kaydet'; projectId: string; year: number; week: number; gonder: boolean; content: Pick<WeeklyReport, 'thisWeek' | 'nextWeek' | 'abbreviations' | 'planReview' | 'pmScore' | 'pmScoreNote' | 'aiDraft'> }
    | { op: 'karar'; projectId: string; year: number; week: number; karar: 'onay' | 'iade'; not?: string }
    | { op: 'yayin'; year: number; week: number };

const asText = (v: unknown) => (typeof v === 'string' ? v : v && typeof v === 'object' && 'metin' in v ? String((v as { metin: unknown }).metin ?? '') : '').replace(/\s+/g, ' ').trim();

const meetingOf = (v: unknown): MeetingDetails | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const o = v as Record<string, unknown>;
    const m = { date: String(o.tarih || ''), place: String(o.yer || ''), participants: String(o.katilimcilar || ''), agenda: String(o.gundem || ''), decisions: String(o.kararlar || '') };
    return Object.values(m).some(Boolean) ? m : undefined;
};

/** Ajanın verdiği maddeleri uygulama maddelerine çevirir; AI taslağıyla eşleşenler "ai" kaynaklı sayılır (düzeltme ölçüsü) */
const buildContent = (args: Record<string, unknown>, prevPlans: ReportItem[], input: string, now: Date): { content: Extract<ReportOp, { op: 'kaydet' }>['content']; problems: string[] } => {
    const problems: string[] = [];
    const list = (k: string) => (Array.isArray(args[k]) ? (args[k] as unknown[]) : []);
    const thisWeek = list('bu_hafta').map(x => {
        const raw = x && typeof x === 'object' ? String((x as { kategori?: unknown }).kategori || '') : '';
        const cat: ReportCategory = (THIS_WEEK_CATEGORIES as string[]).includes(raw) ? raw as ReportCategory : 'ongoing';
        if (raw && raw !== cat) problems.push(`"${raw}" geçerli bir madde türü değil; "devam eden faaliyet" sayıldı.`);
        const meeting = cat === 'meeting' ? meetingOf((x as { toplanti?: unknown })?.toplanti) : undefined;
        return newItem(cat, asText(x), { source: 'manual', ...(meeting ? { meeting } : {}) });
    }).filter(i => i.text || i.meeting);
    const nextWeek = list('gelecek_hafta').map(asText).filter(Boolean).map(t => newItem('plan', t, { source: 'manual' }));
    const abbreviations: Abbreviation[] = list('kisaltmalar').map(a => {
        const o = (a || {}) as Record<string, unknown>;
        return { abbr: String(o.kisaltma || '').trim(), expansion: String(o.acilim || '').trim() };
    }).filter(a => a.abbr && a.expansion);
    const planReview: PlanReviewItem[] = list('plan_degerlendirmesi').flatMap(x => {
        const o = (x || {}) as Record<string, unknown>;
        const status = String(o.durum || '') as PlanReviewStatus;
        if (!PLAN_REVIEW_STATUSES.includes(status)) { problems.push(`Plan değerlendirmesinde geçersiz durum: ${JSON.stringify(o.durum)} (done|partial|slipped|dropped).`); return []; }
        const byId = prevPlans.find(p => p.id === o.madde_id);
        const byText = !byId && typeof o.madde === 'string' ? prevPlans.find(p => itemDisplay(p).toLocaleLowerCase('tr-TR') === String(o.madde).trim().toLocaleLowerCase('tr-TR')) : undefined;
        const item = byId || byText;
        if (!item) { problems.push(`Geçen haftanın planında olmayan madde: ${JSON.stringify(o.madde_id || o.madde)}.`); return []; }
        return [{ itemId: item.id, text: itemDisplay(item), status }];
    });
    const score = args.py_puani === undefined ? undefined : Number(args.py_puani);
    if (score !== undefined && !(Number.isInteger(score) && score >= 1 && score <= 10)) problems.push('PY puanı 1–10 arasında tam sayı olmalı.');
    let aiDraft: WeeklyReport['aiDraft'];
    if (typeof args.ai_taslagi === 'string' && args.ai_taslagi.trim()) {
        try {
            const s = parseReportSuggestion(args.ai_taslagi);
            const pairs = matchItems(s.thisWeek, thisWeek);
            pairs.forEach(({ a, g }) => { thisWeek[g] = { ...thisWeek[g], source: 'ai', aiOriginal: { text: s.thisWeek[a].text, category: s.thisWeek[a].category } }; });
            const planPairs = matchItems(s.nextWeek, nextWeek);
            planPairs.forEach(({ a, g }) => { nextWeek[g] = { ...nextWeek[g], source: 'ai', aiOriginal: { text: s.nextWeek[a].text, category: 'plan' } }; });
            aiDraft = {
                generatedAt: now.toISOString(), input, output: args.ai_taslagi.trim(), variant: PRODUCTION_VARIANT, model: 'Claude (MCP)', mode: 'replace',
                proposed: { thisWeek: s.thisWeek.length, nextWeek: s.nextWeek.length },
                itemIds: [...pairs.map(p => thisWeek[p.g].id), ...planPairs.map(p => nextWeek[p.g].id)],
            };
        } catch (e) {
            problems.push(`ai_taslagi çözümlenemedi: ${(e as Error).message}`);
        }
    }
    return {
        content: { thisWeek, nextWeek, abbreviations, planReview, ...(score !== undefined && Number.isInteger(score) ? { pmScore: score, pmScoreNote: asText(args.py_puani_notu) || undefined } : {}), ...(aiDraft ? { aiDraft } : {}) },
        problems,
    };
};

export interface PreparedReport { op: ReportOp; title: string; details: Record<string, unknown> }

export const prepareReportOp = (ws: WorkspaceData, ctx: ToolContext, name: string, args: Record<string, unknown>, now: Date, worklog: WorklogEntry[] = []): PreparedReport => {
    const w = parseWeek(args.hafta, now);
    if (name === REPORT_PUBLISH_TOOL) {
        if (!isReportSteward(ctx.identity)) throw new Error('Haftayı yalnız PYB destek yayınlar.');
        if (isWeekPublished(ws, w.year, w.week)) throw new Error(`${weekKey(w)} zaten yayınlandı.`);
        const approved = (ws.weeklyReports || []).filter(r => r.year === w.year && r.week === w.week && r.stage === 'approved');
        if (!approved.length) throw new Error(`${weekKey(w)} için onaylı rapor yok; önce biçim onayı verin.`);
        const waiting = (ws.weeklyReports || []).filter(r => r.year === w.year && r.week === w.week && r.kind === 'project' && r.stage !== 'approved');
        return {
            op: { op: 'yayin', ...w }, title: `${weekKey(w)} haftalık raporlarının yayını`,
            details: { onayli: approved.length, ...(waiting.length ? { yayina_girmeyen: waiting.map(r => `${ws.projects.find(p => p.id === r.projectId)?.name} (${STAGE_LABELS[r.stage]})`) } : {}) },
        };
    }
    const project = resolveProject(ctx, args.proje);
    const all = ws.weeklyReports || [];
    const existing = findReport(all, w.year, w.week, project.id);
    if (name === REPORT_DECIDE_TOOL) {
        if (!existing) throw new Error(`${project.name} için ${weekKey(w)} raporu yok.`);
        const karar = args.karar === 'iade' ? 'iade' : 'onay';
        const not = asText(args.not);
        if (karar === 'iade' && !not) throw new Error('İade için not zorunlu: eksikleri yazın.');
        const owner = existing.stage === 'bs_review' ? ctx.identity.role === 'bolum_sorumlu' : (existing.stage === 'pyds_review' || existing.stage === 'approved') && isReportSteward(ctx.identity);
        if (!owner) throw new Error(`Rapor "${STAGE_LABELS[existing.stage]}" aşamasında; bu aşamanın kararı sizde değil.`);
        if (karar === 'onay' && !nextStage(existing, reportFlowOf(ws))) throw new Error('Rapor zaten onaylı.');
        const lint = lintCounts(lintReport(existing, lintDictionary(ws)));
        return {
            op: { op: 'karar', projectId: project.id, ...w, karar, ...(not ? { not } : {}) },
            title: `${project.name} · ${weekKey(w)} raporu: ${karar === 'onay' ? 'onay' : 'iade'}`,
            details: { asama: STAGE_LABELS[existing.stage], karar, ...(not ? { not } : {}), bicim: `${lint.errors} hata, ${lint.warnings} uyarı` },
        };
    }
    // kaydet / gönder (PY)
    if (!ownsProject(ctx, project)) throw new Error(`"${project.name}" projesinin raporunu yalnız proje sahibi PY yazar.`);
    if (existing && existing.stage !== 'draft') throw new Error(`Rapor "${STAGE_LABELS[existing.stage]}" aşamasında; düzenlemek için iade edilmesi gerekir.`);
    if (isWeekPublished(ws, w.year, w.week)) throw new Error(`${weekKey(w)} yayınlandı; rapor değişmez.`);
    const prevPlans = previousPlansOf(all, { kind: 'project', year: w.year, week: w.week, projectId: project.id, departmentCode: projectDepartment(ws, project) });
    const input = reportInput(ws, project, w, worklog);
    const { content, problems } = buildContent(args, prevPlans, input, now);
    if (!content.thisWeek.length && !content.nextWeek.length) throw new Error('Raporda madde yok.');
    const dictionary = lintDictionary(ws);
    const check = checkSuggestion(content, input, dictionary);
    const gonder = args.gonder === true;
    const flow = reportFlowOf(ws);
    const draftLike = { kind: 'project' as const, stage: 'draft' as const, pmScore: content.pmScore, planReview: content.planReview };
    const blockers = flowBlockers(draftLike, flow, prevPlans);
    const unreviewed = prevPlans.filter(p => !(content.planReview || []).some(r => r.itemId === p.id));
    if (gonder && (check.errors > 0 || blockers.length)) {
        throw new Error(`Rapor gönderilemez: ${[...check.lint.filter(l => l.level === 'error').map(l => l.message.replace(/\.+$/, '')), ...blockers].join('; ')}. Düzeltip yeniden deneyin (gonder=false ile taslak olarak kaydedebilirsiniz).`);
    }
    return {
        op: { op: 'kaydet', projectId: project.id, ...w, gonder, content },
        title: `${project.name} · ${weekKey(w)} haftalık rapor${gonder ? ' — bölüm sorumlusuna gönderim' : ' — taslak'}`,
        details: {
            bu_hafta: content.thisWeek.length, gelecek_hafta: content.nextWeek.length, py_puani: content.pmScore,
            ai_eslesen_madde: content.aiDraft?.itemIds?.length ?? 0,
            bicim: check.lint.map(l => `${l.level === 'error' ? 'HATA' : 'uyarı'}: ${l.message}`),
            dayanaksiz: check.grounding.map(g => `${g.kind === 'number' ? 'rakam' : g.kind === 'date' ? 'tarih' : 'ad'} "${g.value}" girdide yok — doğruysa bırakın, değilse düzeltin`),
            ...(unreviewed.length ? { degerlendirilmeyen_plan: unreviewed.map(p => ({ madde_id: p.id, madde: itemDisplay(p) })) } : {}),
            ...(problems.length ? { notlar: problems } : {}),
        },
    };
};

/** Öneriyi güncel veriyle uygular (yetki ve aşama utils/weeklyReport'ta yeniden denetlenir) */
export const applyReportOp = (ws: WorkspaceData, ctx: ToolContext, op: ReportOp, now: Date): { ws: WorkspaceData; summary: string } => {
    const actor = actorOf(ws);
    const id = ctx.identity;
    if (op.op === 'yayin') {
        const pubs = publishWeek(ws, id, op.year, op.week, actor.name, now);
        if (!pubs) throw new Error(`${weekKey(op)} yayınlanamadı (yetki, onaylı rapor yok ya da zaten yayınlandı).`);
        const summary = `${weekKey(op)} haftalık raporları yayınlandı`;
        return { ws: appendAudit({ ...ws, weeklyPublications: pubs }, 'report.publish', `${summary} — Claude (MCP) ile`), summary };
    }
    const project = ws.projects.find(p => p.id === op.projectId);
    if (!project) throw new Error('Proje bulunamadı.');
    const reports = ws.weeklyReports || [];
    const existing = findReport(reports, op.year, op.week, op.projectId);
    const dictionary = lintDictionary(ws);
    if (op.op === 'karar') {
        if (!existing) throw new Error('Rapor bulunamadı.');
        if (op.karar === 'iade') {
            const r = returnReportIn(ws, id, existing.id, actor, op.not || '', now);
            if (!r) throw new Error('İade edilemedi (aşama değişmiş ya da yetki yok).');
            const summary = `"${project.name}" ${weekKey(op)} raporu iade edildi (${STAGE_LABELS[r.report.stage]} aşamasına)`;
            return { ws: appendAudit({ ...ws, weeklyReports: r.reports }, 'report.return', `${summary}: ${op.not} — Claude (MCP) ile`, project.id), summary };
        }
        // Onay içerik değiştirmez: yalnız aşama ilerler (geçmişe "edit" düşmez)
        const flow = reportFlowOf(ws);
        if (existing.stage === 'draft' || !canEditReport(ws, id, existing) || !nextStage(existing, flow)) throw new Error('Onaylanamadı (aşama değişmiş ya da yetki yok).');
        if (lintCounts(lintReport(existing, dictionary)).errors > 0) throw new Error('Raporda biçim hatası var; onaylamak yerine iade edin.');
        const next = advanceReport(existing, actor, now, flow);
        const summary = `"${project.name}" ${weekKey(op)} raporu onaylandı → ${STAGE_LABELS[next.stage]}`;
        return { ws: appendAudit({ ...ws, weeklyReports: reports.map(x => (x.id === next.id ? next : x)) }, 'report.approve', `${summary} — Claude (MCP) ile`, project.id), summary };
    }
    const base = existing || createReport({ kind: 'project', projectId: project.id, departmentCode: projectDepartment(ws, project), year: op.year, week: op.week }, actor, now);
    const r = saveReport(ws, id, { ...base, ...op.content }, actor, { advance: op.gonder, dictionary, now });
    if (!r) throw new Error(op.gonder ? 'Gönderilemedi: yetki, aşama, biçim hatası ya da akış kuralı (geçen haftanın planı, PY puanı).' : 'Kaydedilemedi: yetki ya da aşama değişmiş.');
    const summary = `"${project.name}" ${weekKey(op)} haftalık raporu ${op.gonder ? `gönderildi → ${STAGE_LABELS[r.report.stage]}` : 'taslak olarak kaydedildi'}`;
    const next = { ...ws, weeklyReports: r.reports };
    return { ws: op.gonder ? appendAudit(next, 'report.submit', `${summary} — Claude (MCP) ile`, project.id) : next, summary };
};
