import { Project, WorklogEntry } from '../../types';
import { can } from '../permissions';
import { projectJiraKeys } from '../jiraAllocation';
import { resolveProject, ToolContext, ToolError } from './scope';

/**
 * Jira worklog raporu (Tempo raporlarına benzer): birden çok proje, bir ay ya da
 * tarih aralığı; proje, kişi × proje, kayıt, gün ya da hafta kırılımı.
 *
 * Kaynak Jira worklog'larıdır (Jira Server/DC'de Tempo Timesheets'in yazdığı
 * süreler de Jira worklog'u olarak durur). Uygulamadaki bir proje verilirse
 * yalnız o projenin görevlerine bağlı Jira kayıtlarına yazılan süre sayılır
 * (aynı Jira projesindeki başka işler "kapsam dışı" olarak ayrıca bildirilir);
 * doğrudan Jira proje anahtarı (ör. MPS) verilirse o Jira projesinin tamamı.
 */

export const MAX_REPORT_DAYS = 92;
export const MAX_REPORT_PROJECTS = 10;
export type WorklogGroup = 'proje' | 'kisi' | 'kayit' | 'gun' | 'hafta';

const MONTHS: Record<string, number> = {
    ocak: 1, subat: 2, şubat: 2, mart: 3, nisan: 4, mayis: 5, mayıs: 5, haziran: 6, temmuz: 7,
    agustos: 8, ağustos: 8, eylul: 9, eylül: 9, ekim: 10, kasim: 11, kasım: 11, aralik: 12, aralık: 12,
};
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}$/;
const r1 = (n: number) => Math.round(n * 10) / 10;
const keyOf = (s: string | undefined) => (s || '').trim().toUpperCase();

/**
 * Tarih aralığı: "ay" ("2026-11", "Kasım", "kasım 2026") ya da baslangic/bitis
 * (YYYY-AA-GG). Ay verilirse ayın tamamı; bugünden ileri gidilmez. Hiçbiri yoksa bu ay.
 */
export const reportRange = (args: { ay?: unknown; baslangic?: unknown; bitis?: unknown }, now: Date): { from: string; to: string } => {
    const today = iso(now);
    const clampTo = (d: string) => (d > today ? today : d);
    const b = typeof args.baslangic === 'string' ? args.baslangic.trim() : '';
    const e = typeof args.bitis === 'string' ? args.bitis.trim() : '';
    if (b || e) {
        if ((b && !DAY_RE.test(b)) || (e && !DAY_RE.test(e))) throw new ToolError('Tarihler YYYY-AA-GG biçiminde olmalı.');
        const from = b || `${today.slice(0, 7)}-01`;
        const to = clampTo(e || today);
        if (from > to) throw new ToolError('Başlangıç bitişten sonra olamaz.');
        return { from, to };
    }
    let year = now.getFullYear(), month = now.getMonth() + 1;
    const raw = typeof args.ay === 'string' ? args.ay.trim().toLocaleLowerCase('tr-TR') : typeof args.ay === 'number' ? String(args.ay) : '';
    if (raw) {
        const ym = /^(\d{4})-(\d{1,2})$/.exec(raw);
        const name = Object.keys(MONTHS).find(k => raw.startsWith(k));
        const y = /(\d{4})/.exec(raw);
        if (ym) { year = +ym[1]; month = +ym[2]; }
        else if (name) { month = MONTHS[name]; year = y ? +y[1] : (month > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear()); }
        else if (/^\d{1,2}$/.test(raw)) { month = +raw; if (month > now.getMonth() + 1) year--; }
        else throw new ToolError(`"${args.ay}" ay olarak anlaşılamadı (ör. 2026-11 ya da Kasım).`);
        if (month < 1 || month > 12) throw new ToolError('Ay 1-12 arasında olmalı.');
    }
    const from = `${year}-${pad(month)}-01`;
    const last = new Date(year, month, 0).getDate();
    const to = clampTo(`${year}-${pad(month)}-${pad(last)}`);
    if (from > today) throw new ToolError(`${from.slice(0, 7)} henüz gelmedi.`);
    return { from, to };
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

/** Rapordaki bir kalem: uygulama projesi (kendi Jira kayıtlarıyla sınırlı) ya da Jira projesinin tamamı */
export interface ReportTarget {
    label: string;
    jiraKey: string;
    /** Verilirse yalnız bu kayıtlar sayılır */
    issueKeys?: Set<string>;
}

const mainKeyOf = (p: Project): string => {
    const own = keyOf(p.jiraProjectKey);
    if (own) return own;
    const n = new Map<string, number>();
    projectJiraKeys(p).forEach(k => { const pre = k.split('-')[0]; n.set(pre, (n.get(pre) || 0) + 1); });
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
};

/** "GİB, ATL, MPS" → hedefler (kapsam kuralı: yalnız görünür projeler; Jira anahtarı yalnız görünür bir projenin anahtarıysa ya da portföyün tamamını gören rolde) */
export const resolveTargets = (ctx: ToolContext, raw: unknown): ReportTarget[] => {
    const list = (Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/[,;\n]| ve /) : []).map(s => s.trim()).filter(Boolean);
    if (!list.length) list.push('');
    if (list.length > MAX_REPORT_PROJECTS) throw new ToolError(`En çok ${MAX_REPORT_PROJECTS} proje verilebilir.`);
    const out: ReportTarget[] = [];
    for (const item of list) {
        try {
            const p = resolveProject(ctx, item);
            const key = mainKeyOf(p);
            if (!key) throw new ToolError(`"${p.name}" projesinin Jira bağlantısı yok (Jira proje anahtarı ya da Jira anahtarlı görev).`);
            const keys = projectJiraKeys(p);
            out.push({ label: p.name, jiraKey: key, ...(keys.size ? { issueKeys: keys } : {}) });
        } catch (e) {
            const k = keyOf(item);
            const known = ctx.scoped.projects.some(p => mainKeyOf(p) === k);
            if (item && KEY_RE.test(item) && (known || can(ctx.identity, 'portfolio.viewAll'))) { out.push({ label: `Jira ${k}`, jiraKey: k }); continue; }
            throw e;
        }
    }
    return out;
};

export interface WorklogReportInput {
    targets: ReportTarget[];
    from: string;
    to: string;
    groups: WorklogGroup[];
    person?: string;
    fetch: (key: string, from: string, to: string) => Promise<WorklogEntry[]>;
}

const weekOf = (d: string): string => {
    const t = new Date(`${d}T00:00:00Z`);
    const day = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - day + 3);
    const y = t.getUTCFullYear();
    const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
    return `${y}-H${pad(w)}`;
};

export const buildWorklogReport = async (o: WorklogReportInput) => {
    if (daysBetween(o.from, o.to) > MAX_REPORT_DAYS) throw new ToolError(`Aralık en çok ${MAX_REPORT_DAYS} gün olabilir; daha kısa aralıkla ya da ay ay isteyin.`);
    const byKey = new Map<string, WorklogEntry[]>();
    for (const k of [...new Set(o.targets.map(t => t.jiraKey))]) byKey.set(k, await o.fetch(k, o.from, o.to));
    const who = (o.person || '').trim().toLocaleLowerCase('tr-TR');
    const rows: (WorklogEntry & { target: string })[] = [];
    const projects = o.targets.map(t => {
        const all = (byKey.get(t.jiraKey) || []).filter(w => !who || w.author.toLocaleLowerCase('tr-TR').includes(who));
        const mine = t.issueKeys ? all.filter(w => t.issueKeys!.has(keyOf(w.issueKey))) : all;
        mine.forEach(w => rows.push({ ...w, target: t.label }));
        const hours = mine.reduce((s, w) => s + w.hours, 0);
        const outside = t.issueKeys ? all.reduce((s, w) => s + w.hours, 0) - hours : 0;
        return {
            proje: t.label, jira: t.jiraKey, saat: r1(hours), gun: r1(hours / 8),
            kisi_sayisi: new Set(mine.map(w => w.author)).size, kayit_sayisi: new Set(mine.map(w => w.issueKey)).size,
            ...(outside > 0.05 ? { kapsam_disi_saat: r1(outside) } : {}),
        };
    });
    const sumBy = (key: (w: typeof rows[number]) => string) => {
        const m = new Map<string, number>();
        rows.forEach(w => m.set(key(w), (m.get(key(w)) || 0) + w.hours));
        return m;
    };
    const total = rows.reduce((s, w) => s + w.hours, 0);
    const result: Record<string, unknown> = {
        aralik: `${o.from} – ${o.to}`,
        kaynak: 'Jira worklog (Tempo\'nun Jira\'ya yazdığı süreler dahil)',
        toplam_saat: r1(total),
        toplam_gun: r1(total / 8),
        projeler: projects,
    };
    if (o.groups.includes('kisi') || o.groups.includes('proje')) {
        const people = new Map<string, Map<string, number>>();
        rows.forEach(w => { const m = people.get(w.author) || new Map(); m.set(w.target, (m.get(w.target) || 0) + w.hours); people.set(w.author, m); });
        result.kisiler = [...people].map(([kisi, m]) => ({
            kisi, saat: r1([...m.values()].reduce((a, b) => a + b, 0)),
            ...(o.targets.length > 1 ? { projeler: Object.fromEntries([...m].map(([k, v]) => [k, r1(v)])) } : {}),
        })).sort((a, b) => b.saat - a.saat);
    }
    if (o.groups.includes('kayit')) {
        const sums = sumBy(w => w.issueKey || '?');
        const title = new Map(rows.map(w => [w.issueKey || '?', w.summary]));
        result.kayitlar = [...sums].map(([anahtar, s]) => ({ anahtar, ozet: title.get(anahtar), saat: r1(s) })).sort((a, b) => b.saat - a.saat).slice(0, 25);
    }
    if (o.groups.includes('gun')) result.gunler = [...sumBy(w => w.date.slice(0, 10))].sort((a, b) => a[0].localeCompare(b[0])).map(([tarih, s]) => ({ tarih, saat: r1(s) }));
    if (o.groups.includes('hafta')) result.haftalar = [...sumBy(w => weekOf(w.date.slice(0, 10)))].sort((a, b) => a[0].localeCompare(b[0])).map(([hafta, s]) => ({ hafta, saat: r1(s) }));
    if (projects.some(p => p.kapsam_disi_saat)) result.not = 'kapsam_disi_saat: aynı Jira projesinde bu uygulama projesinin görevlerine bağlı olmayan kayıtlara yazılan süre. Jira projesinin tamamı için proje yerine Jira anahtarını (ör. MPS) verin.';
    if (!rows.length) result.not = `Bu aralıkta ${who ? `"${o.person}" için ` : ''}worklog bulunamadı.`;
    return result;
};
