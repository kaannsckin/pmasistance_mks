import { ProjectStatus, RagStatus, RiskStatus, Task, TaskStatus } from '../../types';
import { getPlanLockStatus, MONTH_INDEXES, ROLE_LABELS, summarizeByProject } from '../allocations';
import { AUDIT_ACTION_LABELS } from '../audit';
import { buildCostReport } from '../costing';
import { CATEGORY_LABELS, analyzeDataHealth } from '../dataHealth';
import { departmentScorecards, orgCapacity } from '../deptScorecard';
import { buildPortfolioEVM, buildProjectEVM, defaultStatusMonth, ProjectEVM } from '../evm';
import { attentionItems, executiveSummary, portfolioHealth, projectHealth } from '../executive';
import { buildForecast, FORECAST_DIM_LABELS, FORECAST_METHOD_LABELS, ForecastDim, ForecastMethod } from '../forecast';
import { buildPersonProfile } from '../personProfile';
import { recentChanges } from '../recentChanges';
import { buildRoleAnalysis, summarizeGaps } from '../roleAnalysis';
import { RISK_BAND_LABELS, RISK_STATUS_LABELS, riskBand, riskScore, summarizeRisks } from '../risks';
import { allPersonRoles, findAvailablePeople } from '../staffing';
import { buildStatusReport } from '../statusReport';
import { buildUtilization } from '../utilization';
import { RAG_SOURCE_LABELS, RagSourceType } from '../rag/sources';
import { summarizeWorkPackages } from '../workPackages';
import { AiAction, AiProposal, describeAction, validateAction } from './actions';
import { JsonSchema, ToolCall, ToolSpec } from './protocol';
import {
    clampLimit, maskSicil, matchByText, months12, personName, r2, resolveDepartmentCode, resolvePerson,
    resolveProject, resolveYear, ToolContext, ToolError,
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
            description: 'Serbest metin bilgi tabanında anlam ve anahtar kelime araması: haftalık notlar, görev açıklama/yorumları, risk açıklama ve aksiyonları, müşteri istekleri, PESTEL/SWOT maddeleri, hedefler, proje durum notları, uygulamanın kullanım kılavuzu ve Bilgi Bankası\'na yüklenen kurumsal dokümanlar. "Nasıl yapılır" soruları, geçmiş kararlar/konuşmalar, notlarda veya dokümanlarda geçen konular için kullan. Sayısal sorular için yapısal araçları tercih et. Yanıtta kullandığın bilgiyi [no] biçiminde kaynak numarasıyla belirt.',
            parameters: S.obj({
                sorgu: S.str('Aranacak konu; doğal dilde, anahtar kelimeleri içeren kısa bir ifade.'),
                kaynak: S.str('Yalnızca bu kaynak türünde ara (isteğe bağlı): not, gorev, risk, istek, analiz (PESTEL/SWOT), hedef, proje, kilavuz (kullanım kılavuzu), dokuman (kurumsal dokümanlar).', RAG_TYPES),
                proje: S.str('Yalnızca bu projede ara (isteğe bağlı; proje adı ya da kodu).'),
                limit: S.int('En fazla kaç pasaj (varsayılan 6, en çok 10).'),
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
                    },
                    acik_risk: (p.risks || []).filter(r => r.status !== 'closed').length,
                    guncellendi: p.updatedAt?.slice(0, 10),
                })),
            };
        },
    },
    {
        label: 'Portföy özeti',
        spec: {
            name: 'portfoy_ozeti',
            description: 'Portföy sağlık skoru (0-100), proje bazında sağlık/SPI/CPI ve skoru düşüren nedenler, "dikkat gerektirenler" listesi (onay bekleyen plan, bütçe/takvim sapması, kritik RAG, geciken iş, aşırı tahsis, veri sorunları) ve risk özeti. Genel durum soruları için ilk tercih.',
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
                    proje: h.name, skor: h.score, bant: h.band, rag: h.rag ? RAG_TR[h.rag] : undefined,
                    spi: r2(h.spi), cpi: r2(h.cpi), yuksek_risk: h.highRisks, nedenler: h.reasons,
                })),
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
            description: 'Tek projenin ayrıntılı durumu: sağlık skoru ve nedenleri, görev istatistikleri, geciken ve 14 gün içinde bitecek görevler, en yüksek riskler, iş paketleri, hedefler, bu yılın plan/gerçekleşen adam-ayı, plan kilidi ve EVM özeti.',
            parameters: S.obj({ proje: P.project, yil: P.year }),
        },
        run: (a, ctx) => {
            const p = resolveProject(ctx, a.proje);
            const year = resolveYear(ctx, a.yil);
            const statusMonth = defaultStatusMonth(year, ctx.now);
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
                saglik: { skor: h.score, bant: h.band, spi: r2(h.spi), cpi: r2(h.cpi), nedenler: h.reasons },
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
                metin: S.str('Görev adında / açıklamasında geçen metin.'),
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
                    if (metin && !norm(`${t.name} ${t.notes || ''}`).includes(metin)) return;
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
                projeler: prof.byProject.map(b => ({ proje: b.projectName, rol: b.role, plan_aa: r2(b.total), aylik_plan: months12(b.months) })),
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
            const rows = findAvailablePeople(people, ctx.ws.allocations, ctx.ws.leaves || [], { role, year, months, requiredAA: required });
            return {
                sorgu: { rol: role || 'tümü', yil: year, aylar: `${start}-${end}`, gerekli_aa: required, bolum: dept },
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
            description: 'Bölüm bazında kapasite sağlığı: kişi sayısı, yıllık efektif kapasite, planlanan/gerçekleşen AA, doluluk, aşırı yüklü kişi, katkı verilen proje sayısı. Bölüm verilirse kişi kırılımı da döner.',
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
            if (a.sadece_acik !== false) rows = rows.filter(r => r.totals.gap > 0);
            return {
                yil: year, bolum: dept, acigi_olan_rol: gaps.rolesWithGap, toplam_acik_aa: gaps.totalGapAA,
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
            description: 'Gerçekleşen adam-ay verisinden yılın kalan aylarını tahmin eder; yıl sonu tahmini (EAC = gerçekleşen + öngörü), plana göre sapma ve ünvan oranlarıyla tahmini maliyet. Proje/kişi/bölüm kırılımı.',
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
            const statusMonth = defaultStatusMonth(year, ctx.now);
            if (str(a.proje)) {
                const p = resolveProject(ctx, a.proje);
                const e = buildProjectEVM(ctx.scoped, p.id, year, statusMonth);
                if (!e) throw new ToolError('EVM hesaplanamadı.');
                return { yil: year, ...evmRow(e) };
            }
            const pf = buildPortfolioEVM(ctx.scoped, year, [...ctx.visibleProjectIds], statusMonth);
            return {
                yil: year, durum_ayi: pf.statusMonth, bac: Math.round(pf.bac), pv: Math.round(pf.pv), ev: Math.round(pf.ev), ac: Math.round(pf.ac),
                spi: r2(pf.spi), cpi: r2(pf.cpi), eac: Math.round(pf.eac), vac: Math.round(pf.vac),
                maliyetli_unvan_sayisi: pf.costedTitleCount,
                projeler: pf.projects.filter(e => e.costed).slice(0, 30).map(evmRow),
            };
        },
    },
    {
        label: 'Maliyet raporu',
        spec: {
            name: 'maliyet_raporu',
            description: 'Tahsis × ünvan aylık maliyetinden (TL) plan ve gerçekleşen maliyet: toplam, aylık, proje ve bölüm bazında; maliyetlenemeyen (ünvanı/oranı eksik) kişi sayısı.',
            parameters: S.obj({ yil: P.year, proje: S.str('Proje adı ya da kodu (isteğe bağlı).') }),
        },
        run: (a, ctx) => {
            const year = resolveYear(ctx, a.yil);
            const c = buildCostReport(ctx.ws, year);
            const row = (r: typeof c.byProject[number]) => ({ ad: r.label, plan_tl: r.planCost, gerceklesen_tl: r.actualCost, sapma_tl: r.varianceCost });
            if (str(a.proje)) {
                const p = resolveProject(ctx, a.proje, { anyProject: true });
                const r = c.byProject.find(x => x.key === p.id);
                return r ? { yil: year, proje: p.name, ...row(r) } : { yil: year, proje: p.name, not: 'Bu proje için maliyetlenebilir tahsis yok.' };
            }
            return {
                yil: year, plan_tl: c.totalPlanCost, gerceklesen_tl: c.totalActualCost, sapma_tl: c.totalVarianceCost,
                aylik_plan_tl: c.monthlyPlanCost, aylik_gerceklesen_tl: c.monthlyActualCost,
                projeler: c.byProject.slice(0, 30).map(row), bolumler: c.byDepartment.map(row),
                maliyetlenemeyen_kisi_sayisi: c.uncostedPeople.length, maliyetli_unvan_sayisi: c.costedTitleCount,
            };
        },
    },
    {
        label: 'Veri sağlığı',
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
            description: 'Projenin haftalık durum raporu taslağını üretir (görev ilerlemesi, geciken/yaklaşan işler, RAG, bu ay tahsis, riskler, haftanın notları). Kullanıcı rapor/e-posta yazmak istediğinde temel olarak kullan.',
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

const propose = (ctx: ToolContext, action: AiAction) => {
    const err = validateAction(ctx.ws, action);
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
            description: 'Projeye yeni risk eklemeyi ÖNERİR (kullanıcı onaylamadan uygulanmaz). Kullanıcı açıkça risk eklemek istediğinde ya da notlardan/gecikmelerden net bir risk çıkardığında kullan.',
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
            description: 'Projeye yeni görev eklemeyi ÖNERİR (kullanıcı onaylamadan uygulanmaz).',
            parameters: S.obj({
                proje: P.project,
                ad: S.str('Görev adı.'),
                oncelik: S.str('Öncelik (varsayılan Medium).', ['Blocker', 'High', 'Medium', 'Low']),
                atanan: S.str('Atanacak kişinin adı soyadı (veri havuzundan).'),
                bitis: S.str('Bitiş tarihi YYYY-AA-GG.'),
                sure_iyimser: S.num('İyimser süre (gün).'),
                sure_ortalama: S.num('Ortalama süre (gün).'),
                sure_kotumser: S.num('Kötümser süre (gün).'),
                aciklama: S.str('Görev açıklaması.'),
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
            });
        },
    },
    {
        label: 'Görev durumu önerisi',
        writeOnly: true,
        spec: {
            name: 'oner_gorev_durumu',
            description: 'Bir görevin durumunu değiştirmeyi ÖNERİR (kullanıcı onaylamadan uygulanmaz).',
            parameters: S.obj({
                proje: P.project,
                gorev: S.str('Görevin adı (kısmi olabilir).'),
                durum: S.str('Yeni durum.', ['Backlog', 'ToDo', 'InProgress', 'Done']),
            }, ['gorev', 'durum']),
        },
        run: (a, ctx) => {
            const project = resolveProject(ctx, a.proje);
            const status = str(a.durum) as TaskStatus;
            if (!Object.values(TaskStatus).includes(status)) throw new ToolError('Durum Backlog, ToDo, InProgress ya da Done olmalı.');
            const hits = matchByText(project.tasks, str(a.gorev), t => [t.name]);
            if (hits.length === 0) throw new ToolError(`"${str(a.gorev)}" adlı görev ${project.name} projesinde bulunamadı.`);
            if (hits.length > 1) throw new ToolError(`"${str(a.gorev)}" birden fazla görevle eşleşti: ${hits.slice(0, 8).map(t => t.name).join(', ')}.`);
            return propose(ctx, { type: 'gorev_durumu', projectId: project.id, taskId: hits[0].id, status });
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
        label: 'Tahsis önerisi',
        writeOnly: true,
        spec: {
            name: 'oner_tahsis_ayarla',
            description: 'Bir kişinin bir projedeki belirli ayının plan ya da gerçekleşen adam-ay değerini ayarlamayı ÖNERİR (kullanıcı onaylamadan uygulanmaz). Birden çok ay için ayrı ayrı çağır. Plan kilitliyse yalnızca gerçekleşen değiştirilebilir.',
            parameters: S.obj({
                kisi: S.str('Kişinin adı soyadı.'),
                proje: S.str('Proje adı ya da kodu.'),
                yil: P.year,
                ay: S.int('Ay (1-12).'),
                alan: P.field,
                aa: S.num('Yeni adam-ay değeri (0-1,5; 0 = boşalt).'),
            }, ['kisi', 'proje', 'ay', 'aa']),
        },
        run: (a, ctx) => {
            const person = resolvePerson(ctx, a.kisi);
            const project = resolveProject(ctx, a.proje, { anyProject: true });
            const value = Number(a.aa);
            if (!Number.isFinite(value)) throw new ToolError('aa sayısal olmalı.');
            return propose(ctx, {
                type: 'tahsis_ayarla', personId: person.id, projectId: project.id, year: resolveYear(ctx, a.yil),
                month: Number(a.ay), field: effortField(a.alan), value: Math.round(value * 100) / 100,
            });
        },
    },
];

AI_TOOLS.push(...PROPOSAL_TOOLS);

const TOOL_MAP = new Map(AI_TOOLS.map(t => [t.spec.name, t]));

/** Bu kullanıcıya sunulacak araç tanımları (yönetici rollerine not/istek araçları hiç gönderilmez) */
export const toolSpecsFor = (ctx: ToolContext): ToolSpec[] =>
    AI_TOOLS.filter(t => (!t.privateOnly || ctx.canSeePrivate) && (!t.writeOnly || ctx.canWrite)).map(t => t.spec);

export const toolLabel = (name: string): string => TOOL_MAP.get(name)?.label || name;

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
    if (!def || (def.privateOnly && !ctx.canSeePrivate) || (def.writeOnly && !ctx.canWrite)) {
        return { content: JSON.stringify({ hata: `Bilinmeyen ya da bu rol için kullanılamayan araç: ${call.name}` }), ok: false };
    }
    try {
        return { content: serialize(await def.run(call.arguments || {}, ctx)), ok: true };
    } catch (e) {
        if (e instanceof ToolError) return { content: JSON.stringify({ hata: e.message }), ok: false };
        console.error(`[ai] araç hatası (${call.name}):`, (e as Error)?.message);
        return { content: JSON.stringify({ hata: 'Araç çalıştırılırken beklenmeyen bir hata oluştu.' }), ok: false };
    }
};
