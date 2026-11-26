import { IssueType, PermissionKey, ProjectStatus, RagStatus, RiskStatus, Task, TaskStatus } from '../../types';
import { projectRolesOf } from '../projectRoles';
import { componentAnalytics, GroupStats, teamAnalytics } from '../teamAnalytics';
import { describeProgressModel, progressOf } from '../progress';
import { normalizeEnumArgs } from './enumAliases';
import { inMonthEstimates, InMonthEstimate } from '../inMonthActual';
import { getPlanLockStatus, inferAllocationRole, MONTH_INDEXES, ROLE_LABELS, summarizeByProject } from '../allocations';
import { AUDIT_ACTION_LABELS } from '../audit';
import { buildCostReport, costPeriodLabel } from '../costing';
import { CATEGORY_LABELS, analyzeDataHealth } from '../dataHealth';
import { departmentScorecards, orgCapacity } from '../deptScorecard';
import { buildPortfolioEVM, buildProjectEVM, closedStatusMonth, ProjectEVM } from '../evm';
import { attentionItems, executiveSummary, isHealthScored, portfolioHealth, projectHealth } from '../executive';
import { buildForecast, FORECAST_DIM_LABELS, FORECAST_METHOD_LABELS, ForecastDim, ForecastMethod } from '../forecast';
import { buildPersonProfile } from '../personProfile';
import { recentChanges } from '../recentChanges';
import { buildRoleAnalysis, summarizeGaps, UNASSIGNED_ROLE } from '../roleAnalysis';
import { RISK_BAND_LABELS, RISK_STATUS_LABELS, riskBand, riskScore, summarizeRisks } from '../risks';
import { allPersonRoles, departmentLeadIds, findAvailablePeople } from '../staffing';
import { buildStatusReport } from '../statusReport';
import { buildUtilization } from '../utilization';
import { RAG_SOURCE_LABELS, RagSourceType } from '../rag/sources';
import { summarizeWorkPackages } from '../workPackages';
import { can } from '../permissions';
import { AiAction, AiProposal, describeAction, TaskFieldChange, validateAction } from './actions';
import { buildWorklogReport, reportRange, resolveTargets, WorklogGroup } from './worklogReport';
import { buildWorkforce, hourlyRate, matchWorklogPerson } from '../workforce';
import { fullName, PERSON_ISSUE_LABELS, personIssues, trNorm, trUpper } from '../dataPool';
import { MAX_POOL_ROWS, parseMoney, PoolNewPerson, PoolPersonChange, PoolTitle, titleCodeFor } from './poolActions';
import { WorkspaceData } from '../../types';
import { labelFamilies, milestonePlan } from '../dashboard/data';
import { CALLOUT_TONES, CalloutTone, CHART_TYPES, ChartType, DOC_FORMAT_LABELS, DOC_FORMATS, DocBlock, DocError, DocFormat, documentStats, KPI_STATUSES, KpiStatus, normalizeDocument, tableFromResult } from '../export/aiDocument';
import {
    AGG_FNS, AggFn, AnalysisError, applyFilters, correlation, DataTable, describeTable, distribution, Filter, FILTER_OPS, FilterOp,
    groupBy, Measure, outliers, PERIODS, Period, pivot, profile, topRows, trend,
} from './dataAnalysis';
import { SKILLS, skillById } from './skills';
import { ALL_GROUPS, groupCatalog, groupsOfTool, ToolGroup } from './toolRouting';
import { DEFAULT_OPTIONS, describeMetrics, optimizePlan, rescueScenarios } from '../planning/planOptimizer';
import { buildHistory, calibrator } from '../planning/history';
import { calendarLabel, sprintCalendar } from '../sprintCalendar';
import { JsonSchema, ToolCall, ToolSpec } from './protocol';
import { knownWorkflow, taskStatusLabel } from '../workflow';
import { effectiveScheme } from '../projectScheme';
import { DIALOG_KEYS, DIALOGS, DialogKey, SCREEN_KEYS, SCREENS, ScreenKey } from './uiActions';
import type { JiraIssueRecord } from '../integrations';
import {
    clampLimit, maskSicil, matchByText, months12, personName, r2, resolveDepartmentCode, resolvePerson,
    resolveProject, resolveYear, ToolContext, ToolError, withBulkLimit,
} from './scope';

/**
 * AI asistanının araç kataloğu. Araçlar tarayıcıda, uygulamanın mevcut ve test
 * edilmiş hesap motorları üzerinde çalışır — model sayı üretmez, sayıyı araç
 * hesaplar. Hepsi SALT-OKUNURDUR ve ToolContext kapsamına uyar (bkz. scope.ts).
 */

type Args = Record<string, unknown>;

export interface ToolDef {
    spec: ToolSpec;
    /** Arayüzde gösterilen kısa etiket */
    label: string;
    /** Yalnızca not/istek görebilen roller (yönetici rollerine hiç sunulmaz) */
    privateOnly?: boolean;
    /** Değişiklik ÖNERİSİ üreten araç — yalnızca veri girebilen rollere sunulur */
    writeOnly?: boolean;
    /** Veri havuzu ÖNERİSİ üreten araç — yalnız veri havuzunu düzenleyebilen rollere (PYB Destek) sunulur */
    poolWrite?: boolean;
    /** Yalnız bu yetkiyi taşıyan rollere sunulur (ör. denetim günlüğü, veri sağlığı) */
    permission?: PermissionKey;
    /** Tarayıcı çalışma zamanı gerektirir: ui (ajan gezinmesi) ya da jira (sunucuda Jira bağlantısı) */
    requires?: 'ui' | 'jira' | 'files' | 'memory' | 'toolGroups' | 'whiteboard';
    run: (args: Args, ctx: ToolContext) => unknown | Promise<unknown>;
}

/** Tek araç sonucunun üst sınırı (karakter) — bağlamı şişirmesin */
export const MAX_TOOL_RESULT_CHARS = 12_000;

const MONTH_NOTE = '12 elemanlı aylık diziler Ocak→Aralık sırasındadır.';

const PROJECT_STATUS_TR: Record<ProjectStatus, string> = { devam: 'Devam Eden', teklif: 'Teklif', beklemede: 'Beklemede', tamamlandi: 'Tamamlandı' };
const RAG_TR: Record<RagStatus, string> = { green: 'Yolunda', amber: 'Riskli', red: 'Kritik' };
const TASK_STATUS_TR: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'Backlog', [TaskStatus.ToDo]: 'Yapılacak', [TaskStatus.InProgress]: 'Devam Ediyor', [TaskStatus.Done]: 'Tamamlandı',
};
const LOCK_TR = { draft: 'Taslak', submitted: 'Onay Bekliyor', locked: 'Onaylı/Kilitli' } as const;

const IN_MONTH_NOTE = 'ay_ici_tahmin: kapanmamış ayın haftalık rapor worklog\'undan tahmini gerçekleşeni; EVM\'e girmez (EVM son kapanan aya kadar), ay kapanışında kesinleşir. oran = tahmini / worklog\'u olan günlere düşen plan.';
const inMonthRow = (x: InMonthEstimate) => ({ ay: x.month, kayitli_gun: x.coveredDays, son_kayit: x.lastDate, saat: x.hours, tahmini_gerceklesen_aa: x.estimatedAA, ayni_doneme_plan_aa: x.planToDateAA, oran: x.ratio });

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const short = (s: string | undefined, n = 200): string | undefined => {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    if (!t) return undefined;
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const todayIso = (now: Date): string => now.toISOString().slice(0, 10);
const isOverdue = (t: Task, now: Date): boolean => !!t.dueDate && t.status !== TaskStatus.Done && t.dueDate.slice(0, 10) < todayIso(now);
const norm = (s: string): string => s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

const S = {
    obj: (properties: Record<string, JsonSchema> = {}, required: string[] = []): JsonSchema =>
        ({ type: 'object', properties, ...(required.length ? { required } : {}) }),
    str: (description: string, values?: string[]): JsonSchema => ({ type: 'string', description, ...(values ? { enum: values } : {}) }),
    int: (description: string): JsonSchema => ({ type: 'integer', description }),
    num: (description: string): JsonSchema => ({ type: 'number', description }),
    bool: (description: string): JsonSchema => ({ type: 'boolean', description }),
};

const P = {
    year: S.int('Yıl (örn. 2026). Verilmezse içinde bulunulan yıl.'),
    project: S.str('Proje adı ya da kodu. Verilmezse kullanıcının açık olan projesi.'),
    limit: S.int('En fazla kaç kayıt dönsün (varsayılan 20, en çok 50).'),
    dept: S.str('Bölüm kodu ya da adı (örn. U310). Verilmezse tüm bölümler.'),
    field: S.str('plan (planlanan) ya da actual (gerçekleşen). Varsayılan plan.', ['plan', 'actual']),
};

const effortField = (v: unknown): 'plan' | 'actual' => (v === 'actual' ? 'actual' : 'plan');

const projectPmName = (ctx: ToolContext, pmPersonId?: string): string | undefined => {
    const pm = pmPersonId ? ctx.ws.people.find(p => p.id === pmPersonId) : undefined;
    return pm ? personName(pm) : undefined;
};

const taskRow = (t: Task, ctx: ToolContext, projectName: string, wpNames: Map<string, string>) => ({
    proje: projectName,
    gorev: t.name,
    durum: TASK_STATUS_TR[t.status] || t.status,
    is_durumu: t.jiraStatus ? taskStatusLabel(t) : undefined,
    bilesen: t.components?.length ? t.components.join(', ') : undefined,
    hedef_surum: t.fixVersion || undefined,
    cozum: t.resolution || undefined,
    oncelik: t.priority,
    atanan: t.resourceName || undefined,
    bitis: t.dueDate ? t.dueDate.slice(0, 10) : undefined,
    geciken: isOverdue(t, ctx.now) || undefined,
    surum: t.version || undefined,
    is_paketi: t.workPackageId ? wpNames.get(t.workPackageId) : undefined,
    jira: t.jiraId || undefined,
    tahmin_gun: { iyimser: t.time.best, ortalama: t.time.avg, kotumser: t.time.worst },
    alt_gorev: t.subtasks?.length ? `${t.subtasks.filter(s => s.completed).length}/${t.subtasks.length}` : undefined,
    aciklama: short(t.notes, 160),
});

const evmRow = (e: ProjectEVM) => ({
    proje: e.projectName,
    maliyetlenebilir: e.costed,
    tamamlanma_yuzde: Math.round(e.percentComplete * 100),
    durum_ayi: e.statusMonth,
    bac_butce: Math.round(e.bac),
    pv_planlanan_deger: Math.round(e.pv),
    ev_kazanilan_deger: Math.round(e.ev),
    ac_gercek_maliyet: Math.round(e.ac),
    spi: r2(e.spi),
    cpi: r2(e.cpi),
    eac_tahmini_toplam: Math.round(e.eac),
    vac_sapma: Math.round(e.vac),
});

// ---------------------------------------------------------------------------
// Araçlar
// ---------------------------------------------------------------------------

const RAG_TYPES = Object.keys(RAG_SOURCE_LABELS) as RagSourceType[];

export const AI_TOOLS: ToolDef[] = [
    {
        label: 'Bilgi tabanı araması',
        spec: {
            name: 'bilgi_ara',
            description: 'Serbest metinde anlam araması: notlar, görev/risk açıklamaları, istekler, PESTEL/SWOT, hedefler, kullanım kılavuzu ve kurumsal dokümanlar. "Nasıl yapılır", geçmiş kararlar ve metinde geçen konular için; sayısal sorularda yapısal araçlar.',
            parameters: S.obj({
                sorgu: S.str('Kısa, anahtar kelimeli ifade'),
                kaynak: S.str('Kaynak türü; analiz=PESTEL/SWOT, kilavuz=kullanım kılavuzu', RAG_TYPES),
                proje: S.str('Proje adı/kodu'),
                limit: S.int('Pasaj (6, en çok 10)'),
            }, ['sorgu']),
        },
        run: async (a, ctx) => {
            if (!ctx.rag) throw new ToolError('Bilgi tabanı araması bu oturumda kullanılamıyor.');
            const sorgu = str(a.sorgu);
            if (!sorgu) throw new ToolError('sorgu parametresi gerekli.');
            const rawTypes = Array.isArray(a.kaynak) ? a.kaynak : str(a.kaynak) ? [str(a.kaynak)] : [];
            const types = rawTypes.filter((t): t is RagSourceType => RAG_TYPES.includes(t as RagSourceType));
            if (!ctx.canSeePrivate && types.length > 0 && types.every(t => t === 'not' || t === 'istek')) {
                throw new ToolError('Bu rol proje notlarına ve müşteri isteklerine erişemez.');
            }
            const project = str(a.proje) ? resolveProject(ctx, a.proje) : undefined;
            const hits = await ctx.rag.search(sorgu, { k: clampLimit(a.limit, 6, 10), types, projectId: project?.id });
            const sonuclar = hits.map(h => {
                let cit = ctx.citations.find(c => c.chunkId === h.chunk.id);
                if (!cit) {
                    cit = {
                        no: ctx.citations.length + 1, chunkId: h.chunk.id, type: h.chunk.type, title: h.chunk.title,
                        projectName: h.chunk.projectName, date: h.chunk.date, excerpt: maskSicil(h.chunk.text, ctx.ws.people), ref: h.chunk.ref,
                    };
                    ctx.citations.push(cit);
                }
                return {
                    no: cit.no, kaynak: RAG_SOURCE_LABELS[h.chunk.type], baslik: h.chunk.title, proje: h.chunk.projectName,
                    tarih: h.chunk.date, metin: short(cit.excerpt, 900),
                };
            });
            return {
                sorgu, arama_turu: ctx.rag.mode(), sonuc_sayisi: sonuclar.length, sonuclar,
                ...(sonuclar.length === 0 ? { not: 'Eşleşen içerik bulunamadı. Farklı/eş anlamlı kelimelerle tekrar dene ya da yapısal araçları kullan.' } : {}),
            };
        },
    },
    {
        label: 'Proje listesi',
        spec: {
            name: 'proje_listesi',
            description: 'Kullanıcının görebildiği projeleri listeler: durum, haftalık RAG, proje yöneticisi, görev ilerlemesi, geciken görev ve açık risk sayısı.',
            parameters: S.obj({
                durum: S.str('Proje durumu filtresi.', ['devam', 'teklif', 'beklemede', 'tamamlandi']),
                rag: S.str('RAG filtresi: green=Yolunda, amber=Riskli, red=Kritik.', ['green', 'amber', 'red']),
            }),
        },
        run: (a, ctx) => {
            let ps = ctx.scoped.projects;
            if (str(a.durum)) ps = ps.filter(p => p.status === a.durum);
            if (str(a.rag)) ps = ps.filter(p => p.rag === a.rag);
            return {
                proje_sayisi: ps.length,
                ...(ctx.scoped.projects.length === 0 && (ctx.identity.role === 'py' || ctx.identity.role === 'bolum_sorumlu') && !ctx.identity.personId
                    ? { not: 'Kullanıcı kimliğinde kişi seçilmediği için kapsamda proje yok (sağ üstteki kimlik menüsünden kişi seçilmeli).' }
                    : {}),
                projeler: ps.map(p => ({
                    ad: p.name,
                    kod: p.code || undefined,
                    durum: PROJECT_STATUS_TR[p.status] || p.status,
                    rag: p.rag ? RAG_TR[p.rag] : undefined,
                    rag_notu: short(p.ragNote),
                    proje_yoneticisi: projectPmName(ctx, p.pmPersonId),
                    gorev: {
                        toplam: p.tasks.length,
                        tamamlanan: p.tasks.filter(t => t.status === TaskStatus.Done).length,
                        geciken: p.tasks.filter(t => isOverdue(t, ctx.now)).length,
                        ilerleme_yuzde: progressOf(p.tasks, p.progressModel).pct,
                    },
                    acik_risk: (p.risks || []).filter(r => r.status !== 'closed').length,
                    // Plan kilidi öneri denenmeden görünsün (B-014): kilitliyse yalnız gerçekleşen değişir
                    plan_kilidi: LOCK_TR[getPlanLockStatus(ctx.ws.planLocks, p.id, ctx.year)],
                    guncellendi: p.updatedAt?.slice(0, 10),
                })),
            };
        },
    },
    {
        label: 'Portföy özeti',
        spec: {
            name: 'portfoy_ozeti',
            description: 'Portföy sağlık skoru (0-100), proje bazında sağlık/SPI/CPI ve skoru düşüren nedenler, "dikkat gerektirenler" (onay bekleyen plan, sapma, kritik RAG, geciken iş, aşırı tahsis, veri sorunu) ve risk özeti. Genel durum sorularında ilk tercih.',
            parameters: S.obj({ yil: P.year }),
        },
        run: (a, ctx) => {
            const year = resolveYear(ctx, a.yil);
            const health = portfolioHealth(ctx.scoped, year);
            const attn = attentionItems(ctx.scoped, year, ctx.now);
            return {
                yil: year,
                saglik_skoru: health.orgScore,
                saglik_bandi: health.orgBand,
                ozet: maskSicil(executiveSummary(ctx.scoped, year, ctx.now), ctx.ws.people),
                projeler: health.projects.slice(0, 40).map(h => ({
                    proje: h.name, skor: h.score, bant: h.band, guven: h.confidence, rag: h.rag ? RAG_TR[h.rag] : undefined,
                    spi: r2(h.spi), cpi: r2(h.cpi), yuksek_risk: h.highRisks, nedenler: h.reasons,
                })),
                ...(health.unscored.length ? { skorlanmayan: health.unscored.map(u => `${u.name} (teklif aşamasında)`) } : {}),
                dikkat_gerektirenler: attn.slice(0, 20).map(i => ({
                    onem: i.severity === 'error' ? 'kritik' : 'uyarı', kategori: i.category,
                    baslik: maskSicil(i.title, ctx.ws.people), detay: maskSicil(i.detail, ctx.ws.people),
                })),
                dikkat_toplam: attn.length,
                risk_ozeti: summarizeRisks(ctx.scoped),
            };
        },
    },
    {
        label: 'Proje detayı',
        spec: {
            name: 'proje_detayi',
            description: 'Tek projenin ayrıntılı durumu: sağlık skoru ve girdi dökümü, görev istatistikleri, geciken ve 14 günde bitecek görevler, en yüksek riskler, iş paketleri, hedefler, yılın plan/gerçekleşen AA\'sı, plan kilidi, EVM.',
            parameters: S.obj({ proje: P.project, yil: P.year }),
        },
        run: (a, ctx) => {
            const p = resolveProject(ctx, a.proje);
            const year = resolveYear(ctx, a.yil);
            const statusMonth = closedStatusMonth(ctx.ws, year, ctx.now);
            const h = projectHealth(ctx.scoped, p, year, statusMonth);
            const wpNames = new Map(p.workPackages.map(w => [w.id, w.name]));
            const today = todayIso(ctx.now);
            const in14 = new Date(ctx.now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
            const open = p.tasks.filter(t => t.status !== TaskStatus.Done);
            const overdue = open.filter(t => isOverdue(t, ctx.now)).sort((x, y) => (x.dueDate || '').localeCompare(y.dueDate || ''));
            const upcoming = open.filter(t => t.dueDate && t.dueDate.slice(0, 10) >= today && t.dueDate.slice(0, 10) <= in14)
                .sort((x, y) => (x.dueDate || '').localeCompare(y.dueDate || ''));
            const allocs = ctx.ws.allocations.filter(x => x.projectId === p.id && x.year === year);
            const sum = (f: 'plan' | 'actual') => r2(allocs.reduce((s, x) => s + MONTH_INDEXES.reduce((t, m) => t + (x[f][m] || 0), 0), 0));
            const evm = buildProjectEVM(ctx.scoped, p.id, year, statusMonth);
            const risks = (p.risks || []).filter(r => r.status !== 'closed').map(r => ({ r, s: riskScore(r) })).sort((x, y) => y.s - x.s);
            return {
                ad: p.name,
                kod: p.code || undefined,
                durum: PROJECT_STATUS_TR[p.status] || p.status,
                rag: p.rag ? RAG_TR[p.rag] : undefined,
                rag_notu: short(p.ragNote, 400),
                proje_yoneticisi: projectPmName(ctx, p.pmPersonId),
                baslangic: p.settings.projectStartDate,
                surum_suresi_hafta: p.settings.sprintDuration,
                ilerleme: { yuzde: progressOf(p.tasks, p.progressModel).pct, yontem: describeProgressModel(p.progressModel) },
                saglik: !isHealthScored(p) ? { skor: null, not: 'Teklif aşamasında skorlanmaz.' } : {
                    skor: h.score, bant: h.band, guven: h.confidence, kapsam: h.coverage, spi: r2(h.spi), cpi: r2(h.cpi), nedenler: h.reasons,
                    // Skorun girdileri: normalize değer (0-1, null = veri yok), ağırlık ve skordan düşürdüğü puan
                    girdiler: h.factors.map(f => ({ girdi: f.label, deger: f.value, agirlik: f.weight, kayip_puan: f.points, ayrinti: f.detail })),
                    algi_farki: h.perceptionGap,
                },
                gorevler: {
                    toplam: p.tasks.length,
                    durumlara_gore: Object.fromEntries(Object.values(TaskStatus).map(s => [TASK_STATUS_TR[s], p.tasks.filter(t => t.status === s).length])),
                    geciken_sayisi: overdue.length,
                    geciken: overdue.slice(0, 10).map(t => taskRow(t, ctx, p.name, wpNames)),
                    yaklasan_14_gun: upcoming.slice(0, 10).map(t => taskRow(t, ctx, p.name, wpNames)),
                },
                riskler: {
                    acik: risks.length,
                    en_yuksek: risks.slice(0, 8).map(({ r, s }) => ({
                        baslik: r.title, skor: s, bant: RISK_BAND_LABELS[riskBand(s)], durum: RISK_STATUS_LABELS[r.status], sahibi: r.owner, aksiyon: short(r.mitigation),
                    })),
                },
                is_paketleri: summarizeWorkPackages(p.workPackages, p.tasks).map(w => ({ ad: w.name, gorev: w.taskCount, tamamlanan: w.doneCount, yuzde: w.donePct })),
                hedefler: p.objectives.map(o => ({ hedef: o.name, ceyrek: o.quarter, anahtar_sonuc: o.keyResults.length })),
                pestel_madde: (p.pestelItems || []).length,
                swot_madde: (p.swotItems || []).length,
                tahsis: { yil: year, plan_aa: sum('plan'), gerceklesen_aa: sum('actual'), kisi: new Set(allocs.map(x => x.personId)).size, plan_kilidi: LOCK_TR[getPlanLockStatus(ctx.ws.planLocks, p.id, year)] },
                evm: evm && evm.costed ? evmRow(evm) : { not: 'Maliyetlenebilir tahsis yok (ünvan maliyetleri ya da tahsis eksik).' },
                // Dashboard'daki projeye özel göstergeler (PoC skoru gibi) ve kilometre taşları (MS etiketleri)
                ...((p.kpis || []).length ? {
                    ozel_gostergeler: (p.kpis || []).map(k => ({
                        ad: k.name, birim: k.unit, guncel: k.points[k.points.length - 1]?.value, son_olcum: k.points[k.points.length - 1]?.date,
                        hedef: k.target, hedef_aciklama: k.targetLabel, baslangic: k.baseline, yuksek_iyi: k.higherIsBetter !== false,
                        gecmis: k.points.slice(-6).map(x => `${x.date}: ${x.value}`),
                    })),
                } : {}),
                ...(() => {
                    const ms = labelFamilies(p.tasks).find(f => /^ms$/i.test(f.prefix));
                    if (!ms) return {};
                    const rows = milestonePlan(p.tasks, { kind: 'labels', prefix: ms.prefix }, { project: p, workflow: effectiveScheme(ctx.ws, p).workflow }, 'count', ctx.now);
                    return { kilometre_taslari: rows.map(r => ({ tas: r.key, kayit: r.total, tamamlanan: r.done, geciken: r.overdue, bitis: r.end, durum: r.state, kumulatif_plan_yuzde: Math.round(r.cumulativePlanned * 100) })) };
                })(),
            };
        },
    },
    {
        label: 'Görev arama',
        spec: {
            name: 'gorev_ara',
            description: 'Görünür projelerdeki görevleri filtreleyerek listeler (durum, kişi, gecikme, öncelik, metin). Proje verilmezse tüm görünür projelerde arar.',
            parameters: S.obj({
                proje: S.str('Proje adı ya da kodu (isteğe bağlı).'),
                durum: S.str('Görev durumu.', ['Backlog', 'ToDo', 'InProgress', 'Done']),
                kisi: S.str('Atanan kişinin adı (kısmi olabilir).'),
                geciken: S.bool('Yalnızca bitiş tarihi geçmiş ve tamamlanmamış görevler.'),
                oncelik: S.str('Öncelik.', ['Blocker', 'High', 'Medium', 'Low']),
                metin: S.str('Görev adında / açıklamasında ya da Jira anahtarında (ör. MKS-12) geçen metin.'),
                limit: P.limit,
            }),
        },
        run: (a, ctx) => {
            const projects = str(a.proje) ? [resolveProject(ctx, a.proje)] : ctx.scoped.projects;
            const kisi = norm(str(a.kisi));
            const metin = norm(str(a.metin));
            const rows: ReturnType<typeof taskRow>[] = [];
            let total = 0;
            const limit = clampLimit(a.limit, 25);
            projects.forEach(p => {
                const wpNames = new Map(p.workPackages.map(w => [w.id, w.name]));
                p.tasks.forEach(t => {
                    if (str(a.durum) && t.status !== a.durum) return;
                    if (str(a.oncelik) && t.priority !== a.oncelik) return;
                    if (a.geciken === true && !isOverdue(t, ctx.now)) return;
                    if (kisi && !norm(t.resourceName || '').includes(kisi)) return;
                    if (metin && !norm(`${t.jiraId || ''} ${t.name} ${t.notes || ''}`).includes(metin)) return;
                    total++;
                    if (rows.length < limit) rows.push(taskRow(t, ctx, p.name, wpNames));
                });
            });
            return { eslesen: total, gosterilen: rows.length, gorevler: rows };
        },
    },
    {
        label: 'Risk listesi',
        spec: {
            name: 'risk_listesi',
            description: 'Görünür projelerin risk kaydı: olasılık×etki skoru (1-25), bant, sahip, azaltıcı aksiyon. Varsayılan: açık ve izlenen riskler, skora göre azalan.',
            parameters: S.obj({
                proje: S.str('Proje adı ya da kodu (isteğe bağlı).'),
                durum: S.str('aktif = açık + izlenen (varsayılan).', ['aktif', 'open', 'monitoring', 'closed']),
                min_skor: S.int('En düşük risk skoru (1-25).'),
                limit: P.limit,
            }),
        },
        run: (a, ctx) => {
            const projects = str(a.proje) ? [resolveProject(ctx, a.proje)] : ctx.scoped.projects;
            const durum = str(a.durum) || 'aktif';
            const min = Number(a.min_skor) || 0;
            const all = projects.flatMap(p => (p.risks || []).map(r => ({ p, r, s: riskScore(r) })))
                .filter(({ r }) => (durum === 'aktif' ? r.status !== 'closed' : r.status === (durum as RiskStatus)))
                .filter(({ s }) => s >= min)
                .sort((x, y) => y.s - x.s);
            return {
                eslesen: all.length,
                riskler: all.slice(0, clampLimit(a.limit, 20)).map(({ p, r, s }) => ({
                    proje: p.name, baslik: r.title, skor: s, bant: RISK_BAND_LABELS[riskBand(s)], olasilik: r.probability, etki: r.impact,
                    durum: RISK_STATUS_LABELS[r.status], sahibi: r.owner, aksiyon: short(r.mitigation), aciklama: short(r.description),
                    olusturma: r.createdAt?.slice(0, 10),
                })),
            };
        },
    },
    {
        label: 'Kişi profili',
        spec: {
            name: 'kisi_profili',
            description: `Bir kişinin yıllık iş yükü: aylık efektif kapasite (izin düşülmüş), tüm projelerdeki aylık plan/gerçekleşen adam-ay, kapasite aşımı olan aylar, proje dağılımı, rolleri, görünür projelerdeki görev ve riskleri. Kişi verilmezse kullanıcının kendisi. ${MONTH_NOTE}`,
            parameters: S.obj({ kisi: S.str('Kişinin adı soyadı.'), yil: P.year }),
        },
        run: (a, ctx) => {
            const person = resolvePerson(ctx, a.kisi);
            const year = resolveYear(ctx, a.yil);
            const prof = buildPersonProfile(ctx.ws, person.id, year, ctx.now);
            if (!prof) throw new ToolError('Kişi profili hesaplanamadı.');
            const dept = ctx.ws.departments.find(d => d.code === person.departmentCode);
            const title = ctx.ws.titles.find(t => t.code === person.titleCode);
            return {
                ad: personName(person),
                bolum: person.departmentCode ? `${person.departmentCode}${dept ? ` (${dept.name})` : ''}` : undefined,
                unvan: title ? title.name : person.titleCode,
                roller: person.roles,
                yil: year,
                temel_aylik_kapasite_aa: prof.capacity,
                efektif_kapasite: months12(prof.monthlyCapacity),
                aylik_izin: months12(prof.monthlyLeave),
                aylik_plan: months12(prof.monthlyPlan),
                aylik_gerceklesen: months12(prof.monthlyActual),
                toplam_plan_aa: r2(prof.totalPlanAA),
                toplam_gerceklesen_aa: r2(prof.totalActualAA),
                kapasite_asimi_olan_aylar: prof.overMonths,
                projeler: prof.byProject.map(b => ({ proje: b.projectName, rol: b.role, plan_aa: r2(b.total), aylik_plan: months12(b.months), plan_kilidi: LOCK_TR[getPlanLockStatus(ctx.ws.planLocks, b.projectId, year)] })),
                gorevler: prof.tasks.filter(t => ctx.visibleProjectIds.has(t.projectId)).slice(0, 15).map(t => ({
                    proje: t.projectName, gorev: t.taskName, durum: TASK_STATUS_TR[t.status] || t.status, bitis: t.dueDate?.slice(0, 10), geciken: t.overdue || undefined,
                })),
                riskler: prof.risks.filter(r => ctx.visibleProjectIds.has(r.projectId)).slice(0, 10).map(r => ({
                    proje: r.projectName, baslik: r.title, skor: r.score, durum: RISK_STATUS_LABELS[r.status],
                })),
            };
        },
    },
    {
        label: 'Uygun kişi bulma',
        spec: {
            name: 'uygun_kisi_bul',
            description: 'Belirli bir rol ve ay penceresi için boş kapasitesi olan kişileri bulur (izinler ve mevcut plan tahsisleri düşülür). Uygun olanlar önce, en dar aydaki boşluğa göre sıralanır.',
            parameters: S.obj({
                rol: S.str('Rol adı (örn. "Yazılım Geliştirme Mühendisi"). Verilmezse herkes.'),
                yil: P.year,
                baslangic_ay: S.int('Pencerenin ilk ayı (1-12). Varsayılan: bu yılsa bu ay, değilse Ocak.'),
                bitis_ay: S.int('Pencerenin son ayı (1-12). Varsayılan Aralık.'),
                gerekli_aa: S.num('Her ayda gereken boş kapasite (adam-ay, örn. 0.5). Varsayılan 0.5.'),
                bolum: P.dept,
                limit: P.limit,
            }),
        },
        run: (a, ctx) => {
            const year = resolveYear(ctx, a.yil);
            const defStart = year === ctx.year ? ctx.now.getMonth() + 1 : 1;
            const start = Math.min(12, Math.max(1, Number(a.baslangic_ay) || defStart));
            const end = Math.min(12, Math.max(start, Number(a.bitis_ay) || 12));
            const required = Number(a.gerekli_aa) > 0 ? Number(a.gerekli_aa) : 0.5;
            const dept = resolveDepartmentCode(ctx, a.bolum);
            let role: string | undefined;
            if (str(a.rol)) {
                const roles = allPersonRoles(ctx.ws.people);
                const hits = matchByText(roles, str(a.rol), r => [r]);
                if (hits.length === 0) throw new ToolError(`"${str(a.rol)}" rolünde kimse yok. Havuzdaki roller: ${roles.slice(0, 30).join(', ')}`);
                if (hits.length > 1 && !hits.some(h => norm(h) === norm(str(a.rol)))) {
                    throw new ToolError(`"${str(a.rol)}" birden fazla rolle eşleşti: ${hits.join(', ')}.`);
                }
                role = hits.find(h => norm(h) === norm(str(a.rol))) || hits[0];
            }
            const months = MONTH_INDEXES.filter(m => m >= start && m <= end);
            const people = dept ? ctx.ws.people.filter(p => p.departmentCode === dept) : ctx.ws.people;
            const leads = departmentLeadIds(ctx.ws.departments);
            const rows = findAvailablePeople(people, ctx.ws.allocations, ctx.ws.leaves || [], { role, year, months, requiredAA: required, exclude: leads });
            const leadsSkipped = people.filter(p => leads.has(p.id) && (!role || p.roles.includes(role))).length;
            return {
                sorgu: { rol: role || 'tümü', yil: year, aylar: `${start}-${end}`, gerekli_aa: required, bolum: dept },
                ...(leadsSkipped ? { not: `${leadsSkipped} bölüm sorumlusu aday sayılmadı (yönetim görevi; proje tahsisi yok).` } : {}),
                aday_sayisi: rows.length,
                uygun_sayisi: rows.filter(r => r.fits).length,
                adaylar: rows.slice(0, clampLimit(a.limit, 15)).map(r => ({
                    ad: r.name, bolum: r.departmentCode, roller: r.roles, uygun: r.fits,
                    en_dar_ay_bos_aa: r.windowMinFree, pencere_toplam_bos_aa: r.windowFree,
                    pencere_aylik_bos: months.map(m => r.freeByMonth[m - 1]),
                })),
            };
        },
    },
    {
        label: 'Doluluk analizi',
        spec: {
            name: 'doluluk_analizi',
            description: 'Kişi × ay doluluk (yük / efektif kapasite): ortalama doluluk, kapasitesini aşan kişiler ve hangi aylarda aştıkları, düşük dolulukta olanlar.',
            parameters: S.obj({ yil: P.year, alan: P.field, bolum: P.dept, limit: P.limit }),
        },
        run: (a, ctx) => {
            const year = resolveYear(ctx, a.yil);
            const dept = resolveDepartmentCode(ctx, a.bolum);
            const people = dept ? ctx.ws.people.filter(p => p.departmentCode === dept) : ctx.ws.people;
            const u = buildUtilization(ctx.ws.allocations, people, year, effortField(a.alan), ctx.ws.leaves || []);
            const limit = clampLimit(a.limit, 20);
            const over = u.rows.filter(r => r.overCount > 0).sort((x, y) => y.overCount - x.overCount || (y.avgRatio || 0) - (x.avgRatio || 0));
            const low = u.rows.filter(r => r.avgRatio !== null && r.avgRatio < 0.5 && r.totalCapacity > 0).sort((x, y) => (x.avgRatio || 0) - (y.avgRatio || 0));
            return {
                yil: year, alan: effortField(a.alan), bolum: dept, kisi_sayisi: u.rows.length,
                ortalama_doluluk: r2(u.avgUtilization),
                kapasitesini_asan_kisi: u.peopleOver,
                hic_yuku_olmayan_kisi: u.peopleIdle,
                asiri_yuklu: over.slice(0, limit).map(r => ({
                    ad: r.name, bolum: r.departmentCode, yillik_oran: r2(r.avgRatio), asiri_ay_sayisi: r.overCount,
                    asiri_aylar: r.cells.filter(c => c.level === 'over').map(c => ({ ay: c.month, yuk: r2(c.load), kapasite: r2(c.capacity) })),
                })),
                dusuk_dolulukta: low.slice(0, 10).map(r => ({ ad: r.name, bolum: r.departmentCode, yillik_oran: r2(r.avgRatio) })),
            };
        },
    },
    {
        label: 'Departman karnesi',
        spec: {
            name: 'departman_karnesi',
            description: 'Bölüm bazında kapasite: kişi, efektif kapasite, plan/gerçekleşen AA, doluluk, aşırı yüklü kişi, proje sayısı; bölüm verilirse kişi kırılımı.',
            parameters: S.obj({ yil: P.year, bolum: P.dept }),
        },
        run: (a, ctx) => {
            const year = resolveYear(ctx, a.yil);
            const dept = resolveDepartmentCode(ctx, a.bolum);
            const row = (d: ReturnType<typeof departmentScorecards>[number]) => ({
                bolum: d.code, ad: d.name, kisi: d.headcount, kapasite_aa: r2(d.capacityAA), plan_aa: r2(d.plannedAA), gerceklesen_aa: r2(d.actualAA),
                izin_aa: r2(d.leaveAA), doluluk: r2(d.utilization), asiri_yuklu_kisi: d.overAllocatedPeople, proje: d.projectCount, bant: d.band, nedenler: d.reasons,
            });
            if (dept) {
                const d = departmentScorecards(ctx.ws, year).find(x => x.code === dept);
                if (!d) throw new ToolError(`${dept} bölümü için ${year} verisi yok.`);
                return { yil: year, ...row(d), kisiler: d.people.map(p => ({ ad: p.name, kapasite_aa: r2(p.capacityAA), plan_aa: r2(p.plannedAA), doluluk: r2(p.utilization), asiri: p.over || undefined })) };
            }
            const org = orgCapacity(ctx.ws, year);
            return {
                yil: year, toplam_kisi: org.totalHeadcount, toplam_kapasite_aa: r2(org.totalCapacityAA), toplam_plan_aa: r2(org.totalPlannedAA),
                toplam_gerceklesen_aa: r2(org.totalActualAA), doluluk: r2(org.utilization), asiri_yuklu_kisi: org.overAllocatedPeople,
                bolumler: org.departments.map(row),
            };
        },
    },
    {
        label: 'Kapasite-talep analizi',
        spec: {
            name: 'kapasite_talep',
            description: 'Bölüm × rol bazında planlanan proje talebi, mevcut işgücü kapasitesi, teklif aşamasındaki ihtiyaç ve personel açığı (AA). İşe alım ihtiyacı soruları için.',
            parameters: S.obj({ yil: P.year, bolum: P.dept, sadece_acik: S.bool('Yalnızca açığı olan rolleri getir (varsayılan true).') }),
        },
        run: (a, ctx) => {
            const year = resolveYear(ctx, a.yil);
            const dept = resolveDepartmentCode(ctx, a.bolum);
            let rows = buildRoleAnalysis(ctx.ws.allocations, ctx.ws.people, ctx.ws.projects, year, ctx.ws.leaves || []);
            if (dept) rows = rows.filter(r => r.departmentCode === dept);
            const gaps = summarizeGaps(rows);
            // Rolü girilmemiş tahsis satırlarının talebi hiçbir rol kapasitesiyle eşleşmez → açık şişer
            const demand = rows.reduce((s, r) => s + r.totals.planned + r.totals.proposal, 0);
            const unassigned = rows.filter(r => r.role === UNASSIGNED_ROLE).reduce((s, r) => s + r.totals.planned + r.totals.proposal, 0);
            // Rolsüz satırın talebi kişinin rolüne yazılır (B-025); ne kadarının tahminle yazıldığı söylenir
            const byId = new Map(ctx.ws.people.map(p => [p.id, p]));
            const inferredAA = ctx.ws.allocations
                .filter(x => x.year === year && !(x.role || '').trim() && (!dept || byId.get(x.personId)?.departmentCode === dept) && inferAllocationRole(ctx.ws.allocations, byId.get(x.personId), x.projectId))
                .reduce((s, x) => s + Object.values(x.plan).reduce((t: number, v) => t + (Number(v) || 0), 0), 0);
            if (a.sadece_acik !== false) rows = rows.filter(r => r.totals.gap > 0);
            return {
                yil: year, bolum: dept, acigi_olan_rol: gaps.rolesWithGap, toplam_acik_aa: gaps.totalGapAA,
                ...(unassigned > 0 ? {
                    uyari: `Planlı talebin %${Math.round((unassigned / demand) * 100)}'i (${r2(unassigned)} AA) rolü girilmemiş tahsis satırlarında; bu talep hiçbir rolün kapasitesiyle eşleşmediği için "${UNASSIGNED_ROLE}" satırında açık görünür. İşe alım kararından önce Tahsis Tablosu'nda satırlara rol girilmeli.`,
                } : {}),
                ...(inferredAA > 0 ? { not: `Rolü girilmemiş tahsis satırlarındaki ${r2(inferredAA)} AA, kişinin projedeki ya da en sık rolüne yazıldı. Kesin analiz için Tahsis Tablosu'nda rol girilmesi önerilir.` } : {}),
                satirlar: rows.sort((x, y) => y.totals.gap - x.totals.gap).slice(0, 30).map(r => ({
                    bolum: r.departmentCode, rol: r.role, planli_proje_aa: r2(r.totals.planned), kapasite_aa: r2(r.totals.capacity),
                    teklif_ihtiyaci_aa: r2(r.totals.proposal), acik_aa: r2(r.totals.gap),
                })),
            };
        },
    },
    {
        label: 'Tahsis özeti',
        spec: {
            name: 'tahsis_ozeti',
            description: `İşgücü tahsisi (adam-ay). Proje verilmezse proje bazında yıllık/aylık toplamlar; proje verilirse o projedeki kişi bazında plan ve gerçekleşen, plan kilidi durumu. ${MONTH_NOTE}`,
            parameters: S.obj({ yil: P.year, proje: S.str('Proje adı ya da kodu (isteğe bağlı).'), alan: P.field }),
        },
        run: (a, ctx) => {
            const year = resolveYear(ctx, a.yil);
            if (str(a.proje)) {
                const p = resolveProject(ctx, a.proje, { anyProject: true });
                const allocs = ctx.ws.allocations.filter(x => x.projectId === p.id && x.year === year);
                const wpNames = new Map(p.workPackages.map(w => [w.id, w.name]));
                const tot = (m: Record<number, number>) => r2(MONTH_INDEXES.reduce((s, k) => s + (m[k] || 0), 0));
                return {
                    proje: p.name, yil: year, plan_kilidi: LOCK_TR[getPlanLockStatus(ctx.ws.planLocks, p.id, year)],
                    plan_toplam_aa: r2(allocs.reduce((s, x) => s + (tot(x.plan) || 0), 0)),
                    gerceklesen_toplam_aa: r2(allocs.reduce((s, x) => s + (tot(x.actual) || 0), 0)),
                    satirlar: allocs.slice(0, 60).map(x => {
                        const person = ctx.ws.people.find(pp => pp.id === x.personId);
                        return {
                            kisi: person ? personName(person) : 'Havuzda olmayan kişi', bolum: person?.departmentCode, rol: x.role,
                            is_paketi: x.workPackageId ? wpNames.get(x.workPackageId) : undefined,
                            plan_aa: tot(x.plan), gerceklesen_aa: tot(x.actual),
                            aylik_plan: MONTH_INDEXES.map(m => r2(x.plan[m] || 0)), aylik_gerceklesen: MONTH_INDEXES.map(m => r2(x.actual[m] || 0)),
                        };
                    }),
                };
            }
            const field = effortField(a.alan);
            const names = new Map(ctx.ws.projects.map(p => [p.id, p.name]));
            const rows = summarizeByProject(ctx.ws.allocations, names, year, field);
            const monthly = MONTH_INDEXES.map((_, i) => r2(rows.reduce((s, r) => s + r.months[i], 0)));
            return {
                yil: year, alan: field, toplam_aa: r2(rows.reduce((s, r) => s + r.total, 0)), aylik_toplam: monthly,
                projeler: rows.sort((x, y) => y.total - x.total).slice(0, 40).map(r => ({ proje: r.label, toplam_aa: r2(r.total), aylik: months12(r.months) })),
            };
        },
    },
    {
        label: 'İş yükü öngörüsü',
        spec: {
            name: 'is_yuku_ongorusu',
            description: 'Gerçekleşenden yıl sonu öngörüsü (EAC), plana göre sapma ve tahmini maliyet; proje/kişi/bölüm kırılımı.',
            parameters: S.obj({
                yil: P.year,
                yontem: S.str('movingAvg=Hareketli ortalama (varsayılan), linear=Doğrusal trend, naive=Son ay, plan=Plana göre.', ['movingAvg', 'linear', 'naive', 'plan']),
                boyut: S.str('Kırılım boyutu (varsayılan project).', ['project', 'person', 'department']),
                pencere: S.int('Hareketli ortalama penceresi (ay, varsayılan 3).'),
                limit: P.limit,
            }),
        },
        run: (a, ctx) => {
            const year = resolveYear(ctx, a.yil);
            const method = (['movingAvg', 'linear', 'naive', 'plan'].includes(str(a.yontem)) ? str(a.yontem) : 'movingAvg') as ForecastMethod;
            const dim = (['project', 'person', 'department'].includes(str(a.boyut)) ? str(a.boyut) : 'project') as ForecastDim;
            const f = buildForecast(ctx.ws, { year, method, window: Number(a.pencere) || 3, dim });
            const row = (r: typeof f.total) => ({
                etiket: r.label, alt_etiket: r.sublabel, gerceklesen_ytd_aa: r2(r.ytd), kalan_ongoru_aa: r2(r.remaining), yil_sonu_tahmini_aa: r2(r.eac),
                plan_aa: r2(r.planTotal), sapma_aa: r2(r.variance), tahmini_maliyet_tl: r.costable ? Math.round(r.costEac) : undefined,
            });
            return {
                yil: year, yontem: FORECAST_METHOD_LABELS[method], boyut: FORECAST_DIM_LABELS[dim],
                son_gerceklesen_ay: f.cutoffMonth,
                not: f.cutoffMonth === 0 ? 'Bu yıl için gerçekleşen veri yok; öngörü plana dayanır.' : undefined,
                toplam: row(f.total),
                aylik_seri: f.total.months.map((m, i) => ({ ay: i + 1, deger: r2(m.forecast), ongoru: m.isForecast, plan: r2(m.plan) })),
                kirilim: f.rows.slice(0, clampLimit(a.limit, 15)).map(row),
                maliyetlenemeyen_aa: r2(f.uncostedEacAA),
            };
        },
    },
    {
        label: 'EVM analizi',
        spec: {
            name: 'evm_analizi',
            description: 'Kazanılmış değer yönetimi (TL): BAC, PV, EV, AC, SPI (<1 takvim gerisi), CPI (<1 bütçe aşımı), EAC, VAC. Proje verilirse tek proje, yoksa görünür portföy.',
            parameters: S.obj({ yil: P.year, proje: S.str('Proje adı ya da kodu (isteğe bağlı).') }),
        },
        run: (a, ctx) => {
            const year = resolveYear(ctx, a.yil);
            const statusMonth = closedStatusMonth(ctx.ws, year, ctx.now);
            if (str(a.proje)) {
                const p = resolveProject(ctx, a.proje);
                const e = buildProjectEVM(ctx.scoped, p.id, year, statusMonth);
                if (!e) throw new ToolError('EVM hesaplanamadı.');
                const est = inMonthEstimates(ctx.ws, p.id, ctx.now);
                return { yil: year, ...evmRow(e), ...(est.length ? { ay_ici_tahmin: est.map(inMonthRow), ay_ici_not: IN_MONTH_NOTE } : {}) };
            }
            const pf = buildPortfolioEVM(ctx.scoped, year, [...ctx.visibleProjectIds], statusMonth);
            return {
                yil: year, durum_ayi: pf.statusMonth, bac: Math.round(pf.bac), pv: Math.round(pf.pv), ev: Math.round(pf.ev), ac: Math.round(pf.ac),
                spi: r2(pf.spi), cpi: r2(pf.cpi), eac: Math.round(pf.eac), vac: Math.round(pf.vac),
                maliyetli_unvan_sayisi: pf.costedTitleCount,
                projeler: pf.projects.filter(e => e.costed).slice(0, 30).map(e => {
                    const est = inMonthEstimates(ctx.ws, e.projectId, ctx.now);
                    return { ...evmRow(e), ...(est.length ? { ay_ici_tahmin: est.map(inMonthRow) } : {}) };
                }),
                ay_ici_not: IN_MONTH_NOTE,
            };
        },
    },
    {
        label: 'Maliyet raporu',
        spec: {
            name: 'maliyet_raporu',
            description: 'Tahsis × ünvan maliyetinden (TL) yıllık plan, gerçekleşen ve sapma: toplam, aylık, proje ve bölüm bazında; maliyetlenemeyen kişi sayısı.',
            parameters: S.obj({ yil: P.year, proje: S.str('Proje adı ya da kodu (isteğe bağlı).') }),
        },
        run: (a, ctx) => {
            const year = resolveYear(ctx, a.yil);
            const c = buildCostReport(ctx.ws, year);
            const row = (r: typeof c.byProject[number]) => ({ ad: r.label, plan_tl: r.planCost, donem_plan_tl: r.periodPlanCost, gerceklesen_tl: r.actualCost, sapma_tl: r.varianceCost });
            const donem = costPeriodLabel(c.periodEndMonth);
            if (str(a.proje)) {
                const p = resolveProject(ctx, a.proje, { anyProject: true });
                const r = c.byProject.find(x => x.key === p.id);
                return r ? { yil: year, proje: p.name, sapma_donemi: donem, ...row(r) } : { yil: year, proje: p.name, not: 'Bu proje için maliyetlenebilir tahsis yok.' };
            }
            return {
                yil: year, sapma_donemi: donem, plan_tl: c.totalPlanCost, donem_plan_tl: c.totalPeriodPlanCost, gerceklesen_tl: c.totalActualCost, sapma_tl: c.totalVarianceCost,
                aylik_plan_tl: c.monthlyPlanCost, aylik_gerceklesen_tl: c.monthlyActualCost,
                projeler: c.byProject.slice(0, 30).map(row), bolumler: c.byDepartment.map(row),
                maliyetlenemeyen_kisi_sayisi: c.uncostedPeople.length, maliyetli_unvan_sayisi: c.costedTitleCount,
            };
        },
    },
    {
        label: 'Veri sağlığı',
        permission: 'app.dataHealth',
        spec: {
            name: 'veri_sagligi',
            description: 'Veri kalitesi denetimi: yetim tahsis, eşleşmeyen görev ataması/risk sahibi, mükerrer personel, bölümü veya ünvan maliyeti eksik kayıt, sahipsiz proje.',
            parameters: S.obj({ limit: P.limit }),
        },
        run: (a, ctx) => {
            const h = analyzeDataHealth(ctx.ws);
            return {
                sayilar: { hata: h.counts.error, uyari: h.counts.warn, bilgi: h.counts.info, toplam: h.counts.total },
                kategoriler: Object.entries(h.byCategory).filter(([, n]) => n > 0).map(([k, n]) => ({ kategori: CATEGORY_LABELS[k as keyof typeof CATEGORY_LABELS] || k, adet: n })),
                sorunlar: h.issues.slice(0, clampLimit(a.limit, 20)).map(i => ({
                    onem: i.severity, kategori: CATEGORY_LABELS[i.category], baslik: maskSicil(i.title, ctx.ws.people), detay: maskSicil(i.detail, ctx.ws.people), duzeltme: i.fixLabel,
                })),
            };
        },
    },
    {
        label: 'Son değişiklikler',
        permission: 'app.audit',
        spec: {
            name: 'son_degisiklikler',
            description: 'Denetim günlüğünden son değişiklikler (proje oluşturma/silme, RAG değişimi, plan onay/red/kilit, risk ekleme/kapatma, veri içe aktarma…): kim, ne zaman, ne yaptı.',
            parameters: S.obj({ gun: S.int('Kaç gün geriye bakılsın (varsayılan 7).'), limit: P.limit }),
        },
        run: (a, ctx) => {
            const days = Number(a.gun) > 0 ? Math.min(Number(a.gun), 365) : 7;
            const list = recentChanges(ctx.scoped, ctx.now, days);
            return {
                gun: days, adet: list.length,
                degisiklikler: list.slice(0, clampLimit(a.limit, 25)).map(e => ({
                    zaman: e.at.slice(0, 16).replace('T', ' '), kim: e.actorName || ROLE_LABELS[e.actorRole], rol: ROLE_LABELS[e.actorRole],
                    islem: AUDIT_ACTION_LABELS[e.action] || e.action, ozet: maskSicil(e.summary, ctx.ws.people), proje: e.projectName,
                })),
            };
        },
    },
    {
        label: 'Not arama',
        privateOnly: true,
        spec: {
            name: 'notlari_ara',
            description: 'Proje yöneticisinin haftalık notlarında (Günlük) arama: içerik, tarih/hafta, etiketler. Proje verilmezse görünür tüm projeler; en yeni önce.',
            parameters: S.obj({
                proje: S.str('Proje adı ya da kodu (isteğe bağlı).'),
                metin: S.str('Notta geçen metin ya da etiket (isteğe bağlı).'),
                son_hafta: S.int('Yalnızca son N haftanın notları.'),
                limit: P.limit,
            }),
        },
        run: (a, ctx) => {
            if (!ctx.canSeePrivate) throw new ToolError('Bu rol proje notlarına erişemez.');
            const projects = str(a.proje) ? [resolveProject(ctx, a.proje)] : ctx.scoped.projects;
            const metin = norm(str(a.metin));
            const since = Number(a.son_hafta) > 0 ? new Date(ctx.now.getTime() - Number(a.son_hafta) * 7 * 86400000).toISOString() : '';
            const notes = projects.flatMap(p => p.notes.map(n => ({ p, n })))
                .filter(({ n }) => !since || n.createdAt >= since)
                .filter(({ n }) => !metin || norm(`${n.content} ${(n.tags || []).join(' ')}`).includes(metin))
                .sort((x, y) => y.n.createdAt.localeCompare(x.n.createdAt));
            return {
                eslesen: notes.length,
                notlar: notes.slice(0, clampLimit(a.limit, 15)).map(({ p, n }) => ({
                    proje: p.name, tarih: n.createdAt.slice(0, 10), hafta: `${n.year}-H${n.weekNumber}`, etiketler: n.tags?.length ? n.tags : undefined,
                    icerik: short(n.content, 600),
                })),
            };
        },
    },
    {
        label: 'Müşteri istekleri',
        privateOnly: true,
        spec: {
            name: 'musteri_istekleri',
            description: 'Projelere gelen müşteri istekleri: başlık, açıklama, müşteri, durum (New=yeni, Converted=göreve dönüştü, Rejected=reddedildi).',
            parameters: S.obj({
                proje: S.str('Proje adı ya da kodu (isteğe bağlı).'),
                durum: S.str('Durum filtresi.', ['New', 'Converted', 'Rejected']),
                limit: P.limit,
            }),
        },
        run: (a, ctx) => {
            if (!ctx.canSeePrivate) throw new ToolError('Bu rol müşteri isteklerine erişemez.');
            const projects = str(a.proje) ? [resolveProject(ctx, a.proje)] : ctx.scoped.projects;
            const list = projects.flatMap(p => p.customerRequests.map(r => ({ p, r })))
                .filter(({ r }) => !str(a.durum) || r.status === a.durum)
                .sort((x, y) => y.r.createdAt.localeCompare(x.r.createdAt));
            return {
                eslesen: list.length,
                istekler: list.slice(0, clampLimit(a.limit, 20)).map(({ p, r }) => ({
                    proje: p.name, baslik: r.title, musteri: r.customerName, durum: r.status, tarih: r.createdAt.slice(0, 10), aciklama: short(r.description, 300),
                })),
            };
        },
    },
    {
        label: 'Durum raporu taslağı',
        spec: {
            name: 'durum_raporu_taslagi',
            description: 'Projenin haftalık durum raporu taslağı (ilerleme, geciken/yaklaşan işler, RAG, tahsis, riskler, notlar); rapor/e-posta yazımının temeli.',
            parameters: S.obj({ proje: P.project }),
        },
        run: (a, ctx) => {
            const p = resolveProject(ctx, a.proje);
            const rep = buildStatusReport(ctx.scoped, p.id, ctx.now);
            if (!rep) throw new ToolError('Durum raporu üretilemedi.');
            return { proje: rep.projectName, hafta: `${rep.year}-H${rep.week}`, icerik_var: rep.hasContent, taslak: maskSicil(rep.text, ctx.ws.people) };
        },
    },
];


// ---------------------------------------------------------------------------
// Değişiklik ÖNERİ araçları — hiçbir şeyi değiştirmez; kullanıcı onayına
// sunulacak bir öneri kartı üretir (bkz. utils/ai/actions.ts)
// ---------------------------------------------------------------------------

const PENDING_NOTE = 'Öneri hazırlandı; kullanıcı sohbetteki karttan "Uygula" derse uygulanacak. Değişikliği yaptığını SÖYLEME; kullanıcıdan kartı onaylamasını iste.';

const propose = (ctx: ToolContext, action: AiAction, checkWs: WorkspaceData = ctx.ws) => {
    const err = validateAction(checkWs, action);
    if (err) throw new ToolError(err);
    const d = describeAction(ctx.ws, action);
    const proposal: AiProposal = { id: `oneri-${Date.now().toString(36)}-${ctx.proposals.length + 1}`, action, title: d.title, details: d.details, status: 'pending' };
    ctx.proposals.push(proposal);
    return { oneri_no: ctx.proposals.length, ozet: d.title, ayrintilar: d.details, durum: PENDING_NOTE };
};

const level = (v: unknown, name: string): 1 | 2 | 3 | 4 | 5 => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new ToolError(`${name} 1-5 arasında bir tam sayı olmalı.`);
    return n as 1 | 2 | 3 | 4 | 5;
};

const days = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
};

const PROPOSAL_TOOLS: ToolDef[] = [
    {
        label: 'Risk önerisi',
        writeOnly: true,
        spec: {
            name: 'oner_risk_ekle',
            description: 'Projeye yeni risk eklemeyi ÖNERİR (onaysız uygulanmaz). Kullanıcı açıkça risk eklemek istediğinde ya da notlardan/gecikmelerden net bir risk çıkardığında kullan.',
            parameters: S.obj({
                proje: P.project,
                baslik: S.str('Risk başlığı (kısa, net).'),
                aciklama: S.str('Riskin açıklaması.'),
                olasilik: S.int('Olasılık 1-5.'),
                etki: S.int('Etki 1-5.'),
                aksiyon: S.str('Azaltıcı aksiyon.'),
                sahip: S.str('Risk sahibi kişinin adı soyadı (veri havuzundan).'),
            }, ['baslik', 'olasilik', 'etki']),
        },
        run: (a, ctx) => {
            const project = resolveProject(ctx, a.proje);
            const owner = str(a.sahip) ? resolvePerson(ctx, a.sahip) : undefined;
            return propose(ctx, {
                type: 'risk_ekle', projectId: project.id, title: str(a.baslik), description: str(a.aciklama) || undefined,
                probability: level(a.olasilik, 'Olasılık'), impact: level(a.etki, 'Etki'), mitigation: str(a.aksiyon) || undefined, ownerPersonId: owner?.id,
            });
        },
    },
    {
        label: 'Görev önerisi',
        writeOnly: true,
        spec: {
            name: 'oner_gorev_ekle',
            description: 'Projeye yeni görev eklemeyi ÖNERİR (onaysız uygulanmaz).',
            parameters: S.obj({
                proje: P.project,
                ad: S.str('Görev adı.'),
                oncelik: S.str('Öncelik (varsayılan Medium).', ['Blocker', 'High', 'Medium', 'Low']),
                atanan: S.str('Ad soyad'),
                bitis: S.str('YYYY-AA-GG'),
                sure_iyimser: S.num('İyimser süre (gün).'),
                sure_ortalama: S.num('Ortalama süre (gün).'),
                sure_kotumser: S.num('Kötümser süre (gün).'),
                aciklama: S.str('Açıklama'),
                tur: S.str('', ['bug', 'feature', 'improvement', 'task', 'other']),
                etiketler: S.str('virgülle'),
            }, ['ad']),
        },
        run: (a, ctx) => {
            const project = resolveProject(ctx, a.proje);
            const person = str(a.atanan) ? resolvePerson(ctx, a.atanan) : undefined;
            const pr = str(a.oncelik);
            const hasTime = [a.sure_iyimser, a.sure_ortalama, a.sure_kotumser].some(v => v !== undefined && v !== null && v !== '');
            return propose(ctx, {
                type: 'gorev_ekle', projectId: project.id, name: str(a.ad),
                priority: (['Blocker', 'High', 'Medium', 'Low'].includes(pr) ? pr : 'Medium') as Task['priority'],
                resourceName: person ? personName(person) : undefined,
                dueDate: str(a.bitis) || undefined,
                time: hasTime ? { best: days(a.sure_iyimser), avg: days(a.sure_ortalama), worst: days(a.sure_kotumser) } : undefined,
                notes: str(a.aciklama) || undefined,
                ...(['bug', 'feature', 'improvement', 'task', 'other'].includes(str(a.tur)) ? { issueType: str(a.tur) as IssueType } : {}),
                ...(str(a.etiketler) ? { labels: str(a.etiketler).split(',').map(x => x.trim()).filter(Boolean) } : {}),
            });
        },
    },
    {
        label: 'Görev durumu önerisi',
        writeOnly: true,
        spec: {
            name: 'oner_gorev_durumu',
            description: 'Görev durumunu değiştirmeyi ÖNERİR (onaysız uygulanmaz). İş akışı kuralları uygulanır; kural not/süre isterse gecis_notu/harcanan_saat ver.',
            parameters: S.obj({
                proje: P.project,
                gorev: S.str('Ad ya da Jira anahtarı'),
                is_durumu: S.str('Hedef durum (ör. Testte)'),
                durum: S.str('ya da kategori', ['Backlog', 'ToDo', 'InProgress', 'Done']),
                gecis_notu: S.str(''),
                harcanan_saat: S.num(''),
            }, ['gorev']),
        },
        run: (a, ctx) => {
            const project = resolveProject(ctx, a.proje);
            const key = str(a.is_durumu);
            let status = str(a.durum) as TaskStatus;
            if (!key && !Object.values(TaskStatus).includes(status)) throw new ToolError('is_durumu ya da durum (Backlog, ToDo, InProgress, Done) gerekli.');
            const hits = matchByText(project.tasks, str(a.gorev), t => [t.name, t.jiraId]);
            if (hits.length === 0) throw new ToolError(`"${str(a.gorev)}" adlı görev ${project.name} projesinde bulunamadı.`);
            if (hits.length > 1) throw new ToolError(`"${str(a.gorev)}" birden fazla görevle eşleşti: ${hits.slice(0, 8).map(t => t.name).join(', ')}.`);
            if (key) {
                const s = knownWorkflow(key, effectiveScheme(ctx.ws, project).workflow);
                if (s) status = s.category;
                else status = status && Object.values(TaskStatus).includes(status) ? status : hits[0].status;
            }
            const hours = Number(a.harcanan_saat);
            return propose(ctx, {
                type: 'gorev_durumu', projectId: project.id, taskId: hits[0].id, status, ...(key ? { workflowKey: key } : {}),
                ...(str(a.gecis_notu) ? { comment: str(a.gecis_notu) } : {}), ...(Number.isFinite(hours) && hours > 0 ? { hours } : {}),
            });
        },
    },
    {
        label: 'Görev güncelleme önerisi',
        writeOnly: true,
        spec: {
            name: 'oner_gorev_guncelle',
            description: 'Görevlerin termin, atanan, öncelik, süre ya da etiketini güncellemeyi ÖNERİR (onaysız uygulanmaz). Tüm görevler TEK çağrıda; yalnız değişen alanlar.',
            parameters: S.obj({
                proje: P.project,
                gorevler: {
                    type: 'array',
                    items: S.obj({
                        gorev: S.str('Ad ya da Jira anahtarı'),
                        bitis: S.str('YYYY-AA-GG ya da yok'),
                        kaydir_gun: S.int('± gün'),
                        atanan: S.str('Ad soyad ya da yok'),
                        oncelik: S.str('', ['Blocker', 'High', 'Medium', 'Low']),
                        sure: S.num('Olası gün'),
                        etiket_ekle: S.str(''),
                        etiket_cikar: S.str(''),
                    }, ['gorev']),
                },
            }, ['gorevler']),
        },
        run: (a, ctx) => {
            const project = resolveProject(ctx, a.proje);
            const csv = (v: unknown) => str(v).split(',').map(x => x.trim()).filter(Boolean);
            const { ok, skipped } = eachRow(rowsArg(a.gorevler, 'gorevler'), r => {
                const hits = matchByText(project.tasks, str(r.gorev), t => [t.name, t.jiraId]);
                if (!hits.length) throw new ToolError(`"${str(r.gorev)}" ${project.name} projesinde yok.`);
                if (hits.length > 1) throw new ToolError(`"${str(r.gorev)}" birden çok görevle eşleşti: ${hits.slice(0, 5).map(t => t.name).join(', ')}.`);
                const t = hits[0];
                const c: TaskFieldChange = { taskId: t.id };
                const due = str(r.bitis);
                if (due) c.dueDate = /^(yok|sil|-)$/i.test(due) ? '' : due;
                const shift = Number(r.kaydir_gun);
                if (r.kaydir_gun !== undefined && r.kaydir_gun !== null && r.kaydir_gun !== '' && Number.isFinite(shift) && shift !== 0) {
                    if (!t.dueDate) throw new ToolError(`${t.name}: termini yok, kaydırılamaz (bitis verin).`);
                    const d = new Date(`${t.dueDate}T00:00:00Z`);
                    d.setUTCDate(d.getUTCDate() + Math.round(shift));
                    c.dueDate = d.toISOString().slice(0, 10);
                }
                const who = str(r.atanan);
                if (who) c.resourceName = /^(yok|kimse|-)$/i.test(who) ? '' : personName(resolvePerson(ctx, who));
                if (str(r.oncelik)) c.priority = str(r.oncelik) as Task['priority'];
                const avg = Number(r.sure);
                if (r.sure !== undefined && r.sure !== null && r.sure !== '' && Number.isFinite(avg) && avg >= 0) {
                    // Yalnız olası süre verildi: iyimser/kötümser mevcut oranla ölçeklenir, yoksa ±%30
                    const base = t.time.avg > 0 ? t.time : { best: avg * 0.7, avg, worst: avg * 1.3 };
                    const k = t.time.avg > 0 ? avg / t.time.avg : 1;
                    c.time = { best: days(base.best * k), avg: days(avg), worst: days(base.worst * k) };
                }
                if (csv(r.etiket_ekle).length) c.addLabels = csv(r.etiket_ekle);
                if (csv(r.etiket_cikar).length) c.removeLabels = csv(r.etiket_cikar);
                if (Object.keys(c).length === 1) throw new ToolError(`${t.name}: değişecek alan verilmedi.`);
                return c;
            });
            return withSkipped(propose(ctx, { type: 'gorev_guncelle', projectId: project.id, changes: ok }), skipped);
        },
    },
    {
        label: 'Görev silme önerisi',
        writeOnly: true,
        spec: {
            name: 'oner_gorev_sil',
            description: 'Görev silmeyi ÖNERİR (onaysız silinmez). Yalnız açık istekte; tümü TEK çağrıda.',
            parameters: S.obj({
                proje: P.project,
                gorevler: { type: 'array', items: S.str('Ad/anahtar') },
                gerekce: S.str(''),
            }, ['gorevler']),
        },
        run: (a, ctx) => {
            const project = resolveProject(ctx, a.proje);
            const { ok, skipped } = eachRow(listArg(a.gorevler).map(g => ({ gorev: String(g ?? "") })), r => {
                const hits = matchByText(project.tasks, str(r.gorev), t => [t.name, t.jiraId]);
                if (!hits.length) throw new ToolError(`"${str(r.gorev)}" ${project.name} projesinde yok.`);
                if (hits.length > 1) throw new ToolError(`"${str(r.gorev)}" birden çok görevle eşleşti: ${hits.slice(0, 5).map(t => t.jiraId || t.name).join(', ')}; Jira anahtarıyla belirtin.`);
                return hits[0].id;
            });
            if (!ok.length) throw new ToolError(`Silinecek görev bulunamadı: ${skipped.join(' ')}`);
            return withSkipped(propose(ctx, { type: 'gorev_sil', projectId: project.id, taskIds: [...new Set(ok)], reason: str(a.gerekce) || undefined }), skipped);
        },
    },
    {
        label: 'RAG önerisi',
        writeOnly: true,
        spec: {
            name: 'oner_rag_guncelle',
            description: 'Projenin haftalık RAG durumunu (ve durum notunu) güncellemeyi ÖNERİR (kullanıcı onaylamadan uygulanmaz).',
            parameters: S.obj({
                proje: P.project,
                rag: S.str('green=Yolunda, amber=Riskli, red=Kritik.', ['green', 'amber', 'red']),
                not: S.str('Haftalık durum notu (isteğe bağlı).'),
            }, ['rag']),
        },
        run: (a, ctx) => {
            const project = resolveProject(ctx, a.proje);
            const rag = str(a.rag) as RagStatus;
            if (!['green', 'amber', 'red'].includes(rag)) throw new ToolError('rag green, amber ya da red olmalı.');
            return propose(ctx, { type: 'rag_guncelle', projectId: project.id, rag, ragNote: str(a.not) || undefined });
        },
    },
    {
        label: 'Risk güncelleme önerisi',
        writeOnly: true,
        spec: {
            name: 'oner_risk_guncelle',
            description: 'Var olan riski güncellemeyi ya da kapatmayı ÖNERİR (onaysız uygulanmaz). Aynı riski yeniden ekleme; bunu kullan.',
            parameters: S.obj({
                proje: P.project,
                risk: S.str('Risk başlığı (kısmi).'),
                durum: S.str('', ['open', 'monitoring', 'closed']),
                olasilik: S.int('1-5'),
                etki: S.int('1-5'),
                aksiyon: S.str('Azaltıcı aksiyon'),
                sahip: S.str('Ad soyad'),
                gerekce: S.str('Denetim kaydına yazılır'),
            }, ['risk']),
        },
        run: (a, ctx) => {
            const project = resolveProject(ctx, a.proje);
            const hits = matchByText(project.risks || [], str(a.risk), r => [r.title]);
            if (hits.length === 0) throw new ToolError(`"${str(a.risk)}" adlı risk ${project.name} projesinde bulunamadı.`);
            if (hits.length > 1) throw new ToolError(`"${str(a.risk)}" birden fazla riskle eşleşti: ${hits.slice(0, 8).map(r => r.title).join(', ')}.`);
            const status = str(a.durum);
            if (status && !['open', 'monitoring', 'closed'].includes(status)) throw new ToolError('durum open, monitoring ya da closed olmalı.');
            const given = (v: unknown) => v !== undefined && v !== null && v !== '';
            const owner = str(a.sahip) ? resolvePerson(ctx, a.sahip) : undefined;
            return propose(ctx, {
                type: 'risk_guncelle', projectId: project.id, riskId: hits[0].id,
                ...(status ? { status: status as RiskStatus } : {}),
                ...(given(a.olasilik) ? { probability: level(a.olasilik, 'Olasılık') } : {}),
                ...(given(a.etki) ? { impact: level(a.etki, 'Etki') } : {}),
                ...(a.aksiyon !== undefined ? { mitigation: str(a.aksiyon) } : {}),
                ...(owner ? { ownerPersonId: owner.id } : {}),
                ...(str(a.gerekce) ? { reason: str(a.gerekce) } : {}),
            });
        },
    },
    {
        label: 'Müşteri isteği kararı önerisi',
        writeOnly: true,
        privateOnly: true,
        spec: {
            name: 'oner_istek_karari',
            description: 'Yeni müşteri isteğini karara bağlamayı ÖNERİR (onaysız uygulanmaz). kabul: istekten görev açılır; ret: istek reddedilir. Gerekçe proje notuna yazılır.',
            parameters: S.obj({
                proje: P.project,
                istek: S.str('İstek başlığı (kısmi).'),
                karar: S.str('', ['kabul', 'ret']),
                gerekce: S.str('Kapsam, efor, takvim etkisi'),
                tarih: S.str('YYYY-AA-GG'),
                oncelik: S.str('Kabulde görev önceliği', ['Blocker', 'High', 'Medium', 'Low']),
                atanan: S.str('Ad soyad'),
                bitis: S.str('YYYY-AA-GG'),
                efor_gun: S.num('Tahmini efor (gün)'),
            }, ['istek', 'karar', 'gerekce']),
        },
        run: (a, ctx) => {
            const project = resolveProject(ctx, a.proje);
            const open = (project.customerRequests || []).filter(r => r.status === 'New');
            const hits = matchByText(open, str(a.istek), r => [r.title]);
            if (hits.length === 0) throw new ToolError(`"${str(a.istek)}" adlı karar bekleyen istek ${project.name} projesinde bulunamadı.`);
            if (hits.length > 1) throw new ToolError(`"${str(a.istek)}" birden fazla istekle eşleşti: ${hits.slice(0, 8).map(r => r.title).join(', ')}.`);
            const decision = str(a.karar);
            if (decision !== 'kabul' && decision !== 'ret') throw new ToolError('karar kabul ya da ret olmalı.');
            const person = str(a.atanan) ? resolvePerson(ctx, a.atanan) : undefined;
            const pr = str(a.oncelik);
            const effort = days(a.efor_gun);
            return propose(ctx, {
                type: 'istek_karari', projectId: project.id, requestId: hits[0].id, decision, reason: str(a.gerekce), day: str(a.tarih) || undefined,
                ...(decision === 'kabul' ? {
                    task: {
                        priority: (['Blocker', 'High', 'Medium', 'Low'].includes(pr) ? pr : 'Medium') as Task['priority'],
                        resourceName: person ? personName(person) : undefined,
                        dueDate: str(a.bitis) || undefined,
                        // Tek nokta tahmini: iyimser/kötümser bilinmiyor (görev formunda olduğu gibi 0)
                        time: effort > 0 ? { best: 0, avg: effort, worst: 0 } : undefined,
                    },
                } : {}),
            });
        },
    },
    {
        label: 'Not önerisi',
        writeOnly: true,
        privateOnly: true,
        spec: {
            name: 'oner_not_ekle',
            description: 'Proje notu (Günlük) eklemeyi ÖNERİR (onaysız uygulanmaz): karar, aksiyon. #etiket, @kişi, [ ] yapılacak.',
            parameters: S.obj({
                proje: P.project,
                metin: S.str(''),
                tarih: S.str('YYYY-AA-GG'),
            }, ['metin']),
        },
        run: (a, ctx) => {
            const project = resolveProject(ctx, a.proje);
            return propose(ctx, { type: 'not_ekle', projectId: project.id, content: str(a.metin), day: str(a.tarih) || undefined });
        },
    },
    {
        label: 'Tahsis önerisi',
        writeOnly: true,
        spec: {
            name: 'oner_tahsis_ayarla',
            description: 'Kişinin projedeki plan/gerçekleşen tahsisini bir ay ya da ay aralığı için ÖNERİR (onaysız uygulanmaz). Aralık yıl geçebilir; her aya aynı değer. Plan kilitliyse yalnız gerçekleşen.',
            parameters: S.obj({
                kisi: S.str('Ad soyad.'),
                proje: S.str('Proje adı/kodu.'),
                baslangic: S.str('İlk ay YYYY-AA.'),
                bitis: S.str('Son ay YYYY-AA; tek ayda boş.'),
                yuzde: S.num('Aylık % (0-150).'),
                aa: S.num('Ya da aylık adam-ay (0-1,5).'),
                alan: P.field,
                yil: S.int('Eski biçim: yıl.'),
                ay: S.int('Eski biçim: ay 1-12.'),
            }, ['kisi', 'proje']),
        },
        run: (a, ctx) => {
            const person = resolvePerson(ctx, a.kisi);
            const project = resolveProject(ctx, a.proje, { anyProject: true });
            const hasPct = a.yuzde !== undefined && a.yuzde !== null && a.yuzde !== '';
            const value = hasPct ? Number(a.yuzde) / 100 : Number(a.aa);
            if (!Number.isFinite(value)) throw new ToolError('yuzde ya da aa sayısal olmalı.');
            // Eski çağrılar: yil + ay (1-12)
            const ym = (v: unknown) => {
                const t = typeof v === 'number' ? String(v) : str(v);
                if (/^\d{4}-\d{1,2}$/.test(t)) { const [y, m] = t.split('-'); return `${y}-${m.padStart(2, '0')}`; }
                if (/^\d{1,2}$/.test(t)) return `${resolveYear(ctx, a.yil)}-${t.padStart(2, '0')}`;
                return '';
            };
            const from = ym(a.baslangic) || ym(a.ay);
            const to = ym(a.bitis) || from;
            if (!from) throw new ToolError('baslangic YYYY-AA biçiminde olmalı (ör. 2026-12).');
            const v = Math.round(value * 100) / 100;
            if (from === to) {
                const [y, m] = from.split('-').map(Number);
                return propose(ctx, { type: 'tahsis_ayarla', personId: person.id, projectId: project.id, year: y, month: m, field: effortField(a.alan), value: v });
            }
            return propose(ctx, { type: 'tahsis_araligi', personId: person.id, projectId: project.id, from, to, field: effortField(a.alan), value: v });
        },
    },
    {
        label: 'Jira eşitleme önerisi',
        writeOnly: true,
        requires: 'jira',
        spec: {
            name: 'oner_jira_esitle',
            description: 'Projeyi Jira ile eşitlemeyi ÖNERİR (onaysız çalışmaz); proje ayarındaki alan seçimiyle.',
            parameters: S.obj({ proje: P.project }),
        },
        run: (a, ctx) => propose(ctx, { type: 'jira_esitle', projectId: resolveProject(ctx, a.proje).id }),
    },
];

// ---------------------------------------------------------------------------
// Ajan araçları — arayüzü yönetir (ekran değiştirir, kayıt açar). Veri
// DEĞİŞTİRMEZ; kullanıcının menüden yapabileceği gezinmenin aynısıdır.
// ---------------------------------------------------------------------------

const uiRun = (ctx: ToolContext, cmd: Parameters<NonNullable<ToolContext['ui']>['run']>[0]) => {
    if (!ctx.ui) throw new ToolError('Arayüz komutları bu oturumda kullanılamıyor.');
    const r = ctx.ui.run(cmd);
    if (!r.ok) throw new ToolError(r.message);
    // Aynı turda sonraki araçlar yeni açık projeyi varsayılan alsın
    if ('projectId' in cmd && cmd.projectId) ctx.activeProjectId = cmd.projectId;
    return { tamam: true, sonuc: r.message };
};

const SCREEN_HELP = SCREEN_KEYS.map(k => `${k}=${SCREENS[k].label}${SCREENS[k].project ? ' (proje)' : ''}`).join('; ');

const AGENT_TOOLS: ToolDef[] = [
    {
        label: 'Ekran açıldı',
        requires: 'ui',
        spec: {
            name: 'ekrana_git',
            description: `Uygulamada ekran değiştirir (kullanıcının ekranı hemen değişir; veri değişmez). Kullanıcı bir ekranı "aç/göster/git/götür" dediğinde ya da yanıtı en iyi bir ekran gösterecekse kullan. "(proje)" ekranları bir proje gerektirir: proje verilirse önce o proje açılır, verilmezse açık proje kullanılır. Ekranlar: ${SCREEN_HELP}.`,
            parameters: S.obj({
                ekran: S.str('Açılacak ekran.', SCREEN_KEYS),
                proje: S.str('Proje adı ya da kodu (proje ekranlarında; isteğe bağlı).'),
            }, ['ekran']),
        },
        run: (a, ctx) => {
            const screen = str(a.ekran) as ScreenKey;
            if (!SCREENS[screen]) throw new ToolError(`Bilinmeyen ekran "${str(a.ekran)}". Geçerli: ${SCREEN_KEYS.join(', ')}.`);
            const project = str(a.proje) ? resolveProject(ctx, a.proje) : undefined;
            return uiRun(ctx, { type: 'screen', screen, ...(project ? { projectId: project.id } : {}) });
        },
    },
    {
        label: 'Görev açıldı',
        requires: 'ui',
        spec: {
            name: 'gorev_ac',
            description: 'Bir görevin ayrıntı penceresini açar (ilgili proje de açılır). Kullanıcı bir görevi görmek/açmak istediğinde kullan.',
            parameters: S.obj({
                proje: P.project,
                gorev: S.str('Görevin adı (kısmi olabilir) ya da Jira anahtarı.'),
            }, ['gorev']),
        },
        run: (a, ctx) => {
            const project = resolveProject(ctx, a.proje);
            const q = str(a.gorev);
            const hits = matchByText(project.tasks, q, t => [t.name, t.jiraId]);
            if (hits.length === 0) throw new ToolError(`"${q}" adlı görev ${project.name} projesinde bulunamadı.`);
            if (hits.length > 1) throw new ToolError(`"${q}" birden fazla görevle eşleşti: ${hits.slice(0, 8).map(t => t.name).join(', ')}.`);
            return uiRun(ctx, { type: 'task', projectId: project.id, taskId: hits[0].id });
        },
    },
    {
        label: 'Kişi profili açıldı',
        requires: 'ui',
        spec: {
            name: 'kisi_profili_ac',
            description: 'Bir kişinin profil penceresini (tahsisler, doluluk, projeler) açar.',
            parameters: S.obj({ kisi: S.str('Kişinin adı soyadı.') }, ['kisi']),
        },
        run: (a, ctx) => uiRun(ctx, { type: 'person', personId: resolvePerson(ctx, a.kisi).id }),
    },
    {
        label: 'Pencere açıldı',
        requires: 'ui',
        spec: {
            name: 'pencere_ac',
            description: `Uygulama penceresi açar: ${DIALOG_KEYS.map(k => `${k}=${DIALOGS[k]}`).join('; ')}.`,
            parameters: S.obj({ pencere: S.str('Açılacak pencere.', DIALOG_KEYS) }, ['pencere']),
        },
        run: (a, ctx) => {
            const dialog = str(a.pencere) as DialogKey;
            if (!DIALOGS[dialog]) throw new ToolError(`Bilinmeyen pencere "${str(a.pencere)}".`);
            return uiRun(ctx, { type: 'dialog', dialog });
        },
    },
    {
        label: 'Panoya çizildi',
        requires: 'whiteboard',
        spec: {
            name: 'panoya_ciz',
            description: 'Ekranda açık Whiteboard panosuna çizer: yapışkan not, metin, şekil, bölüm, ok, akış şeması, ekran taslağı (wireframe); seçili notları gruplar. Seçili bir ekran görüntüsü varsa görseli görür, istenen değişiklikleri görselin üstünde çerçeve ve numarayla işaretler, istenirse yanına yeni ekranın taslağını çizer. Kullanıcı panoya bir şey çizmeni, işaretlemeni, taslak çıkarmanı ya da notları düzenlemeni istediğinde kullan; isteği ayrıntılarıyla (kullanıcının sözleriyle) "istek" alanına yaz. Çizim hemen panoya eklenir; kullanıcı Ctrl+Z ile geri alabilir.',
            parameters: S.obj({
                istek: S.str('Çizim isteği: ne çizilecek, hangi değişiklikler işaretlenecek (kullanıcının talebi, ayrıntılı).'),
            }, ['istek']),
        },
        run: async (a, ctx) => {
            if (!ctx.whiteboard) throw new ToolError('Açık ve düzenlenebilir bir pano yok: önce projede Whiteboard ekranını açın.');
            const istek = str(a.istek);
            if (!istek) throw new ToolError('Çizim isteği boş.');
            const r = await ctx.whiteboard.draw(istek);
            return {
                tamam: true,
                ozet: r.summary,
                eklenen_nesne: r.added,
                ...(r.moved ? { tasinan_nesne: r.moved } : {}),
                ...(r.noImage ? { not: 'Seçili görsel modele gönderilemedi; çizim yalnız açıklamaya göre yapıldı.' } : {}),
                pano: ctx.whiteboard.describe(),
            };
        },
    },
];

// ---------------------------------------------------------------------------
// Jira araçları — SALT OKUNUR; sunucu proxy'si üzerinden (jeton yalnız sunucuda,
// JIRA_ALLOWED_PROJECTS sunucuda uygulanır). Uygulamada bir projeye bağlı Jira
// anahtarları yalnız o projeyi görebilen kullanıcıya açılır.
// ---------------------------------------------------------------------------

const JIRA_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}-\d{1,9}$/;
const JIRA_PROJECT_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}$/;
const SEC_TO_HOURS = (v: number | null | undefined) => v == null ? undefined : r2(v / 3600);
const STATUS_CAT_TR: Record<string, string> = { new: 'Yapılacak', indeterminate: 'Devam ediyor', done: 'Tamamlandı' };

/** Jira proje anahtarı, kapsam dışındaki bir uygulama projesine bağlıysa reddeder */
const assertJiraKeyInScope = (ctx: ToolContext, jiraProjectKey: string) => {
    const k = jiraProjectKey.toUpperCase();
    const linked = ctx.ws.projects.filter(p => (p.jiraProjectKey || '').trim().toUpperCase() === k);
    if (linked.length && !linked.some(p => ctx.visibleProjectIds.has(p.id))) {
        throw new ToolError(`${k} Jira projesi kullanıcının yetki kapsamındaki bir projeye bağlı değil; gösterilemez.`);
    }
};

const appTaskOf = (ctx: ToolContext, key: string) => {
    for (const p of ctx.scoped.projects) {
        const t = p.tasks.find(x => (x.jiraId || '').toUpperCase() === key.toUpperCase());
        if (t) return { proje: p.name, gorev: t.name, durum: TASK_STATUS_TR[t.status] || t.status };
    }
    return undefined;
};

const jiraRow = (ctx: ToolContext, i: JiraIssueRecord, detail: boolean) => ({
    anahtar: i.key,
    ozet: i.summary,
    tur: i.issueType || undefined,
    durum: i.status,
    durum_kategorisi: i.statusCategory ? STATUS_CAT_TR[i.statusCategory] : undefined,
    oncelik: i.priority || undefined,
    atanan: i.assignee || undefined,
    olusturma: i.created ? i.created.slice(0, 10) : undefined,
    guncelleme: i.updated ? i.updated.slice(0, 10) : undefined,
    termin: i.due || undefined,
    cozulme: i.resolved ? i.resolved.slice(0, 10) : undefined,
    surum: i.fixVersions.length ? i.fixVersions.join(', ') : undefined,
    bilesen: i.components.length ? i.components.join(', ') : undefined,
    etiket: i.labels.length ? i.labels.join(', ') : undefined,
    story_point: i.storyPoints ?? undefined,
    tahmin_saat: SEC_TO_HOURS(i.originalEstimateSeconds),
    harcanan_saat: SEC_TO_HOURS(i.timeSpentSeconds),
    kalan_saat: SEC_TO_HOURS(i.remainingEstimateSeconds),
    gecmis_ozeti: i.historySummary,
    engelleyen: i.blockedBy.length ? i.blockedBy.join(', ') : undefined,
    uygulamada: appTaskOf(ctx, i.key),
    ...(detail ? {
        aciklama: short(i.description, 1500),
        durum_gecmisi: i.transitions.slice(-8).map(t => `${t.at.slice(0, 10)}: ${t.from} → ${t.to}`),
    } : { aciklama: short(i.description, 160) }),
});

const jiraFail = (e: unknown): never => {
    if (e instanceof ToolError) throw e;
    throw new ToolError(`Jira'dan okunamadı: ${(e as Error)?.message || 'bilinmeyen hata'}`);
};

const JIRA_TOOLS: ToolDef[] = [
    {
        label: 'Jira kaydı ve geçmişi',
        requires: 'jira',
        spec: {
            name: 'jira_kayit_getir',
            description: 'Anahtarı bilinen Jira kayıtlarının Jira\'daki GÜNCEL hâlini getirir (durum, atanan, öncelik, termin, sürüm, story point, tahmin/harcanan süre, açıklama, durum geçmişi) ve uygulamadaki karşılık gelen görevi gösterir. Değişikliklerin kim tarafından ne zaman yapıldığını görmek için gecmis seçeneğini kullan. Örn. "MKS-123 ne durumda?".',
            parameters: S.obj({
                anahtarlar: S.str('Jira anahtarları, virgülle ayrılmış (en çok 20). Örn. "MKS-12, MKS-15".'),
                gecmis: S.bool('Tek kayıt için değişiklik geçmişini getirir.'),
                gecmis_sayfa: S.int('Geçmiş sayfası (en yeni ilk, her sayfa 20 değişiklik).'),
            }, ['anahtarlar']),
        },
        run: async (a, ctx) => {
            if (!ctx.jira) throw new ToolError('Jira bağlantısı bu oturumda kullanılamıyor.');
            const raw = Array.isArray(a.anahtarlar) ? a.anahtarlar.map(String) : str(a.anahtarlar).split(/[\s,;]+/);
            const keys = [...new Set(raw.map(k => k.trim().toUpperCase()).filter(Boolean))];
            if (!keys.length) throw new ToolError('En az bir Jira anahtarı verin (örn. MKS-12).');
            if (keys.length > 20) throw new ToolError('Bir seferde en çok 20 anahtar sorgulanabilir.');
            const bad = keys.filter(k => !JIRA_KEY_RE.test(k));
            if (bad.length) throw new ToolError(`Geçersiz Jira anahtarı: ${bad.join(', ')} (biçim: PROJE-123).`);
            keys.forEach(k => assertJiraKeyInScope(ctx, k.split('-')[0]));
            if (a.gecmis === true) {
                if (keys.length !== 1) throw new ToolError('Geçmişi okumak için bir Jira anahtarı verin.');
                if (!ctx.jira.history) throw new ToolError('Jira geçmişi bu oturumda kullanılamıyor.');
                const entries = await ctx.jira.history(keys[0]).catch(jiraFail);
                const page = clampLimit(a.gecmis_sayfa, 1, 250);
                return {
                    anahtar: keys[0], toplam: entries.length, sayfa: page, sayfa_sayisi: Math.ceil(entries.length / 20),
                    gecmis: entries.slice((page - 1) * 20, page * 20).map(entry => ({
                        tarih: entry.at, yapan: entry.author, alanlar: entry.items.map(item => ({
                            alan: item.field, eski: short(item.fromString ?? item.from ?? '', 200),
                            yeni: short(item.toString ?? item.to ?? '', 200),
                        })),
                    })),
                };
            }
            const page = await ctx.jira.byKeys(keys).catch(jiraFail);
            const detail = page.issues.length <= 5;
            return {
                kayit_sayisi: page.issues.length,
                kayitlar: page.issues.map(i => jiraRow(ctx, i, detail)),
                ...(page.missing.length ? { bulunamayan: page.missing, not: 'Bulunamayan kayıtlar silinmiş, taşınmış ya da jetonun erişimi dışında olabilir.' } : {}),
            };
        },
    },
    {
        label: 'Jira araması',
        requires: 'jira',
        spec: {
            name: 'jira_kayit_ara',
            description: 'Jira\'da kayıt arar: bir Jira projesi, etiket ya da kayıtlı (sık kullanılan) filtre içinde; isteğe bağlı serbest metinle. Varsayılan yalnız açık kayıtlar. Kaynak verilmezse açık uygulama projesinin Jira anahtarı kullanılır. Hangi proje/filtrelere erişildiğini görmek için jira_baglanti kullan. Sayım/dağılım sonuçta özetlenir.',
            parameters: S.obj({
                jira_proje: S.str('Jira proje anahtarı (örn. MKS).'),
                etiket: S.str('Jira etiketi (virgülle birden çok).'),
                filtre_id: S.str('Kayıtlı Jira filtresinin numarası.'),
                metin: S.str('Özet/açıklama/yorumda geçen kelimeler (harf, rakam, boşluk).'),
                kapali_dahil: S.bool('true ise kapanmış kayıtlar da gelir (varsayılan false).'),
                limit: S.int('En fazla kaç kayıt listelensin (varsayılan 20, en çok 50).'),
            }),
        },
        run: async (a, ctx) => {
            if (!ctx.jira) throw new ToolError('Jira bağlantısı bu oturumda kullanılamıyor.');
            let projectKey = str(a.jira_proje).toUpperCase();
            const labels = str(a.etiket).split(',').map(l => l.trim()).filter(Boolean);
            const filterId = str(a.filtre_id);
            if (!projectKey && !labels.length && !filterId) {
                const active = ctx.scoped.projects.find(p => p.id === ctx.activeProjectId);
                projectKey = (active?.jiraProjectKey || '').trim().toUpperCase();
                if (!projectKey) throw new ToolError('Jira kaynağı belirtilmedi ve açık projenin Jira anahtarı yok. jira_proje, etiket ya da filtre_id verin (jira_baglanti ile listelenebilir).');
            }
            if (projectKey && !JIRA_PROJECT_RE.test(projectKey)) throw new ToolError(`Geçersiz Jira proje anahtarı: ${projectKey}.`);
            if (projectKey) assertJiraKeyInScope(ctx, projectKey);
            const limit = clampLimit(a.limit, 20, 50);
            const page = await ctx.jira.search(
                { ...(projectKey ? { projectKey } : {}), ...(labels.length ? { labels } : {}), ...(filterId ? { filterId } : {}), ...(str(a.metin) ? { text: str(a.metin) } : {}) },
                { openOnly: a.kapali_dahil !== true, pageSize: Math.max(limit, 50) },
            ).catch(jiraFail);
            const hiddenKeys = new Set(ctx.ws.projects.filter(p => p.jiraProjectKey && !ctx.visibleProjectIds.has(p.id)).map(p => p.jiraProjectKey!.trim().toUpperCase()));
            const visibleProjects = new Set(ctx.ws.projects.filter(p => p.jiraProjectKey && ctx.visibleProjectIds.has(p.id)).map(p => p.jiraProjectKey!.trim().toUpperCase()));
            const issues = page.issues.filter(i => { const k = i.key.split('-')[0].toUpperCase(); return !hiddenKeys.has(k) || visibleProjects.has(k); });
            const count = (f: (i: JiraIssueRecord) => string) => issues.reduce<Record<string, number>>((m, i) => { const k = f(i) || '—'; m[k] = (m[k] || 0) + 1; return m; }, {});
            return {
                kaynak: { jira_proje: projectKey || undefined, etiket: labels.length ? labels : undefined, filtre_id: filterId || undefined, metin: str(a.metin) || undefined, yalniz_acik: a.kapali_dahil !== true },
                toplam: page.total ?? undefined,
                bu_sayfada: issues.length,
                ...(page.next ? { not: 'Daha fazla kayıt var; dağılımlar yalnız bu sayfaya göredir. Daha dar filtre kullanın.' } : {}),
                durum_dagilimi: count(i => i.status),
                atanan_dagilimi: count(i => i.assignee),
                oncelik_dagilimi: count(i => i.priority),
                kayitlar: issues.slice(0, limit).map(i => jiraRow(ctx, i, false)),
            };
        },
    },
    {
        label: 'Jira bağlantısı',
        requires: 'jira',
        spec: {
            name: 'jira_baglanti',
            description: 'Jira bağlantısını sınar ve erişilebilen Jira projelerini ve kayıtlı (sık kullanılan) filtreleri listeler; uygulama projelerinin bağlı olduğu Jira anahtarlarını gösterir.',
            parameters: S.obj(),
        },
        run: async (_a, ctx) => {
            if (!ctx.jira) throw new ToolError('Jira bağlantısı bu oturumda kullanılamıyor.');
            const m = await ctx.jira.meta().catch(jiraFail);
            return {
                baglanti: 'tamam',
                jira_projeleri: m.projects.slice(0, 60).map(p => ({ anahtar: p.key, ad: p.name })),
                kayitli_filtreler: m.filters.slice(0, 30).map(f => ({ id: f.id, ad: f.name })),
                uygulama_baglantilari: ctx.scoped.projects.filter(p => p.jiraProjectKey).map(p => ({ proje: p.name, jira_proje: p.jiraProjectKey })),
            };
        },
    },
];

AI_TOOLS.push({
    label: 'Jira worklog raporu',
    requires: 'jira',
    spec: {
        name: 'jira_worklog_raporu',
        description: 'Projelerin Jira worklog raporu (Tempo gibi): ay ya da aralıkta saat; proje, kişi, kayıt, gün, hafta kırılımı. Uygulama projesi → yalnız onun Jira kayıtları; Jira anahtarı (MPS) → Jira projesinin tamamı. En çok 92 gün.',
        parameters: S.obj({
            projeler: S.str('Virgülle projeler ya da Jira anahtarları; boşsa açık proje.'),
            ay: S.str('2026-11 ya da Kasım; boşsa bu ay.'),
            baslangic: S.str('Ya da YYYY-AA-GG.'),
            bitis: S.str('YYYY-AA-GG.'),
            grupla: S.str('proje, kisi, kayit, gun, hafta (virgülle); varsayılan proje,kisi.'),
            kisi: S.str('Yalnız bu kişi.'),
        }),
    },
    run: async (a, ctx) => {
        if (!ctx.jira) throw new ToolError('Jira bağlantısı yapılandırılmamış (Yönetici konsolu › Entegrasyonlar).');
        const targets = resolveTargets(ctx, a.projeler);
        const { from, to } = reportRange(a, ctx.now);
        const allowed: WorklogGroup[] = ['proje', 'kisi', 'kayit', 'gun', 'hafta'];
        const groups = str(a.grupla).split(/[,\s]+/).map(g => g.toLocaleLowerCase('tr-TR').replace('kişi', 'kisi').replace('kayıt', 'kayit').replace('gün', 'gun')).filter((g): g is WorklogGroup => allowed.includes(g as WorklogGroup));
        return buildWorklogReport({ targets, from, to, groups: groups.length ? groups : ['proje', 'kisi'], person: str(a.kisi) || undefined, fetch: ctx.jira.worklogs });
    },
});


// ---------------------------------------------------------------------------
// İş güçleri (billing hours): görevlerin Jira worklog'larından kim, hangi
// kayıtta, ne kadar zaman ve maliyeti. Kayıtlı veriden okunur (eşitlemede
// gelir); jira_kayit_worklog ise Jira'dan canlı getirir.
// ---------------------------------------------------------------------------

const WORKFORCE_TOOLS: ToolDef[] = [
    {
        label: 'İş gücü raporu',
        requires: 'jira',
        spec: {
            name: 'is_gucu_raporu',
            description: 'Jira worklog\'larından (billing hours) kim, hangi kayıtta kaç saat harcamış ve maliyeti. "X hangi işte ne kadar çalıştı", "ATL-12\'de kaç kişi kaç saat" için.',
            parameters: S.obj({
                kisi: S.str('Kişi adı (kısmi).'),
                kayit: S.str('Jira anahtarı ya da özet (kısmi).'),
                projeler: S.str('Virgülle; boşsa tümü.'),
                ay: S.str('2026-11 ya da Kasım; boşsa tüm zamanlar.'),
                baslangic: S.str('YYYY-AA-GG.'),
                bitis: S.str('YYYY-AA-GG.'),
                grupla: S.str('', ['kisi', 'kayit', 'proje']),
                limit: S.int('Varsayılan 15, en çok 40.'),
            }),
        },
        run: (a, ctx) => {
            const names = str(a.projeler).split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
            const projects = names.length ? names.map(n => resolveProject(ctx, n)) : ctx.scoped.projects;
            const range: { from?: string; to?: string } = str(a.ay) || str(a.baslangic) || str(a.bitis) ? reportRange(a, ctx.now) : {};
            const query = str(a.kisi) || str(a.kayit);
            const r = buildWorkforce(ctx.ws, projects, { ...range, query });
            const limit = clampLimit(a.limit, 15, 40);
            const by = str(a.grupla) || 'kisi';
            const money = (v: number | null) => (v === null ? undefined : Math.round(v));
            const rows = by === 'kayit'
                ? r.records.slice(0, limit).map(x => ({ anahtar: x.issueKey, ozet: short(x.summary, 80), proje: x.projectName, saat: x.hours, maliyet_tl: money(x.cost), kisiler: x.people.slice(0, 6).map(p => `${p.name} ${p.hours} sa`) }))
                : by === 'proje'
                    ? [...new Set(r.records.map(x => x.projectName))].map(name => {
                        const recs = r.records.filter(x => x.projectName === name);
                        return { proje: name, saat: r2(recs.reduce((s, x) => s + x.hours, 0)), maliyet_tl: recs.reduce((s, x) => s + x.cost, 0), kayit_sayisi: recs.length };
                    }).sort((x, y) => y.saat - x.saat).slice(0, limit)
                    : r.people.slice(0, limit).map(p => ({
                        kisi: p.name, havuzda: !!p.person, unvan: p.person?.titleCode, birim: p.person?.departmentCode,
                        saat: p.hours, gun: r2(p.hours / 8), maliyet_tl: p.uncostedHours === p.hours ? undefined : p.cost, kayit_sayisi: p.records,
                        en_cok: [...new Map(p.entries.map(e => [e.taskId, e])).values()]
                            .map(e => ({ k: e.issueKey, s: r2(p.entries.filter(x => x.taskId === e.taskId).reduce((t, x) => t + x.hours, 0)) }))
                            .sort((x, y) => y.s - x.s).slice(0, query ? 10 : 3).map(x => `${x.k} ${x.s} sa`),
                    }));
            return {
                donem: range.from ? `${range.from} – ${range.to}` : 'tüm zamanlar',
                toplam_saat: r.totalHours, toplam_gun: r2(r.totalHours / 8), toplam_maliyet_tl: r.totalCost,
                ...(r.uncostedHours ? { maliyetlenemeyen_saat: r.uncostedHours, not: 'Ünvanı/ünvan maliyeti olmayan ya da havuzda bulunmayan kişilerin saati maliyete katılmadı.' } : {}),
                kisi_sayisi: r.people.length, kayit_sayisi: r.records.length,
                ...(r.unmatchedAuthors.length ? { havuzda_olmayan: r.unmatchedAuthors.slice(0, 10) } : {}),
                ...(r.pendingTasks ? { bekleyen: `${r.pendingTasks} kaydın worklog'u henüz alınmadı (eşitleme sürüyor).` } : {}),
                ...(r.syncedTasks === 0 ? { uyari: 'Hiçbir görevin worklog\'u alınmamış; görevler Jira ile eşitlenince veri gelir.' } : {}),
                gruplama: by,
                satirlar: rows,
                ...(by === 'kisi' && r.people.length > limit ? { kalan: r.people.length - limit } : {}),
                ...(by === 'kayit' && r.records.length > limit ? { kalan: r.records.length - limit } : {}),
            };
        },
    },
    {
        label: 'Jira worklog',
        requires: 'jira',
        spec: {
            name: 'jira_kayit_worklog',
            description: 'Jira kayıtlarında kim kaç saat harcamış: Jira\'dan CANLI (kişi, saat, son tarih, maliyet). Kayıt uygulamada yoksa ya da veri eskiyse.',
            parameters: S.obj({ anahtarlar: S.str('Virgülle, en çok 20 (MKS-12, MKS-15).') }, ['anahtarlar']),
        },
        run: async (a, ctx) => {
            if (!ctx.jira) throw new ToolError('Jira bağlantısı bu oturumda kullanılamıyor.');
            const keys = [...new Set(str(a.anahtarlar).split(/[\s,;]+/).map(k => k.trim().toUpperCase()).filter(Boolean))];
            if (!keys.length) throw new ToolError('En az bir Jira anahtarı verin (örn. MKS-12).');
            if (keys.length > 20) throw new ToolError('Bir seferde en çok 20 anahtar sorgulanabilir.');
            const bad = keys.filter(k => !JIRA_KEY_RE.test(k));
            if (bad.length) throw new ToolError(`Geçersiz Jira anahtarı: ${bad.join(', ')} (biçim: PROJE-123).`);
            keys.forEach(k => assertJiraKeyInScope(ctx, k.split('-')[0]));
            const res = await ctx.jira.issueWorklogs(keys).catch(jiraFail);
            const kayitlar = keys.filter(k => !res.missing.includes(k)).map(k => {
                const rows = res.entries.filter(e => e.issueKey === k);
                const by = new Map<string, { kisi: string; saat: number; maliyet: number | null; son: string }>();
                rows.forEach(e => {
                    const person = matchWorklogPerson(ctx.ws.people, e.author, e.authorEmail);
                    const name = person ? fullName(person) : e.author;
                    const rate = hourlyRate(person, ctx.ws.titles, e.date);
                    const x = by.get(name) || { kisi: name, saat: 0, maliyet: 0, son: '' };
                    x.saat += e.hours;
                    x.maliyet = x.maliyet === null || rate === null ? null : x.maliyet + rate * e.hours;
                    if (e.date > x.son) x.son = e.date;
                    by.set(name, x);
                });
                const kisiler = [...by.values()].sort((p, q) => q.saat - p.saat).map(x => ({ kisi: x.kisi, saat: r2(x.saat), son_tarih: x.son, maliyet_tl: x.maliyet === null ? undefined : Math.round(x.maliyet) }));
                return { anahtar: k, uygulamada: appTaskOf(ctx, k), kisi_sayisi: kisiler.length, toplam_saat: r2(rows.reduce((s, e) => s + e.hours, 0)), kisiler };
            });
            return { kayitlar, ...(res.missing.length ? { bulunamayan: res.missing } : {}) };
        },
    },
];

// ---------------------------------------------------------------------------
// Veri havuzu: okuma (herkes) ve ÖNERİ (yalnız veri havuzunu düzenleyebilen rol).
// Satır listeleri tek kartta onaylanır; okunamayan satırlar "atlanan" olarak döner.
// ---------------------------------------------------------------------------

/** Dizi argümanı (bazı modeller diziyi JSON metni olarak yollar) */
const rowsArg = (v: unknown, name: string): Args[] => {
    let x = v;
    if (typeof x === 'string') { try { x = JSON.parse(x); } catch { /* aşağıda hata */ } }
    if (!Array.isArray(x) || !x.length) throw new ToolError(`${name} boş olmayan bir liste olmalı.`);
    if (x.length > MAX_POOL_ROWS) throw new ToolError(`Tek öneride en çok ${MAX_POOL_ROWS} satır; tabloyu bölün.`);
    return x.filter((r): r is Args => !!r && typeof r === 'object');
};

/** Bu turda önerilmiş (henüz uygulanmamış) ünvan/bölümler — aynı turdaki kişi önerisi bunlara başvurabilsin */
const pendingPool = (ctx: ToolContext) => {
    const titles = ctx.ws.titles.slice();
    const departments = ctx.ws.departments.slice();
    for (const p of ctx.proposals) {
        if (p.status !== 'pending') continue;
        if (p.action.type === 'unvan_kaydet') for (const t of p.action.titles) if (!titles.some(x => x.code === t.code)) titles.push({ code: t.code, name: t.name, monthlyCost: t.monthlyCost });
        if (p.action.type === 'birim_kaydet') for (const d of p.action.departments) if (!departments.some(x => x.code === trUpper(d.code))) departments.push({ code: trUpper(d.code), name: d.name });
    }
    return { titles, departments, ws: { ...ctx.ws, titles, departments } };
};

const resolveTitleCode = (titles: WorkspaceData['titles'], ref: unknown): string => {
    const t = str(ref);
    const hit = titles.find(x => trUpper(x.code) === trUpper(t)) || titles.find(x => trNorm(x.name) === trNorm(t));
    if (!hit) throw new ToolError(`"${t}" ünvanı havuzda yok; önce oner_unvan_kaydet ile ekleyin.`);
    return hit.code;
};

const resolveDeptCode = (departments: WorkspaceData['departments'], ref: unknown): string => {
    const t = str(ref);
    const hit = departments.find(x => trUpper(x.code) === trUpper(t)) || departments.find(x => trNorm(x.name) === trNorm(t));
    if (!hit) throw new ToolError(`"${t}" bölümü havuzda yok; önce oner_bolum_kaydet ile ekleyin.`);
    return hit.code;
};

const aaArg = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace('%', ''));
    if (!Number.isFinite(n)) throw new ToolError('aa sayısal olmalı (0-1,5).');
    return n > 1.5 && n <= 150 ? Math.round(n) / 100 : Math.round(n * 100) / 100; // %80 → 0,8
};

/** Satır satır çözer; hatalı satırlar atlanır ve nedeniyle döner */
const eachRow = <T,>(rows: Args[], fn: (r: Args, i: number) => T): { ok: T[]; skipped: string[] } => {
    const ok: T[] = [], skipped: string[] = [];
    rows.forEach((r, i) => {
        try { ok.push(fn(r, i)); } catch (e) { skipped.push(`${i + 1}. satır: ${(e as Error).message}`); }
    });
    if (!ok.length) throw new ToolError(`Hiçbir satır önerilemedi. ${skipped.slice(0, 10).join(' ')}`);
    return { ok, skipped };
};

const withSkipped = (out: ReturnType<typeof propose>, skipped: string[]) => (skipped.length ? { ...out, atlanan: skipped } : out);

const POOL_TOOLS: ToolDef[] = [
    {
        label: 'Veri havuzu',
        spec: {
            name: 'veri_havuzu',
            description: 'Veri havuzu listesi: ünvanlar (kısaltma, ad, 1 AA aylık maliyet, kişi sayısı), bölümler ya da kişiler (bölüm, ünvan, AA, eksikler). Havuz önerisinden önce mevcut kayıtları görmek için.',
            parameters: S.obj({
                tur: S.str('', ['unvan', 'bolum', 'kisi']),
                ara: S.str('Ad/kod içinde ara'),
                eksik: S.str('Yalnız eksiği olan kişiler', ['bolum', 'unvan', 'maliyet', 'eposta']),
                limit: P.limit,
            }, ['tur']),
        },
        run: (a, ctx) => {
            const q = trNorm(str(a.ara));
            const lim = clampLimit(a.limit, 50);
            const { titles, departments, people } = ctx.ws;
            if (str(a.tur) === 'unvan') {
                const rows = titles.filter(t => !q || trNorm(`${t.code} ${t.name}`).includes(q));
                return {
                    toplam: rows.length,
                    unvanlar: rows.slice(0, lim).map(t => ({ kisaltma: t.code, ad: t.name, aylik_maliyet_tl: t.monthlyCost, kisi: people.filter(p => p.titleCode === t.code).length })),
                    maliyetsiz: rows.filter(t => !t.monthlyCost).map(t => t.code),
                };
            }
            if (str(a.tur) === 'bolum') {
                const rows = departments.filter(d => !q || trNorm(`${d.code} ${d.name}`).includes(q));
                return { toplam: rows.length, bolumler: rows.slice(0, lim).map(d => ({ kod: d.code, ad: d.name, sorumlu: d.leadName, kisi: people.filter(p => p.departmentCode === d.code).length })) };
            }
            const want = str(a.eksik);
            const issueKey = ({ bolum: 'department', unvan: 'title', maliyet: 'cost', eposta: 'email' } as const)[want as 'bolum'];
            const rows = people
                .map(p => ({ p, iss: personIssues(p, departments, titles) }))
                .filter(({ p, iss }) => (!q || trNorm(`${fullName(p)} ${p.departmentCode} ${p.titleCode || ''}`).includes(q)) && (!issueKey || iss.includes(issueKey)));
            return {
                toplam: rows.length,
                kisiler: rows.slice(0, lim).map(({ p, iss }) => ({
                    ad: fullName(p), bolum: p.departmentCode || undefined, unvan: p.titleCode ? titles.find(t => t.code === p.titleCode)?.name || p.titleCode : undefined,
                    aa: p.availableAA, ...(ctx.canWritePool ? { eposta: p.email } : {}), ...(iss.length ? { eksik: iss.map(i => PERSON_ISSUE_LABELS[i]) } : {}),
                })),
            };
        },
    },
    {
        label: 'Ünvan önerisi',
        poolWrite: true,
        spec: {
            name: 'oner_unvan_kaydet',
            description: 'Ünvan ekle/güncelle ÖNERİR (onaysız uygulanmaz): ad ve 1 AA aylık maliyet (TL). Var olan ünvan adı/kısaltmasıyla eşleşir ve güncellenir; yoksa eklenir. Tüm tabloyu TEK çağrıda ver; toplam/ortalama ve grup başlığı satırlarını katma.',
            parameters: S.obj({
                unvanlar: {
                    type: 'array',
                    items: S.obj({ ad: S.str(''), kisaltma: S.str('Yoksa üretilir'), aylik_maliyet: S.num('TL') }, ['ad']),
                },
            }, ['unvanlar']),
        },
        run: (a, ctx) => {
            const taken = ctx.ws.titles.map(t => t.code);
            const { ok, skipped } = eachRow(rowsArg(a.unvanlar, 'unvanlar'), r => {
                const name = str(r.ad).replace(/\s+/g, ' ');
                if (!name) throw new ToolError('ad boş.');
                if (/^(genel )?(toplam|ortalama|ort\.?)\b/i.test(name)) throw new ToolError(`"${name}" bir toplam/ortalama satırı; ünvan değil.`);
                const given = trUpper(str(r.kisaltma));
                const cur = (given && ctx.ws.titles.find(t => t.code === given)) || ctx.ws.titles.find(t => trNorm(t.name) === trNorm(name));
                const hasCost = r.aylik_maliyet !== undefined && r.aylik_maliyet !== null && r.aylik_maliyet !== '';
                const cost = hasCost ? parseMoney(r.aylik_maliyet) : undefined;
                if (hasCost && cost === undefined) throw new ToolError(`"${name}" maliyeti okunamadı (${String(r.aylik_maliyet)}).`);
                const code = cur?.code || given || titleCodeFor(name, taken);
                taken.push(code);
                return { code, name, ...(cost !== undefined ? { monthlyCost: cost } : {}) } as PoolTitle;
            });
            return withSkipped(propose(ctx, { type: 'unvan_kaydet', titles: ok }), skipped);
        },
    },
    {
        label: 'Kişi güncelleme önerisi',
        poolWrite: true,
        spec: {
            name: 'oner_kisi_guncelle',
            description: 'Havuzdaki kişilerin ünvanını, bölümünü, e-postasını ya da kullanılabilir AA\'sını güncellemeyi ÖNERİR (onaysız uygulanmaz). Birden çok kişiyi TEK çağrıda ver; yalnız değişecek alanları yaz.',
            parameters: S.obj({
                kisiler: {
                    type: 'array',
                    items: S.obj({ kisi: S.str('Ad soyad'), unvan: S.str('Ad ya da kısaltma'), bolum: S.str('Kod'), eposta: S.str(''), aa: S.num('0-1,5') }, ['kisi']),
                },
            }, ['kisiler']),
        },
        run: (a, ctx) => {
            const pool = pendingPool(ctx);
            const { ok, skipped } = eachRow(rowsArg(a.kisiler, 'kisiler'), r => {
                const person = resolvePerson(ctx, str(r.kisi) || '?');
                const c: PoolPersonChange = { personId: person.id };
                if (str(r.unvan)) c.titleCode = resolveTitleCode(pool.titles, r.unvan);
                if (str(r.bolum)) c.departmentCode = resolveDeptCode(pool.departments, r.bolum);
                if (str(r.eposta)) c.email = str(r.eposta);
                const aa = aaArg(r.aa);
                if (aa !== undefined) c.availableAA = aa;
                return c;
            });
            return withSkipped(propose(ctx, { type: 'kisi_guncelle', changes: ok }, pool.ws), skipped);
        },
    },
    {
        label: 'Kişi ekleme önerisi',
        poolWrite: true,
        spec: {
            name: 'oner_kisi_ekle',
            description: 'Veri havuzuna yeni kişi eklemeyi ÖNERİR (onaysız uygulanmaz). Havuzda olan kişiyi ekleme; oner_kisi_guncelle kullan.',
            parameters: S.obj({
                kisiler: {
                    type: 'array',
                    items: S.obj({ ad: S.str('Ad (ya da ad soyad)'), soyad: S.str(''), bolum: S.str('Kod'), unvan: S.str('Ad ya da kısaltma'), eposta: S.str(''), aa: S.num('Varsayılan 1') }, ['ad', 'bolum']),
                },
            }, ['kisiler']),
        },
        run: (a, ctx) => {
            const pool = pendingPool(ctx);
            const { ok, skipped } = eachRow(rowsArg(a.kisiler, 'kisiler'), r => {
                let first = str(r.ad).replace(/\s+/g, ' '), last = str(r.soyad).replace(/\s+/g, ' ');
                if (!last && first.includes(' ')) { const i = first.lastIndexOf(' '); last = first.slice(i + 1); first = first.slice(0, i); }
                if (!first || !last) throw new ToolError('ad ve soyad gerekli.');
                if (ctx.ws.people.some(p => trNorm(fullName(p)) === trNorm(`${first} ${last}`))) throw new ToolError(`${first} ${last} havuzda zaten var (oner_kisi_guncelle).`);
                return {
                    firstName: first, lastName: last, departmentCode: resolveDeptCode(pool.departments, r.bolum),
                    ...(str(r.unvan) ? { titleCode: resolveTitleCode(pool.titles, r.unvan) } : {}),
                    ...(str(r.eposta) ? { email: str(r.eposta) } : {}),
                    availableAA: aaArg(r.aa) ?? 1,
                } as PoolNewPerson;
            });
            return withSkipped(propose(ctx, { type: 'kisi_ekle', people: ok }, pool.ws), skipped);
        },
    },
    {
        label: 'Bölüm önerisi',
        poolWrite: true,
        spec: {
            name: 'oner_bolum_kaydet',
            description: 'Bölüm ekle ya da adını güncelle ÖNERİR (onaysız uygulanmaz), koda göre.',
            parameters: S.obj({
                bolumler: { type: 'array', items: S.obj({ kod: S.str('ör. U310'), ad: S.str('') }, ['kod', 'ad']) },
            }, ['bolumler']),
        },
        run: (a, ctx) => {
            const { ok, skipped } = eachRow(rowsArg(a.bolumler, 'bolumler'), r => {
                if (!str(r.kod) || !str(r.ad)) throw new ToolError('kod ve ad gerekli.');
                return { code: trUpper(str(r.kod)), name: str(r.ad) };
            });
            return withSkipped(propose(ctx, { type: 'birim_kaydet', departments: ok }), skipped);
        },
    },
];

// ---------------------------------------------------------------------------
// Dosya çıktısı: Excel, CSV, Word, PDF, PowerPoint. Asistan belgeyi bölümlerle
// tanımlar; tablolar elle yazılabilir ya da bir okuma aracının sonucundan
// doğrudan doldurulur (sayılar yeniden yazılmaz). Dosya tarayıcıda üretilir.
// ---------------------------------------------------------------------------

/** Bir turda en çok bu kadar dosya; tablo kaynağı olarak en çok bu kadar satır */
export const MAX_FILES_PER_TURN = 5;
const SOURCE_ROW_LIMIT = 1000;

const listArg = (v: unknown): unknown[] => {
    let x = v;
    if (typeof x === 'string') { try { x = JSON.parse(x); } catch { return x ? [x] : []; } }
    return Array.isArray(x) ? x : [];
};

/** Tablo kaynağı olabilecek araç: okuma aracı (öneri, ekran ve dosya araçları değil) */
const sourceTool = (name: string, ctx: ToolContext): ToolDef => {
    const def = TOOL_MAP.get(name);
    if (!def || !toolAvailable(def, ctx)) throw new ToolError(`"${name}" kaynak olarak kullanılamaz (bu rolde yok ya da bilinmiyor).`);
    if (def.writeOnly || def.poolWrite || def.requires === 'ui' || (def.requires === 'files' && def.spec.name !== 'veri_analiz')) throw new ToolError(`"${name}" bir okuma aracı değil; kaynak yalnız okuma araçları olabilir.`);
    return def;
};

/** Okuma aracını çalıştırıp sonucundaki listeyi tabloya çevirir (dosya, grafik ve analiz kaynağı) */
const loadSourceTable = async (name: string, argJson: string, field: string, ctx: ToolContext, where: string): Promise<{ columns: string[]; rows: (string | number | null)[][]; field: string }> => {
    const def = sourceTool(name, ctx);
    let args: Args = {};
    if (argJson) { try { args = JSON.parse(argJson); } catch { throw new ToolError(`${where}: kaynak_arg geçerli JSON değil.`); } }
    const result = await withBulkLimit(SOURCE_ROW_LIMIT, () => def.run(normalizeEnumArgs(def.spec.parameters, args || {}), ctx));
    try { return tableFromResult(result, field || undefined); } catch (e) { throw new ToolError(`${where} (${name}): ${(e as Error).message}`); }
};

const pickColumns = (t: { columns: string[]; rows: (string | number | null)[][] }, want: string[], where: string) => {
    if (!want.length) return t;
    const idx = want.map(w => t.columns.findIndex(c => c.toLocaleLowerCase('tr-TR') === w.toLocaleLowerCase('tr-TR')));
    const missing = want.filter((_, k) => idx[k] < 0);
    if (missing.length) throw new ToolError(`${where}: ${missing.join(', ')} sütunu sonuçta yok. Var olanlar: ${t.columns.join(', ')}.`);
    return { columns: idx.map(k => t.columns[k]), rows: t.rows.map(r => idx.map(k => r[k])) };
};

const FILE_TOOLS: ToolDef[] = [
    {
        label: 'Dosya hazırlama',
        requires: 'files',
        spec: {
            name: 'dosya_olustur',
            description: 'Excel/CSV/Word/PDF/PowerPoint dosyası hazırlar (sohbette indirme kartı). Raporda: özet, gosterge, vurgu, grafik, tablolar; ham döküm sonda. Tablo/grafik verisini kaynak_arac ile bir okuma aracından ya da veri_analiz\'den al. TEK çağrı.',
            parameters: S.obj({
                bicim: S.str('', ['xlsx', 'csv', 'docx', 'pdf', 'pptx']),
                baslik: S.str(''),
                alt_baslik: S.str('Dönem, kapsam'),
                bolumler: {
                    type: 'array',
                    items: S.obj({
                        tur: S.str('', ['baslik', 'alt_baslik', 'paragraf', 'liste', 'tablo', 'gosterge', 'vurgu', 'grafik']),
                        metin: S.str('Başlık/paragraf/vurgu metni; tablo/grafik adı'),
                        vurgu_basligi: S.str('Mesaj cümlesi'),
                        ton: S.str('', CALLOUT_TONES),
                        gostergeler: { type: 'array', items: S.obj({ ad: S.str(''), deger: S.str('"%78", "₺1,2 Mn"'), degisim: S.str('Kıyas'), durum: S.str('', KPI_STATUSES), not: S.str('') }, ['ad', 'deger']) },
                        grafik_turu: S.str('', CHART_TYPES),
                        etiketler: { type: 'array', items: S.str('') },
                        seriler: { type: 'array', items: S.obj({ ad: S.str(''), degerler: { type: 'array', items: S.num('') } }) },
                        etiket_sutun: S.str('Grafik kaynağında etiket sütunu'),
                        deger_sutunlari: { type: 'array', items: S.str('') },
                        maddeler: { type: 'array', items: S.str('') },
                        sutunlar: { type: 'array', items: S.str('') },
                        satirlar: { type: 'array', items: { type: 'array', items: S.str('') } },
                        kaynak_arac: S.str('Tablo için okuma aracı adı (ör. gorev_ara)'),
                        kaynak_arg: S.str('O aracın argümanları, JSON'),
                        kaynak_alan: S.str('Sonuçtaki liste alanı (ör. gorevler)'),
                        not: S.str('Tablo altı not'),
                    }, ['tur']),
                },
            }, ['bicim', 'baslik', 'bolumler']),
        },
        run: async (a, ctx) => {
            if (!ctx.files) throw new ToolError('Dosya hazırlama bu ortamda kullanılamıyor.');
            if (ctx.files.length >= MAX_FILES_PER_TURN) throw new ToolError(`Bir yanıtta en çok ${MAX_FILES_PER_TURN} dosya hazırlanabilir.`);
            const format = str(a.bicim) as DocFormat;
            if (!DOC_FORMATS.includes(format)) throw new ToolError('bicim xlsx, csv, docx, pdf ya da pptx olmalı.');
            const sections = listArg(a.bolumler).filter((x): x is Args => !!x && typeof x === 'object');
            if (!sections.length) throw new ToolError('bolumler boş olamaz.');
            const blocks: DocBlock[] = [];
            const sources: { arac: string; alan: string; satir: number }[] = [];
            for (const [i, b] of sections.entries()) {
                const tur = str(b.tur);
                if (tur === 'baslik' || tur === 'alt_baslik') blocks.push({ kind: 'heading', text: str(b.metin), level: tur === 'baslik' ? 1 : 2 });
                else if (tur === 'paragraf') blocks.push({ kind: 'paragraph', text: str(b.metin) });
                else if (tur === 'liste') blocks.push({ kind: 'list', items: listArg(b.maddeler).map(x => String(x ?? '')) });
                else if (tur === 'gosterge') {
                    const items = listArg(b.gostergeler).filter((x): x is Args => !!x && typeof x === 'object')
                        .map(k => ({ label: str(k.ad), value: String(k.deger ?? '').trim(), change: str(k.degisim) || undefined, status: (KPI_STATUSES.includes(str(k.durum) as KpiStatus) ? str(k.durum) : 'notr') as KpiStatus, note: str(k.not) || undefined }));
                    if (!items.length) throw new ToolError(`${i + 1}. bölüm: gosterge için gostergeler listesi gerekli.`);
                    blocks.push({ kind: 'kpi', items });
                } else if (tur === 'vurgu') {
                    const tone = (CALLOUT_TONES.includes(str(b.ton) as CalloutTone) ? str(b.ton) : 'bulgu') as CalloutTone;
                    blocks.push({ kind: 'callout', tone, title: str(b.vurgu_basligi) || undefined, text: str(b.metin) });
                } else if (tur === 'grafik') {
                    const chart = (CHART_TYPES.includes(str(b.grafik_turu) as ChartType) ? str(b.grafik_turu) : 'bar') as ChartType;
                    const name = str(b.kaynak_arac);
                    let labels: string[], series: { name: string; values: (number | null)[] }[];
                    if (name) {
                        const t = await loadSourceTable(name, str(b.kaynak_arg), str(b.kaynak_alan), ctx, `${i + 1}. bölüm`);
                        const where = `${i + 1}. bölüm`;
                        const lab = str(b.etiket_sutun) || t.columns[0];
                        const vals = listArg(b.deger_sutunlari).map(String);
                        const want = vals.length ? vals : t.columns.filter((c, k) => c !== lab && t.rows.some(r => typeof r[k] === 'number')).slice(0, 1);
                        const picked = pickColumns(t, [lab, ...want], where);
                        labels = picked.rows.slice(0, 40).map(r => String(r[0] ?? '(boş)'));
                        series = picked.columns.slice(1, 7).map((c, k) => ({ name: c, values: picked.rows.slice(0, 40).map(r => (typeof r[k + 1] === 'number' ? r[k + 1] as number : null)) }));
                    } else {
                        labels = listArg(b.etiketler).map(x => String(x ?? ''));
                        series = listArg(b.seriler).filter((x): x is Args => !!x && typeof x === 'object').map(se => ({ name: str(se.ad), values: listArg(se.degerler).map(v => (typeof v === 'number' ? v : Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : null)) }));
                    }
                    blocks.push({ kind: 'chart', chart, title: str(b.metin) || undefined, labels, series, note: str(b.not) || undefined });
                    if (name) sources.push({ arac: name, alan: str(b.kaynak_alan) || '(grafik)', satir: labels.length });
                } else if (tur === 'tablo') {
                    const note = str(b.not) || undefined;
                    const name = str(b.kaynak_arac);
                    if (name) {
                        const t = await loadSourceTable(name, str(b.kaynak_arg), str(b.kaynak_alan), ctx, `${i + 1}. bölüm`);
                        // İstenen sütunlar verildiyse yalnız onlar ve o sırayla (başlık adına göre, büyük/küçük harf duyarsız)
                        const { columns, rows } = pickColumns(t, listArg(b.sutunlar).map(x => String(x)), `${i + 1}. bölüm`);
                        blocks.push({ kind: 'table', title: str(b.metin) || undefined, columns, rows, note });
                        sources.push({ arac: name, alan: t.field, satir: rows.length });
                    } else {
                        blocks.push({ kind: 'table', title: str(b.metin) || undefined, columns: listArg(b.sutunlar).map(x => String(x ?? '')), rows: listArg(b.satirlar).map(r => (Array.isArray(r) ? r : [r])) as (string | number | null)[][], note });
                    }
                } else throw new ToolError(`${i + 1}. bölüm: tur baslik, alt_baslik, paragraf, liste, tablo, gosterge, vurgu ya da grafik olmalı.`);
            }
            let doc;
            try {
                doc = normalizeDocument({ title: str(a.baslik), subtitle: str(a.alt_baslik) || undefined, format, blocks });
            } catch (e) {
                if (e instanceof DocError) throw new ToolError(e.message);
                throw e;
            }
            ctx.files.push(doc);
            const st = documentStats(doc);
            return {
                dosya: doc.title, bicim: DOC_FORMAT_LABELS[format], tablo: st.tables, satir: st.rows, grafik: st.charts, gosterge: st.kpis, vurgu: st.callouts,
                ...(!st.kpis && !st.callouts && st.tables ? { kalite_notu: 'Dosyada gösterge ya da bulgu/öneri vurgusu yok. Kullanıcı yalnız veri dökümü istediyse sorun yok; analiz ya da rapor istediyse gosterge ve vurgu bölümleriyle bir kez daha hazırla.' } : {}),
                tablolar: doc.blocks.filter(b => b.kind === 'table').map(b => ({ ad: (b as Extract<DocBlock, { kind: 'table' }>).title, sutunlar: (b as Extract<DocBlock, { kind: 'table' }>).columns, satir: (b as Extract<DocBlock, { kind: 'table' }>).rows.length })),
                ...(sources.length ? { kaynaklar: sources } : {}),
                durum: 'Dosya hazır; kullanıcı sohbetteki karttan indirir (diğer biçimler de kartta). İçeriği yanıtta tekrar yazma; neyi içerdiğini bir iki cümleyle söyle.',
            };
        },
    },
];

// ---------------------------------------------------------------------------
// Analiz: hesap motoru (veri_analiz) ve yetenek oyun kitapları (yetenek_yukle).
// Model sayıyı kafadan üretmez; ekli tablolar ya da okuma araçlarının sonuçları
// üzerinde burada hesaplatır.
// ---------------------------------------------------------------------------

const ISLEMLER = ['profil', 'ozet', 'pivot', 'trend', 'dagilim', 'aykiri', 'korelasyon', 'satirlar'] as const;

/** Analiz edilecek tablo: kaynak_arac verildiyse onun sonucu, yoksa ekli tablolardan biri */
const analysisTable = async (a: Args, ctx: ToolContext): Promise<DataTable> => {
    const name = str(a.kaynak_arac);
    if (name) {
        if (name === 'veri_analiz') throw new ToolError('veri_analiz kendi kaynağı olamaz.');
        const t = await loadSourceTable(name, str(a.kaynak_arg), str(a.kaynak_alan), ctx, 'Kaynak');
        return { name: `${name}${t.field ? ` → ${t.field}` : ''}`, columns: t.columns, rows: t.rows };
    }
    const tables = ctx.tables || [];
    if (!tables.length) throw new ToolError('Analiz edilecek tablo yok: kullanıcı Excel/CSV eklemedi. Uygulama verisi için kaynak_arac ile bir okuma aracı (ör. gorev_ara, is_gucu_raporu, maliyet_raporu) ver.');
    const want = str(a.tablo);
    if (!want) {
        if (tables.length === 1) return tables[0];
        throw new ToolError(`Birden çok tablo var; tablo adını ver: ${tables.map(t => `"${t.name}"`).join(', ')}.`);
    }
    const f = (s: string) => s.toLocaleLowerCase('tr-TR');
    const hit = tables.find(t => f(t.name) === f(want)) || tables.filter(t => f(t.name).includes(f(want)))[0];
    if (!hit) throw new ToolError(`"${want}" tablosu yok. Tablolar: ${tables.map(t => `"${t.name}"`).join(', ')}.`);
    return hit;
};

const measuresArg = (v: unknown): Measure[] => listArg(v).filter((x): x is Args => !!x && typeof x === 'object')
    .map(m => ({ sutun: str(m.sutun) || undefined, fonk: (str(m.fonk) || 'toplam') as AggFn, ad: str(m.ad) || undefined }));

// Analiz araçları sohbet çalışma zamanına (files) bağlıdır: tarayıcı sohbetinde sunulur, temel istek
// (MCP — orada Claude kendi analizini yapar) büyümez.
/** Ekip analizi (asistan): Ekip › Takımlar / Bileşenler ekranıyla aynı hesap */
const teamAnalysisTool: ToolDef = {
    label: 'Ekip analizi',
    requires: 'files',
    spec: {
        name: 'ekip_analizi',
        description: 'Takım (proje rolü) ya da bileşen kırılımı: ilerleme %, açık/geciken, dönemde biten, açık efor, hata açılan/kapanan, kapanma süresi, tahmin sapması, kişi yükü ve bulgular.',
        parameters: S.obj({ proje: P.project, kirilim: S.str('', ['takim', 'bilesen']), gun: S.int('Dönem (varsayılan 30)') }),
    },
    run: (a, ctx) => {
        const project = resolveProject(ctx, a.proje);
        const gun = typeof a.gun === 'number' && a.gun >= 7 && a.gun <= 365 ? Math.round(a.gun) : 30;
        const fn = str(a.kirilim) === 'bilesen' ? componentAnalytics : teamAnalytics;
        const r = fn(project, projectRolesOf(ctx.ws), ctx.ws.people, { now: ctx.now, periodDays: gun });
        if (!r.groups.length) return { proje: project.name, not: str(a.kirilim) === 'bilesen' ? 'Bileşen yok.' : 'Proje rollerinde üye yok (Proje ayarları › Roller).' };
        const row = (g: GroupStats) => ({
            ad: g.name, kisi: g.members.length, ilerleme_yuzde: g.progressPct, toplam: g.total, acik: g.open, surecte: g.inProgress, geciken: g.overdue, blocker: g.blockers,
            biten_donem: g.doneInPeriod, biten_efor_gun: g.effortDoneInPeriod, acik_efor_gun: g.openEffort,
            hata: { acik: g.bugsOpen, acilan: g.bugsOpened, kapanan: g.bugsClosed, pay_yuzde: Math.round(g.bugShare * 100) },
            kapanma_gun_ortanca: g.leadTimeDays, gerceklesen_tahmin_orani: g.estimateRatio, haftalik_biten_8: g.weekly,
            kisiler: g.memberStats.slice(0, 8).map(m => ({ ad: m.name, acik: m.open, geciken: m.overdue, biten: m.doneInPeriod, acik_efor: m.openEffort })),
            ...(g.lead ? { sorumlu: g.lead } : {}), ...(g.teams?.length ? { takimlar: g.teams } : {}),
        });
        return { proje: project.name, donem_gun: gun, ilerleme_yontemi: describeProgressModel(project.progressModel), gruplar: r.groups.map(row), ...(r.outside ? { disarida: row(r.outside) } : {}), bulgular: r.insights.map(i => i.text) };
    },
};

/** Plan optimizasyonu (asistan): Plan ekranındaki "Optimize et" ile aynı motor */
const planOptimizeTool: ToolDef = {
    label: 'Plan optimizasyonu',
    requires: 'files',
    spec: {
        name: 'plan_optimizasyonu',
        description: 'Sürüm planını (kilometre taşı × sprint) optimize eder: taş tahminleri önce/sonra, kapasite, hız kontrolü, gecikmeye kurtarma senaryoları ve gerekçeli değişiklikler. "Taşa yetişir miyiz, nasıl yetiştiririz, planı düzelt" sorularında. oner=true (ve senaryo) ile hesaplanan değişiklikler onaylı öneri kartı olur.',
        parameters: S.obj({
            proje: P.project,
            surum: S.str('Sürüm planı adı (yoksa son taslak)'),
            hedef_doluluk: S.int('% (varsayılan 85)'),
            kisi_degisikligi: S.bool('Aynı birimde kişi değişikliği'),
            bol: S.bool('Büyük işi böl (varsayılan açık)'),
            bastan: S.bool('Baştan dağıt'),
            gecmis_sapma: S.bool('Eforu geçmiş sapmayla düzelt'),
            senaryo: S.str('Önerilecek senaryo kimliği (önceki sonuçtan)'),
            oner: S.bool('Öneri kartı hazırla'),
        }),
    },
    run: (a, ctx) => {
        const project = resolveProject(ctx, a.proje);
        const plans = (project.releasePlans || []).filter(p => p.mode === 'manual');
        if (!plans.length) throw new ToolError(`${project.name} projesinde sürüm planı yok. Planlama › Plan ekranında görevleri seçip bir sürüm oluşturun.`);
        const want = str(a.surum).toLocaleLowerCase('tr-TR');
        const plan = (want ? plans.find(p => p.name.toLocaleLowerCase('tr-TR').includes(want)) : undefined)
            || [...plans].sort((x, y) => Number(y.status === 'draft') - Number(x.status === 'draft') || y.updatedAt.localeCompare(x.updatedAt))[0];
        const hist = a.gecmis_sapma === true ? calibrator(buildHistory(ctx.scoped.projects)) : undefined;
        const load = typeof a.hedef_doluluk === 'number' && a.hedef_doluluk >= 30 && a.hedef_doluluk <= 100 ? a.hedef_doluluk / 100 : DEFAULT_OPTIONS.targetLoad;
        const base = optimizePlan(project, plan, {
            mode: a.bastan === true ? 'fresh' : 'stable', targetLoad: load, split: a.bol !== false, reassign: a.kisi_degisikligi === true,
            useRemaining: true, people: ctx.ws.people, leaves: ctx.ws.leaves || [], now: ctx.now,
            ...(hist ? { calibrate: (t: Task) => hist({ unit: t.unit, issueType: t.issueType })?.median } : {}),
        });
        const scenarios = rescueScenarios(project, plan, base);
        const pick = str(a.senaryo) ? scenarios.find(x => x.id === str(a.senaryo)) : undefined;
        if (str(a.senaryo) && !pick) throw new ToolError(`"${str(a.senaryo)}" senaryosu yok. Senaryolar: ${scenarios.map(x => x.id).join(', ') || 'yok (gecikme yok)'}.`);
        const shown = pick?.result || base;
        const names = project.settings.sprintNames || {};
        const sl = (v: number) => (v === 0 ? 'Havuz' : names[v] || `Sprint ${v}`);
        const keyOf = (id: string) => { const t = project.tasks.find(x => x.id === id); return t ? t.jiraId || t.name : id; };
        const out: Args = {
            surum: plan.name,
            takvim: calendarLabel(sprintCalendar(project.settings)),
            secenekler: { hedef_doluluk: `%${Math.round(shown.options.targetLoad * 100)}`, kisi_degisikligi: shown.options.reassign, bol: shown.options.split, kip: shown.options.mode === 'stable' ? 'yalnız gerekeni değiştir' : 'baştan' },
            once: describeMetrics(shown.before),
            sonra: describeMetrics(shown.after),
            taslar: shown.after.milestones.map(m => ({ tas: m.name, hedef: m.target, simdi: shown.before.milestones.find(x => x.id === m.id)?.forecast, optimize: m.forecast, durum: m.status })),
            ...(shown.velocity ? { hiz: { gun_sprint: shown.velocity.perSprint, sprint: shown.velocity.sprints, plan_varsayimi: shown.velocity.planned, ...(shown.velocity.recommendedLoad ? { onerilen_doluluk: `%${Math.round(shown.velocity.recommendedLoad * 100)}` } : {}) } } : {}),
            uyarilar: shown.warnings.slice(0, 8).map(w => w.message),
            senaryolar: scenarios.map(x => ({ id: x.id, ad: x.label, aciklama: x.detail, sonuc: x.retarget ? 'plan değişmez, hedef güncellenir' : describeMetrics(x.result.after), degisiklik: x.result.changes.length })),
            degisiklik_sayisi: shown.changes.length,
            degisiklikler: shown.changes.slice(0, 25).map(c => ({ gorev: keyOf(c.taskId), sprint: `${sl(c.from)} → ${sl(c.to)}`, ...(c.toSpan !== undefined ? { sprint_sayisi: c.toSpan } : {}), ...(c.toResource !== undefined ? { kisi: `${c.fromResource || 'atanmamış'} → ${c.toResource || 'atanmamış'}` } : {}), neden: c.reason })),
            yontem: 'Kapasite: katılım × iş günü (tatil, izin düşülür) × hedef doluluk; bu sprintte yalnız kalan günler. Sıra: taş → Blocker → kritik zincir → öncelik → termin; öncül bittiği sprintten sonra ardıl başlar. Sezgisel yöntem: en iyiyi garanti etmez.',
        };
        if (a.oner === true) {
            if (!ctx.canWrite) throw new ToolError('Bu rol plan değişikliği öneremez; Planlama › Plan › Optimize et ekranını projenin PY\'si kullanır.');
            out.oneri = propose(ctx, {
                type: 'plan_uygula', projectId: project.id, planId: plan.id, label: pick ? pick.label : `optimize (${shown.changes.length} değişiklik)`,
                changes: shown.changes, ...(pick?.descope ? { descope: pick.descope } : {}), ...(pick?.retarget ? { retarget: pick.retarget } : {}),
            });
        }
        return out;
    },
};

const ANALYSIS_TOOLS: ToolDef[] = [
    planOptimizeTool,
    teamAnalysisTool,
    {
        label: 'Veri analizi',
        requires: 'files',
        spec: {
            name: 'veri_analiz',
            description: 'Hesap motoru (ekli tablonun TÜM satırları ya da kaynak_arac sonucu). profil: yapı ve veri kalitesi; ozet: grupla+ölç+pay %; pivot: grupla[0]×grupla[1]; trend: tarih_sutun, dönem, değişim, eğilim; dagilim; aykiri (IQR); korelasyon (sutun, sutun2); satirlar: süz-sırala-ilk N. Toplam/ortalama/pay/sıralamayı kafadan değil bununla hesapla.',
            parameters: S.obj({
                islem: S.str('', [...ISLEMLER]),
                tablo: S.str('Ek tablo adı'),
                kaynak_arac: S.str('Okuma aracı (ek yerine)'),
                kaynak_arg: S.str('JSON'),
                kaynak_alan: S.str(''),
                filtre: { type: 'array', items: S.obj({ sutun: S.str(''), op: S.str('', FILTER_OPS), deger: S.str('') }) },
                grupla: { type: 'array', items: S.str('') },
                olcumler: { type: 'array', items: S.obj({ sutun: S.str(''), fonk: S.str('', AGG_FNS), ad: S.str('') }) },
                sutun: S.str(''),
                sutun2: S.str(''),
                tarih_sutun: S.str(''),
                periyot: S.str('', PERIODS),
                sirala: S.str(''),
                artan: S.bool(''),
                limit: S.int(''),
                goster: { type: 'array', items: S.str('') },
            }, ['islem']),
        },
        run: async (a, ctx) => {
            const t = await analysisTable(a, ctx);
            const islem = str(a.islem) as typeof ISLEMLER[number];
            try {
                const filters = listArg(a.filtre).filter((x): x is Args => !!x && typeof x === 'object')
                    .map(f => ({ sutun: str(f.sutun), op: (str(f.op) || '=') as FilterOp, deger: f.deger } as Filter));
                const rows = applyFilters(t, filters);
                const head = { tablo: t.name, toplam_satir: t.rows.length, ...(filters.length ? { suzulen_satir: rows.length } : {}) };
                const groups = listArg(a.grupla).map(String).filter(Boolean);
                const ms = measuresArg(a.olcumler);
                const limit = typeof a.limit === 'number' ? a.limit : undefined;
                switch (islem) {
                    case 'profil': return { ...profile(t, rows), ...(filters.length ? { suzulen_satir: rows.length } : {}) };
                    case 'ozet': return { ...head, ...groupBy(t, rows, groups, ms, { sirala: str(a.sirala) || undefined, artan: a.artan === true, limit }) };
                    case 'pivot':
                        if (groups.length < 2) throw new AnalysisError('pivot için grupla: [satır sütunu, sütun sütunu] gerekli.');
                        return { ...head, ...pivot(t, rows, groups[0], groups[1], ms[0] || { fonk: 'say' }) };
                    case 'trend':
                        if (!str(a.tarih_sutun)) throw new AnalysisError('trend için tarih_sutun gerekli.');
                        return { ...head, ...trend(t, rows, str(a.tarih_sutun), ms[0] || { fonk: 'say' }, (str(a.periyot) || 'ay') as Period) };
                    case 'dagilim': return { ...head, ...distribution(t, rows, str(a.sutun)) };
                    case 'aykiri': return { ...head, ...outliers(t, rows, str(a.sutun), listArg(a.goster).map(String)) };
                    case 'korelasyon': return { ...head, ...correlation(t, rows, str(a.sutun), str(a.sutun2)) };
                    case 'satirlar': return { ...head, ...topRows(t, rows, { sirala: str(a.sirala) || undefined, artan: a.artan === true, limit, sutunlar: listArg(a.goster).map(String) }) };
                    default: throw new AnalysisError(`islem ${ISLEMLER.join(', ')} olmalı.`);
                }
            } catch (e) {
                if (e instanceof AnalysisError) throw new ToolError(e.message);
                throw e;
            }
        },
    },
    {
        label: 'Yetenek yükleme',
        requires: 'files',
        spec: {
            name: 'yetenek_yukle',
            description: 'Yeteneğin oyun kitabını (adımlar, şablon, kalite kontrol) açar; istek bir yeteneğe uyuyor ama "Etkin yetenek" yoksa yanıtlamadan önce çağır.',
            parameters: S.obj({ ad: S.str('', SKILLS.map(s => s.id)) }, ['ad']),
        },
        run: a => {
            const sk = skillById(str(a.ad));
            if (!sk) throw new ToolError(`"${str(a.ad)}" diye bir yetenek yok. Yetenekler: ${SKILLS.map(s => s.id).join(', ')}.`);
            return { yetenek: sk.name, oyun_kitabi: sk.playbook };
        },
    },
];

/** Ekli tabloların modele gösterilen listesi (sistem talimatında) */
export const tablesPromptSection = (tables: DataTable[] | undefined): string =>
    tables?.length ? `Ekli tablolar (veri_analiz ile TÜM satırlar üzerinde hesap yapılabilir; mesajdaki EK metni kısaltılmış olabilir):\n${tables.slice(0, 12).map(t => `- ${describeTable(t)}`).join('\n')}` : '';

// ---------------------------------------------------------------------------
// Hafıza: kullanıcının kalıcı tercihleri (bu tarayıcıda). Yazma ve silme yalnız
// kullanıcı bu turda kendi mesajında açıkça isterse yapılır.
// ---------------------------------------------------------------------------

const REMEMBER_INTENT = /hatırla|unutma|aklında tut|bundan (sonra|böyle)|her zaman|hep |tercih|kaydet|not al|bilmelisin|bil ki|hafıza|hafiza|hitap|diye seslen/i;
const FORGET_INTENT = /unut|sil|kaldır|çıkar|temizle|hatırlama/i;
const MEMORY_SECTIONS = ['uslup', 'tercih', 'not'] as const;

const MEMORY_TOOLS: ToolDef[] = [
    {
        label: 'Hafızaya kaydetme',
        requires: 'memory',
        spec: {
            name: 'hafiza_kaydet',
            description: 'Kullanıcının hafiza.md belgesine bir satır yazar. Yalnız kullanıcı açıkça isterse; kısa, genel bir cümle. Değişebilecek bilgi "Anahtar: değer" biçiminde (ör. "Ana proje: ATLAS", "Hitap: Murat Bey") yazılırsa aynı anahtarlı eski satırın yerini alır.',
            parameters: S.obj({
                not: S.str('En çok 300 karakter'),
                bolum: S.str('uslup: hitap, yazım tarzı, yanıt uzunluğu (her yanıtta, eskimez); tercih: kalıcı çalışma tercihi (her yanıtta, eskimez); not: tarihli bağlam (yalnız ilgili sorularda, eskir). Varsayılan not.', [...MEMORY_SECTIONS]),
                onemli: S.bool('Önemli not: daha yavaş eskir'),
                etiketler: { type: 'array', items: S.str('Tek kelime, ör. atlas'), description: 'Notun konusu (proje kodu, kişi, konu); ilgili sorularda bulunmasını sağlar' },
            }, ['not']),
        },
        run: (a, ctx) => {
            if (!ctx.memory) throw new ToolError('Hafıza bu ortamda kullanılamıyor.');
            if (!REMEMBER_INTENT.test(ctx.memory.userPrompt)) throw new ToolError('Kullanıcı bu mesajda hatırlamanı istemedi; hafızaya yalnız açık istekle yazılır.');
            const bolum = MEMORY_SECTIONS.find(x => x === str(a.bolum)) || 'not';
            try {
                const r = ctx.memory.store.add(str(a.not), { section: bolum, important: a.onemli === true, tags: listArg(a.etiketler).map(String) });
                return {
                    kaydedildi: r.item.text,
                    bolum,
                    ...(r.replaced ? { yerini_aldi: r.replaced.text } : {}),
                    ...(r.existed ? { not: 'Bu satır zaten vardı; tarihi yenilendi.' } : {}),
                    toplam: ctx.memory.store.list().filter(i => i.section !== 'arsiv').length,
                };
            } catch (e) {
                throw new ToolError((e as Error).message);
            }
        },
    },
    {
        label: 'Hafızadan silme',
        requires: 'memory',
        spec: {
            name: 'hafiza_sil',
            description: 'Hafızadaki bir satırı (metin parçasıyla) ya da hepsini siler; yalnız kullanıcı "unut/sil" derse.',
            parameters: S.obj({ not: S.str('Metin parçası'), hepsi: S.bool('Tümünü sil') }),
        },
        run: (a, ctx) => {
            if (!ctx.memory) throw new ToolError('Hafıza bu ortamda kullanılamıyor.');
            if (!FORGET_INTENT.test(ctx.memory.userPrompt)) throw new ToolError('Kullanıcı bu mesajda silmeni istemedi.');
            if (a.hepsi === true) {
                const n = ctx.memory.store.list().length;
                ctx.memory.store.clear();
                return { silinen: n };
            }
            const ref = typeof a.not === 'number' ? a.not : str(a.not);
            if (ref === '') throw new ToolError('Silinecek notu (metin parçası) verin.');
            const hit = ctx.memory.store.remove(ref);
            if (!hit) throw new ToolError(`"${ref}" hafızada bulunamadı.`);
            return { silindi: hit.text, kalan: ctx.memory.store.list().filter(i => i.section !== 'arsiv').length };
        },
    },
];

// ---------------------------------------------------------------------------
// Araç grubu açma: soruya göre seçilen gruplar yetmezse model eksik grubu açar
// ---------------------------------------------------------------------------

const ROUTING_TOOLS: ToolDef[] = [
    {
        label: 'Araç açma',
        requires: 'toolGroups',
        spec: {
            name: 'arac_ac',
            description: `Bu turda sana yalnız soruyla ilgili araçlar verildi. Gereken araç yoksa ilgili grubu aç; açılan araçlar sonraki adımda kullanılabilir. Gruplar: ${groupCatalog()}.`,
            parameters: S.obj({ gruplar: { type: 'array', items: S.str('', ALL_GROUPS.filter(g => g !== 'temel')), description: 'Açılacak gruplar' } }, ['gruplar']),
        },
        run: (a, ctx) => {
            if (!ctx.toolGroups) throw new ToolError('Bu ortamda tüm araçlar zaten açık.');
            const want = listArg(a.gruplar).map(String).filter((g): g is ToolGroup => (ALL_GROUPS as string[]).includes(g));
            if (!want.length) throw new ToolError(`Geçerli bir grup verin: ${ALL_GROUPS.filter(g => g !== 'temel').join(', ')}.`);
            for (const g of want) ctx.toolGroups.add(g);
            const opened = AI_TOOLS.filter(t => toolAvailable(t, ctx) && groupsOfTool(t.spec.name).some(g => want.includes(g))).map(t => t.spec.name);
            return { acilan_gruplar: want, araclar: opened, ...(opened.length ? {} : { not: 'Bu gruplarda rolünüze açık araç yok.' }) };
        },
    },
];

AI_TOOLS.push(...PROPOSAL_TOOLS, ...AGENT_TOOLS, ...JIRA_TOOLS, ...WORKFORCE_TOOLS, ...POOL_TOOLS, ...ANALYSIS_TOOLS, ...FILE_TOOLS, ...MEMORY_TOOLS, ...ROUTING_TOOLS);

const TOOL_MAP = new Map(AI_TOOLS.map(t => [t.spec.name, t]));

/** Bu kullanıcıya sunulacak araç tanımları (yönetici rollerine not/istek araçları hiç gönderilmez) */
const toolAvailable = (t: ToolDef, ctx: ToolContext): boolean =>
    (!t.privateOnly || ctx.canSeePrivate) && (!t.writeOnly || ctx.canWrite) && (!t.poolWrite || ctx.canWritePool) && (!t.permission || can(ctx.identity, t.permission))
    && (!t.requires || !!ctx[t.requires]);

/** Bu turda modele sunulan araçlar: rol kapsamı + (tarayıcı sohbetinde) soruya göre seçilen gruplar */
const inRoute = (t: ToolDef, ctx: ToolContext): boolean => {
    if (!ctx.toolGroups) return true;
    const groups = groupsOfTool(t.spec.name);
    return groups.length === 0 || groups.some(g => ctx.toolGroups!.has(g));
};

export const toolSpecsFor = (ctx: ToolContext): ToolSpec[] => AI_TOOLS.filter(t => toolAvailable(t, ctx) && inRoute(t, ctx)).map(t => t.spec);

export const toolLabel = (name: string): string => TOOL_MAP.get(name)?.label || name;

/** Araç türü (arayüzde simge): okuma, öneri, arayüz komutu ya da Jira */
export const toolKind = (name: string): 'read' | 'propose' | 'ui' | 'jira' | 'file' | 'memory' => {
    const t = TOOL_MAP.get(name);
    if (!t) return 'read';
    if (t.requires === 'files') return t.spec.name === 'dosya_olustur' ? 'file' : 'read';
    if (t.requires === 'memory') return 'memory';
    if (t.requires === 'toolGroups') return 'read';
    if (t.requires === 'ui' || t.requires === 'whiteboard') return 'ui';
    // Onay isteyen öneriler (ör. oner_jira_esitle) Jira'ya bağlı olsa da öneri sayılır
    if (t.writeOnly || t.poolWrite) return 'propose';
    return t.requires === 'jira' ? 'jira' : 'read';
};

const serialize = (value: unknown): string => {
    const s = JSON.stringify(value, (_k, v) => (v === undefined ? undefined : v));
    if (s.length <= MAX_TOOL_RESULT_CHARS) return s;
    return JSON.stringify({
        kisaltildi: true,
        not: 'Sonuç çok büyük olduğu için kısaltıldı; daha dar bir filtre ya da limit kullanın.',
        veri: s.slice(0, MAX_TOOL_RESULT_CHARS - 300),
    });
};

/** Aracı çalıştırır; sonuç (ya da hata açıklaması) modele gidecek JSON metnidir */
export const executeTool = async (call: Pick<ToolCall, 'name' | 'arguments'>, ctx: ToolContext): Promise<{ content: string; ok: boolean }> => {
    const def = TOOL_MAP.get(call.name);
    if (!def || !toolAvailable(def, ctx)) {
        return { content: JSON.stringify({ hata: `Bilinmeyen ya da bu rol için kullanılamayan araç: ${call.name}` }), ok: false };
    }
    try {
        return { content: serialize(await def.run(normalizeEnumArgs(def.spec.parameters, call.arguments || {}), ctx)), ok: true };
    } catch (e) {
        if (e instanceof ToolError) return { content: JSON.stringify({ hata: e.message }), ok: false };
        console.error(`[ai] araç hatası (${call.name}):`, (e as Error)?.message);
        return { content: JSON.stringify({ hata: 'Araç çalıştırılırken beklenmeyen bir hata oluştu.' }), ok: false };
    }
};
