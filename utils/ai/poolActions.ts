import { Department, Person, TitleDef, WorkspaceData } from '../../types';
import { appendAudit } from '../audit';
import { fullName, trNorm, trUpper } from '../dataPool';
import { can } from '../permissions';
import { identityOf } from '../rbac';

/**
 * Veri havuzu önerileri (ünvan ve aylık maliyet, kişi, bölüm). Proje önerileri
 * gibi ASLA kendiliğinden uygulanmaz: asistan kart üretir, kullanıcı "Uygula"
 * derse burada yeniden doğrulanır. Yalnız veri havuzunu düzenleme yetkisi
 * (varsayılan PYB Destek) olan kullanıcıya sunulur ve onun adına uygulanır.
 */

/** Tek öneride en çok bu kadar satır (bir Excel tablosu tek kartta onaylanabilsin) */
export const MAX_POOL_ROWS = 100;
/** Ünvan aylık maliyeti için akla yatkın üst sınır (₺) — yanlış basamak/sütun okumasını yakalar */
export const MAX_MONTHLY_COST = 10_000_000;
/** Kartta en çok bu kadar satır ayrıntısı; kalanı özetlenir */
const CARD_ROWS = 30;

export interface PoolTitle { code: string; name: string; monthlyCost?: number }
export interface PoolPersonChange { personId: string; titleCode?: string; departmentCode?: string; email?: string; availableAA?: number }
export interface PoolNewPerson { firstName: string; lastName: string; departmentCode: string; titleCode?: string; email?: string; availableAA: number }

export type PoolAction =
    /** Ünvan ekle / güncelle (kısaltmaya göre): ad ve 1 AA'lık aylık maliyet */
    | { type: 'unvan_kaydet'; titles: PoolTitle[] }
    /** Var olan kişilerin ünvanı, bölümü, e-postası ya da kullanılabilir AA'sı */
    | { type: 'kisi_guncelle'; changes: PoolPersonChange[] }
    | { type: 'kisi_ekle'; people: PoolNewPerson[] }
    /** Bölüm ekle / adını güncelle (koda göre) */
    | { type: 'birim_kaydet'; departments: Pick<Department, 'code' | 'name'>[] };

const POOL_TYPES = new Set<string>(['unvan_kaydet', 'kisi_guncelle', 'kisi_ekle', 'birim_kaydet']);
export const isPoolAction = (a: { type: string }): a is PoolAction => POOL_TYPES.has(a.type);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fmtTL = (v?: number): string => (v === undefined ? 'maliyet yok' : `₺${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`);
const fmtAA = (v: number): string => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/**
 * Para metni → sayı. "234.187,00", "₺234.187", "234187.5", "234 187" ve sayı
 * kabul edilir; okunamazsa undefined.
 */
export const parseMoney = (v: unknown): number | undefined => {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined;
    if (typeof v !== 'string') return undefined;
    let s = v.replace(/[₺\s]|TL|TRY/gi, '').trim();
    if (!s) return undefined;
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
        // Hangisi sondaysa ondalık ayırıcı odur
        s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lastComma > -1) {
        // Tek virgül ve ardından 1-2 hane: ondalık; aksi binlik
        s = /,\d{1,2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
    } else if (lastDot > -1 && (s.split('.').length > 2 || /\.\d{3}$/.test(s))) {
        s = s.replace(/\./g, ''); // 234.187 → binlik
    }
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
};

/**
 * Ünvan adından kısaltma: kelimelerin baş harfleri (Ar-Ge tek kelime), en az
 * üç harf; tek kelimede ilk üç harf. Havuzda/öneride varsa sonuna sayı eklenir.
 * "Uzman Ar-Ge Proje Teknisyeni" → UAPT, "Danışman" → DAN, "Aday Araştırmacı" → AAR
 */
export const titleCodeFor = (name: string, taken: Iterable<string>): string => {
    const used = new Set([...taken].map(trUpper));
    const words = name.split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
    let code = '';
    if (words.length === 1) code = trUpper(words[0].slice(0, 3));
    else {
        code = trUpper(words.map(w => w[0]).join('')).slice(0, 5);
        const last = words[words.length - 1];
        for (let i = 1; code.length < 3 && i < last.length; i++) code += trUpper(last[i]);
    }
    if (!code) code = 'UNV';
    if (!used.has(code)) return code;
    for (let i = 2; ; i++) if (!used.has(`${code}${i}`)) return `${code}${i}`;
};

const canEditPool = (ws: WorkspaceData): boolean => can(identityOf(ws), 'datapool.edit');

const rowsError = (n: number, what: string): string | null =>
    n < 1 ? `Önerilecek ${what} yok.` : n > MAX_POOL_ROWS ? `Tek öneride en çok ${MAX_POOL_ROWS} ${what} olabilir; tabloyu bölün.` : null;

const dupes = (keys: string[]): string[] => {
    const seen = new Set<string>(), out = new Set<string>();
    keys.forEach(k => (seen.has(k) ? out.add(k) : seen.add(k)));
    return [...out];
};

const titleChanged = (cur: TitleDef | undefined, t: PoolTitle): boolean =>
    !cur || cur.name !== t.name.trim() || (t.monthlyCost !== undefined && cur.monthlyCost !== t.monthlyCost);

const personChangeFields = (p: Person, c: PoolPersonChange): string[] => [
    ...(c.titleCode !== undefined && c.titleCode !== (p.titleCode || '') ? ['titleCode'] : []),
    ...(c.departmentCode !== undefined && c.departmentCode !== (p.departmentCode || '') ? ['departmentCode'] : []),
    ...(c.email !== undefined && c.email.trim().toLowerCase() !== (p.email || '') ? ['email'] : []),
    ...(c.availableAA !== undefined && c.availableAA !== p.availableAA ? ['availableAA'] : []),
];

/** Doğrulama — sorun varsa Türkçe açıklama, yoksa null */
export const validatePoolAction = (ws: WorkspaceData, action: PoolAction): string | null => {
    if (!canEditPool(ws)) return 'Veri havuzunu düzenleme yetkiniz yok (varsayılan olarak PYB Destek düzenler).';
    const titleCodes = new Set(ws.titles.map(t => t.code));
    const deptCodes = new Set(ws.departments.map(d => d.code));
    switch (action.type) {
        case 'unvan_kaydet': {
            const e = rowsError(action.titles.length, 'ünvan');
            if (e) return e;
            for (const t of action.titles) {
                if (!trUpper(t.code)) return `"${t.name}" için kısaltma boş olamaz.`;
                if (!t.name.trim()) return `${t.code} kısaltmalı ünvanın adı boş olamaz.`;
                if (t.monthlyCost !== undefined && !(t.monthlyCost > 0 && t.monthlyCost < MAX_MONTHLY_COST)) {
                    return `"${t.name}" aylık maliyeti 0 ile ${MAX_MONTHLY_COST.toLocaleString('tr-TR')} ₺ arasında olmalı.`;
                }
            }
            const d = dupes(action.titles.map(t => trUpper(t.code)));
            if (d.length) return `Aynı kısaltma birden fazla satırda: ${d.join(', ')}.`;
            const dn = dupes(action.titles.map(t => trNorm(t.name)));
            if (dn.length) return `Aynı ünvan adı birden fazla satırda: ${dn.join(', ')}.`;
            // Yeni bir kısaltma, havuzdaki BAŞKA bir ünvanın adını taşıyamaz (mükerrer ünvan)
            for (const t of action.titles) {
                const clash = ws.titles.find(x => trNorm(x.name) === trNorm(t.name) && x.code !== t.code);
                if (clash && !titleCodes.has(t.code)) return `"${t.name}" ünvanı havuzda ${clash.code} kısaltmasıyla zaten var.`;
            }
            if (!action.titles.some(t => titleChanged(ws.titles.find(x => x.code === t.code), t))) return 'Ünvanlarda değişen bir şey yok; havuz zaten bu değerlerde.';
            return null;
        }
        case 'kisi_guncelle': {
            const e = rowsError(action.changes.length, 'kişi');
            if (e) return e;
            const d = dupes(action.changes.map(c => c.personId));
            if (d.length) return 'Aynı kişi birden fazla satırda; tek satırda birleştirin.';
            for (const c of action.changes) {
                const p = ws.people.find(x => x.id === c.personId);
                if (!p) return 'Kişi veri havuzunda bulunamadı (silinmiş olabilir).';
                if (c.titleCode && !titleCodes.has(c.titleCode)) return `${fullName(p)}: "${c.titleCode}" ünvanı havuzda yok. Önce ünvan önerisini uygulayın.`;
                if (c.departmentCode && !deptCodes.has(c.departmentCode)) return `${fullName(p)}: "${c.departmentCode}" bölümü havuzda yok. Önce bölüm önerisini uygulayın.`;
                if (c.email && !EMAIL_RE.test(c.email.trim())) return `${fullName(p)}: e-posta adresi geçersiz.`;
                if (c.availableAA !== undefined && !(c.availableAA >= 0 && c.availableAA <= 1.5)) return `${fullName(p)}: kullanılabilir AA 0 ile 1,5 arasında olmalı.`;
            }
            if (!action.changes.some(c => personChangeFields(ws.people.find(x => x.id === c.personId)!, c).length)) return 'Kişilerde değişen bir şey yok.';
            return null;
        }
        case 'kisi_ekle': {
            const e = rowsError(action.people.length, 'kişi');
            if (e) return e;
            const d = dupes(action.people.map(p => trNorm(`${p.firstName} ${p.lastName}`)));
            if (d.length) return `Aynı kişi birden fazla satırda: ${d.join(', ')}.`;
            for (const p of action.people) {
                const n = `${p.firstName} ${p.lastName}`.trim();
                if (!p.firstName.trim() || !p.lastName.trim()) return `"${n || '?'}": ad ve soyad zorunlu.`;
                if (ws.people.some(x => trNorm(fullName(x)) === trNorm(n))) return `${n} havuzda zaten var; ekleme yerine güncelleme önerin.`;
                if (!deptCodes.has(p.departmentCode)) return `${n}: "${p.departmentCode || '—'}" bölümü havuzda yok.`;
                if (p.titleCode && !titleCodes.has(p.titleCode)) return `${n}: "${p.titleCode}" ünvanı havuzda yok. Önce ünvan önerisini uygulayın.`;
                if (p.email && !EMAIL_RE.test(p.email.trim())) return `${n}: e-posta adresi geçersiz.`;
                if (!(p.availableAA >= 0 && p.availableAA <= 1.5)) return `${n}: kullanılabilir AA 0 ile 1,5 arasında olmalı.`;
            }
            return null;
        }
        case 'birim_kaydet': {
            const e = rowsError(action.departments.length, 'bölüm');
            if (e) return e;
            for (const dp of action.departments) if (!trUpper(dp.code) || !dp.name.trim()) return 'Bölüm kodu ve adı zorunlu.';
            const d = dupes(action.departments.map(x => trUpper(x.code)));
            if (d.length) return `Aynı bölüm kodu birden fazla satırda: ${d.join(', ')}.`;
            if (!action.departments.some(x => ws.departments.find(y => y.code === trUpper(x.code))?.name !== x.name.trim())) return 'Bölümlerde değişen bir şey yok.';
            return null;
        }
    }
};

const capRows = <T,>(rows: T[], line: (r: T) => { label: string; value: string }): { label: string; value: string }[] => [
    ...rows.slice(0, CARD_ROWS).map(line),
    ...(rows.length > CARD_ROWS ? [{ label: '…', value: `ve ${rows.length - CARD_ROWS} satır daha` }] : []),
];

/** Öneri kartı başlığı ve satırları */
export const describePoolAction = (ws: WorkspaceData, action: PoolAction): { title: string; details: { label: string; value: string }[] } => {
    const titleName = (code?: string) => (code ? ws.titles.find(t => t.code === code)?.name || code : '—');
    switch (action.type) {
        case 'unvan_kaydet': {
            const rows = action.titles.map(t => ({ t, cur: ws.titles.find(x => x.code === t.code) }));
            const added = rows.filter(r => !r.cur).length;
            const changed = rows.filter(r => r.cur && titleChanged(r.cur, r.t)).length;
            return {
                title: `Ünvan ve maliyet: ${[added ? `${added} yeni` : '', changed ? `${changed} güncelleme` : ''].filter(Boolean).join(', ') || 'değişiklik yok'}`,
                details: capRows(rows.filter(r => titleChanged(r.cur, r.t)), ({ t, cur }) => ({
                    label: `${t.name.trim()} (${t.code})`,
                    value: !cur
                        ? `yeni · ${fmtTL(t.monthlyCost)}`
                        : [cur.name !== t.name.trim() ? `ad: ${cur.name} → ${t.name.trim()}` : '', t.monthlyCost !== undefined && t.monthlyCost !== cur.monthlyCost ? `${fmtTL(cur.monthlyCost)} → ${fmtTL(t.monthlyCost)}` : ''].filter(Boolean).join(' · '),
                })),
            };
        }
        case 'kisi_guncelle': {
            const rows = action.changes.map(c => ({ c, p: ws.people.find(x => x.id === c.personId) })).filter(r => r.p && personChangeFields(r.p, r.c).length);
            return {
                title: `Kişi güncelle: ${rows.length} kişi`,
                details: capRows(rows, ({ c, p }) => ({
                    label: fullName(p!),
                    value: personChangeFields(p!, c).map(f => {
                        if (f === 'titleCode') return `ünvan: ${titleName(p!.titleCode)} → ${titleName(c.titleCode)}`;
                        if (f === 'departmentCode') return `bölüm: ${p!.departmentCode || '—'} → ${c.departmentCode}`;
                        if (f === 'email') return `e-posta: ${c.email?.trim().toLowerCase() || '—'}`;
                        return `AA: ${fmtAA(p!.availableAA)} → ${fmtAA(c.availableAA!)}`;
                    }).join(' · '),
                })),
            };
        }
        case 'kisi_ekle':
            return {
                title: `Kişi ekle: ${action.people.length} kişi`,
                details: capRows(action.people, p => ({
                    label: `${p.firstName} ${p.lastName}`.trim(),
                    value: [p.departmentCode, p.titleCode ? titleName(p.titleCode) : 'ünvan yok', `${fmtAA(p.availableAA)} AA`, p.email || ''].filter(Boolean).join(' · '),
                })),
            };
        case 'birim_kaydet':
            return {
                title: `Bölüm: ${action.departments.length} satır`,
                details: capRows(action.departments, d => {
                    const cur = ws.departments.find(x => x.code === trUpper(d.code));
                    return { label: trUpper(d.code), value: cur ? (cur.name === d.name.trim() ? `${cur.name} (değişmiyor)` : `${cur.name} → ${d.name.trim()}`) : `yeni · ${d.name.trim()}` };
                }),
            };
    }
};

const newPersonId = (): string => `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Uygular (saf); önce validatePoolAction ile yeniden denetlenir */
export const applyPoolAction = (ws: WorkspaceData, action: PoolAction): { ws: WorkspaceData; summary: string } => {
    const err = validatePoolAction(ws, action);
    if (err) throw new Error(err);
    let next: WorkspaceData;
    let summary: string;
    switch (action.type) {
        case 'unvan_kaydet': {
            const byCode = new Map(action.titles.map(t => [trUpper(t.code), t]));
            let added = 0, updated = 0;
            const titles = ws.titles.map(cur => {
                const t = byCode.get(cur.code);
                if (!t || !titleChanged(cur, t)) return cur;
                updated++;
                return { ...cur, name: t.name.trim(), ...(t.monthlyCost !== undefined ? { monthlyCost: t.monthlyCost } : {}) };
            });
            for (const t of action.titles) {
                const code = trUpper(t.code);
                if (ws.titles.some(x => x.code === code)) continue;
                added++;
                titles.push({ code, name: t.name.trim(), ...(t.monthlyCost !== undefined ? { monthlyCost: t.monthlyCost } : {}) });
            }
            next = { ...ws, titles };
            summary = `Ünvanlar: ${[added ? `${added} eklendi` : '', updated ? `${updated} güncellendi` : ''].filter(Boolean).join(', ')}`;
            break;
        }
        case 'kisi_guncelle': {
            const byId = new Map(action.changes.map(c => [c.personId, c]));
            let n = 0;
            const people = ws.people.map(p => {
                const c = byId.get(p.id);
                if (!c || !personChangeFields(p, c).length) return p;
                n++;
                return {
                    ...p,
                    ...(c.titleCode !== undefined ? { titleCode: c.titleCode || undefined } : {}),
                    ...(c.departmentCode !== undefined ? { departmentCode: c.departmentCode } : {}),
                    ...(c.email !== undefined ? { email: c.email.trim().toLowerCase() || undefined } : {}),
                    ...(c.availableAA !== undefined ? { availableAA: c.availableAA } : {}),
                };
            });
            next = { ...ws, people };
            summary = `${n} kişinin veri havuzu kaydı güncellendi`;
            break;
        }
        case 'kisi_ekle': {
            const added: Person[] = action.people.map(p => ({
                id: newPersonId(), firstName: p.firstName.trim(), lastName: p.lastName.trim(), departmentCode: p.departmentCode,
                ...(p.titleCode ? { titleCode: p.titleCode } : {}), ...(p.email?.trim() ? { email: p.email.trim().toLowerCase() } : {}),
                availableAA: p.availableAA, roles: [],
            }));
            next = { ...ws, people: [...ws.people, ...added] };
            summary = `Veri havuzuna ${added.length} kişi eklendi`;
            break;
        }
        case 'birim_kaydet': {
            const byCode = new Map(action.departments.map(d => [trUpper(d.code), d.name.trim()]));
            const departments = ws.departments.map(d => (byCode.has(d.code) ? { ...d, name: byCode.get(d.code)! } : d));
            const fresh = [...byCode].filter(([code]) => !ws.departments.some(d => d.code === code)).map(([code, name]) => ({ code, name }));
            next = { ...ws, departments: [...departments, ...fresh] };
            summary = `Bölümler: ${fresh.length} eklendi, ${action.departments.length - fresh.length} güncellendi`;
            break;
        }
    }
    return { ws: appendAudit(next, 'ai.apply', `AI önerisiyle (veri havuzu): ${summary}`), summary };
};
