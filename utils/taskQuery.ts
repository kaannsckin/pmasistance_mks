import { IssueType, Task, TaskStatus } from '../types';
import { ISSUE_TYPE_LABELS, pertDays } from './planning/lifecycle';
import { taskTimeTracking } from './timeTracking';
import { sprintsOf } from './sprintSpan';

/**
 * Görev sorgu dili (JQL benzeri). Görevleri aramak, süzmek ve toplu seçmek
 * için bütün ekranlarda aynı dil kullanılır: Liste araması, Plan simülasyonu
 * kapsamı, Sürüm planına kayıt ekleme ve Jira'ya gönder.
 *
 *   durum = Süreçte AND öncelik >= Yüksek
 *   atanan IS EMPTY AND sprint = Havuz ORDER BY öncelik DESC
 *   etiket IN (mobil, web) OR özet ~ "parola"
 *   termin < today() AND durum != Tamamlandı
 *   oluşturma >= -14d AND tür = Hata
 *
 * Alan adları Türkçe ya da Jira'daki İngilizce adıyla yazılabilir; değerler
 * büyük/küçük harf ve ı/i farkı gözetmeden eşleşir. İşleçsiz yazılan sözcük
 * ya da tırnaklı metin başlıkta, açıklamada, anahtarda ve etiketlerde aranır.
 * Yan yana yazılan koşullar VE ile birleşir.
 */

// ------------------------------------------------------------------ bağlam

export interface TaskQueryContext {
    now?: Date;
    /** Sprint numarası → özel ad (sprint = "Kış sprinti") */
    sprintNames?: Record<number, string>;
    /** İş paketi kimliği → ad (iş_paketi = "Kimlik") */
    workPackages?: { id: string; name: string }[];
    /** Oturumdaki kişinin görevlerdeki adı (atanan = me / currentUser()) */
    me?: string;
}

// ------------------------------------------------------------------ yardımcılar

/** Büyük/küçük ve ı/i duyarsız karşılaştırma için normalleştirme */
export const normQ = (s: string): string => s.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/\s+/g, ' ');

const DAY = 86_400_000;
const dayNum = (d: Date): number => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
const isoDayNum = (iso?: string): number | undefined => {
    if (!iso) return undefined;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (m) return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
    const d = new Date(iso);
    return isNaN(d.getTime()) ? undefined : dayNum(d);
};

const PRIORITY_RANK: Record<Task['priority'], number> = { Blocker: 4, High: 3, Medium: 2, Low: 1 };
const PRIORITY_ALIASES: Record<string, Task['priority']> = {
    blocker: 'Blocker', engelleyici: 'Blocker', highest: 'Blocker', kritik: 'Blocker', critical: 'Blocker',
    high: 'High', yuksek: 'High', 'yüksek': 'High',
    medium: 'Medium', orta: 'Medium', normal: 'Medium',
    low: 'Low', dusuk: 'Low', 'düşük': 'Low', lowest: 'Low',
};
export const PRIORITY_QUERY_LABELS: Record<Task['priority'], string> = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' };

const STATUS_QUERY_LABELS: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'Bekleyen',
    [TaskStatus.ToDo]: 'Yapılacak',
    [TaskStatus.InProgress]: 'Süreçte',
    [TaskStatus.Done]: 'Tamamlandı',
};
const OPEN = [TaskStatus.Backlog, TaskStatus.ToDo, TaskStatus.InProgress];
const STATUS_ALIASES: Record<string, TaskStatus[]> = {
    backlog: [TaskStatus.Backlog], bekleyen: [TaskStatus.Backlog],
    todo: [TaskStatus.ToDo], 'to do': [TaskStatus.ToDo], yapilacak: [TaskStatus.ToDo], 'yapılacak': [TaskStatus.ToDo],
    inprogress: [TaskStatus.InProgress], 'in progress': [TaskStatus.InProgress], surecte: [TaskStatus.InProgress], 'süreçte': [TaskStatus.InProgress], devam: [TaskStatus.InProgress], 'devam ediyor': [TaskStatus.InProgress],
    done: [TaskStatus.Done], tamamlandi: [TaskStatus.Done], 'tamamlandı': [TaskStatus.Done], bitti: [TaskStatus.Done], kapali: [TaskStatus.Done], 'kapalı': [TaskStatus.Done], closed: [TaskStatus.Done],
    open: OPEN, acik: OPEN, 'açık': OPEN,
};

const TYPE_ALIASES: Record<string, IssueType> = {
    bug: 'bug', hata: 'bug', defect: 'bug',
    feature: 'feature', story: 'feature', 'yeni özellik': 'feature', 'yeni ozellik': 'feature', ozellik: 'feature', 'özellik': 'feature',
    improvement: 'improvement', iyilestirme: 'improvement', 'iyileştirme': 'improvement',
    task: 'task', gorev: 'task', 'görev': 'task',
    other: 'other', diger: 'other', 'diğer': 'other',
};
const lookup = <T>(map: Record<string, T>, v: string): T | undefined => map[normQ(v)] ?? map[v.trim().toLocaleLowerCase('tr-TR')];

// ------------------------------------------------------------------ alanlar

export type FieldType = 'text' | 'list' | 'priority' | 'status' | 'type' | 'number' | 'date' | 'bool' | 'sprint';

export interface FieldDef {
    key: string;
    label: string;
    aliases: string[];
    type: FieldType;
    hint: string;
}

/** Sorgu dilindeki alanlar (ilk ad önerilerde gösterilen addır) */
export const QUERY_FIELDS: FieldDef[] = [
    { key: 'text', label: 'metin', aliases: ['text', 'ara'], type: 'text', hint: 'Başlık, açıklama, anahtar ve etiketlerde arar' },
    { key: 'summary', label: 'özet', aliases: ['summary', 'baslik', 'başlık', 'ad', 'name', 'ozet'], type: 'text', hint: 'Görev başlığı' },
    { key: 'description', label: 'açıklama', aliases: ['description', 'aciklama', 'not', 'notes'], type: 'text', hint: 'Görev açıklaması' },
    { key: 'key', label: 'anahtar', aliases: ['key', 'jira', 'issuekey', 'numara'], type: 'text', hint: 'Jira anahtarı (ör. ABC-12)' },
    { key: 'status', label: 'durum', aliases: ['status'], type: 'status', hint: 'Bekleyen, Yapılacak, Süreçte, Tamamlandı, Açık ya da Jira durum adı' },
    { key: 'priority', label: 'öncelik', aliases: ['priority', 'oncelik', 'önem', 'onem'], type: 'priority', hint: 'Engelleyici > Yüksek > Orta > Düşük; < ve > kullanılabilir' },
    { key: 'type', label: 'tür', aliases: ['type', 'issuetype', 'tur'], type: 'type', hint: 'Hata, Yeni özellik, İyileştirme, Görev, Diğer' },
    { key: 'assignee', label: 'atanan', aliases: ['assignee', 'sorumlu', 'kisi', 'kişi'], type: 'text', hint: 'Sorumlu kişi; ben için me' },
    { key: 'unit', label: 'birim', aliases: ['unit', 'bolum', 'bölüm'], type: 'text', hint: 'Birim / bölüm' },
    { key: 'sprint', label: 'sprint', aliases: ['version'], type: 'sprint', hint: 'Sprint numarası ya da adı; Havuz = sprint atanmamış' },
    { key: 'labels', label: 'etiket', aliases: ['labels', 'label', 'etiketler'], type: 'list', hint: 'Etiketlerden biri' },
    { key: 'component', label: 'bileşen', aliases: ['component', 'components', 'bilesen'], type: 'list', hint: 'Bileşenlerden biri' },
    { key: 'fixVersion', label: 'sürüm', aliases: ['fixversion', 'surum', 'hedef_sürüm'], type: 'text', hint: 'Hedef sürüm (Jira Fix Version)' },
    { key: 'workPackage', label: 'iş_paketi', aliases: ['workpackage', 'is_paketi', 'paket', 'epic'], type: 'text', hint: 'İş paketi adı' },
    { key: 'jiraStatus', label: 'jira_durumu', aliases: ['jirastatus'], type: 'text', hint: 'Jira’daki durum adı (ör. ANALYSIS)' },
    { key: 'resolution', label: 'çözüm', aliases: ['resolution', 'cozum'], type: 'text', hint: 'Jira çözümü' },
    { key: 'due', label: 'termin', aliases: ['due', 'duedate', 'bitiş', 'bitis'], type: 'date', hint: 'Bitiş tarihi' },
    { key: 'created', label: 'oluşturma', aliases: ['created', 'olusturma', 'açılış', 'acilis'], type: 'date', hint: 'Açılış tarihi' },
    { key: 'updated', label: 'güncelleme', aliases: ['updated', 'guncelleme'], type: 'date', hint: 'Son değişiklik' },
    { key: 'started', label: 'başlama', aliases: ['started', 'baslama'], type: 'date', hint: 'İlk kez Süreçte’ye geçtiği gün' },
    { key: 'resolved', label: 'kapanış', aliases: ['resolved', 'kapanis', 'resolutiondate'], type: 'date', hint: 'Kapanış tarihi' },
    { key: 'estimate', label: 'tahmin', aliases: ['estimate', 'efor'], type: 'number', hint: 'Tahmini efor (gün, PERT)' },
    { key: 'spent', label: 'harcanan', aliases: ['spent', 'timespent', 'worklog'], type: 'number', hint: 'Harcanan süre (saat, Jira)' },
    { key: 'remaining', label: 'kalan', aliases: ['remaining', 'remainingestimate'], type: 'number', hint: 'Jira kalan süre (saat)' },
    { key: 'effortOverrun', label: 'tahmin_aşılmış', aliases: ['overrun', 'tahmin_asilmis'], type: 'bool', hint: 'Harcanan tahmini aştı veya açık işin kalan süresi sıfır' },
    { key: 'unestimated', label: 'tahminsiz', aliases: ['unestimated'], type: 'bool', hint: 'Jira veya plan tahmini girilmemiş' },
    { key: 'storyPoints', label: 'puan', aliases: ['storypoints', 'sp', 'story_points'], type: 'number', hint: 'Story point' },
    { key: 'overdue', label: 'gecikmiş', aliases: ['overdue', 'gecikmis', 'geciken'], type: 'bool', hint: 'Termini geçmiş ve açık: gecikmiş = evet' },
];

const FIELD_BY_NAME = new Map<string, FieldDef>();
for (const f of QUERY_FIELDS) for (const n of [f.label, f.key, ...f.aliases]) FIELD_BY_NAME.set(normQ(n), f);
export const fieldByName = (name: string): FieldDef | undefined => FIELD_BY_NAME.get(normQ(name));

const wpName = (t: Task, ctx: TaskQueryContext) => (t.workPackageId ? ctx.workPackages?.find(w => w.id === t.workPackageId)?.name || t.workPackageId : '');

/** Alanın görevdeki metin değer(ler)i (metin ve liste türleri) */
const textValues = (f: FieldDef, t: Task, ctx: TaskQueryContext): string[] => {
    switch (f.key) {
        case 'text': return [t.name, t.notes || '', t.jiraId || '', ...(t.labels || [])];
        case 'summary': return [t.name];
        case 'description': return [t.notes || ''];
        case 'key': return [t.jiraId || ''];
        case 'assignee': return [t.resourceName || ''];
        case 'unit': return [t.unit || ''];
        case 'labels': return t.labels || [];
        case 'component': return t.components || [];
        case 'fixVersion': return [t.fixVersion || ''];
        case 'workPackage': return [wpName(t, ctx)];
        case 'jiraStatus': return [t.jiraStatus || ''];
        case 'resolution': return [t.resolution || ''];
        default: return [];
    }
};

const numberValue = (f: FieldDef, t: Task): number | undefined => {
    switch (f.key) {
        case 'estimate': return pertDays(t) ?? undefined;
        case 'spent': return t.actualHours;
        case 'remaining': return t.remainingEstimateHours;
        case 'storyPoints': return t.storyPoints;
        default: return undefined;
    }
};

const dateValue = (f: FieldDef, t: Task): number | undefined => {
    switch (f.key) {
        case 'due': return isoDayNum(t.dueDate);
        case 'created': return isoDayNum(t.createdAt || t.importedAt);
        case 'updated': return isoDayNum(t.updatedAt);
        case 'started': return isoDayNum(t.startedAt);
        case 'resolved': return isoDayNum(t.resolvedAt);
        default: return undefined;
    }
};

const isOverdue = (t: Task, ctx: TaskQueryContext) => {
    const due = isoDayNum(t.dueDate);
    return due !== undefined && t.status !== TaskStatus.Done && due < dayNum(ctx.now || new Date());
};
const booleanValue = (f: FieldDef, t: Task, ctx: TaskQueryContext): boolean => {
    if (f.key === 'effortOverrun') return taskTimeTracking(t).overrun;
    if (f.key === 'unestimated') return t.originalEstimateHours == null && !pertDays(t);
    return isOverdue(t, ctx);
};

// ------------------------------------------------------------------ sözcükler

type TokKind = 'word' | 'string' | 'op' | 'lparen' | 'rparen' | 'comma';
interface Token { kind: TokKind; text: string; value: string; start: number; end: number }

const OPS = ['!=', '>=', '<=', '!~', '=', '~', '>', '<'];
const WORD_CHAR = /[\p{L}\p{N}_\-.:/+*@']/u;

export class TaskQueryError extends Error {
    constructor(message: string, public start: number, public end: number) { super(message); }
}

const tokenize = (src: string): Token[] => {
    const out: Token[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === '(') { out.push({ kind: 'lparen', text: c, value: c, start: i, end: i + 1 }); i++; continue; }
        if (c === ')') { out.push({ kind: 'rparen', text: c, value: c, start: i, end: i + 1 }); i++; continue; }
        if (c === ',') { out.push({ kind: 'comma', text: c, value: c, start: i, end: i + 1 }); i++; continue; }
        if (c === '"' || c === '“' || c === '”') {
            const start = i;
            i++;
            let v = '';
            while (i < src.length && src[i] !== '"' && src[i] !== '”' && src[i] !== '“') {
                if (src[i] === '\\' && i + 1 < src.length) { v += src[i + 1]; i += 2; continue; }
                v += src[i++];
            }
            if (i >= src.length) throw new TaskQueryError('Tırnak kapanmamış.', start, src.length);
            i++;
            out.push({ kind: 'string', text: src.slice(start, i), value: v, start, end: i });
            continue;
        }
        const op = OPS.find(o => src.startsWith(o, i));
        if (op) { out.push({ kind: 'op', text: op, value: op, start: i, end: i + op.length }); i += op.length; continue; }
        if (c === '&' && src[i + 1] === '&') { out.push({ kind: 'word', text: '&&', value: 'AND', start: i, end: i + 2 }); i += 2; continue; }
        if (c === '|' && src[i + 1] === '|') { out.push({ kind: 'word', text: '||', value: 'OR', start: i, end: i + 2 }); i += 2; continue; }
        if (WORD_CHAR.test(c)) {
            const start = i;
            while (i < src.length && WORD_CHAR.test(src[i])) i++;
            const text = src.slice(start, i);
            out.push({ kind: 'word', text, value: text, start, end: i });
            continue;
        }
        throw new TaskQueryError(`Beklenmeyen karakter: ${c}`, i, i + 1);
    }
    return out;
};

const KEYWORDS: Record<string, string> = {
    and: 'AND', ve: 'AND', or: 'OR', veya: 'OR', not: 'NOT', degil: 'NOT', 'değil': 'NOT',
    in: 'IN', is: 'IS', empty: 'EMPTY', null: 'EMPTY', bos: 'EMPTY', 'boş': 'EMPTY',
    order: 'ORDER', by: 'BY', asc: 'ASC', desc: 'DESC', artan: 'ASC', azalan: 'DESC', sirala: 'ORDER', 'sırala': 'ORDER',
};
const kw = (t?: Token): string | undefined => (t && t.kind === 'word' ? (t.value === 'AND' || t.value === 'OR' ? t.value : KEYWORDS[normQ(t.text)]) : undefined);

// ------------------------------------------------------------------ ağaç

type Value = { kind: 'lit'; text: string; quoted: boolean; start: number; end: number } | { kind: 'fn'; name: string; args: string[]; start: number; end: number };
type Op = '=' | '!=' | '~' | '!~' | '>' | '>=' | '<' | '<=' | 'in' | 'not in';
export type QueryNode =
    | { kind: 'and' | 'or'; items: QueryNode[] }
    | { kind: 'not'; item: QueryNode }
    | { kind: 'cmp'; field: FieldDef; op: Op; values: Value[]; start: number; end: number }
    | { kind: 'empty'; field: FieldDef; negate: boolean }
    | { kind: 'text'; value: string };

export interface SortSpec { field: FieldDef; desc: boolean }

export interface ParsedQuery { where: QueryNode | null; orderBy: SortSpec[] }

const closest = (name: string): string | undefined => {
    const n = normQ(name);
    let best: { label: string; d: number } | undefined;
    for (const f of QUERY_FIELDS) {
        for (const cand of [f.label, f.key, ...f.aliases]) {
            const d = editDistance(n, normQ(cand));
            if (d <= 2 && (!best || d < best.d)) best = { label: f.label, d };
        }
    }
    return best?.label;
};
const editDistance = (a: string, b: string): number => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return dp[a.length][b.length];
};

/** Sorguyu ayrıştırır; hatada konumuyla birlikte TaskQueryError atar */
export const parseTaskQuery = (src: string): ParsedQuery => {
    const toks = tokenize(src);
    let p = 0;
    const peek = (o = 0) => toks[p + o];
    const eof = () => p >= toks.length;
    const fail = (msg: string, t?: Token): never => {
        const at = t || toks[toks.length - 1];
        throw new TaskQueryError(msg, at ? at.start : 0, at ? at.end : src.length);
    };

    const isOpStart = (o = 0) => {
        const t = peek(o);
        if (!t) return false;
        if (t.kind === 'op') return true;
        const k = kw(t);
        return k === 'IN' || k === 'IS' || (k === 'NOT' && kw(peek(o + 1)) === 'IN');
    };

    const parseValue = (): Value => {
        const t = peek();
        if (!t) return fail('Değer bekleniyor.');
        if (t.kind === 'string') { p++; return { kind: 'lit', text: t.value, quoted: true, start: t.start, end: t.end }; }
        if (t.kind !== 'word' || (kw(t) && kw(t) !== 'EMPTY' && !['ASC', 'DESC', 'BY'].includes(kw(t)!))) return fail('Değer bekleniyor.', t);
        p++;
        if (peek()?.kind === 'lparen' && peek()!.start === t.end) {
            p++;
            const args: string[] = [];
            while (peek() && peek()!.kind !== 'rparen') {
                const a = peek()!;
                if (a.kind === 'comma') { p++; continue; }
                if (a.kind !== 'word' && a.kind !== 'string') fail('İşlev bağımsız değişkeni bekleniyor.', a);
                args.push(a.value);
                p++;
            }
            const close = peek();
            if (!close) return fail('İşlev parantezi kapanmamış.', t);
            p++;
            return { kind: 'fn', name: t.text, args, start: t.start, end: close.end };
        }
        return { kind: 'lit', text: t.value, quoted: false, start: t.start, end: t.end };
    };

    const parseClause = (): QueryNode => {
        const t = peek()!;
        if (t.kind === 'string') { p++; return { kind: 'text', value: t.value }; }
        if (t.kind !== 'word') return fail('Koşul bekleniyor.', t);
        if (!isOpStart(1)) {
            // İşleçsiz sözcük: metin araması
            if (kw(t) && kw(t) !== 'EMPTY') return fail(`"${t.text}" burada beklenmiyor.`, t);
            p++;
            const phraseEnd = normQ(t.text) === 'tahmin' && ['aşilmiş', 'asilmis'].includes(normQ(peek()?.text || '')) ? peek() : undefined;
            const flag = fieldByName(phraseEnd ? 'tahmin_aşılmış' : t.text);
            if (phraseEnd) p++;
            if (flag?.type === 'bool' && flag.key !== 'overdue') {
                return { kind: 'cmp', field: flag, op: '=', values: [{ kind: 'lit', text: 'evet', quoted: false, start: t.start, end: t.end }], start: t.start, end: t.end };
            }
            return { kind: 'text', value: t.value };
        }
        const field = fieldByName(t.text);
        if (!field) {
            const s = closest(t.text);
            return fail(`Bilinmeyen alan: ${t.text}${s ? ` (${s} mi demek istediniz?)` : ''}`, t);
        }
        p++;
        const o = peek()!;
        if (kw(o) === 'IS') {
            p++;
            let negate = false;
            if (kw(peek()) === 'NOT') { negate = true; p++; }
            if (kw(peek()) !== 'EMPTY') return fail('IS sonrasında EMPTY (boş) bekleniyor.', peek() || o);
            p++;
            return { kind: 'empty', field, negate };
        }
        let op: Op;
        if (kw(o) === 'NOT') { p += 2; op = 'not in'; }
        else if (kw(o) === 'IN') { p++; op = 'in'; }
        else { p++; op = o.value as Op; }
        if (op === 'in' || op === 'not in') {
            const lp = peek();
            if (!lp || lp.kind !== 'lparen') return fail('IN sonrasında parantezli liste bekleniyor: (a, b).', lp || o);
            p++;
            const values: Value[] = [];
            while (true) {
                if (!peek()) return fail('Liste parantezi kapanmamış.', lp);
                if (peek()!.kind === 'rparen') { p++; break; }
                values.push(parseValue());
                if (peek()?.kind === 'comma') p++;
                else if (peek()?.kind !== 'rparen') return fail('Listede virgül ya da ) bekleniyor.', peek() || lp);
            }
            if (!values.length) return fail('Liste boş olamaz.', lp);
            return { kind: 'cmp', field, op, values, start: t.start, end: toks[p - 1].end };
        }
        if (kw(peek()) === 'EMPTY') {
            p++;
            if (op === '=' || op === '!=') return { kind: 'empty', field, negate: op === '!=' };
            return fail('EMPTY yalnız = ya da != ile kullanılır.', toks[p - 1]);
        }
        const v = parseValue();
        if (['remaining', 'spent'].includes(field.key) && v.kind === 'lit' && /^saat$/i.test(peek()?.text || '')) p++;
        if ((op === '>' || op === '<' || op === '>=' || op === '<=') && !['priority', 'number', 'date', 'sprint'].includes(field.type)) {
            fail(`${field.label} alanında ${op} kullanılamaz.`, o);
        }
        if ((op === '~' || op === '!~') && !['text', 'list', 'status'].includes(field.type)) fail(`${field.label} alanında ~ kullanılamaz; = ya da IN deneyin.`, o);
        return { kind: 'cmp', field, op, values: [v], start: t.start, end: v.end };
    };

    const startsTerm = () => {
        const t = peek();
        if (!t || t.kind === 'rparen' || t.kind === 'comma') return false;
        const k = kw(t);
        return !(k === 'OR' || k === 'AND' || k === 'ORDER');
    };

    const parseUnary = (): QueryNode => {
        const t = peek();
        if (!t) return fail('Koşul bekleniyor.');
        if (kw(t) === 'NOT') { p++; return { kind: 'not', item: parseUnary() }; }
        if (t.kind === 'lparen') {
            p++;
            const e = parseOr();
            if (peek()?.kind !== 'rparen') return fail('Parantez kapanmamış.', t);
            p++;
            return e;
        }
        return parseClause();
    };
    const parseAnd = (): QueryNode => {
        const items = [parseUnary()];
        while (!eof()) {
            if (kw(peek()) === 'AND') { p++; items.push(parseUnary()); continue; }
            if (startsTerm()) { items.push(parseUnary()); continue; }
            break;
        }
        return items.length === 1 ? items[0] : { kind: 'and', items };
    };
    function parseOr(): QueryNode {
        const items = [parseAnd()];
        while (kw(peek()) === 'OR') { p++; items.push(parseAnd()); }
        return items.length === 1 ? items[0] : { kind: 'or', items };
    }

    let where: QueryNode | null = null;
    if (!eof() && kw(peek()) !== 'ORDER') where = parseOr();
    const orderBy: SortSpec[] = [];
    if (!eof()) {
        if (kw(peek()) !== 'ORDER') fail(peek()!.kind === 'rparen' ? 'Fazladan ) var.' : `"${peek()!.text}" burada beklenmiyor.`, peek());
        p++;
        if (kw(peek()) === 'BY') p++;
        do {
            if (peek()?.kind === 'comma') p++;
            const ft = peek();
            if (!ft || ft.kind !== 'word') return fail('ORDER BY sonrasında alan adı bekleniyor.', ft);
            const field = fieldByName(ft.text);
            if (!field || field.key === 'text') return fail(`Sıralanamayan alan: ${ft.text}`, ft);
            p++;
            let desc = false;
            if (kw(peek()) === 'DESC') { desc = true; p++; } else if (kw(peek()) === 'ASC') p++;
            orderBy.push({ field, desc });
        } while (peek()?.kind === 'comma');
        if (!eof()) fail(`"${peek()!.text}" burada beklenmiyor.`, peek());
    }
    return { where, orderBy };
};

// ------------------------------------------------------------------ değerlendirme

/** Tarih değeri: ISO, gg.aa.yyyy, göreli (-7d, +2w, -1m, -1y) ya da işlev → gün numarası */
const resolveDate = (v: Value, ctx: TaskQueryContext): number => {
    const now = ctx.now || new Date();
    const today = dayNum(now);
    if (v.kind === 'fn') {
        const n = Number(v.args[0] || 0) || 0;
        const name = normQ(v.name);
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        switch (name) {
            case 'now': case 'today': case 'bugun': case 'bugün': return today + n;
            case 'startofweek': case 'haftabasi': case 'haftabaşı': { const wd = (d.getDay() + 6) % 7; return today - wd + n * 7; }
            case 'endofweek': case 'haftasonu': { const wd = (d.getDay() + 6) % 7; return today - wd + 6 + n * 7; }
            case 'startofmonth': case 'aybasi': case 'aybaşı': return dayNum(new Date(d.getFullYear(), d.getMonth() + n, 1));
            case 'endofmonth': case 'aysonu': return dayNum(new Date(d.getFullYear(), d.getMonth() + n + 1, 0));
            case 'startofyear': case 'yilbasi': case 'yılbaşı': return dayNum(new Date(d.getFullYear() + n, 0, 1));
            case 'endofyear': case 'yilsonu': case 'yılsonu': return dayNum(new Date(d.getFullYear() + n, 11, 31));
            default: throw new TaskQueryError(`Bilinmeyen tarih işlevi: ${v.name}()`, v.start, v.end);
        }
    }
    const s = v.text.trim();
    const rel = /^([+-]?\d+)\s*([dgwhmay])$/i.exec(s);
    if (rel) {
        const n = Number(rel[1]);
        const unit = rel[2].toLowerCase();
        if (unit === 'd' || unit === 'g') return today + n;
        if (unit === 'w' || unit === 'h') return today + n * 7;
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (unit === 'm' || unit === 'a') return dayNum(new Date(d.getFullYear(), d.getMonth() + n, d.getDate()));
        return dayNum(new Date(d.getFullYear() + n, d.getMonth(), d.getDate()));
    }
    const tr = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
    if (tr) return Math.floor(Date.UTC(+tr[3], +tr[2] - 1, +tr[1]) / DAY);
    const iso = isoDayNum(s);
    if (/^\d{4}-\d{2}-\d{2}/.test(s) && iso !== undefined) return iso;
    const word = normQ(s);
    if (word === 'bugun' || word === 'today') return today;
    if (word === 'dun' || word === 'dün' || word === 'yesterday') return today - 1;
    if (word === 'yarin' || word === 'yarın' || word === 'tomorrow') return today + 1;
    throw new TaskQueryError(`Tarih anlaşılmadı: ${s} (ör. 2026-12-31, 31.12.2026, -7d, today())`, v.start, v.end);
};

const litText = (v: Value, ctx: TaskQueryContext): string => {
    if (v.kind === 'lit') return v.text;
    const name = normQ(v.name);
    if (name === 'currentuser' || name === 'ben') return ctx.me || '';
    throw new TaskQueryError(`${v.name}() burada kullanılamaz.`, v.start, v.end);
};

const resolveNumber = (v: Value, label: string): number => {
    const n = v.kind === 'lit' ? Number(v.text.replace(',', '.')) : NaN;
    if (!Number.isFinite(n)) throw new TaskQueryError(`${label} için sayı bekleniyor.`, v.start, v.end);
    return n;
};

const resolveSprint = (v: Value, ctx: TaskQueryContext): number => {
    const s = litText(v, ctx);
    const n = normQ(s);
    if (n === 'havuz' || n === 'backlog') return 0;
    const m = /^(?:sprint\s*)?(\d+)$/i.exec(s.trim());
    if (m) return Number(m[1]);
    const named = Object.entries(ctx.sprintNames || {}).find(([, name]) => normQ(name || '') === n);
    if (named) return Number(named[0]);
    throw new TaskQueryError(`Sprint bulunamadı: ${s}`, v.start, v.end);
};

const resolvePriority = (v: Value, ctx: TaskQueryContext): Task['priority'] => {
    const s = litText(v, ctx);
    const p = lookup(PRIORITY_ALIASES, s);
    if (!p) throw new TaskQueryError(`Öncelik anlaşılmadı: ${s} (Engelleyici, Yüksek, Orta, Düşük)`, v.start, v.end);
    return p;
};

const resolveType = (v: Value, ctx: TaskQueryContext): IssueType => {
    const s = litText(v, ctx);
    const t = lookup(TYPE_ALIASES, s);
    if (!t) throw new TaskQueryError(`Tür anlaşılmadı: ${s} (Hata, Yeni özellik, İyileştirme, Görev, Diğer)`, v.start, v.end);
    return t;
};

const resolveBool = (v: Value, ctx: TaskQueryContext): boolean => {
    const s = normQ(litText(v, ctx));
    if (['true', 'evet', '1', 'yes', 'var'].includes(s)) return true;
    if (['false', 'hayir', 'hayır', '0', 'no', 'yok'].includes(s)) return false;
    throw new TaskQueryError('evet ya da hayır bekleniyor.', v.start, v.end);
};

/** * joker karakterli desen ya da düz alt dize */
const containsMatcher = (pattern: string): ((s: string) => boolean) => {
    const p = normQ(pattern);
    if (!p.includes('*')) return s => normQ(s).includes(p);
    const parts = p.split('*').filter(Boolean);
    return s => {
        const text = normQ(s);
        let from = 0;
        for (const part of parts) {
            const at = text.indexOf(part, from);
            if (at < 0) return false;
            from = at + part.length;
        }
        return true;
    };
};

type Pred = (t: Task) => boolean;

const compileCmp = (node: Extract<QueryNode, { kind: 'cmp' }>, ctx: TaskQueryContext): Pred => {
    const { field, op, values } = node;
    const neg = op === '!=' || op === '!~' || op === 'not in';
    const wrap = (pos: Pred): Pred => (neg ? t => !pos(t) : pos);

    switch (field.type) {
        case 'text':
        case 'list': {
            if (op === '~' || op === '!~') {
                const m = containsMatcher(litText(values[0], ctx));
                return wrap(t => textValues(field, t, ctx).some(m));
            }
            if (op === '=' || op === '!=' || op === 'in' || op === 'not in') {
                const wanted = new Set(values.map(v => normQ(litText(v, ctx))));
                // "atanan = me" oturumdaki kişi
                if (field.key === 'assignee' && wanted.has('me')) { wanted.delete('me'); if (ctx.me) wanted.add(normQ(ctx.me)); }
                return wrap(t => textValues(field, t, ctx).some(s => s && wanted.has(normQ(s))));
            }
            break;
        }
        case 'status': {
            if (op === '~' || op === '!~') {
                const m = containsMatcher(litText(values[0], ctx));
                return wrap(t => m(STATUS_QUERY_LABELS[t.status] || t.status) || (!!t.jiraStatus && m(t.jiraStatus)));
            }
            const appStatuses = new Set<TaskStatus>();
            const jira = new Set<string>();
            for (const v of values) {
                const s = litText(v, ctx);
                const app = lookup(STATUS_ALIASES, s) || (Object.values(TaskStatus) as string[]).filter(x => normQ(x) === normQ(s)) as TaskStatus[];
                if (app.length) app.forEach(a => appStatuses.add(a)); else jira.add(normQ(s));
            }
            return wrap(t => appStatuses.has(t.status) || (!!t.jiraStatus && jira.has(normQ(t.jiraStatus))));
        }
        case 'priority': {
            const ranks = values.map(v => PRIORITY_RANK[resolvePriority(v, ctx)]);
            const r = (t: Task) => PRIORITY_RANK[t.priority] || 0;
            if (op === '>') return t => r(t) > ranks[0];
            if (op === '>=') return t => r(t) >= ranks[0];
            if (op === '<') return t => r(t) < ranks[0];
            if (op === '<=') return t => r(t) <= ranks[0];
            const set = new Set(ranks);
            return wrap(t => set.has(r(t)));
        }
        case 'type': {
            const set = new Set(values.map(v => resolveType(v, ctx)));
            return wrap(t => !!t.issueType && set.has(t.issueType));
        }
        case 'bool': {
            const want = resolveBool(values[0], ctx);
            return wrap(t => booleanValue(field, t, ctx) === want);
        }
        case 'sprint': {
            const nums = values.map(v => resolveSprint(v, ctx));
            const s = (t: Task) => t.version || 0;
            if (op === '>') return t => s(t) > nums[0];
            if (op === '>=') return t => s(t) >= nums[0];
            if (op === '<') return t => s(t) < nums[0];
            if (op === '<=') return t => s(t) <= nums[0];
            // Eşitlik ve IN, sprintler arası devam eden görevi kapsadığı her sprintte bulur.
            const set = new Set(nums);
            return wrap(t => sprintsOf(t).some(sprint => set.has(sprint)));
        }
        case 'number': {
            const nums = values.map(v => resolveNumber(v, field.label));
            const get = (t: Task) => numberValue(field, t);
            const cmp = (f: (x: number) => boolean): Pred => t => { const x = get(t); return x !== undefined && f(x); };
            if (op === '>') return cmp(x => x > nums[0]);
            if (op === '>=') return cmp(x => x >= nums[0]);
            if (op === '<') return cmp(x => x < nums[0]);
            if (op === '<=') return cmp(x => x <= nums[0]);
            const set = new Set(nums);
            return wrap(cmp(x => set.has(x)));
        }
        case 'date': {
            const days = values.map(v => resolveDate(v, ctx));
            const get = (t: Task) => dateValue(field, t);
            const cmp = (f: (x: number) => boolean): Pred => t => { const x = get(t); return x !== undefined && f(x); };
            if (op === '>') return cmp(x => x > days[0]);
            if (op === '>=') return cmp(x => x >= days[0]);
            if (op === '<') return cmp(x => x < days[0]);
            if (op === '<=') return cmp(x => x <= days[0]);
            const set = new Set(days);
            return wrap(cmp(x => set.has(x)));
        }
    }
    throw new TaskQueryError(`${field.label} alanında ${op} kullanılamaz.`, node.start, node.end);
};

const isEmptyField = (f: FieldDef, t: Task, ctx: TaskQueryContext): boolean => {
    switch (f.type) {
        case 'text': case 'list': return !textValues(f, t, ctx).some(s => s.trim());
        case 'type': return !t.issueType;
        case 'sprint': return !t.version;
        case 'number': return numberValue(f, t) === undefined;
        case 'date': return dateValue(f, t) === undefined;
        case 'status': return false;
        case 'priority': return !t.priority;
        case 'bool': return false;
    }
};

const compileNode = (n: QueryNode, ctx: TaskQueryContext): Pred => {
    switch (n.kind) {
        case 'and': { const ps = n.items.map(x => compileNode(x, ctx)); return t => ps.every(p => p(t)); }
        case 'or': { const ps = n.items.map(x => compileNode(x, ctx)); return t => ps.some(p => p(t)); }
        case 'not': { const p = compileNode(n.item, ctx); return t => !p(t); }
        case 'text': { const m = containsMatcher(n.value); const f = FIELD_BY_NAME.get('text')!; return t => textValues(f, t, ctx).some(m); }
        case 'empty': return n.negate ? t => !isEmptyField(n.field, t, ctx) : t => isEmptyField(n.field, t, ctx);
        case 'cmp': return compileCmp(n, ctx);
    }
};

const sortValue = (f: FieldDef, t: Task, ctx: TaskQueryContext): string | number | undefined => {
    switch (f.type) {
        case 'priority': return PRIORITY_RANK[t.priority];
        case 'status': return [TaskStatus.Backlog, TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.Done].indexOf(t.status);
        case 'type': return t.issueType ? ISSUE_TYPE_LABELS[t.issueType] : undefined;
        case 'sprint': return t.version || 0;
        case 'number': return numberValue(f, t);
        case 'date': return dateValue(f, t);
        case 'bool': return booleanValue(f, t, ctx) ? 1 : 0;
        default: { const v = textValues(f, t, ctx).filter(Boolean)[0]; return v || undefined; }
    }
};

export interface CompiledQuery {
    /** Boş sorgu her görevi kabul eder */
    empty: boolean;
    test: (t: Task) => boolean;
    /** ORDER BY verildiyse sıralayıcı */
    compare: ((a: Task, b: Task) => number) | null;
    orderBy: SortSpec[];
}

export type QueryResult = { ok: true; query: CompiledQuery } | { ok: false; error: string; start: number; end: number };

/** Sorguyu derler; hata varsa Türkçe ileti ve konum döner (atmaz) */
export const compileTaskQuery = (src: string, ctx: TaskQueryContext = {}): QueryResult => {
    try {
        const parsed = parseTaskQuery(src);
        const test = parsed.where ? compileNode(parsed.where, ctx) : () => true;
        const compare = parsed.orderBy.length ? (a: Task, b: Task) => {
            for (const s of parsed.orderBy) {
                const x = sortValue(s.field, a, ctx), y = sortValue(s.field, b, ctx);
                if (x === y) continue;
                if (x === undefined) return 1; // boş değerler her zaman sonda
                if (y === undefined) return -1;
                const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'tr', { numeric: true });
                if (c) return s.desc ? -c : c;
            }
            return 0;
        } : null;
        return { ok: true, query: { empty: !parsed.where && !parsed.orderBy.length, test, compare, orderBy: parsed.orderBy } };
    } catch (e) {
        if (e instanceof TaskQueryError) return { ok: false, error: e.message, start: e.start, end: e.end };
        return { ok: false, error: e instanceof Error ? e.message : String(e), start: 0, end: src.length };
    }
};

/** Görevleri sorguyla süzer (ve ORDER BY varsa sıralar) */
export const runTaskQuery = (tasks: Task[], src: string, ctx: TaskQueryContext = {}): { ok: true; tasks: Task[] } | { ok: false; error: string; start: number; end: number } => {
    const r = compileTaskQuery(src, ctx);
    if (r.ok === false) return r;
    const out = tasks.filter(r.query.test);
    if (r.query.compare) out.sort(r.query.compare);
    return { ok: true, tasks: out };
};

/**
 * Metin bir sorgu mu, düz arama mı? İşleç, IN/IS, VE/VEYA ya da ORDER BY
 * içeriyorsa sorgudur; yalnız sözcüklerden oluşan metin düz aramadır.
 */
export const looksLikeQuery = (src: string): boolean => {
    let toks: Token[];
    try { toks = tokenize(src); } catch { return /["=<>~()]/.test(src); }
    return toks.some((t, i) => t.kind === 'op' || t.kind === 'lparen' || ['IN', 'IS', 'AND', 'OR', 'ORDER', 'NOT'].includes(kw(t) || '')
        || (t.kind === 'word' && ['effortOverrun', 'unestimated'].includes(fieldByName(t.text)?.key || ''))
        || (normQ(t.text) === 'tahmin' && ['aşilmiş', 'asilmis'].includes(normQ(toks[i + 1]?.text || ''))));
};

// ------------------------------------------------------------------ öneriler

export interface QuerySuggestion {
    /** Listede gösterilen */
    label: string;
    /** Yerine yazılan metin */
    insert: string;
    hint?: string;
    kind: 'field' | 'op' | 'value' | 'keyword';
}

export interface SuggestResult { from: number; to: number; items: QuerySuggestion[] }

const quote = (s: string) => (/^[\p{L}\p{N}_\-.:/+@]+$/u.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`);

const opsFor = (f: FieldDef): QuerySuggestion[] => {
    const base: [string, string][] = [['=', 'eşittir'], ['!=', 'eşit değil']];
    if (['text', 'list', 'status'].includes(f.type)) base.push(['~', 'içerir'], ['!~', 'içermez']);
    if (['priority', 'number', 'date', 'sprint'].includes(f.type)) base.push(['>', 'büyük / sonra'], ['>=', ''], ['<', 'küçük / önce'], ['<=', '']);
    if (f.type !== 'bool' && f.type !== 'number' && f.type !== 'date') base.push(['IN (', 'listeden biri'], ['NOT IN (', 'listede değil']);
    if (f.type !== 'bool' && f.type !== 'status') base.push(['IS EMPTY', 'boş'], ['IS NOT EMPTY', 'dolu']);
    return base.map(([o, h]) => ({ label: o.replace(' (', ''), insert: o.endsWith('(') ? o : `${o} `, hint: h || undefined, kind: 'op' as const }));
};

/** Alanın önerilecek değerleri (görevlerdeki gerçek değerlerden) */
export const valuesFor = (f: FieldDef, tasks: Task[], ctx: TaskQueryContext): { value: string; hint?: string }[] => {
    const uniqSorted = (xs: string[]) => [...new Set(xs.map(x => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    switch (f.type) {
        case 'status': {
            const jira = uniqSorted(tasks.map(t => t.jiraStatus || ''));
            return [...Object.values(STATUS_QUERY_LABELS), 'Açık'].map(v => ({ value: v })).concat(jira.map(v => ({ value: v, hint: 'Jira durumu' })));
        }
        case 'priority': return (['Blocker', 'High', 'Medium', 'Low'] as Task['priority'][]).map(p => ({ value: PRIORITY_QUERY_LABELS[p] }));
        case 'type': return (Object.keys(ISSUE_TYPE_LABELS) as IssueType[]).map(t => ({ value: ISSUE_TYPE_LABELS[t] }));
        case 'bool': return [{ value: 'evet' }, { value: 'hayır' }];
        case 'sprint': {
            const vs = [...new Set(tasks.map(t => t.version || 0))].sort((a, b) => a - b);
            return vs.map(v => ({ value: v === 0 ? 'Havuz' : String(v), hint: v && ctx.sprintNames?.[v] ? ctx.sprintNames[v] : undefined }));
        }
        case 'date': return [
            { value: 'today()', hint: 'bugün' }, { value: '-7d', hint: '7 gün önce' }, { value: '-14d', hint: '14 gün önce' }, { value: '+7d', hint: '7 gün sonra' },
            { value: 'startOfWeek()', hint: 'hafta başı' }, { value: 'endOfWeek()', hint: 'hafta sonu' }, { value: 'startOfMonth()', hint: 'ay başı' }, { value: 'endOfMonth()', hint: 'ay sonu' },
        ];
        case 'number': return [];
        default: {
            const vs = uniqSorted(tasks.flatMap(t => (f.key === 'text' || f.key === 'summary' || f.key === 'description' ? [] : textValues(f, t, ctx))));
            const out: { value: string; hint?: string }[] = vs.slice(0, 200).map(v => ({ value: v }));
            if (f.key === 'assignee' && ctx.me) out.unshift({ value: 'me', hint: ctx.me });
            return out;
        }
    }
};

/**
 * İmlecin bulunduğu yere göre öneriler: alan adı, işleç, değer ya da
 * bağlaç. Ayrıştırma hatası olsa da (yazım sürerken) en iyi tahmini verir.
 */
export const suggestTaskQuery = (src: string, caret: number, tasks: Task[], ctx: TaskQueryContext = {}): SuggestResult => {
    const head = src.slice(0, caret);
    let toks: Token[];
    try { toks = tokenize(head); } catch { return { from: caret, to: caret, items: [] }; }
    // İmleç bir sözcüğün içindeyse o sözcük tamamlanır
    const last = toks[toks.length - 1];
    const partial = last && last.end === caret && (last.kind === 'word' || (last.kind === 'string' && !head.endsWith('"'))) ? last : undefined;
    const before = partial ? toks.slice(0, -1) : toks;
    let to = caret;
    while (to < src.length && WORD_CHAR.test(src[to])) to++;
    const from = partial ? partial.start : caret;
    const prefix = partial ? normQ(partial.value) : '';
    const filter = (items: QuerySuggestion[]) => (prefix ? items.filter(i => normQ(i.label).startsWith(prefix) || normQ(i.insert).startsWith(prefix)) : items);

    const prev = before[before.length - 1];
    const prev2 = before[before.length - 2];
    const fieldSugs = (): QuerySuggestion[] => QUERY_FIELDS.map(f => ({ label: f.label, insert: `${f.label} `, hint: f.hint, kind: 'field' as const }));
    const joinSugs: QuerySuggestion[] = [
        { label: 'AND', insert: 'AND ', hint: 've', kind: 'keyword' },
        { label: 'OR', insert: 'OR ', hint: 'veya', kind: 'keyword' },
        { label: 'ORDER BY', insert: 'ORDER BY ', hint: 'sırala', kind: 'keyword' },
    ];

    // ORDER BY bölgesi
    const orderIdx = before.findIndex(t => kw(t) === 'ORDER');
    if (orderIdx >= 0) {
        if (!prev || kw(prev) === 'BY' || kw(prev) === 'ORDER' || prev.kind === 'comma') {
            return { from, to, items: filter(QUERY_FIELDS.filter(f => f.key !== 'text').map(f => ({ label: f.label, insert: `${f.label} `, hint: f.hint, kind: 'field' as const }))) };
        }
        return { from, to, items: filter([{ label: 'DESC', insert: 'DESC', hint: 'azalan', kind: 'keyword' }, { label: 'ASC', insert: 'ASC', hint: 'artan', kind: 'keyword' }, { label: ',', insert: ', ', hint: 'ikinci alan', kind: 'keyword' }]) };
    }

    // Değer konumu: alan + işleç ya da IN listesinin içi
    const valueField = (): FieldDef | undefined => {
        if (prev?.kind === 'op' && prev2?.kind === 'word') return fieldByName(prev2.text);
        // IN ( a, b, | — geriye doğru açık paranteze kadar git
        let depth = 0;
        for (let i = before.length - 1; i >= 0; i--) {
            const t = before[i];
            if (t.kind === 'rparen') { depth++; continue; }
            if (t.kind === 'lparen') {
                if (depth > 0) { depth--; continue; }
                const k = kw(before[i - 1]);
                if (k === 'IN') {
                    const fTok = kw(before[i - 2]) === 'NOT' ? before[i - 3] : before[i - 2];
                    return fTok ? fieldByName(fTok.text) : undefined;
                }
                return undefined;
            }
        }
        return undefined;
    };
    const vf = valueField();
    if (vf && (prev?.kind === 'op' || prev?.kind === 'lparen' || prev?.kind === 'comma')) {
        const inList = prev?.kind !== 'op';
        const items = valuesFor(vf, tasks, ctx).map(v => ({ label: v.value, insert: quote(v.value) + (inList ? '' : ' '), hint: v.hint, kind: 'value' as const }));
        return { from, to, items: filter(items).slice(0, 60) };
    }

    // İşleç konumu: alan adından sonra
    if (prev?.kind === 'word' && !kw(prev) && fieldByName(prev.text) && (!prev2 || prev2.kind === 'lparen' || ['AND', 'OR', 'NOT'].includes(kw(prev2) || ''))) {
        const f = fieldByName(prev.text)!;
        if (!partial) return { from, to, items: opsFor(f) };
    }
    if (kw(prev) === 'IS') return { from, to, items: filter([{ label: 'EMPTY', insert: 'EMPTY ', kind: 'keyword' }, { label: 'NOT EMPTY', insert: 'NOT EMPTY ', kind: 'keyword' }]) };

    // Koşul başı: alan adları
    if (!prev || prev.kind === 'lparen' || ['AND', 'OR', 'NOT'].includes(kw(prev) || '')) {
        const items = fieldSugs();
        if (!prev || kw(prev) !== 'NOT') items.push({ label: 'NOT', insert: 'NOT ', hint: 'değil', kind: 'keyword' });
        return { from, to, items: filter(items) };
    }

    // Tamamlanmış koşuldan sonra: bağlaçlar
    if (prev.kind === 'rparen' || prev.kind === 'string' || prev.kind === 'word') {
        return { from, to, items: filter(joinSugs) };
    }
    return { from, to, items: [] };
};

/** Yardım ekranındaki örnekler */
export const QUERY_EXAMPLES: { query: string; text: string }[] = [
    { query: 'kalan > 4 saat AND tahmin aşılmış', text: 'Dört saatten fazla işi kalan ve tahmini aşan kayıtları bul.' },
    { query: 'tahminsiz AND durum = Açık', text: 'Planlama öncesi açık ve tahminsiz işleri ayır.' },
    { query: 'durum = Süreçte AND öncelik >= Yüksek', text: 'Süreçteki yüksek ve engelleyici işler' },
    { query: 'atanan IS EMPTY AND durum = Açık', text: 'Atanmamış açık kayıtlar' },
    { query: 'sprint = Havuz ORDER BY öncelik DESC', text: 'Sürüm planı için havuzdaki işleri önceliğe göre sırala' },
    { query: 'gecikmiş = evet', text: 'Termini geçmiş açık işler' },
    { query: 'tür = Hata AND oluşturma >= -14d', text: 'Son iki haftada açılan hatalar' },
    { query: 'etiket IN (mobil, web) OR özet ~ "parola"', text: 'Etiketlerden biri ya da başlıkta “parola”' },
    { query: 'anahtar IS EMPTY AND tahmin IS NOT EMPTY', text: 'Jira’da olmayan, tahmini girilmiş kayıtlar' },
    { query: 'termin >= startOfMonth() AND termin <= endOfMonth() AND durum != Tamamlandı', text: 'Bu ay bitmesi gereken açık işler' },
];
