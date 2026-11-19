import * as XLSX from 'xlsx';
import {
    CustomerRequest,
    Person,
    Project,
    ProjectAiProfile,
    Resource,
    Task,
    TaskStatus,
    WorkPackage,
    WorkspaceData,
} from '../types';
import { withStatus } from './planning/lifecycle';
import { foldTr } from './rag/text';
import { createProject } from './workspace';

/**
 * "PoC Bulgu Takip" Excel'i (GİB PoC çalışması) → PlanAsistan projesi.
 *
 * Excel'deki kurgu ile uygulamadaki karşılığı:
 *  - Genel Liste (takipteki her bulgu)      → görev (Test No kimliğiyle; yeniden aktarımda güncellenir)
 *  - Epic Listesi / CR Listesi (Jira kırılımı) → iş paketi (epic) + görev notunda CR / iş kodu
 *  - EMS (kişi havuzu, kaynak %)            → proje kaynakları
 *  - EMS Çalışması (öncül işler)            → görev öncülü
 *  - GİB rapor ve toplantı çıktıları        → müşteri istekleri (PY'ye özel alan)
 *  - MS, önem, PoC sonucu, güncel sonuç      → etiketler (filtre ve pano)
 *  - Test Kalemleri                         → PoC skoru ve zorunlu açık (önizleme ve günlük)
 *
 * Excel'deki formül sütunları (Sorumlu, Epic, İş Kodu, İlerleme …) dosyada
 * hesaplanmış değer olmadan da gelebilir; bu yüzden hepsi burada ham
 * girdilerden yeniden türetilir. Sütunlar başlık adıyla bulunur (yeri
 * değişse de okunur).
 */

export type SheetMatrix = unknown[][];
/** Sayfa adı → satır × sütun ham değerler (sheet_to_json header:1 biçimi) */
export type WorkbookMatrices = Record<string, SheetMatrix>;

export const GIB_TEAMS = ['EMS', 'İstemci', 'Test', 'Dizin'] as const;
export type GibTeam = typeof GIB_TEAMS[number];

/** Excel'deki "Durum" listesi (Rehber) → pano durumu */
const STATUS_MAP: Record<string, TaskStatus> = {
    'acik': TaskStatus.ToDo,
    'analizde': TaskStatus.InProgress,
    'yanit bekleniyor': TaskStatus.InProgress,
    'gelistirmede': TaskStatus.InProgress,
    'testte': TaskStatus.InProgress,
    'kapandi': TaskStatus.Done,
    'iptal / kapsam disi': TaskStatus.Done,
};

/** Test Prosedürü sonuç sınıfları: PoC skoruna giren puanlar */
const RESULT_SCORE: Record<string, number> = {
    'karsilandi': 1,
    'kismen karsilandi': 0.5,
    'karsilanmadi': 0,
};
const RESULT_CLASSES = new Set(['karsilandi', 'kismen karsilandi', 'karsilanmadi', 'test edilemedi', 'ureticiye sorulacak', 'degerlendirme disi']);

export interface GibImportSummary {
    findings: number;
    epics: number;
    crs: number;
    rapor51: number;
    mandatory: number;
    byMs: Record<string, number>;
    byStatus: Record<TaskStatus, number>;
    effortByTeam: Record<GibTeam, number>;
    totalEffortDays: number;
    withoutEffort: number;
    assigned: number;
    predecessors: number;
    resources: number;
    requests: number;
    /** Test Kalemleri'nden: ağırlıklı PoC skoru (0-1) ve zorunlu açık sayısı */
    pocScore?: number;
    mandatoryOpen?: number;
    testItems?: number;
}

export interface GibImportPackage {
    tasks: Task[];
    /** Excel'de "Durum" yazılı görevler (yeniden aktarımda yalnız bunların durumu güncellenir) */
    explicitStatusIds: string[];
    workPackages: WorkPackage[];
    resources: Resource[];
    customerRequests: CustomerRequest[];
    aiProfile: ProjectAiProfile;
    jiraProjectKey?: string;
    projectStartDate?: string;
    tagColors: Record<string, string>;
    summary: GibImportSummary;
    warnings: string[];
}

// ---------------------------------------------------------------------------
// Hücre yardımcıları
// ---------------------------------------------------------------------------

const text = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return toIsoDate(v) || '';
    return String(v).replace(/ /g, ' ').trim();
};

const fold = (v: unknown): string => foldTr(text(v)).replace(/\s+/g, ' ');

/** "0,5" / "1.5" / 2 → sayı; boş ya da sayı değilse 0 */
export const num = (v: unknown): number => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const s = text(v).replace(',', '.');
    if (!s) return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
};

const pad = (n: number): string => String(n).padStart(2, '0');

/** Excel tarihi (seri sayı, Date ya da "gg.aa.yyyy" / "yyyy-aa-gg") → "yyyy-aa-gg" */
export const toIsoDate = (v: unknown): string | undefined => {
    if (v === null || v === undefined || v === '') return undefined;
    if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) return undefined;
        return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    }
    if (typeof v === 'number') {
        if (!Number.isFinite(v) || v < 61) return undefined;
        const d = new Date(Math.round((v - 25569) * 86400000));
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    const s = text(v);
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
    m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    return undefined;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** İlk harfi büyük (Türkçe): "müşteri ile …" → "Müşteri ile …" */
const capitalize = (s: string): string => (s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s);

const slug = (s: string): string => foldTr(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

const findSheet = (wb: WorkbookMatrices, ...names: string[]): SheetMatrix | undefined => {
    const keys = Object.keys(wb);
    for (const name of names) {
        const target = foldTr(name);
        const hit = keys.find(k => foldTr(k.trim()) === target) || keys.find(k => foldTr(k.trim()).startsWith(target));
        if (hit) return wb[hit];
    }
    return undefined;
};

/** Başlık satırını bulur: verilen başlıkların hepsini içeren ilk satır (ilk 15 satırda) */
const findHeaderRow = (rows: SheetMatrix, required: string[]): number => {
    const req = required.map(foldTr);
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const cells = (rows[i] || []).map(fold);
        if (req.every(r => cells.some(c => c.startsWith(r)))) return i;
    }
    return -1;
};

type ColumnIndex = (...candidates: string[]) => number;

/** Başlık adıyla sütun: önce tam eşleşme, sonra "ile başlayan" */
const columnIndex = (header: unknown[]): ColumnIndex => {
    const cells = header.map(fold);
    return (...candidates) => {
        for (const c of candidates.map(foldTr)) {
            const exact = cells.indexOf(c);
            if (exact >= 0) return exact;
        }
        for (const c of candidates.map(foldTr)) {
            const prefix = cells.findIndex(h => h.startsWith(c));
            if (prefix >= 0) return prefix;
        }
        return -1;
    };
};

const at = (row: unknown[] | undefined, i: number): unknown => (row && i >= 0 ? row[i] : undefined);

// ---------------------------------------------------------------------------
// Sayfa okuyucular
// ---------------------------------------------------------------------------

interface CrRow {
    code: string;
    type: string; // Epic | Customer Requirement | Task | Sub-task
    epic: string; // EP-01
    cr: string; // CR-05
    requirement: string;
    jira: string;
    effort: Record<GibTeam, number>;
}

const readCrList = (rows: SheetMatrix | undefined): { byCode: Map<string, CrRow>; byTest: Map<string, CrRow>; crCount: number } => {
    const byCode = new Map<string, CrRow>();
    const byTest = new Map<string, CrRow>();
    let crCount = 0;
    if (!rows) return { byCode, byTest, crCount };
    const h = findHeaderRow(rows, ['Test No', 'Jira Tipi']);
    if (h < 0) return { byCode, byTest, crCount };
    const col = columnIndex(rows[h]);
    const cCode = col('Epic / CR / Task / Sub-task Kodu', 'Kod');
    const cTest = col('Test No');
    const cReq = col('Gereksinim / Başlık', 'Gereksinim');
    const cJira = col('Jira Anahtarı');
    const cType = col('Jira Tipi');
    const cLinkedCr = col('Bağlı CR');
    const cTeam = GIB_TEAMS.map(t => col(`${t} (gün)`));
    let epicNo = 0;
    for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i];
        const code = text(at(r, cCode));
        const type = text(at(r, cType));
        if (!code && !type) continue;
        if (foldTr(type) === 'epic') epicNo++;
        if (!code) continue;
        const isCr = foldTr(type) === 'customer requirement' || /^CR-\d+$/i.test(code);
        if (isCr) crCount++;
        const crMatch = code.match(/^CR-\d+/i);
        const row: CrRow = {
            code,
            type,
            epic: epicNo > 0 ? `EP-${pad(epicNo)}` : '',
            cr: text(at(r, cLinkedCr)) || (crMatch ? crMatch[0].toUpperCase() : ''),
            requirement: text(at(r, cReq)),
            jira: text(at(r, cJira)),
            effort: Object.fromEntries(GIB_TEAMS.map((t, k) => [t, num(at(r, cTeam[k]))])) as Record<GibTeam, number>,
        };
        byCode.set(code, row);
        const test = text(at(r, cTest));
        if (test && !byTest.has(test)) byTest.set(test, row);
    }
    return { byCode, byTest, crCount };
};

interface EpicRow { no: string; name: string; shortName: string; goal: string; jira: string }

const readEpics = (rows: SheetMatrix | undefined): EpicRow[] => {
    if (!rows) return [];
    const h = findHeaderRow(rows, ['Epic No']);
    if (h < 0) return [];
    const col = columnIndex(rows[h]);
    const cNo = col('Epic No');
    const cName = col('Epic Adı');
    const cShort = col('Epic Name');
    const cGoal = col('Hedef');
    const cJira = col('Jira Anahtarı');
    const out: EpicRow[] = [];
    for (let i = h + 1; i < rows.length; i++) {
        const no = text(at(rows[i], cNo));
        if (!/^EP-\d+$/i.test(no)) continue;
        out.push({
            no: no.toUpperCase(),
            name: text(at(rows[i], cName)),
            shortName: text(at(rows[i], cShort)),
            goal: text(at(rows[i], cGoal)),
            jira: text(at(rows[i], cJira)),
        });
    }
    return out;
};

/** EMS sayfasındaki "Kişi havuzu" bloğu: ad + kaynak % (1 = tam zamanlı) */
const readTeamPool = (rows: SheetMatrix | undefined): { name: string; share: number }[] => {
    if (!rows) return [];
    for (let i = 0; i < rows.length; i++) {
        const cells = (rows[i] || []).map(fold);
        const nameCol = cells.indexOf('kisi havuzu');
        if (nameCol < 0) continue;
        const shareCol = cells.findIndex(c => c.startsWith('kaynak %'));
        const out: { name: string; share: number }[] = [];
        for (let j = i + 1; j < Math.min(rows.length, i + 40); j++) {
            const name = text(at(rows[j], nameCol));
            if (foldTr(name) === 'toplam') break;
            if (!name) continue;
            const raw = shareCol >= 0 ? num(at(rows[j], shareCol)) : 1;
            out.push({ name, share: raw > 1 ? raw / 100 : raw || 1 });
        }
        return out;
    }
    return [];
};

/** EMS Çalışması: "A, B'nin öncülüdür" çiftleri (Test No → Test No) */
const readPredecessors = (rows: SheetMatrix | undefined): [string, string][] => {
    if (!rows) return [];
    const h = findHeaderRow(rows, ['Test No', 'Neyin öncülü']);
    if (h < 0) return [];
    const col = columnIndex(rows[h]);
    const cTest = col('Test No');
    const cOf = col('Neyin öncülü');
    const out: [string, string][] = [];
    for (let i = h + 1; i < rows.length; i++) {
        const from = text(at(rows[i], cTest));
        const targets = text(at(rows[i], cOf)).split(/[,;]/).map(s => s.trim()).filter(Boolean);
        targets.forEach(to => { if (from && to) out.push([from, to]); });
    }
    return out;
};

const readStartDate = (rows: SheetMatrix | undefined): string | undefined => {
    if (!rows) return undefined;
    for (const r of rows) {
        const cells = (r || []);
        const i = cells.findIndex(c => fold(c) === 'baslangic tarihi');
        if (i < 0) continue;
        for (let k = i + 1; k < cells.length; k++) {
            const iso = toIsoDate(cells[k]);
            if (iso) return iso;
        }
    }
    return undefined;
};

/** Giriş sayfasındaki tanımlar (MS0, MS1, öncelik 10 / 9 / 7,5) → proje kartı sözlüğü */
const readGlossary = (rows: SheetMatrix | undefined): { term: string; explanation: string }[] => {
    if (!rows) return [];
    const out: { term: string; explanation: string }[] = [];
    let section = '';
    for (const r of rows) {
        const cells = (r || []).map(text).filter(Boolean);
        if (!cells.length) continue;
        if (/^\d+\.\s/.test(cells[0])) { section = fold(cells[0]); continue; }
        if (cells.length < 2) continue;
        const [term, explanation] = cells;
        if (/^MS\d+$/i.test(term)) out.push({ term: term.toUpperCase(), explanation });
        else if (section.includes('oncelik') && /^\d+([.,]\d+)?$/.test(term)) out.push({ term: `Öncelik ${term}`, explanation });
    }
    return out;
};

/** Toplantı çıktıları sayfasında Excel'in tarihe çevirdiği madde numaraları ("3.4" → 3 Nisan) geri çevrilir */
const itemRef = (v: unknown): string => {
    let d: Date | undefined;
    if (v instanceof Date) d = v;
    else if (typeof v === 'number' && v > 1000) {
        const u = new Date(Math.round((v - 25569) * 86400000));
        d = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
    }
    if (!d) return text(v);
    // "3.17" gibi girişler ay.yıl olarak (1 Mart 2017) okunur
    if (d.getDate() === 1 && d.getFullYear() < 2020) return `${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`;
    return `${d.getDate()}.${d.getMonth() + 1}`;
};

const readMeetingRequests = (rows: SheetMatrix | undefined, customer: string, now: string): CustomerRequest[] => {
    if (!rows) return [];
    const h = findHeaderRow(rows, ['Hata Başlığı']);
    if (h < 0) return [];
    const col = columnIndex(rows[h]);
    const cTitle = col('Hata Başlığı');
    const cState = col('Durum');
    const cCheck = col('Doğrulama');
    const cPrio = col('Öncelik');
    const cEffort = col('İş Gücü');
    const cNote = col('Açıklama', 'Açıklamna', 'Aç');
    const cRef = 0;
    const cCustomer = cTitle > 1 ? cTitle - 1 : -1;
    const out: CustomerRequest[] = [];
    const used = new Set<string>();
    let section = '';
    let last: CustomerRequest | undefined;
    for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const title = text(at(r, cTitle));
        const note = text(at(r, cNote));
        const others = [cState, cCheck, cPrio, cEffort].map(c => text(at(r, c))).filter(Boolean);
        if (!title) {
            if (note && last) last.description += `\n${note}`;
            continue;
        }
        const ref = cRef !== cTitle ? itemRef(at(r, cRef)) : '';
        const cust = text(at(r, cCustomer));
        if (!ref && !cust && !others.length && !note) { section = title; continue; } // ara başlık
        const lines = [
            ref ? `Madde: ${ref}` : '',
            section ? `Bölüm: ${section}` : '',
            text(at(r, cState)) ? `Durum: ${text(at(r, cState))}` : '',
            text(at(r, cCheck)) ? `Doğrulama: ${text(at(r, cCheck))}` : '',
            text(at(r, cPrio)) ? `Öncelik: ${text(at(r, cPrio))}` : '',
            text(at(r, cEffort)) ? `İş gücü: ${text(at(r, cEffort))}` : '',
            note ? `Açıklama: ${note}` : '',
        ].filter(Boolean);
        let id = `gibreq-${slug(title) || i}`;
        while (used.has(id)) id = `${id}-${i}`;
        used.add(id);
        last = {
            id,
            title,
            description: lines.join('\n'),
            customerName: cust || customer,
            createdAt: now,
            status: 'New',
        };
        out.push(last);
    }
    return out;
};

/** Test Kalemleri: ağırlıklı PoC skoru (güncel sonuç varsa o) ve zorunlu açık */
const computePocScore = (
    rows: SheetMatrix | undefined,
    currentResult: Map<string, string>,
): { score: number; mandatoryOpen: number; items: number } | undefined => {
    if (!rows) return undefined;
    const h = findHeaderRow(rows, ['Test No', 'Ağırlık', 'PoC Sonucu']);
    if (h < 0) return undefined;
    const col = columnIndex(rows[h]);
    const cTest = col('Test No');
    const cImp = col('Önem');
    const cWeight = col('Ağırlık');
    const cPoc = col('PoC Sonucu');
    let weighted = 0;
    let evaluated = 0;
    let mandatoryOpen = 0;
    let items = 0;
    for (let i = h + 1; i < rows.length; i++) {
        const test = text(at(rows[i], cTest));
        if (!test) continue;
        items++;
        const current = currentResult.get(test);
        const result = current && RESULT_CLASSES.has(foldTr(current)) ? foldTr(current) : fold(at(rows[i], cPoc));
        const score = RESULT_SCORE[result];
        const w = num(at(rows[i], cWeight));
        if (score !== undefined) { weighted += w * score; evaluated += w; }
        if (fold(at(rows[i], cImp)) === 'zorunlu' && (result === 'karsilanmadi' || result === 'kismen karsilandi')) mandatoryOpen++;
    }
    return { score: evaluated > 0 ? weighted / evaluated : 0, mandatoryOpen, items };
};

// ---------------------------------------------------------------------------
// Bulgu → görev
// ---------------------------------------------------------------------------

const priorityOf = (score: number, tier: number): Task['priority'] => {
    if (score >= 10) return 'Blocker';
    if (score >= 9) return 'High';
    if (score > 0) return score >= 7.5 ? 'Medium' : 'Low';
    // Öncelik verilmemiş: müşterinin önem kademesinden
    if (tier === 1) return 'High';
    if (tier >= 2 && tier <= 4) return 'Medium';
    return 'Low';
};

export const MS_TAG_COLORS: Record<string, string> = {
    MS0: '#dc2626',
    MS1: '#ea580c',
    MS2: '#ca8a04',
    MS3: '#2563eb',
    MS4: '#64748b',
    MS5: '#64748b',
    'Rapor 5.1': '#b91c1c',
    'Zorunlu': '#1e3a8a',
};

export const isGibWorkbook = (sheetNames: string[]): boolean => sheetNames.some(n => foldTr(n.trim()) === 'genel liste');

/**
 * Çalışma kitabını içe aktarma paketine çevirir (saf: aynı girdi → aynı çıktı;
 * `now` yalnız içe aktarma damgası için).
 */
export const parseGibWorkbook = (wb: WorkbookMatrices, opts: { now?: string; customer?: string } = {}): GibImportPackage => {
    const now = opts.now || new Date().toISOString();
    const customer = opts.customer || 'Gelir İdaresi Başkanlığı (GİB)';
    const warnings: string[] = [];

    const main = findSheet(wb, 'Genel Liste');
    if (!main) throw new Error('"Genel Liste" sayfası bulunamadı — bu bir PoC Bulgu Takip dosyası mı?');
    const h = findHeaderRow(main, ['Test No', 'Başlık']);
    if (h < 0) throw new Error('"Genel Liste" sayfasında "Test No" ve "Başlık" başlıkları bulunamadı.');
    const col = columnIndex(main[h]);
    const C = {
        tier: col('Önem Kademesi'),
        test: col('Test No'),
        area: col('Alan'),
        importance: col('Önem'),
        title: col('Başlık'),
        poc: col('PoC Sonucu'),
        reportRef: col('Rapor Referansı'),
        finding: col('Rapordaki Tespit'),
        defect: col('Hata Kaydı'),
        expected: col('Beklenen Sonuç'),
        testNote: col('Test Notu'),
        assignee: col('Atanan'),
        jira: col('Jira / CR No', 'Jira'),
        status: col('Durum'),
        start: col('Başlangıç'),
        due: col('Hedef Tarih'),
        closed: col('Kapanış'),
        current: col('Güncel Sonuç'),
        questions: col('Sorular'),
        ms: col('MS'),
        msNote: col('MS Notları'),
        effortSource: col('Efor Kaynağı'),
        score: col('Öncelik'),
        action: col('Aksiyon / Çözüm Planı', 'Aksiyon'),
        team: GIB_TEAMS.map(t => col(`${t} (gün)`)),
    };
    if (C.test < 0 || C.title < 0) throw new Error('"Genel Liste" sütunları tanınmadı.');

    const crList = readCrList(findSheet(wb, 'CR Listesi'));
    const epics = readEpics(findSheet(wb, 'Epic Listesi'));
    const pool = readTeamPool(findSheet(wb, 'EMS'));
    const predecessorPairs = readPredecessors(findSheet(wb, 'EMS Çalışması'));

    const dataRows = main.slice(h + 1).filter(r => text(at(r, C.test)));
    // CR düzeyinde verilen efor, ona bağlanan maddelere eşit bölünür (Excel'deki kural)
    const sourceCount = new Map<string, number>();
    dataRows.forEach(r => {
        const src = text(at(r, C.effortSource));
        if (src) sourceCount.set(src, (sourceCount.get(src) || 0) + 1);
    });

    const tasks: Task[] = [];
    const explicitStatusIds: string[] = [];
    const currentResult = new Map<string, string>();
    const usedIds = new Set<string>();
    const summary: GibImportSummary = {
        findings: 0, epics: epics.length, crs: crList.crCount, rapor51: 0, mandatory: 0,
        byMs: {}, byStatus: { Backlog: 0, ToDo: 0, InProgress: 0, Done: 0 } as Record<TaskStatus, number>,
        effortByTeam: { 'EMS': 0, 'İstemci': 0, 'Test': 0, 'Dizin': 0 }, totalEffortDays: 0, withoutEffort: 0,
        assigned: 0, predecessors: 0, resources: 0, requests: 0,
    };

    for (const r of dataRows) {
        const testNo = text(at(r, C.test));
        const title = text(at(r, C.title));
        const tierText = text(at(r, C.tier));
        const tier = Number((tierText.match(/^\d+/) || ['0'])[0]);
        const importance = text(at(r, C.importance));
        const poc = text(at(r, C.poc));
        const statusText = text(at(r, C.status));
        const msRaw = at(r, C.ms);
        const ms = text(msRaw) !== '' && Number.isFinite(num(msRaw)) ? `MS${num(msRaw)}` : '';
        const current = capitalize(text(at(r, C.current)));
        if (current) currentResult.set(testNo, current);

        // Efor: kendi sütunları ya da bağlı CR / Task kaydının payı
        const src = text(at(r, C.effortSource));
        const srcRow = src ? crList.byCode.get(src) : undefined;
        const effort = Object.fromEntries(GIB_TEAMS.map((t, k) => {
            const v = srcRow ? srcRow.effort[t] / (sourceCount.get(src) || 1) : num(at(r, C.team[k]));
            return [t, round2(v)];
        })) as Record<GibTeam, number>;
        if (src && !srcRow) warnings.push(`${testNo}: efor kaynağı "${src}" CR Listesi'nde bulunamadı; maddenin kendi eforu alındı.`);
        const teams = GIB_TEAMS.filter(t => effort[t] > 0);
        const total = round2(GIB_TEAMS.reduce((s, t) => s + effort[t], 0));
        const primary = teams.length ? teams.reduce((a, b) => (effort[b] > effort[a] ? b : a)) : '';

        const assignees = text(at(r, C.assignee)).split(/[,;/]/).map(s => s.trim()).filter(Boolean);
        const crRow = crList.byTest.get(testNo);
        const epicNo = crRow?.epic || '';

        const mapped = STATUS_MAP[foldTr(statusText)];
        const cancelled = foldTr(statusText) === 'iptal / kapsam disi';
        let status = mapped ?? TaskStatus.Backlog;
        if ((!statusText || mapped === TaskStatus.ToDo) && ms) status = ms === 'MS0' ? TaskStatus.ToDo : TaskStatus.Backlog;
        if (statusText && mapped === undefined) warnings.push(`${testNo}: "${statusText}" durumu tanınmadı; Bekleyen sayıldı.`);
        if (statusText) explicitStatusIds.push(`gib-${testNo}`);

        const labels = [
            ms,
            tier === 1 ? 'Rapor 5.1' : '',
            importance,
            poc ? `PoC: ${poc}` : '',
            current,
            cancelled ? 'İptal / Kapsam dışı' : '',
            ...(teams.length > 1 ? teams : []),
        ].filter(Boolean);

        const effortLine = teams.length
            ? `${teams.map(t => `${t} ${String(effort[t]).replace('.', ',')}`).join(' · ')}${srcRow ? ` (kaynak: ${src})` : ''}`
            : 'girilmedi';
        const codeLine = crRow ? [crRow.code, crRow.cr && crRow.cr !== crRow.code ? crRow.cr : '', epicNo].filter(Boolean).join(' · ') : '';
        const notes = [
            text(at(r, C.area)) ? `Alan: ${text(at(r, C.area))}` : '',
            tierText ? `Önem kademesi: ${tierText}` : '',
            [poc ? `PoC sonucu: ${poc}` : '', text(at(r, C.reportRef)), text(at(r, C.defect)) ? `Hata kaydı: ${text(at(r, C.defect))}` : ''].filter(Boolean).join(' · '),
            text(at(r, C.finding)) ? `Rapordaki tespit: ${text(at(r, C.finding))}` : '',
            text(at(r, C.expected)) ? `Beklenen sonuç: ${text(at(r, C.expected))}` : '',
            text(at(r, C.testNote)) ? `Test notu: ${text(at(r, C.testNote))}` : '',
            current ? `Güncel sonuç: ${current}` : '',
            text(at(r, C.questions)) ? `Müşteriye soru: ${text(at(r, C.questions))}` : '',
            text(at(r, C.action)) ? `Aksiyon / çözüm planı: ${text(at(r, C.action))}` : '',
            text(at(r, C.msNote)) ? `${ms || 'MS'} notu: ${text(at(r, C.msNote))}` : '',
            num(at(r, C.score)) ? `Öncelik puanı: ${String(num(at(r, C.score))).replace('.', ',')}` : '',
            `Efor (gün): ${effortLine}`,
            assignees.length > 1 ? `Atananlar: ${assignees.join(', ')}` : '',
            statusText ? `Excel durumu: ${statusText}` : '',
            codeLine ? `İş kodu: ${codeLine}` : '',
        ].filter(Boolean).join('\n');

        let id = `gib-${testNo}`;
        if (usedIds.has(id)) { id = `${id}-${tasks.length + 1}`; warnings.push(`${testNo} iki kez geçiyor; ikinci satır ayrı görev olarak alındı.`); }
        usedIds.add(id);

        const pocFold = foldTr(poc);
        const task: Task = {
            id,
            name: `${testNo} · ${title}`,
            availability: total > 0,
            priority: priorityOf(num(at(r, C.score)), tier),
            version: 0,
            predecessor: null,
            unit: primary || 'Genel',
            resourceName: assignees[0] || 'Atanmamış',
            time: { best: total, avg: total, worst: total },
            jiraId: text(at(r, C.jira)) || crRow?.jira || '',
            notes,
            status,
            labels,
            includeInSprints: !cancelled,
            issueType: pocFold === 'karsilanmadi' || pocFold === 'kismen karsilandi' ? 'bug' : 'task',
            importedAt: now,
            estimateSource: 'import',
            ...(epicNo ? { workPackageId: `gib-${epicNo}` } : {}),
            ...(toIsoDate(at(r, C.due)) ? { dueDate: toIsoDate(at(r, C.due)) } : {}),
            ...(toIsoDate(at(r, C.start)) && status !== TaskStatus.Backlog ? { startedAt: `${toIsoDate(at(r, C.start))}T09:00:00.000Z` } : {}),
            ...(toIsoDate(at(r, C.closed)) && status === TaskStatus.Done ? { resolvedAt: `${toIsoDate(at(r, C.closed))}T17:00:00.000Z` } : {}),
        };
        tasks.push(task);

        summary.findings++;
        if (tier === 1) summary.rapor51++;
        if (foldTr(importance) === 'zorunlu') summary.mandatory++;
        summary.byMs[ms || 'MS yok'] = (summary.byMs[ms || 'MS yok'] || 0) + 1;
        summary.byStatus[status]++;
        GIB_TEAMS.forEach(t => { summary.effortByTeam[t] = round2(summary.effortByTeam[t] + effort[t]); });
        summary.totalEffortDays = round2(summary.totalEffortDays + total);
        if (total <= 0) summary.withoutEffort++;
        if (assignees.length) summary.assigned++;
    }

    // Öncüller (görev başına tek öncül: ilk tanım geçerli)
    const byTestId = new Map(tasks.map(t => [t.id, t]));
    predecessorPairs.forEach(([from, to]) => {
        const target = byTestId.get(`gib-${to}`);
        const source = byTestId.get(`gib-${from}`);
        if (!target || !source || target.id === source.id) return;
        if (target.predecessor) {
            target.notes += `\nEk öncül: ${from}`;
            return;
        }
        target.predecessor = source.id;
        summary.predecessors++;
    });

    // Kaynaklar: EMS kişi havuzu + havuzda olmayan atananlar
    const resources: Resource[] = [];
    const seen = new Set<string>();
    const addResource = (name: string, share: number, unit: string) => {
        const key = foldTr(name);
        if (!key || seen.has(key) || foldTr(name) === 'atanmamis') return;
        seen.add(key);
        resources.push({ id: `gibres-${slug(name)}`, name, participation: Math.round(share * 100), unit, title: '' });
    };
    pool.forEach(p => addResource(p.name, p.share, 'EMS'));
    tasks.forEach(t => addResource(t.resourceName, 1, t.unit));
    summary.resources = resources.length;

    const usedEpics = new Set(tasks.map(t => t.workPackageId).filter(Boolean));
    const workPackages: WorkPackage[] = epics.map(e => ({
        id: `gib-${e.no}`,
        name: `${e.no} · ${(e.name || e.shortName).replace(/^GİB\s*[–-]\s*/i, '')}`,
        description: [e.goal, e.jira ? `Jira: ${e.jira}` : ''].filter(Boolean).join(' · '),
    }));
    usedEpics.forEach(id => {
        if (id && !workPackages.some(w => w.id === id)) workPackages.push({ id, name: id.replace(/^gib-/, ''), description: '' });
    });

    const customerRequests = readMeetingRequests(findSheet(wb, 'GİB rapor ve roplantı çıktıları', 'GİB rapor ve toplantı çıktıları', 'GİB rapor'), customer, now);
    summary.requests = customerRequests.length;

    const poc = computePocScore(findSheet(wb, 'Test Kalemleri'), currentResult);
    if (poc) {
        summary.pocScore = poc.score;
        summary.mandatoryOpen = poc.mandatoryOpen;
        summary.testItems = poc.items;
    }

    // Jira proje anahtarı: anahtarların en sık öneki (MPS-6608 → MPS)
    const prefixCount = new Map<string, number>();
    tasks.forEach(t => { const m = t.jiraId.match(/^([A-Z][A-Z0-9]+)-\d+$/); if (m) prefixCount.set(m[1], (prefixCount.get(m[1]) || 0) + 1); });
    const jiraProjectKey = [...prefixCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const msList = Object.keys(summary.byMs).filter(k => k.startsWith('MS')).sort();
    const aiProfile: ProjectAiProfile = {
        summary: `${customer} PoC'sinde tespit edilen bulguların kapatılması: ${summary.findings} takipteki bulgu (${summary.rapor51} tanesi Rapor 5.1 öncelikli bulgu), ${summary.epics} epic ve ${summary.crs} müşteri gereksinimi (CR); ${msList.join(', ')} milestone planı.`,
        customers: customer,
        product: `PoC'si yapılan e-posta sistemi — ekipler: ${GIB_TEAMS.join(', ')}${jiraProjectKey ? ` · Jira: ${jiraProjectKey}` : ''}`,
        glossary: [
            ...readGlossary(findSheet(wb, 'Giriş')),
            { term: 'Önem kademesi', explanation: '1 = Rapor 5.1 öncelikli bulgu; 2–4 = zorunlu maddeler; 5–7 = olması beklenen; 8 = isteğe bağlı; 9 = karşılandı ama notta açık konu var.' },
            { term: 'CR', explanation: 'Customer Requirement: bulguların gruplandığı müşteri gereksinimi (Epic → CR → Task → Sub-task).' },
            { term: 'PoC skoru', explanation: 'Test Kalemleri ağırlıklı puanı (Zorunlu 3, Olması beklenen 2, İsteğe bağlı 1; karşılandı 1, kısmen 0,5, karşılanmadı 0).' },
        ],
        stakeholders: customer,
        reportHints: 'Raporda MS ilerlemesi, Rapor 5.1 (Kademe 1) bulgularının durumu, müşteriye sorulacak açık konular, PoC skoru ve zorunlu açık sayısı öne çıkarılmalı.',
        updatedAt: now,
    };

    return {
        tasks,
        explicitStatusIds,
        workPackages,
        resources,
        customerRequests,
        aiProfile,
        jiraProjectKey,
        projectStartDate: readStartDate(findSheet(wb, 'Milestone')),
        tagColors: Object.fromEntries(Object.entries(MS_TAG_COLORS).filter(([k]) => tasks.some(t => t.labels?.includes(k)))),
        summary,
        warnings,
    };
};

// ---------------------------------------------------------------------------
// Dosya okuma (tarayıcı)
// ---------------------------------------------------------------------------

export const workbookToMatrices = (wb: XLSX.WorkBook): WorkbookMatrices =>
    Object.fromEntries(wb.SheetNames.map(name => [
        name,
        XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }) as SheetMatrix,
    ]));

export const readWorkbookFile = (file: File): Promise<WorkbookMatrices> =>
    file.arrayBuffer().then(buf => workbookToMatrices(XLSX.read(buf, { type: 'array' })));

// ---------------------------------------------------------------------------
// Çalışma alanına uygulama
// ---------------------------------------------------------------------------

export interface GibApplyOptions {
    /** Güncellenecek proje; verilmezse yeni proje açılır */
    projectId?: string;
    projectName: string;
    /** Proje yöneticisi: havuzdaki kişi ya da yeni açılacak kişinin adı */
    pmPersonId?: string;
    newPmName?: string;
    now?: Date;
}

export interface GibApplyResult {
    workspace: WorkspaceData;
    projectId: string;
    pmPersonId?: string;
    createdProject: boolean;
    createdPerson: boolean;
    added: number;
    updated: number;
    kept: number;
}

const personName = (p: Person): string => `${p.firstName} ${p.lastName}`.trim();
const initials = (p: Person): string => [p.firstName, p.lastName].join(' ').split(/\s+/).filter(Boolean).map(w => w.charAt(0)).join('');

/** Ad ya da baş harflerle (ör. "MKS") havuzdaki kişiyi bulur */
export const findPersonByName = (people: Person[], name: string): Person | undefined => {
    const q = foldTr(name.trim());
    if (!q) return undefined;
    return people.find(p => foldTr(personName(p)) === q)
        || people.find(p => foldTr(p.firstName) === q)
        || people.find(p => q.length >= 2 && !q.includes(' ') && foldTr(initials(p)) === q);
};

/** Aynı Excel'den önce aktarılmış projeyi bulur (gib- kimlikli görev taşıyan, en çok eşleşen) */
export const findImportedProject = (projects: Project[], pkg: Pick<GibImportPackage, 'tasks'>): Project | undefined => {
    const ids = new Set(pkg.tasks.map(t => t.id));
    let best: Project | undefined;
    let bestHits = 0;
    projects.forEach(p => {
        const hits = p.tasks.filter(t => ids.has(t.id)).length;
        if (hits > bestHits) { best = p; bestHits = hits; }
    });
    return best;
};

/** Excel'in sahip olduğu alanlar (yeniden aktarımda güncellenir); yaşam döngüsü ve sürüm uygulamada kalır */
const mergeTask = (old: Task, next: Task, statusFromSheet: boolean, now: Date): Task => {
    const merged: Task = {
        ...old,
        name: next.name,
        priority: next.priority,
        unit: next.unit,
        resourceName: next.resourceName !== 'Atanmamış' ? next.resourceName : old.resourceName,
        time: next.time,
        availability: next.availability,
        jiraId: next.jiraId || old.jiraId,
        notes: next.notes,
        labels: next.labels,
        issueType: next.issueType,
        workPackageId: next.workPackageId ?? old.workPackageId,
        dueDate: next.dueDate ?? old.dueDate,
        predecessor: next.predecessor ?? old.predecessor,
        includeInSprints: next.includeInSprints,
    };
    return statusFromSheet && next.status !== old.status ? withStatus(merged, next.status, now) : merged;
};

const upsertBy = <T,>(list: T[], incoming: T[], key: (x: T) => string): T[] => {
    const map = new Map(list.map(x => [key(x), x]));
    incoming.forEach(x => map.set(key(x), { ...(map.get(key(x)) || {}), ...x }));
    return [...map.values()];
};

/** Paketi çalışma alanına uygular: PY (gerekirse havuza eklenir) + proje (yeni ya da güncelleme) */
export const applyGibImport = (ws: WorkspaceData, pkg: GibImportPackage, opts: GibApplyOptions): GibApplyResult => {
    const now = opts.now || new Date();
    const nowIso = now.toISOString();

    // Proje yöneticisi
    let people = ws.people;
    let pmPersonId = opts.pmPersonId && ws.people.some(p => p.id === opts.pmPersonId) ? opts.pmPersonId : undefined;
    let createdPerson = false;
    if (!pmPersonId && opts.newPmName?.trim()) {
        const existing = findPersonByName(ws.people, opts.newPmName);
        if (existing) pmPersonId = existing.id;
        else {
            const parts = opts.newPmName.trim().split(/\s+/);
            const person: Person = {
                id: `person-${slug(opts.newPmName) || 'py'}-${now.getTime().toString(36)}`,
                firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0],
                lastName: parts.length > 1 ? parts[parts.length - 1] : '',
                departmentCode: 'Tanımsız',
                availableAA: 1,
                roles: ['Proje Yöneticisi'],
            };
            people = [...people, person];
            pmPersonId = person.id;
            createdPerson = true;
        }
    }

    const target = opts.projectId ? ws.projects.find(p => p.id === opts.projectId) : undefined;
    const explicit = new Set(pkg.explicitStatusIds);
    let added = 0;
    let updated = 0;
    let kept = 0;
    let project: Project;

    if (!target) {
        project = createProject(opts.projectName, {
            tasks: pkg.tasks,
            resources: pkg.resources,
            customerRequests: pkg.customerRequests,
            workPackages: pkg.workPackages,
            aiProfile: pkg.aiProfile,
            jiraProjectKey: pkg.jiraProjectKey,
            pmPersonId,
        });
        project.settings = {
            ...project.settings,
            ...(pkg.projectStartDate ? { projectStartDate: pkg.projectStartDate } : {}),
            tagColors: { ...(project.settings.tagColors || {}), ...pkg.tagColors },
        };
        added = pkg.tasks.length;
    } else {
        const oldById = new Map(target.tasks.map(t => [t.id, t]));
        const incomingIds = new Set(pkg.tasks.map(t => t.id));
        const tasks = pkg.tasks.map(t => {
            const old = oldById.get(t.id);
            if (!old) { added++; return t; }
            updated++;
            return mergeTask(old, t, explicit.has(t.id), now);
        });
        const extra = target.tasks.filter(t => !incomingIds.has(t.id));
        kept = extra.length;
        project = {
            ...target,
            name: opts.projectName.trim() || target.name,
            tasks: [...tasks, ...extra],
            resources: upsertBy(target.resources, pkg.resources.filter(r => !target.resources.some(o => foldTr(o.name) === foldTr(r.name))), r => r.id),
            workPackages: upsertBy(target.workPackages, pkg.workPackages, w => w.id),
            customerRequests: [
                ...target.customerRequests,
                ...pkg.customerRequests.filter(r => !target.customerRequests.some(o => o.id === r.id)),
            ],
            aiProfile: target.aiProfile ? { ...pkg.aiProfile, ...target.aiProfile } : pkg.aiProfile,
            jiraProjectKey: target.jiraProjectKey || pkg.jiraProjectKey,
            pmPersonId: pmPersonId ?? target.pmPersonId,
            settings: { ...target.settings, tagColors: { ...pkg.tagColors, ...(target.settings.tagColors || {}) } },
            updatedAt: nowIso,
        };
    }

    const projects = target ? ws.projects.map(p => (p.id === target.id ? project : p)) : [...ws.projects, project];
    return {
        workspace: { ...ws, people, projects, activeProjectId: project.id },
        projectId: project.id,
        pmPersonId: project.pmPersonId,
        createdProject: !target,
        createdPerson,
        added,
        updated,
        kept,
    };
};

/** Yüzde biçimi: 0.4575 → "%45,8" */
export const formatPercent = (v: number): string => `%${(Math.round(v * 1000) / 10).toString().replace('.', ',')}`;
