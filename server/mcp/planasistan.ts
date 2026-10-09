import { randomUUID } from 'node:crypto';
import type { Person, UserRole, WorkspaceData } from '../../types.js';
import { ROLE_LABELS } from '../../utils/allocations.js';
import { AiAction, applyAction } from '../../utils/ai/actions.js';
import { appendAudit } from '../../utils/audit.js';
import { JiraImportOptions, mergeJiraIssues, previewJiraImport, sinceMonths } from '../../utils/planning/jiraImport.js';
import type { Env } from '../ai/config.js';
import { fetchJiraIssuesPage, fetchJiraWorklogs, JiraIssueRecord, jiraProjectAllowed } from '../integrations/handler.js';
import { aiPolicyOf } from '../../utils/ai/policy.js';
import type { ToolSpec } from '../../utils/ai/protocol.js';
import { buildToolContext, matchByText, personName, resolveProject, ToolContext } from '../../utils/ai/scope.js';
import { APP_MAP } from '../../utils/ai/systemPrompt.js';
import { AI_TOOLS, executeTool, toolSpecsFor } from '../../utils/ai/tools.js';
import { Retriever } from '../../utils/rag/retriever.js';
import { guideDocs, workspaceDocs } from '../../utils/rag/sources.js';
import { canEditProjectContent, identityNeedsPerson } from '../../utils/rbac.js';
import { APP_VERSION } from '../../utils/workspace.js';
import { validateArgs } from './args.js';
import { McpServerOptions, McpTool, McpToolResult } from './protocol.js';
import { ConflictError, LoadedWorkspace, SourceError, WorkspaceSource } from './source.js';

/**
 * PlanAsistan MCP sunucusu: uygulamadaki AI asistanının araç kataloğunu
 * (utils/ai/tools.ts) Claude gibi MCP istemcilerine açar. Araçlar aynıdır,
 * kapsam kuralları aynıdır (utils/ai/scope.ts): yapılandırılan kimlik (rol +
 * kişi) arayüzde neyi görüyorsa Claude da yalnız onu görür; sayıları model
 * değil uygulamanın hesap motorları üretir; sicil hiçbir çıktıya girmez.
 *
 * Değişiklikler iki adımlıdır, uygulamadaki öneri kartı gibi: oner_* araçları
 * doğrulanmış bir ÖNERİ hazırlar, kullanıcı onaylarsa oneriyi_uygula yeniden
 * doğrulayıp (güncel veriyle) buluta yazar. Yazma varsayılanda kapalıdır.
 */

export const STATUS_TOOL = 'planasistan_durum';
export const APPLY_TOOL = 'oneriyi_uygula';
export const JIRA_IMPORT_TOOL = 'jira_aktar';
export const JIRA_WORKLOG_TOOL = 'jira_worklog';

/** Bir aktarımda en çok bu kadar Jira sayfası (100'er kayıt) alınır — uygulamadaki sınırla aynı */
const JIRA_MAX_PAGES = 50;

/** Uygulanmamış öneri bu süre sonra düşer */
const PROPOSAL_TTL_MS = 30 * 60_000;
const MAX_PROPOSALS = 50;

export interface PlanAsistanMcpOptions {
    source: WorkspaceSource | null;
    /** Kaynak kurulamadıysa nedeni (durum aracında ve araç hatalarında gösterilir) */
    setupError?: string;
    /** PLANASISTAN_ROLE — yoksa bulut üyelik rolü ya da yedekteki kimlik */
    role?: UserRole;
    /** PLANASISTAN_PERSON — kişi adı soyadı ya da havuz id'si */
    person?: string;
    /** PLANASISTAN_PROJECT — proje verilmeyen sorularda kullanılacak proje */
    project?: string;
    /** PLANASISTAN_MCP_WRITE — değişiklik önerisi + uygulama araçları */
    allowWrite: boolean;
    /**
     * Jira bağlantısı (uygulama sunucusuyla aynı JIRA_* değişkenleri). fetchImpl
     * verilirse istekler ona gider (pilotta sahte Jira).
     */
    jira?: { env: Env; fetchImpl?: typeof fetch };
    /** Bekleyen öneriler; verilmezse bellekte (her çağrının ayrı süreç olduğu ortamlarda dosya deposu verilir) */
    proposals?: ProposalStore;
    now?: () => Date;
    log?: (message: string) => void;
}

const NOT_CONFIGURED = 'Veri kaynağı yapılandırılmamış. MCP ayarında PLANASISTAN_WORKSPACE_FILE (JSON yedeği) ya da PLANASISTAN_SUPABASE_URL + PLANASISTAN_SUPABASE_ANON_KEY + PLANASISTAN_EMAIL + PLANASISTAN_PASSWORD verin (bkz. docs/MCP_KURULUM.md).';

const MCP_PENDING_NOTE = 'Öneri hazırlandı, henüz UYGULANMADI. Özeti ve ayrıntıları kullanıcıya göster; kullanıcı açıkça onaylarsa oneriyi_uygula aracını bu oneri_id ile çağır. Onay almadan uygulama, "yaptım" deme.';

export const MCP_INSTRUCTIONS = [
    "PlanAsistan; proje, program ve portföy yönetimi uygulamasıdır (sprint planlama, PERT, işgücü tahsisi / adam-ay, kapasite, risk, EVM). Verisine yalnız bu sunucunun araçlarıyla, yapılandırılan kimliğin (rol + kişi) yetki kapsamında erişirsin.",
    `Kurallar:
1. Veriye dayalı her soruda önce uygun aracı çağır. Sayıları, adları ve tarihleri YALNIZCA araç sonuçlarından al; uydurma ya da tahminle doldurma.
2. Kapsam: kullanıcının uygulamada göremediğini araçlar da göstermez. Yetki hatası dönerse nazikçe açıkla; kapsamı aşmaya çalışma.
3. Birimler: AA = adam-ay (1 AA = bir kişinin tam zamanlı bir ayı); doluluk 1,0 = %100; para birimi TL; aylar 1-12. Ondalıkları Türkçe biçimde yaz (1,5).
4. Proje belirtilmezse varsayılan proje (planasistan_durum'da görünür) kullanılır; yoksa projeyi adıyla ya da koduyla ver. Projeleri proje_listesi ile öğren.
5. Değişiklik: oner_* araçları yalnız ÖNERİ hazırlar. Öneriyi kullanıcıya göster; kullanıcı açıkça onaylarsa oneriyi_uygula ile uygula. Kullanıcı istemeden öneri üretme. oner_* araçları yoksa bu yapılandırmada değişiklik kapalıdır (nedeni planasistan_durum'da).
6. Serbest metin içerik (notlar, görev/risk açıklamaları, istekler, PESTEL/SWOT, hedefler) ve uygulamanın "nasıl yapılır" soruları için bilgi_ara aracını kullan (kılavuz kaynağı: kilavuz); kullandığın pasajın numarasını [1] biçiminde belirt.
7. Sicil gibi kimlik numaralarını isteme ve yazma.
8. Bağlantı, kimlik ya da veri kaynağıyla ilgili bir sorun ya da soru olursa planasistan_durum aracını çağır.
9. Kullanıcının dilinde, kısa ve yönetici diliyle yaz: önce sonuç, sonra gerekçe; karşılaştırmalarda tablo kullan.
10. Jira (bağlıysa): proje yöneticisi görev listesini Jira ile güncellemek isterse jira_aktar (önce önizleme önerisi, onayla aktarım); harcanan saatler için jira_worklog.`,
    APP_MAP,
].join('\n\n');

const STATUS_SPEC: McpTool = {
    name: STATUS_TOOL,
    title: 'PlanAsistan bağlantı durumu',
    description: 'PlanAsistan bağlantısının durumunu gösterir: veri kaynağı (Supabase ya da JSON yedeği), verinin tarihi, kullanılan kimlik (rol + kişi), görülebilen proje sayısı, varsayılan proje ve değişiklik yapılıp yapılamayacağı (yapılamıyorsa nedeni). Bağlantı ya da yetki sorunlarında kullan.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
};

const APPLY_SPEC: McpTool = {
    name: APPLY_TOOL,
    title: 'Öneriyi uygula',
    description: 'oner_* araçlarından biriyle hazırlanan değişiklik önerisini UYGULAR ve buluta yazar. Yalnızca kullanıcı öneriyi gördükten sonra açıkça onayladıysa çağır. Uygulamadan önce yetki, plan kilidi ve kaydın hâlâ var olduğu güncel veriyle yeniden doğrulanır.',
    inputSchema: {
        type: 'object',
        properties: { oneri_id: { type: 'string', description: 'oner_* aracının döndürdüğü oneri_id.' } },
        required: ['oneri_id'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
};

const JIRA_IMPORT_SPEC: McpTool = {
    name: JIRA_IMPORT_TOOL,
    title: 'Jira\'dan kayıt geçmişi',
    description: 'Projenin Jira kayıtlarını uygulamaya aktarmayı ÖNERİR (Planlama › "Jira\'dan geçmiş" ile aynı): başlık, tür, önem, durum ve durum geçmişi, ilk tahmin, harcanan süre, story point, sürüm, termin. Kayıtlar Jira anahtarıyla birleşir; uygulamadaki planlama alanları (sürüm, öncül, iş paketi, kendi tahmini, termin) korunur. Önizleme (yeni / güncellenecek / değişmeyen kayıt) öneri olarak döner; oneriyi_uygula çağrılana kadar aktarılmaz.',
    inputSchema: {
        type: 'object',
        properties: {
            proje: { type: 'string', description: 'Proje adı ya da kodu. Verilmezse varsayılan proje.' },
            kapsam: { type: 'string', enum: ['all', 'done'], description: 'all: açık kayıtlar dahil (varsayılan), done: yalnız kapanmışlar.' },
            donem_ay: { type: 'integer', description: 'Son kaç ayda kapanan kayıtlar (6, 12, 24, 36; 0 = tümü). Varsayılan 12.' },
        },
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
};

const JIRA_WORKLOG_SPEC: McpTool = {
    name: JIRA_WORKLOG_TOOL,
    title: 'Jira worklog özeti',
    description: 'Projenin Jira\'daki worklog kayıtlarını tarih aralığında özetler: toplam saat, kişi, kayıt ve gün bazında (haftalık rapordaki "Jira\'dan çek" ile aynı kaynak). Varsayılan aralık son 7 gün.',
    inputSchema: {
        type: 'object',
        properties: {
            proje: { type: 'string', description: 'Proje adı ya da kodu. Verilmezse varsayılan proje.' },
            baslangic: { type: 'string', description: 'Başlangıç tarihi YYYY-AA-GG (dahil).' },
            bitis: { type: 'string', description: 'Bitiş tarihi YYYY-AA-GG (dahil). Varsayılan bugün.' },
        },
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
};

export type PendingProposal =
    | { kind: 'action'; action: AiAction; title: string; at: number }
    | { kind: 'jira'; projectId: string; key: string; issues: JiraIssueRecord[]; opts: JiraImportOptions; label: string; title: string; at: number };
type Pending = PendingProposal;

/** Uygulanmamış önerilerin deposu */
export interface ProposalStore {
    get: (id: string) => PendingProposal | undefined;
    set: (id: string, p: PendingProposal) => void;
    delete: (id: string) => void;
    /** Süresi dolanları (30 dk) ve fazlasını (50) atar */
    prune: (now: number) => void;
}

export const pruneProposals = (entries: [string, PendingProposal][], now: number): [string, PendingProposal][] =>
    entries.filter(([, p]) => now - p.at <= PROPOSAL_TTL_MS).slice(-MAX_PROPOSALS);

export const memoryProposalStore = (): ProposalStore => {
    let m = new Map<string, PendingProposal>();
    return {
        get: id => m.get(id),
        set: (id, p) => { m.set(id, p); },
        delete: id => { m.delete(id); },
        prune: t => { m = new Map(pruneProposals([...m.entries()], t)); },
    };
};

/** Çağrılabilen her aracın parametre şeması (argüman denetimi için) */
const SCHEMAS = new Map<string, ToolSpec['parameters']>([
    ...AI_TOOLS.map(t => [t.spec.name, t.spec.parameters] as [string, ToolSpec['parameters']]),
    [JIRA_IMPORT_TOOL, JIRA_IMPORT_SPEC.inputSchema],
    [JIRA_WORKLOG_TOOL, JIRA_WORKLOG_SPEC.inputSchema],
    [APPLY_TOOL, APPLY_SPEC.inputSchema],
    [STATUS_TOOL, STATUS_SPEC.inputSchema],
]);

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pct = (v: number) => `%${Math.round(v * 100)}`;

const text = (value: unknown, isError = false): McpToolResult => ({
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
});

const fail = (message: string): McpToolResult => text({ hata: message }, true);

const hostOf = (url: string | undefined): string => {
    try { return new URL(url || '').host; } catch { return url || '?'; }
};

const WRITE_TOOLS = new Set(AI_TOOLS.filter(t => t.writeOnly).map(t => t.spec.name));
const LABELS = new Map(AI_TOOLS.map(t => [t.spec.name, t.label]));

const toMcpTool = (spec: ToolSpec): McpTool => ({
    name: spec.name,
    title: LABELS.get(spec.name),
    description: WRITE_TOOLS.has(spec.name) ? `${spec.description} Öneri, ${APPLY_TOOL} çağrılana kadar uygulanmaz.` : spec.description,
    inputSchema: spec.parameters,
    // Öneri araçları da veriyi değiştirmez (yalnız öneri hazırlar); değiştiren oneriyi_uygula
    annotations: { readOnlyHint: true, openWorldHint: false },
});

interface Session {
    loaded: LoadedWorkspace;
    /** Kimliği uygulanmış çalışma alanı (rol + kişi) */
    ws: WorkspaceData;
    ctx: ToolContext;
    person?: Person;
    roleSource: string;
    /** Değişiklik yapılamıyorsa nedeni */
    writeBlock?: string;
}

const findPerson = (ws: WorkspaceData, ref: string): Person => {
    const byId = ws.people.find(p => p.id === ref);
    if (byId) return byId;
    const matches = matchByText(ws.people, ref, p => [personName(p), `${p.lastName} ${p.firstName}`]);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new SourceError(`PLANASISTAN_PERSON "${ref}" birden fazla kişiyle eşleşti: ${matches.slice(0, 8).map(personName).join(', ')}. Ad soyadı tam verin.`);
    throw new SourceError(`PLANASISTAN_PERSON "${ref}" veri havuzunda bulunamadı.`);
};

/** Sunucu tarafında anahtar kelime (BM25) araması — Bilgi Bankası'na yüklenen dokümanlar tarayıcıdadır, burada yoktur */
const keywordRag = (ctx: ToolContext): NonNullable<ToolContext['rag']> => {
    const retriever = new Retriever();
    return {
        search: (query, o) => {
            retriever.sync([...workspaceDocs(ctx), ...guideDocs()]);
            return retriever.search(query, o);
        },
        mode: () => 'anahtar kelime',
    };
};

export const createPlanAsistanMcp = (o: PlanAsistanMcpOptions): McpServerOptions => {
    const now = o.now || (() => new Date());
    const log = o.log || (() => undefined);
    const proposals = o.proposals || memoryProposalStore();
    const prune = () => proposals.prune(Date.now());
    const remember = (p: Pending): string => {
        prune();
        const id = `oneri-${randomUUID().slice(0, 8)}`;
        proposals.set(id, p);
        return id;
    };

    const buildSession = async (fresh = false): Promise<Session> => {
        if (!o.source) throw new SourceError(o.setupError || NOT_CONFIGURED);
        const loaded = await o.source.load({ fresh });
        const base = loaded.ws;
        // Kimlik: açık ayar > bulut üyelik rolü > yedeği alan tarayıcıdaki kimlik
        const fromFile = o.source.kind === 'file';
        const role: UserRole = o.role || (fromFile ? base.currentRole : loaded.memberRole) || 'py';
        const roleSource = o.role ? 'PLANASISTAN_ROLE' : fromFile ? 'yedekteki kimlik' : 'bulut üyelik rolü';
        const personRef = o.person?.trim() || (fromFile && !o.role ? base.currentPersonId : undefined);
        const person = personRef ? findPerson(base, personRef) : undefined;
        const ws: WorkspaceData = { ...base, currentRole: role, currentPersonId: person?.id };
        const ctx = buildToolContext(ws, now());
        if (identityNeedsPerson(ctx.identity)) {
            throw new SourceError(`${ROLE_LABELS[role]} rolü kapsamı kişiye göre belirlenir; MCP ayarında PLANASISTAN_PERSON (ad soyad) verin.`);
        }
        if (!aiPolicyOf(ws).enabled) {
            throw new SourceError('Yapay zekâ kullanımı yönetici konsolunda kurum genelinde kapatılmış (Yönetici konsolu › Yapay zekâ); MCP araçları da bu ayara uyar.');
        }
        // Uygulamadaki "açık proje"nin karşılığı: ayarlanan varsayılan proje, yoksa tek görünür proje
        ctx.activeProjectId = null;
        if (o.project?.trim()) {
            try {
                ctx.activeProjectId = resolveProject(ctx, o.project).id;
            } catch (e) {
                throw new SourceError(`PLANASISTAN_PROJECT: ${(e as Error).message}`);
            }
        } else if (ctx.scoped.projects.length === 1) {
            ctx.activeProjectId = ctx.scoped.projects[0].id;
        }
        ctx.rag = keywordRag(ctx);

        const readOnly = o.source.readOnlyReason();
        const policy = aiPolicyOf(ws);
        const writeBlock = !o.allowWrite ? 'Değişiklik araçları kapalı: MCP ayarında PLANASISTAN_MCP_WRITE=1 verilmemiş.'
            : readOnly ? readOnly
            : !policy.proposals ? 'AI değişiklik önerileri yönetici konsolunda kapatılmış (Yönetici konsolu › Yapay zekâ).'
            : !ctx.canWrite ? `${ROLE_LABELS[role]} rolü veri girmez; değişiklikler yalnız Proje Yöneticisi ve Bölüm Sorumlusu kimliğiyle yapılır.`
            : undefined;
        if (writeBlock) ctx.canWrite = false;
        return { loaded, ws, ctx, person, roleSource, writeBlock };
    };

    const status = async (): Promise<McpToolResult> => {
        if (!o.source) return text({ durum: 'yapılandırılmamış', hata: o.setupError || NOT_CONFIGURED });
        try {
            const s = await buildSession();
            const active = s.ctx.scoped.projects.find(p => p.id === s.ctx.activeProjectId);
            return text({
                durum: 'bağlı',
                sunucu_surumu: APP_VERSION,
                kaynak: s.loaded.label,
                veri_tarihi: s.loaded.dataAt,
                kimlik: {
                    rol: ROLE_LABELS[s.ctx.identity.role],
                    kisi: s.person ? personName(s.person) : undefined,
                    kaynak: s.roleSource,
                },
                ...(s.loaded.memberRole ? { bulut_uyelik_rolu: ROLE_LABELS[s.loaded.memberRole] } : {}),
                gorunur_proje: s.ctx.scoped.projects.length,
                toplam_proje: s.ws.projects.length,
                varsayilan_proje: active ? (active.code ? `${active.name} (${active.code})` : active.name) : 'yok (projeyi adıyla belirtin)',
                notlar_ve_istekler: s.ctx.canSeePrivate ? (s.loaded.privateVisible ? 'görülebilir' : 'bu hesap için bulutta okunamıyor') : 'bu rol göremez',
                degisiklik: s.writeBlock ? `kapalı — ${s.writeBlock}` : `açık (oner_* + ${APPLY_TOOL}, kullanıcı onayıyla)`,
                bilgi_arama: 'anahtar kelime (Bilgi Bankası\'na yüklenen dokümanlar MCP\'de aranmaz)',
                jira: o.jira ? `bağlı (${hostOf(o.jira.env.JIRA_BASE_URL)})` : 'yapılandırılmamış (JIRA_BASE_URL + JIRA_TOKEN ya da JIRA_EMAIL + JIRA_API_TOKEN)',
            });
        } catch (e) {
            return text({ durum: 'hata', hata: (e as Error).message }, true);
        }
    };

    const apply = async (args: Record<string, unknown>): Promise<McpToolResult> => {
        prune();
        const id = typeof args.oneri_id === 'string' ? args.oneri_id.trim() : '';
        const p = proposals.get(id);
        if (!p) return fail(`"${id}" numaralı öneri bulunamadı ya da süresi doldu (30 dk). Öneriyi oner_* aracıyla yeniden hazırlayın.`);
        let s: Session;
        try {
            s = await buildSession(true); // güncel veriyle yeniden doğrula
        } catch (e) {
            return fail((e as Error).message);
        }
        if (s.writeBlock) return fail(s.writeBlock);
        let result: { ws: WorkspaceData; summary: string };
        try {
            result = p.kind === 'action' ? applyAction(s.ws, p.action) : applyJira(s, p);
        } catch (e) {
            proposals.delete(id);
            return fail(`Öneri uygulanamadı: ${(e as Error).message}`);
        }
        try {
            await o.source!.save(s.loaded.ws, result.ws);
        } catch (e) {
            if (e instanceof ConflictError) return fail(`${e.message} Hiçbir şey yazılmadı; aynı öneriyle tekrar deneyebilirsiniz.`);
            if (e instanceof SourceError) return fail(e.message);
            log(`yazma hatası: ${(e as Error)?.message}`);
            return fail('Değişiklik yazılırken beklenmeyen bir hata oluştu.');
        }
        proposals.delete(id);
        log(`uygulandı (${ROLE_LABELS[s.ctx.identity.role]}${s.person ? ` · ${personName(s.person)}` : ''}): ${result.summary}`);
        return text({
            uygulandi: true,
            ozet: result.summary,
            not: o.source!.kind === 'supabase'
                ? 'Değişiklik buluta yazıldı. Uygulamada görmek için Bulut penceresinden "Buluttan Çek" yapılır.'
                : 'Değişiklik JSON dosyasına yazıldı. Uygulamada görmek için dosya "JSON yedek yükle" ile içe aktarılır.',
        });
    };

    /** Jira aktarımını güncel veriyle uygular (uygulamadaki "Jira'dan geçmiş" ile aynı birleştirme ve denetim kaydı) */
    const applyJira = (s: Session, p: Extract<Pending, { kind: 'jira' }>): { ws: WorkspaceData; summary: string } => {
        const project = s.ws.projects.find(x => x.id === p.projectId);
        if (!project) throw new Error('Proje bulunamadı (silinmiş olabilir).');
        if (!canEditProjectContent(s.ws, s.ctx.identity, project.id)) throw new Error(`"${project.name}" projesinde değişiklik yetkiniz yok (yalnızca proje sahibi Proje Yöneticisi).`);
        const others = s.ws.projects.filter(x => x.id !== project.id).flatMap(x => x.tasks.map(t => t.id));
        const r = mergeJiraIssues(project.tasks, p.issues, p.opts, others);
        if (!r.added && !r.updated) throw new Error('Aktarılacak değişiklik kalmadı; uygulama Jira ile zaten güncel.');
        const next: WorkspaceData = { ...s.ws, projects: s.ws.projects.map(x => (x.id === project.id ? { ...x, tasks: r.tasks, jiraProjectKey: p.key, updatedAt: now().toISOString() } : x)) };
        const summary = `"${project.name}" · Jira ${p.key} kayıt geçmişi (${p.label}): ${r.added} yeni, ${r.updated} güncellenen kayıt`;
        return { ws: appendAudit(next, 'data.import', `${summary} — Claude (MCP) ile`, project.id), summary };
    };

    const jiraImport = async (s: Session, args: Record<string, unknown>): Promise<McpToolResult> => {
        if (!o.jira) return fail('Jira bağlantısı yapılandırılmamış (MCP ayarında JIRA_BASE_URL ve jeton).');
        if (s.writeBlock) return fail(s.writeBlock);
        let project;
        try { project = resolveProject(s.ctx, args.proje); } catch (e) { return fail((e as Error).message); }
        if (!canEditProjectContent(s.ws, s.ctx.identity, project.id)) return fail(`"${project.name}" projesine Jira aktarımı yalnız proje sahibi Proje Yöneticisi tarafından yapılır.`);
        const key = (project.jiraProjectKey || '').trim().toUpperCase();
        if (!key) return fail(`"${project.name}" projesinde Jira proje anahtarı tanımlı değil (uygulamada Planlama › Jira'dan geçmiş ekranında girilir).`);
        if (!jiraProjectAllowed(o.jira.env, key)) return fail(`${key} Jira projesi sunucunun izin listesinde (JIRA_ALLOWED_PROJECTS) yok.`);
        const scope = args.kapsam === 'done' ? 'done' : 'all';
        const months = [0, 6, 12, 24, 36].includes(Number(args.donem_ay)) ? Number(args.donem_ay) : 12;
        const since = sinceMonths(months, now());
        const issues: JiraIssueRecord[] = [];
        let truncated = false;
        try {
            let cursor: string | undefined;
            for (let page = 0; ; page++) {
                if (page >= JIRA_MAX_PAGES) { truncated = true; break; }
                const r = await fetchJiraIssuesPage(o.jira.env, { projectKey: key, scope, since, cursor }, o.jira.fetchImpl);
                issues.push(...r.issues);
                if (!r.next) break;
                cursor = r.next;
            }
        } catch (e) {
            return fail(`Jira'dan okunamadı: ${(e as Error).message}`);
        }
        const pm = s.ws.people.find(x => x.id === project.pmPersonId);
        const opts: JiraImportOptions = { importedAt: now().toISOString(), defaultUnit: pm?.departmentCode || '' };
        const prev = previewJiraImport(project, issues, opts);
        const label = `${months ? `son ${months} ay` : 'tüm geçmiş'}, ${scope === 'done' ? 'kapanmış' : 'açıklar dahil'}`;
        const ozet = {
            jira: key, donem: label, alinan: prev.total, kapanmis: prev.closed, acik: prev.open,
            yeni: prev.added, guncellenecek: prev.updated, degismeyen: prev.unchanged,
            egitime_uygun_kapanmis: `${prev.usableBefore} → ${prev.usableAfter}`,
            ilk_tahmini_olan_kapanmis: pct(prev.withEstimate), harcanan_suresi_olan_kapanmis: pct(prev.withSpent),
            ...(truncated ? { not: `İlk ${issues.length} kayıt alındı; daha fazlası için dönemi daraltın.` } : {}),
        };
        if (!prev.added && !prev.updated) return text({ ...ozet, durum: 'Uygulama Jira ile güncel; aktarılacak değişiklik yok.' });
        const title = `Jira aktarımı: ${project.name} (${key})`;
        const oneriId = remember({ kind: 'jira', projectId: project.id, key, issues, opts, label, title, at: Date.now() });
        return text({ oneri_id: oneriId, ozet: title, ayrintilar: ozet, durum: MCP_PENDING_NOTE });
    };

    const jiraWorklog = async (s: Session, args: Record<string, unknown>): Promise<McpToolResult> => {
        if (!o.jira) return fail('Jira bağlantısı yapılandırılmamış (MCP ayarında JIRA_BASE_URL ve jeton).');
        let project;
        try { project = resolveProject(s.ctx, args.proje); } catch (e) { return fail((e as Error).message); }
        const key = (project.jiraProjectKey || '').trim().toUpperCase();
        if (!key) return fail(`"${project.name}" projesinde Jira proje anahtarı tanımlı değil.`);
        if (!jiraProjectAllowed(o.jira.env, key)) return fail(`${key} Jira projesi sunucunun izin listesinde yok.`);
        const day = /^\d{4}-\d{2}-\d{2}$/;
        const to = typeof args.bitis === 'string' && day.test(args.bitis) ? args.bitis : isoDay(now());
        const fromDefault = new Date(now()); fromDefault.setDate(fromDefault.getDate() - 6);
        const from = typeof args.baslangic === 'string' && day.test(args.baslangic) ? args.baslangic : isoDay(fromDefault);
        if (from > to) return fail('Başlangıç bitişten sonra olamaz.');
        let logs;
        try { logs = await fetchJiraWorklogs(o.jira.env, key, from, to, o.jira.fetchImpl); } catch (e) { return fail(`Jira'dan okunamadı: ${(e as Error).message}`); }
        const sum = (rows: { hours: number }[]) => Math.round(rows.reduce((a, b) => a + b.hours, 0) * 10) / 10;
        const group = <K extends string>(by: (w: typeof logs[number]) => K) => {
            const m = new Map<K, typeof logs>();
            logs!.forEach(w => { const k = by(w); m.set(k, [...(m.get(k) || []), w]); });
            return [...m.entries()];
        };
        return text({
            proje: project.name, jira: key, aralik: `${from} – ${to}`, kayit_sayisi: logs.length, toplam_saat: sum(logs),
            kisi: group(w => w.author).map(([ad, rows]) => ({ ad, saat: sum(rows) })).sort((a, b) => b.saat - a.saat),
            kayit: group(w => w.issueKey).map(([anahtar, rows]) => ({ anahtar, ozet: rows[0].summary, saat: sum(rows) })).sort((a, b) => b.saat - a.saat).slice(0, 15),
            gun: group(w => w.date).map(([tarih, rows]) => ({ tarih, saat: sum(rows) })).sort((a, b) => a.tarih.localeCompare(b.tarih)),
        });
    };

    return {
        name: 'planasistan',
        title: 'PlanAsistan',
        version: APP_VERSION,
        instructions: MCP_INSTRUCTIONS,
        log,
        listTools: async () => {
            let specs: ToolSpec[];
            let canApply = false;
            let jira: McpTool[] = [];
            try {
                const s = await buildSession();
                specs = toolSpecsFor(s.ctx);
                canApply = !s.writeBlock;
                if (o.jira) jira = [JIRA_WORKLOG_SPEC, ...(canApply ? [JIRA_IMPORT_SPEC] : [])];
            } catch (e) {
                // Kaynak şu an okunamıyor: salt-okunur katalog sunulur, her çağrı nedeni döndürür
                log(`araç listesi kapsamsız sunuldu: ${(e as Error).message}`);
                specs = AI_TOOLS.filter(t => !t.writeOnly).map(t => t.spec);
            }
            return [STATUS_SPEC, ...specs.map(toMcpTool), ...jira, ...(canApply ? [APPLY_SPEC] : [])];
        },
        callTool: async (name, rawArgs) => {
            const schema = SCHEMAS.get(name);
            if (!schema) return fail(`Bilinmeyen araç: ${name}`);
            const checked = validateArgs(name, schema, rawArgs);
            if ('error' in checked) return fail(checked.error);
            const args = checked.args;
            if (name === STATUS_TOOL) return status();
            if (name === APPLY_TOOL) return apply(args);
            let s: Session;
            try {
                s = await buildSession();
            } catch (e) {
                return fail((e as Error).message);
            }
            if (name === JIRA_IMPORT_TOOL) return jiraImport(s, args);
            if (name === JIRA_WORKLOG_TOOL) return jiraWorklog(s, args);
            if (WRITE_TOOLS.has(name) && s.writeBlock) return fail(s.writeBlock);
            const out = await executeTool({ name, arguments: args }, s.ctx);
            if (!out.ok) return text(out.content, true);
            if (s.ctx.proposals.length === 0) return text(out.content);
            // Öneri: uygulamadaki kart yerine kimliği olan bekleyen öneri
            const proposal = s.ctx.proposals[s.ctx.proposals.length - 1];
            const oneriId = remember({ kind: 'action', action: proposal.action, title: proposal.title, at: Date.now() });
            return text({ oneri_id: oneriId, ozet: proposal.title, ayrintilar: proposal.details, durum: MCP_PENDING_NOTE });
        },
    };
};
