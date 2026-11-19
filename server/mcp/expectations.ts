import type { ExpectationCategory, ExpectationUrgency, ManagementExpectation, WorkspaceData } from '../../types.js';
import { appendAudit } from '../../utils/audit.js';
import {
    canRaiseExpectation, canRespondExpectation, CATEGORY_LABELS, CATEGORY_ORDER, createExpectation, daysUntilNeed, expectationProjects,
    isActiveExpectation, respondExpectation, sortExpectations, STATUS_LABELS, URGENCY_LABELS, URGENCY_ORDER, urgencyCounts, visibleExpectations, waitingLabel,
} from '../../utils/expectations.js';
import { matchByText, resolveProject, ToolContext } from '../../utils/ai/scope.js';
import type { McpTool } from './protocol.js';

/**
 * Yönetimden beklentiler (MCP): uygulamadaki "Beklentiler" ekranının aynısı.
 *
 *  - beklentiler: kimliğin görebildiği beklentiler (yönetim hepsini; PY kendi
 *    açtıklarını ve projelerininkileri; bölüm sorumlusu bölümününkileri)
 *  - oner_beklenti_ac: PY ya da bölüm sorumlusu yönetimden karar, onay ya da
 *    destek ister (aciliyet, kategori, termin)
 *  - oner_beklenti_yanitla: yönetim (müdür, PYB sorumlusu) kararını yazar:
 *    "inceleniyor" ya da "karşılandı" ve yanıt metni
 *
 * Müdürün kararı böylece uygulamaya yazılır ve demoda görünür (BL-30).
 * Değişiklikler öneri + onay ile uygulanır (oneriyi_uygula); yetki uygulama
 * anında güncel veriyle yeniden denetlenir (utils/expectations).
 */

export const EXPECTATION_READ_TOOL = 'beklentiler';
export const EXPECTATION_RAISE_TOOL = 'oner_beklenti_ac';
export const EXPECTATION_RESPOND_TOOL = 'oner_beklenti_yanitla';
export const EXPECTATION_WRITE_TOOLS = new Set([EXPECTATION_RAISE_TOOL, EXPECTATION_RESPOND_TOOL]);

const READ_SPEC: McpTool = {
    name: EXPECTATION_READ_TOOL,
    title: 'Yönetimden beklentiler',
    description: 'PY ve bölüm sorumlularının yönetimden beklediği karar, onay ve destekler: aciliyet, kategori, termin, kaç gündür beklediği, yönetimin yanıtı. Yönetim hepsini görür; PY kendi açtıklarını ve projelerininkileri, bölüm sorumlusu bölümününkileri.',
    inputSchema: {
        type: 'object',
        properties: {
            durum: { type: 'string', enum: ['aktif', 'kapali', 'tumu'], description: 'aktif (varsayılan): yanıt bekleyen ve incelenen; kapali: karşılanan ve geri çekilen.' },
            proje: { type: 'string', description: 'Proje adı ya da kodu (isteğe bağlı).' },
        },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
};

const RAISE_SPEC: McpTool = {
    name: EXPECTATION_RAISE_TOOL,
    title: 'Yönetimden beklenti önerisi',
    description: `PY ya da bölüm sorumlusu olarak yönetimden karar, onay ya da destek istemeyi ÖNERİR (kaynak, bütçe, öncelik, işe alım, satın alma). Beklenti yönetim panelinde görünür; müdür yanıtını uygulamaya yazar. Kategori: ${CATEGORY_ORDER.join(', ')}. Aciliyet: critical (bu hafta karar), important (iki hafta içinde), normal. Öneri, oneriyi_uygula çağrılana kadar uygulanmaz.`,
    inputSchema: {
        type: 'object',
        properties: {
            baslik: { type: 'string', description: 'Ne isteniyor (kısa, net).' },
            aciklama: { type: 'string', description: 'Gerekçe ve rakamlar: rol, adam-ay, ay, tutar, etki.' },
            kategori: { type: 'string', enum: CATEGORY_ORDER, description: 'Kategori.' },
            aciliyet: { type: 'string', enum: URGENCY_ORDER, description: 'Aciliyet.' },
            proje: { type: 'string', description: 'İlgili proje (isteğe bağlı).' },
            termin: { type: 'string', description: 'En geç ne zamana kadar karar gerekli (YYYY-AA-GG).' },
        },
        required: ['baslik', 'kategori', 'aciliyet'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
};

const RESPOND_SPEC: McpTool = {
    name: EXPECTATION_RESPOND_TOOL,
    title: 'Beklentiye yönetim kararı önerisi',
    description: 'Yönetim (müdür, PYB sorumlusu): bir beklentiye kararı yazmayı ÖNERİR. inceleniyor: karar sürüyor; karsilandi: karar verildi, beklenti kapanır. Yanıt kararın kendisidir: ne, kim, ne kadar, hangi tarihe kadar. Öneri, oneriyi_uygula çağrılana kadar uygulanmaz.',
    inputSchema: {
        type: 'object',
        properties: {
            beklenti: { type: 'string', description: 'Beklentinin başlığı (kısmi olabilir; beklentiler aracıyla bakın) ya da kimliği.' },
            durum: { type: 'string', enum: ['inceleniyor', 'karsilandi'], description: 'inceleniyor ya da karsilandi.' },
            yanit: { type: 'string', description: 'Karar: rakam ve tarihle.' },
        },
        required: ['beklenti', 'durum', 'yanit'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
};

export const EXPECTATION_SCHEMAS: [string, McpTool['inputSchema']][] = [READ_SPEC, RAISE_SPEC, RESPOND_SPEC].map(t => [t.name, t.inputSchema]);

/** Kimliğe göre araçlar: okuma herkese (görünürlük filtreli); açma PY ve bölüm sorumlusuna, yanıt yönetime; yazma yalnız değişiklik açıksa */
export const expectationToolsFor = (ctx: ToolContext, canWrite: boolean): McpTool[] => {
    const out: McpTool[] = [READ_SPEC];
    if (!canWrite) return out;
    if (canRaiseExpectation(ctx.identity)) out.push(RAISE_SPEC);
    if (canRespondExpectation(ctx.identity)) out.push(RESPOND_SPEC);
    return out;
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const day = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);

export const readExpectations = (ws: WorkspaceData, ctx: ToolContext, args: Record<string, unknown>, now: Date): unknown => {
    const scope = str(args.durum) || 'aktif';
    let list = visibleExpectations(ws, ctx.identity);
    if (str(args.proje)) {
        const project = resolveProject(ctx, args.proje);
        list = list.filter(e => e.projectId === project.id);
    }
    const counts = urgencyCounts(list);
    if (scope !== 'tumu') list = list.filter(e => (scope === 'aktif') === isActiveExpectation(e));
    const names = new Map(ws.projects.map(p => [p.id, p.name]));
    return {
        aktif: { toplam: counts.total, yanitsiz: counts.unanswered, kritik: counts.critical, onemli: counts.important, normal: counts.normal },
        beklentiler: sortExpectations(list, now).slice(0, 30).map(e => {
            const left = daysUntilNeed(e, now);
            return {
                id: e.id,
                baslik: e.title,
                aciklama: e.description,
                proje: e.projectId ? names.get(e.projectId) : undefined,
                kategori: CATEGORY_LABELS[e.category],
                aciliyet: URGENCY_LABELS[e.urgency],
                durum: STATUS_LABELS[e.status],
                acan: e.createdByName,
                acilis: day(e.createdAt),
                bekleme: isActiveExpectation(e) ? waitingLabel(e, now) : undefined,
                termin: e.needBy ? `${day(e.needBy)}${left !== null && isActiveExpectation(e) ? (left < 0 ? ` (${-left} gün gecikti)` : ` (${left} gün kaldı)`) : ''}` : undefined,
                yanit: e.response,
                yanitlayan: e.respondedByName,
                yanit_tarihi: day(e.respondedAt),
            };
        }),
        yapabilecegin: [
            ...(canRaiseExpectation(ctx.identity) ? [`yönetimden karar iste (${EXPECTATION_RAISE_TOOL})`] : []),
            ...(canRespondExpectation(ctx.identity) ? [`kararı yaz (${EXPECTATION_RESPOND_TOOL})`] : []),
        ],
    };
};

export type ExpectationOp =
    | { op: 'ac'; draft: { title: string; description?: string; category: ExpectationCategory; urgency: ExpectationUrgency; projectId?: string; needBy?: string } }
    | { op: 'yanitla'; id: string; status: 'acknowledged' | 'resolved'; response: string };

export interface PreparedExpectation { op: ExpectationOp; title: string; details: Record<string, unknown> }

const findExpectation = (list: ManagementExpectation[], ref: string): ManagementExpectation => {
    const byId = list.find(e => e.id === ref);
    if (byId) return byId;
    const hits = matchByText(list, ref, e => [e.title]);
    if (hits.length === 0) throw new Error(`"${ref}" adlı beklenti bulunamadı (beklentiler aracıyla bakın).`);
    if (hits.length > 1) throw new Error(`"${ref}" birden fazla beklentiyle eşleşti: ${hits.slice(0, 6).map(e => e.title).join(', ')}.`);
    return hits[0];
};

export const prepareExpectationOp = (ws: WorkspaceData, ctx: ToolContext, name: string, args: Record<string, unknown>): PreparedExpectation => {
    if (name === EXPECTATION_RAISE_TOOL) {
        if (!canRaiseExpectation(ctx.identity)) throw new Error('Yönetimden beklentiyi Proje Yöneticisi ya da Bölüm Sorumlusu açar.');
        const title = str(args.baslik);
        if (!title) throw new Error('baslik boş olamaz.');
        const category = str(args.kategori) as ExpectationCategory;
        const urgency = str(args.aciliyet) as ExpectationUrgency;
        if (!CATEGORY_ORDER.includes(category)) throw new Error(`kategori şunlardan biri olmalı: ${CATEGORY_ORDER.join(', ')}.`);
        if (!URGENCY_ORDER.includes(urgency)) throw new Error(`aciliyet şunlardan biri olmalı: ${URGENCY_ORDER.join(', ')}.`);
        const needBy = str(args.termin) || undefined;
        if (needBy && !/^\d{4}-\d{2}-\d{2}$/.test(needBy)) throw new Error('termin YYYY-AA-GG biçiminde olmalı.');
        let projectId: string | undefined;
        if (str(args.proje)) {
            const project = resolveProject(ctx, args.proje);
            if (!expectationProjects(ws, ctx.identity).some(p => p.id === project.id)) throw new Error(`"${project.name}" için beklenti açamazsınız (yalnız görebildiğiniz projeler).`);
            projectId = project.id;
        }
        const description = str(args.aciklama) || undefined;
        const projectName = projectId ? ws.projects.find(p => p.id === projectId)?.name : undefined;
        return {
            op: { op: 'ac', draft: { title, description, category, urgency, projectId, needBy } },
            title: `Yönetimden beklenti: ${title}`,
            details: {
                aciliyet: URGENCY_LABELS[urgency], kategori: CATEGORY_LABELS[category],
                ...(projectName ? { proje: projectName } : {}), ...(needBy ? { termin: needBy } : {}), ...(description ? { aciklama: description } : {}),
            },
        };
    }
    if (name === EXPECTATION_RESPOND_TOOL) {
        if (!canRespondExpectation(ctx.identity)) throw new Error('Beklentiye kararı yönetim (müdür, PYB sorumlusu) yazar.');
        const e = findExpectation(visibleExpectations(ws, ctx.identity), str(args.beklenti));
        if (!isActiveExpectation(e)) throw new Error(`Beklenti kapalı (${STATUS_LABELS[e.status]}): ${e.title}.`);
        const durum = str(args.durum);
        if (durum !== 'inceleniyor' && durum !== 'karsilandi') throw new Error('durum inceleniyor ya da karsilandi olmalı.');
        const response = str(args.yanit);
        if (!response) throw new Error('yanit boş olamaz: kararı rakam ve tarihle yazın.');
        const status = durum === 'karsilandi' ? 'resolved' : 'acknowledged';
        return {
            op: { op: 'yanitla', id: e.id, status, response },
            title: `Beklenti ${status === 'resolved' ? 'karşılandı' : 'inceleniyor'}: ${e.title}`,
            details: { durum: `${STATUS_LABELS[e.status]} → ${STATUS_LABELS[status]}`, acan: e.createdByName, yanit: response },
        };
    }
    throw new Error(`Bilinmeyen beklenti aracı: ${name}`);
};

/** Öneriyi güncel veriyle uygular; denetim kaydı uygulamadaki "Beklentiler" ekranıyla aynı */
export const applyExpectationOp = (ws: WorkspaceData, ctx: ToolContext, op: ExpectationOp, now: Date): { ws: WorkspaceData; summary: string } => {
    if (op.op === 'ac') {
        if (!canRaiseExpectation(ctx.identity)) throw new Error('Yönetimden beklentiyi Proje Yöneticisi ya da Bölüm Sorumlusu açar.');
        const e = createExpectation(ws, op.draft, now);
        const summary = `Yönetimden beklenti (${URGENCY_LABELS[e.urgency]} · ${CATEGORY_LABELS[e.category]}): ${e.title}`;
        return { ws: appendAudit({ ...ws, expectations: [e, ...(ws.expectations || [])] }, 'expectation.create', `${summary} — Claude (MCP) ile`, e.projectId), summary };
    }
    if (!canRespondExpectation(ctx.identity)) throw new Error('Beklentiye kararı yönetim (müdür, PYB sorumlusu) yazar.');
    const e = (ws.expectations || []).find(x => x.id === op.id);
    if (!e) throw new Error('Beklenti bulunamadı (silinmiş olabilir).');
    if (!isActiveExpectation(e)) throw new Error(`Beklenti bu arada kapandı (${STATUS_LABELS[e.status]}).`);
    const next = { ...ws, expectations: (ws.expectations || []).map(x => (x.id === e.id ? respondExpectation(ws, x, op.status, op.response, now) : x)) };
    const summary = `Beklenti ${op.status === 'resolved' ? 'karşılandı' : 'inceleniyor'}: ${e.title}`;
    return { ws: appendAudit(next, op.status === 'resolved' ? 'expectation.close' : 'expectation.respond', `${summary} — Claude (MCP) ile`, e.projectId), summary };
};
