import { Allocation, WorkspaceData } from '../types';
import { createAllocationId, EffortField, MONTH_INDEXES } from './allocations';

/**
 * Jira "Toplam Billed Hours" pivotu → gerçekleşen (actual) tahsis köprüsü.
 *
 * Jira'dan alınan, Proje → Kişi × Ay kırılımında harcanan saati (billed hours)
 * gösteren pivot, kişi × proje × ay bazında **gerçekleşen AA**'ya çevrilir:
 *
 *   Gün     = Saat ÷ (1 iş günü = saatBasinaGun, vars. 8)
 *   Adam-Ay = Gün ÷ (ilgili ayın iş günü sayısı — TR resmi çalışma takvimi)
 *
 * Sonuç, havuzdaki kişi ve projelerle eşleştirilerek mevcut tahsis tablosunun
 * `actual` tarafına yazılır; oradan maliyet katmanı, EVM ve yönetim ekranı
 * kendiliğinden beslenir. Eşleşmeyen kişi/proje ayrıca raporlanır.
 *
 * Not: Billed hours = harcanan/gerçekleşen efor olduğundan daima `actual`
 * alanına yazılır (plan değil).
 */

// XLSX, index.html'deki CDN script'inden window üzerinden gelir (poolImporter ile aynı).
declare const XLSX: any;

export const DEFAULT_HOURS_PER_DAY = 8;

/**
 * TR 2026 resmi çalışma günü takvimi (ay 1-12 → iş günü sayısı).
 * Kaynak: T.C. 2026 Resmi Tatil Takvimi (yüklenen çalışma kitabıyla birebir).
 * Mart/Mayıs yarım günler ve bayramlar nedeniyle ondalıklıdır.
 */
export const TR_WORKDAYS_2026: Record<number, number> = {
    1: 21, 2: 20, 3: 20.5, 4: 21, 5: 15.5, 6: 22, 7: 22, 8: 21, 9: 22, 10: 21, 11: 21, 12: 23,
};

const AY_ADI_INDEX: Record<string, number> = {
    ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6,
    temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10,
    kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};

export interface BilledHoursRecord {
    projectName: string;
    personName: string;
    month: number; // 1-12
    hours: number;
}

const norm = (s: unknown): string =>
    (s == null ? '' : String(s)).trim().replace(/\s+/g, ' ');

/** Kişi/proje eşleştirme anahtarı: parantezli ekleri ("(BILGEM)") at, sadeleştir. */
const matchKey = (s: string): string =>
    norm(s).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');

const ayIndex = (v: unknown): number | null => {
    const k = norm(v).toLocaleLowerCase('tr-TR');
    return AY_ADI_INDEX[k] ?? null;
};

/** "1.234,5" / "1234.5" / sayı → number; boş/geçersiz → null. */
const toNumber = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim();
    if (!s) return null;
    const n = Number(s.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) return n;
    const n2 = Number(s);
    return Number.isFinite(n2) ? n2 : null;
};

const isSkipLabel = (v: unknown): boolean => {
    const s = norm(v).toLocaleLowerCase('tr-TR');
    return s === '' || s === '(boş)' || s.startsWith('toplam') || s.startsWith('genel toplam');
};

/**
 * Sayfa1 tipi pivotu (2B hücre dizisi) normalize kayıtlara çevirir.
 *
 * Beklenen düzen — satır: [Project Name?, Full name, Issue summary?, <ay sütunları…>, (boş)?, Genel Toplam?]
 * Proje adı yalnızca grubun ilk satırında dolu olur; aşağıya taşınır.
 * "Toplam …", "Genel Toplam", "(boş)" satır/sütunları atlanır.
 */
export const parseBilledHoursPivot = (matrix: unknown[][]): BilledHoursRecord[] => {
    if (!matrix || !matrix.length) return [];

    // Başlık satırını ve ay sütunlarını bul (ilk 15 satırda ≥2 ay başlığı olan satır).
    let headerIdx = -1;
    const monthCols: { col: number; month: number }[] = [];
    for (let i = 0; i < Math.min(matrix.length, 15); i++) {
        const row = matrix[i] || [];
        const found: { col: number; month: number }[] = [];
        for (let c = 0; c < row.length; c++) {
            const m = ayIndex(row[c]);
            if (m != null) found.push({ col: c, month: m });
        }
        if (found.length >= 2) {
            headerIdx = i;
            monthCols.push(...found);
            break;
        }
    }
    if (headerIdx === -1) return [];

    const header = (matrix[headerIdx] || []).map(v => norm(v).toLocaleLowerCase('tr-TR'));
    const projectCol = header.findIndex(h => h.includes('project') || h.includes('proje'));
    const pCol = projectCol >= 0 ? projectCol : 0;
    // Kişi sütunu proje sütunu olamaz; önce "full name/kişi", sonra proje dışı bir "name".
    let personCol = header.findIndex((h, i) => i !== pCol && (h.includes('full name') || h.includes('kişi')));
    if (personCol < 0) personCol = header.findIndex((h, i) => i !== pCol && h.includes('name'));
    const kCol = personCol >= 0 ? personCol : pCol + 1;

    const records: BilledHoursRecord[] = [];
    let activeProject = '';

    for (let i = headerIdx + 1; i < matrix.length; i++) {
        const row = matrix[i] || [];
        const projCell = row[pCol];
        const personCell = row[kCol];

        if (projCell != null && norm(projCell) && !isSkipLabel(projCell)) {
            activeProject = norm(projCell);
        }
        if (personCell == null || !norm(personCell) || isSkipLabel(personCell)) continue;
        if (!activeProject) continue;

        const personName = norm(personCell);
        for (const { col, month } of monthCols) {
            const hours = toNumber(row[col]);
            if (hours != null && hours !== 0) {
                records.push({ projectName: activeProject, personName, month, hours });
            }
        }
    }
    return records;
};

// ---------------------------------------------------------------------------
// Eşleştirme + AA'ya çevirme
// ---------------------------------------------------------------------------

export interface BilledHoursOptions {
    year: number;
    hoursPerDay?: number; // vars. 8
    workdaysByMonth?: Record<number, number>; // vars. TR_WORKDAYS_2026
}

/** Eşleşen tek (proje × kişi) satırı; aylık gerçekleşen AA ile. */
export interface BilledHoursRow {
    projectId: string;
    projectName: string;
    personId: string;
    personName: string; // havuzdaki ad
    sourceName: string; // pivottaki ad
    months: Record<number, number>; // 1-12 → AA (actual)
    totalHours: number;
    totalAA: number;
}

export interface BilledHoursImportResult {
    year: number;
    hoursPerDay: number;
    rows: BilledHoursRow[]; // yalnızca proje + kişi eşleşenler
    unmatchedProjects: string[]; // havuzda eşleşmeyen proje adları
    unmatchedPeople: string[]; // havuzda eşleşmeyen kişi adları (saati olan)
    matchedProjectCount: number;
    recordCount: number;
    totalHours: number; // tüm kayıtların saati
    totalAA: number; // yalnızca eşleşen satırların AA'sı
}

const projectMatcher = (projects: WorkspaceData['projects']) => {
    const byName = new Map(projects.map(p => [matchKey(p.name), p]));
    return (raw: string) => {
        const key = matchKey(raw);
        // 1) Tam ad eşleşmesi
        if (byName.has(key)) return byName.get(key)!;
        // 2) Kod eşleşmesi (pivot adı "… - 100654" gibi kod içerebilir)
        const withCode = projects.find(p => p.code && new RegExp(`(^|[^0-9])${p.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9]|$)`).test(raw));
        if (withCode) return withCode;
        // 3) " - " öncesi ön ek eşleşmesi (her iki yönde)
        const prefix = matchKey(raw.split(' - ')[0]);
        const byPrefix = projects.find(p => {
            const pk = matchKey(p.name);
            return pk === prefix || pk.startsWith(prefix) || prefix.startsWith(pk);
        });
        return byPrefix ?? null;
    };
};

/** Havuzdaki kişileri "ad soyad" anahtarıyla eşler (parantezli ekler yok sayılır). */
const personMatcher = (people: WorkspaceData['people']) => {
    const byName = new Map(people.map(p => [matchKey(`${p.firstName} ${p.lastName}`), p]));
    return (raw: string) => byName.get(matchKey(raw)) ?? null;
};

/**
 * Pivot kayıtlarını AA'ya çevirip havuzla eşleştirir. Değer daima `actual`
 * (gerçekleşen) olarak üretilir. Aynı proje+kişi+ay için saatler toplanır.
 */
export const suggestBilledHoursActuals = (
    ws: Pick<WorkspaceData, 'projects' | 'people'>,
    records: BilledHoursRecord[],
    opts: BilledHoursOptions,
): BilledHoursImportResult => {
    const hoursPerDay = opts.hoursPerDay && opts.hoursPerDay > 0 ? opts.hoursPerDay : DEFAULT_HOURS_PER_DAY;
    const workdays = opts.workdaysByMonth ?? TR_WORKDAYS_2026;
    const matchProject = projectMatcher(ws.projects);
    const matchPerson = personMatcher(ws.people);

    const rowMap = new Map<string, BilledHoursRow>();
    const unmatchedProjects = new Set<string>();
    const unmatchedPeople = new Set<string>();
    const matchedProjectIds = new Set<string>();
    let totalHours = 0;

    for (const rec of records) {
        totalHours += rec.hours;
        const project = matchProject(rec.projectName);
        const person = matchPerson(rec.personName);
        if (!project) unmatchedProjects.add(rec.projectName);
        if (!person) unmatchedPeople.add(rec.personName);
        if (!project || !person) continue;

        matchedProjectIds.add(project.id);
        const wd = workdays[rec.month] || TR_WORKDAYS_2026[rec.month] || 21;
        const aa = wd > 0 ? rec.hours / hoursPerDay / wd : 0;

        const key = `${project.id}::${person.id}`;
        let row = rowMap.get(key);
        if (!row) {
            row = {
                projectId: project.id,
                projectName: project.name,
                personId: person.id,
                personName: `${person.firstName} ${person.lastName}`.trim(),
                sourceName: rec.personName,
                months: {},
                totalHours: 0,
                totalAA: 0,
            };
            rowMap.set(key, row);
        }
        row.months[rec.month] = (row.months[rec.month] || 0) + aa;
        row.totalHours += rec.hours;
    }

    const rows = Array.from(rowMap.values());
    rows.forEach(row => {
        let total = 0;
        MONTH_INDEXES.forEach(m => {
            if (row.months[m]) {
                row.months[m] = Math.round(row.months[m] * 100) / 100;
                total += row.months[m];
            }
        });
        row.totalAA = Math.round(total * 100) / 100;
        row.totalHours = Math.round(row.totalHours * 100) / 100;
    });
    rows.sort((a, b) =>
        a.projectName.localeCompare(b.projectName, 'tr') || a.personName.localeCompare(b.personName, 'tr'));

    return {
        year: opts.year,
        hoursPerDay,
        rows,
        unmatchedProjects: Array.from(unmatchedProjects).sort((a, b) => a.localeCompare(b, 'tr')),
        unmatchedPeople: Array.from(unmatchedPeople).sort((a, b) => a.localeCompare(b, 'tr')),
        matchedProjectCount: matchedProjectIds.size,
        recordCount: records.length,
        totalHours: Math.round(totalHours * 100) / 100,
        totalAA: Math.round(rows.reduce((s, r) => s + r.totalAA, 0) * 100) / 100,
    };
};

// ---------------------------------------------------------------------------
// Uygulama (çalışma alanına yazma)
// ---------------------------------------------------------------------------

export type BilledApplyMode = 'fill' | 'overwrite';

export interface BilledHoursApplySummary {
    rowsApplied: number;
    cellsWritten: number;
    cellsSkipped: number; // fill modunda korunan dolu aylar
    peopleAffected: number;
    projectsAffected: number;
}

/**
 * Eşleşen satırları çalışma alanının `actual` tarafına uygular.
 *  - fill: yalnızca boş (0/undefined) gerçekleşen aylarını doldurur
 *  - overwrite: pivotta değeri olan ayları yeni değerle değiştirir
 * Satır anahtarı: kişi × proje × yıl (İP'siz, rolsüz köprü satırı) — görev
 * köprüsüyle (taskToAllocation) aynı kural.
 */
export const applyBilledHoursActuals = (
    ws: WorkspaceData,
    result: BilledHoursImportResult,
    mode: BilledApplyMode,
): { workspace: WorkspaceData; summary: BilledHoursApplySummary } => {
    const field: EffortField = 'actual';
    const allocations: Allocation[] = ws.allocations.map(a => ({ ...a, plan: { ...a.plan }, actual: { ...a.actual } }));
    const year = result.year;
    let rowsApplied = 0;
    let cellsWritten = 0;
    let cellsSkipped = 0;
    const people = new Set<string>();
    const projects = new Set<string>();

    result.rows.forEach(r => {
        let alloc = allocations.find(a =>
            a.personId === r.personId && a.projectId === r.projectId && a.year === year &&
            !a.workPackageId && !a.role);
        if (!alloc) {
            alloc = { id: createAllocationId(), personId: r.personId, projectId: r.projectId, year, plan: {}, actual: {} };
            allocations.push(alloc);
        }
        let touched = false;
        Object.entries(r.months).forEach(([mStr, aa]) => {
            const m = Number(mStr);
            if (!aa || aa <= 0) return;
            const existing = alloc![field][m] || 0;
            if (mode === 'fill' && existing > 0) {
                cellsSkipped++;
                return;
            }
            alloc![field][m] = Math.round(aa * 100) / 100;
            cellsWritten++;
            touched = true;
        });
        if (touched) {
            rowsApplied++;
            people.add(r.personId);
            projects.add(r.projectId);
        }
    });

    return {
        workspace: { ...ws, allocations },
        summary: {
            rowsApplied,
            cellsWritten,
            cellsSkipped,
            peopleAffected: people.size,
            projectsAffected: projects.size,
        },
    };
};

// ---------------------------------------------------------------------------
// Dosya / metin okuma
// ---------------------------------------------------------------------------

/** Pano/Excel'den yapıştırılan TSV metnini 2B diziye çevirir. */
export const tsvToMatrix = (text: string): unknown[][] =>
    text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.length > 0).map(l => l.split('\t'));

/** Yapıştırılan pivot metnini (TSV) kayıtlara çevirir. */
export const parseBilledHoursText = (text: string): BilledHoursRecord[] =>
    parseBilledHoursPivot(tsvToMatrix(text));

/**
 * Yüklenen .xlsx/.xls dosyasından pivot içeren sayfayı bulup kayıtlara çevirir.
 * "Sayfa1"/pivot adlı sayfa tercih edilir; yoksa en çok kayıt çıkan sayfa.
 */
export const parseBilledHoursWorkbook = (file: File): Promise<BilledHoursRecord[]> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result;
                if (!content) throw new Error('Dosya içeriği okunamadı.');
                const wb = XLSX.read(content, { type: 'binary' });
                const preferred = wb.SheetNames.find((n: string) => /sayfa1|pivot|billed/i.test(n));
                const order: string[] = preferred
                    ? [preferred, ...wb.SheetNames.filter((n: string) => n !== preferred)]
                    : wb.SheetNames;
                let best: BilledHoursRecord[] = [];
                for (const name of order) {
                    const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false }) as unknown[][];
                    const recs = parseBilledHoursPivot(matrix);
                    if (recs.length > best.length) best = recs;
                    if (preferred && name === preferred && recs.length) break;
                }
                if (!best.length) {
                    throw new Error('Pivot bulunamadı. "Project Name / Full name" başlıklı ve ay sütunları olan bir sayfa gerekli.');
                }
                resolve(best);
            } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        };
        reader.onerror = () => reject(new Error('Dosya okunurken bir hata oluştu.'));
        reader.readAsBinaryString(file);
    });
