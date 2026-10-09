import { randomUUID } from 'node:crypto';
import type { Person, UserRole, WorkspaceData } from '../../types.js';
import { ROLE_LABELS } from '../../utils/allocations.js';
import { AiAction, applyAction } from '../../utils/ai/actions.js';
import { aiPolicyOf } from '../../utils/ai/policy.js';
import type { ToolSpec } from '../../utils/ai/protocol.js';
import { buildToolContext, matchByText, personName, resolveProject, ToolContext } from '../../utils/ai/scope.js';
import { APP_MAP } from '../../utils/ai/systemPrompt.js';
import { AI_TOOLS, executeTool, toolSpecsFor } from '../../utils/ai/tools.js';
import { Retriever } from '../../utils/rag/retriever.js';
import { guideDocs, workspaceDocs } from '../../utils/rag/sources.js';
import { identityNeedsPerson } from '../../utils/rbac.js';
import { APP_VERSION } from '../../utils/workspace.js';
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
9. Kullanıcının dilinde, kısa ve yönetici diliyle yaz: önce sonuç, sonra gerekçe; karşılaştırmalarda tablo kullan.`,
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

const text = (value: unknown, isError = false): McpToolResult => ({
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
});

const fail = (message: string): McpToolResult => text({ hata: message }, true);

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
    const proposals = new Map<string, { action: AiAction; title: string; at: number }>();

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

    const prune = () => {
        const t = Date.now();
        for (const [id, p] of proposals) if (t - p.at > PROPOSAL_TTL_MS) proposals.delete(id);
        while (proposals.size > MAX_PROPOSALS) proposals.delete(proposals.keys().next().value as string);
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
            result = applyAction(s.ws, p.action);
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
            not: 'Değişiklik buluta yazıldı. Uygulamada görmek için Bulut penceresinden "Buluttan Çek" yapılır.',
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
            try {
                const s = await buildSession();
                specs = toolSpecsFor(s.ctx);
                canApply = !s.writeBlock;
            } catch (e) {
                // Kaynak şu an okunamıyor: salt-okunur katalog sunulur, her çağrı nedeni döndürür
                log(`araç listesi kapsamsız sunuldu: ${(e as Error).message}`);
                specs = AI_TOOLS.filter(t => !t.writeOnly).map(t => t.spec);
            }
            return [STATUS_SPEC, ...specs.map(toMcpTool), ...(canApply ? [APPLY_SPEC] : [])];
        },
        callTool: async (name, args) => {
            if (name === STATUS_TOOL) return status();
            if (name === APPLY_TOOL) return apply(args);
            let s: Session;
            try {
                s = await buildSession();
            } catch (e) {
                return fail((e as Error).message);
            }
            if (WRITE_TOOLS.has(name) && s.writeBlock) return fail(s.writeBlock);
            const out = await executeTool({ name, arguments: args }, s.ctx);
            if (!out.ok) return text(out.content, true);
            if (s.ctx.proposals.length === 0) return text(out.content);
            // Öneri: uygulamadaki kart yerine kimliği olan bekleyen öneri
            prune();
            const proposal = s.ctx.proposals[s.ctx.proposals.length - 1];
            const oneriId = `oneri-${randomUUID().slice(0, 8)}`;
            proposals.set(oneriId, { action: proposal.action, title: proposal.title, at: Date.now() });
            return text({ oneri_id: oneriId, ozet: proposal.title, ayrintilar: proposal.details, durum: MCP_PENDING_NOTE });
        },
    };
};
