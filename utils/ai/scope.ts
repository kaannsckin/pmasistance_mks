import { Person, Project, WorkspaceData } from '../../types';
import { Identity, identityOf, isExecViewer, visibleProjectIds } from '../rbac';

/**
 * AI araçlarının veri kapsamı — asistan, kullanıcının arayüzde görebildiğinden
 * fazlasını göremez. Uygulamanın kendi kurallarının aynısı:
 *
 *  - Proje İÇERİĞİ (görev, risk, hedef, iş paketi, RAG notu, not, istek):
 *    yalnızca görünür projeler (Portföy ekranıyla aynı — rbac.visibleProjectIds)
 *  - Notlar ve müşteri istekleri: yönetici rolleri (Müdür, PYB Sorumlusu) HİÇ
 *    göremez (arayüz + Supabase RLS kuralı)
 *  - Kapasite verisi (havuz, tahsis, izin, ünvan oranları): Tahsis ve Veri
 *    Havuzu ekranları gibi tüm rollere açık
 *  - Sicil numarası hiçbir araç çıktısında yer almaz
 */

export interface ToolContext {
    /** Tam çalışma alanı — yalnızca kapasite/havuz hesapları için */
    ws: WorkspaceData;
    /** Görünür projelerle sınırlı (yöneticilerde not/istek boşaltılmış) çalışma alanı */
    scoped: WorkspaceData;
    identity: Identity;
    visibleProjectIds: Set<string>;
    canSeePrivate: boolean;
    activeProjectId: string | null;
    year: number;
    now: Date;
}

export const buildToolContext = (ws: WorkspaceData, now: Date = new Date()): ToolContext => {
    const identity = identityOf(ws);
    const visible = visibleProjectIds(ws, identity);
    const canSeePrivate = !isExecViewer(identity.role);
    const projects = ws.projects
        .filter(p => visible.has(p.id))
        .map(p => (canSeePrivate ? p : { ...p, notes: [], customerRequests: [] }));
    const scoped: WorkspaceData = {
        ...ws,
        projects,
        auditLog: (ws.auditLog || []).filter(e => !e.projectId || visible.has(e.projectId)),
    };
    return {
        ws,
        scoped,
        identity,
        visibleProjectIds: visible,
        canSeePrivate,
        activeProjectId: ws.activeProjectId && visible.has(ws.activeProjectId) ? ws.activeProjectId : null,
        year: now.getFullYear(),
        now,
    };
};

/** Araç çalıştırma hatası — modele açıklama olarak döner */
export class ToolError extends Error {}

const norm = (s: string): string =>
    s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();

export const personName = (p: Pick<Person, 'firstName' | 'lastName'>): string => `${p.firstName} ${p.lastName}`.trim();

/** Ad/kod ile eşleştirme: tam eşleşme > önek > içerir > tüm kelimeler */
export const matchByText = <T,>(items: T[], query: string, keys: (item: T) => (string | undefined)[]): T[] => {
    const q = norm(query);
    if (!q) return [];
    const tiers: T[][] = [[], [], [], []];
    const words = q.split(' ');
    for (const it of items) {
        const vals = keys(it).filter((v): v is string => !!v).map(norm);
        if (vals.some(v => v === q)) tiers[0].push(it);
        else if (vals.some(v => v.startsWith(q))) tiers[1].push(it);
        else if (vals.some(v => v.includes(q))) tiers[2].push(it);
        else if (vals.some(v => words.every(w => v.includes(w)))) tiers[3].push(it);
    }
    return tiers.find(t => t.length > 0) || [];
};

/**
 * Proje referansını (ad, kod ya da id) görünür projelerden çözer; boşsa aktif
 * proje. Görünür olmayan bir proje yetki hatası verir.
 */
export const resolveProject = (ctx: ToolContext, ref: unknown, opts: { anyProject?: boolean } = {}): Project => {
    // anyProject: yalnızca tahsis verisi için (Tahsis ekranı tüm projeleri gösterir)
    const pool = opts.anyProject ? ctx.ws.projects : ctx.scoped.projects;
    const text = typeof ref === 'string' ? ref.trim() : '';
    if (!text) {
        const active = pool.find(p => p.id === ctx.activeProjectId);
        if (active) return active;
        throw new ToolError('Proje belirtilmedi ve açık bir proje yok. Proje adını ya da kodunu verin (proje_listesi ile görebilirsiniz).');
    }
    const byId = pool.find(p => p.id === text);
    if (byId) return byId;
    const matches = matchByText(pool, text, p => [p.name, p.code]);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
        throw new ToolError(`"${text}" birden fazla projeyle eşleşti: ${matches.slice(0, 8).map(p => p.name).join(', ')}. Daha belirgin bir ad verin.`);
    }
    if (matchByText(ctx.ws.projects, text, p => [p.name, p.code]).length > 0) {
        throw new ToolError(`"${text}" projesi kullanıcının yetki kapsamında değil; içeriği gösterilemez.`);
    }
    throw new ToolError(`"${text}" adlı/kodlu bir proje bulunamadı.`);
};

/** Kişi referansını (ad soyad; sicil ile arama da kabul edilir ama çıktıya yazılmaz) havuzdan çözer */
export const resolvePerson = (ctx: ToolContext, ref: unknown): Person => {
    const text = typeof ref === 'string' ? ref.trim() : '';
    if (!text) {
        const me = ctx.ws.people.find(p => p.id === ctx.identity.personId);
        if (me) return me;
        throw new ToolError('Kişi belirtilmedi. Kişinin adını soyadını verin.');
    }
    const byId = ctx.ws.people.find(p => p.id === text || (p.sicil && p.sicil.trim() === text));
    if (byId) return byId;
    const matches = matchByText(ctx.ws.people, text, p => [personName(p), `${p.lastName} ${p.firstName}`]);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
        throw new ToolError(`"${text}" birden fazla kişiyle eşleşti: ${matches.slice(0, 8).map(personName).join(', ')}. Ad soyadı tam verin.`);
    }
    throw new ToolError(`"${text}" adlı bir kişi veri havuzunda bulunamadı.`);
};

/** Bölüm referansı (kod ya da ad) → bölüm kodu */
export const resolveDepartmentCode = (ctx: ToolContext, ref: unknown): string | undefined => {
    const text = typeof ref === 'string' ? ref.trim() : '';
    if (!text) return undefined;
    const exact = ctx.ws.departments.find(d => norm(d.code) === norm(text));
    if (exact) return exact.code;
    const matches = matchByText(ctx.ws.departments, text, d => [d.code, d.name]);
    if (matches.length === 1) return matches[0].code;
    if (matches.length > 1) throw new ToolError(`"${text}" birden fazla bölümle eşleşti: ${matches.map(d => `${d.code} (${d.name})`).join(', ')}.`);
    // Havuzdaki kişilerde geçen ama bölüm tablosunda olmayan kodlar
    if (ctx.ws.people.some(p => norm(p.departmentCode || '') === norm(text))) return text.toUpperCase();
    throw new ToolError(`"${text}" adlı/kodlu bir bölüm bulunamadı.`);
};

/** Yıl parametresi (yoksa içinde bulunulan yıl) */
export const resolveYear = (ctx: ToolContext, ref: unknown): number => {
    const n = Number(ref);
    if (ref === undefined || ref === null || ref === '') return ctx.year;
    if (!Number.isInteger(n) || n < 2000 || n > 2100) throw new ToolError(`Geçersiz yıl: ${String(ref)}`);
    return n;
};

export const r2 = (v: number | null | undefined): number | null =>
    v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;

export const months12 = (arr: number[]): number[] => arr.map(v => Math.round(v * 100) / 100);

export const clampLimit = (ref: unknown, def = 20, max = 50): number => {
    const n = Number(ref);
    return Number.isInteger(n) && n > 0 ? Math.min(n, max) : def;
};

/** Metindeki sicil numaralarını maskeler (araç çıktısına sicil girmesin) */
export const maskSicil = (text: string, people: Person[]): string => {
    let out = text;
    people.forEach(p => {
        const s = p.sicil?.trim();
        if (s && s.length >= 3) out = out.split(s).join('[sicil]');
    });
    return out;
};
