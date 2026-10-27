import type {
    Allocation, CustomerRequest, Leave, ManagementExpectation, Note, Project, ReportItem, Risk, RiskLevel, Task, WeeklyReport, WorklogEntry, WorkspaceData,
} from '../../types.js';
import { TaskStatus } from '../../types.js';
import type { JiraIssueRecord } from '../../utils/integrations.js';
import { mergeJiraIssues } from '../../utils/planning/jiraImport.js';
import { mulberry32, normal, Rng } from '../../utils/planning/random.js';
import { addWorkdays, isWorkday, workdaysInMonth } from '../../utils/planning/workdays.js';
import { isoWeekOf } from '../../utils/weeklyReport.js';
import { createEmptyWorkspace, createProject, defaultProjectSettings } from '../../utils/workspace.js';
import { SearchResponse, searchExport, toRawIssue } from './mockJira.js';
import { ACTIONS, AYLAR, DECISIONS, DOMAIN_REQUESTS, DOMAIN_RISKS, gunAy, issueText, MEETINGS, pick, RISKS, SimIssueType } from './text.js';
import { availableAAOf, DEPARTMENTS, fullName, HOURS_PER_DAY, PEOPLE, PERSONAS, personById, PILOT_BASLANGIC, PROJECTS, ROLE_NAMES, TITLES, WorldProject } from './world.js';

/**
 * Pilot simülasyonu: kurgusal birimin günlük akışı.
 *
 *  - Jira: her iş günü yeni kayıtlar açılır; ekip, o ayki tahsisi kadar saat
 *    çalışır (worklog), kayıtlar başlar, kapanır, ara sıra yeniden açılır.
 *    Kayıtlar çalışma alanına UYGULAMANIN KENDİ Jira aktarımıyla
 *    (mergeJiraIssues) girer — "Jira'dan geçmiş" ekranıyla aynı yol.
 *  - Ay başında geçen ayın worklog saatleri gerçekleşen adam-aya çevrilir.
 *  - Confluence: toplantı notları (karar, aksiyon, gecikmeler) haftalık nota
 *    dönüşür; Cuma haftalık rapor (PY → bölüm sorumlusu → PYB destek akışı),
 *    RAG güncellemesi; ara sıra risk, müşteri isteği ve yönetimden beklenti.
 *
 * Saf ve tohumlu: aynı tohum + aynı günler → aynı veri (rastgelelik günün
 * tarihinden türetilir). Saatler İstanbul saatine göre UTC ISO yazılır.
 */

export const SIM_VERSION = 4;

/**
 * Senaryo: Jira'da ve uygulamada iz bırakan, tarihli olay (pilot senaryo
 * komutuyla eklenir, `gun` ilgili günü üretirken uygular). Tarihler
 * 'YYYY-AA-GG'; kişiler havuz id'si (p04), projeler Jira anahtarıdır (NHR).
 */
export type Senaryo =
    | { id: string; tur: 'kritik-hata'; proje: string; tarih: string; baslik: string; aciklama?: string; oncelik?: string; tip?: SimIssueType; atanan?: string; bagli?: string; tahminSaat?: number; hazirlikGun?: number }
    | { id: string; tur: 'izin'; kisi: string; baslangic: string; bitis: string; neden?: string }
    | { id: string; tur: 'fazla-mesai'; proje: string; baslangic: string; bitis: string; carpan: number }
    | { id: string; tur: 'teklif-kazanildi'; proje: string; tarih: string; baslangic: string; ihtiyac: { bolum: string; kisi: number; aa: number }[] };

export interface SimIssue {
    rec: JiraIssueRecord;
    /** Gerçek gereken efor (saat) — tahminden sapar */
    need: number;
    spent: number;
    projectId: string;
    assigneeId?: string;
    /** Havuz dışı (harici danışman) — kimse üstlenmez; sahipsiz kayıt örneği */
    external?: boolean;
    /** Kayda yazılan worklog'lar: [gün, saat, kişi id] — Jira dışa aktarımına girer */
    logs: [string, number, string][];
}

export interface SimState {
    surum: number;
    tohum: number;
    baslangic: string;
    sonGun: string | null;
    jira: Record<string, { no: number; issues: SimIssue[] }>;
    /** 'YYYY-AA' → kişi → proje → saat */
    saat: Record<string, Record<string, Record<string, number>>>;
    /** Son 21 günün worklog kayıtları */
    worklog: (WorklogEntry & { projectId: string })[];
    sayac: number;
    /** Eklenen senaryolar (bkz. Senaryo) */
    senaryolar?: Senaryo[];
    /** Ajanlı dönemin ilk günü (varsayılan PILOT_BASLANGIC); öncesini simülasyon "geçmişteki kullanıcılar" adına yazar */
    ajanli?: string;
}

export interface ProjectDay {
    ad: string;
    yeni: { key: string; ozet: string; tur: string; oncelik: string }[];
    baslayan: string[];
    kapanan: { key: string; ozet: string; saat: number; tahmin: number | null }[];
    yenidenAcilan: string[];
    /** Jira kayıtlarına yazılan worklog saati */
    saat: number;
    /** Jira dışı genel gider: toplantı, proje yönetimi, analiz (gerçekleşen adam-aya girer, Jira'da yok) */
    genelSaat: number;
    notlar: string[];
    rapor?: string;
    rag?: string;
    riskler: string[];
    istekler: string[];
}

export interface DayEvents {
    gun: string;
    isGunu: boolean;
    projeler: Record<string, ProjectDay>;
    genel: string[];
    confluence: { dosya: string; icerik: string }[];
}

// ---------------------------------------------------------------------------
// Tarih yardımcıları (takvim günü 'YYYY-AA-GG'; saat dilimi İstanbul +03:00)
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
export const dayOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateOf = (day: string): Date => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (day: string, n: number): string => { const d = dateOf(day); d.setDate(d.getDate() + n); return dayOf(d); };
/** İstanbul yerel saatinden UTC ISO */
export const at = (day: string, hour: number, minute = 0): string => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, hour - 3, minute)).toISOString();
};
const ym = (day: string) => day.slice(0, 7);

const hashStr = (s: string): number => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
};

const poisson = (rng: Rng, lambda: number): number => {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rng(); } while (p > L);
    return k - 1;
};

const weighted = <T,>(rng: Rng, items: T[], weights: number[]): T => {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
};

const lognormal = (rng: Rng, sigma: number) => Math.exp(normal(rng) * sigma);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Dünya → çalışma alanı
// ---------------------------------------------------------------------------

const TYPES: SimIssueType[] = ['Hata', 'Hikaye', 'İyileştirme', 'Görev'];
const BASE_HOURS: Record<SimIssueType, number> = { Hata: 6, Hikaye: 16, 'İyileştirme': 12, 'Görev': 8 };
const TYPE_BIAS: Record<SimIssueType, number> = { Hata: 1.25, Hikaye: 1.35, 'İyileştirme': 1.1, 'Görev': 1.0 };
const PRIORITY_RANK: Record<string, number> = { Highest: 0, High: 1, Medium: 2, Low: 3 };
const ascii = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/â/g, 'a');

const wpIds = (projectId: string) => ({ analiz: `${projectId}-ip1`, gelistirme: `${projectId}-ip2`, test: `${projectId}-ip3`, kurulum: `${projectId}-ip4` });

const buildProject = (w: WorldProject, year: number, baslangic: string): Project => {
    const planStart = `${year}-${pad(w.fromMonth)}-01`;
    // Teklif aşamasındaki proje gelecekte başlar; kaydı simülasyonun başında açılmıştır
    const start = planStart < baslangic ? planStart : baslangic;
    const project = createProject(w.name, {
        code: w.code,
        status: w.status,
        rag: 'green',
        pmPersonId: w.pm,
        jiraProjectKey: w.jiraKey,
        createdAt: at(start, 9),
        updatedAt: at(start, 9),
        settings: { ...defaultProjectSettings(), projectStartDate: planStart, sprintDuration: 3 },
    });
    const ip = wpIds(w.id);
    const short = w.name.split(' ')[0];
    return {
        ...project,
        id: w.id,
        workPackages: [
            { id: ip.analiz, name: 'İP1 Analiz ve Tasarım', description: 'Gereksinim, mimari ve arayüz tasarımı' },
            { id: ip.gelistirme, name: 'İP2 Geliştirme', description: 'Yazılım geliştirme ve birim testleri' },
            { id: ip.test, name: 'İP3 Test ve Doğrulama', description: 'Entegrasyon, sistem ve kabul testleri' },
            { id: ip.kurulum, name: 'İP4 Kurulum ve Eğitim', description: 'Saha kurulumu, kullanıcı eğitimi ve kabul' },
        ],
        objectives: [{
            id: `${w.id}-hdf1`, name: `${short} ilk sürümünün kabulü`, description: 'Müşteri kabul testlerinin tamamlanması', quarter: `Q4 ${year}`,
            keyResults: [
                { id: `${w.id}-ks1`, name: 'Açık kritik hata sayısı 0' },
                { id: `${w.id}-ks2`, name: 'Kabul testlerinin %95\'i geçer' },
            ],
        }],
        resources: Object.entries(w.team).map(([pid, aa]) => {
            const person = personById(pid);
            return { id: `res-${w.id}-${pid}`, name: fullName(person), participation: Math.round(aa * 100), unit: person.dept, title: person.title };
        }),
        risks: [],
        ...(w.id === 'prj-atlas' ? {
            pestelItems: [
                { id: 'pst-atl-1', category: 'legal' as const, text: 'Kişisel verilerin korunması mevzuatındaki değişiklik', kind: 'threat' as const, impact: 3 as RiskLevel },
                { id: 'pst-atl-2', category: 'technological' as const, text: 'Açık kaynak harita kütüphanelerinin olgunlaşması', kind: 'opportunity' as const, impact: 4 as RiskLevel },
            ],
            swotItems: [
                { id: 'swt-atl-1', quadrant: 'strength' as const, text: 'Deneyimli çekirdek ekip' },
                { id: 'swt-atl-2', quadrant: 'weakness' as const, text: 'Test otomasyonunun düşük kapsamı' },
            ],
        } : {}),
    };
};

/** Kurgusal birimin başlangıç çalışma alanı (Jira akışı öncesi) */
export const createWorld = (tohum: number, baslangic: string): WorkspaceData => {
    const year = Number(baslangic.slice(0, 4));
    const startMonth = Number(baslangic.slice(5, 7));
    const rng = mulberry32(hashStr(`${tohum}:dunya`));
    const projects = PROJECTS.map(w => buildProject(w, year, baslangic));

    // Başlangıç riskleri ve müşteri istekleri
    projects.forEach((p, i) => {
        const w = PROJECTS[i];
        if (w.rate === 0) return;
        p.risks = [0, 1].map(n => {
            const pool = DOMAIN_RISKS[w.domain];
            const t = pool[n % pool.length];
            return {
                id: `risk-${w.jiraKey}-0${n + 1}`, title: t.title, mitigation: t.mitigation, status: 'open' as const,
                probability: (2 + Math.floor(rng() * 3)) as RiskLevel, impact: (2 + Math.floor(rng() * 3)) as RiskLevel,
                ownerPersonId: w.pm, owner: fullName(personById(w.pm)), createdAt: at(baslangic, 10),
            };
        });
        const req = DOMAIN_REQUESTS[w.domain][0];
        p.customerRequests = [{ id: `istek-${w.jiraKey}-01`, title: req.title, description: req.description, customerName: w.customers[0], createdAt: at(baslangic, 11), status: 'New' }];
    });

    // Tahsis: yıl planı; simülasyondan önceki aylar için gerçekleşen (plan ±%8 — gerçekleşen plana yakın seyreder)
    const allocations: Allocation[] = [];
    PROJECTS.forEach(w => {
        const rows: [string, number, string][] = [
            // Tahsis satırının rolü (Excel'deki "Rol" sütunu): PY'ler projede yönetici, diğerleri bölümünün rolü
            ...Object.entries(w.team).map(([pid, aa]) => [pid, aa, pid === w.pm ? 'Proje Yöneticisi' : personById(pid).role] as [string, number, string]),
            // PYB proje desteği
            ...Object.entries(w.pmo || {}).map(([pid, aa]) => [pid, aa, personById(pid).role] as [string, number, string]),
        ];
        rows.forEach(([pid, aa, role]) => {
            const plan: Record<number, number> = {};
            const actual: Record<number, number> = {};
            for (let m = w.fromMonth; m <= 12; m++) {
                plan[m] = r2(m === 12 ? aa * 0.8 : aa);
                if (m < startMonth) actual[m] = Math.round(plan[m] * (0.92 + rng() * 0.16) * 20) / 20;
            }
            allocations.push({ id: `tah-${w.jiraKey}-${pid}-${year}`, personId: pid, projectId: w.id, year, role, plan, actual });
        });
    });

    const leaves: Leave[] = [
        { id: 'izin-p03', personId: 'p03', year, month: 8, aa: 0.5, reason: 'Yıllık izin' },
        { id: 'izin-p02', personId: 'p02', year, month: 7, aa: 0.25, reason: 'Eğitim' },
        { id: 'izin-p19', personId: 'p19', year, month: 9, aa: 0.3, reason: 'Yıllık izin' },
    ];

    const expectations: ManagementExpectation[] = [{
        id: 'bkl-nhr-01', title: 'NEHİR için ek test mühendisi', description: 'Hata yükü nedeniyle sistem testine en az 0,5 AA ek destek gerekiyor.',
        category: 'resource', urgency: 'important', status: 'open', projectId: 'prj-nehir', createdAt: at(baslangic, 14), updatedAt: at(baslangic, 14),
        createdByRole: 'py', createdByPersonId: 'p14', createdByName: fullName(personById('p14')),
    }];

    const ws: WorkspaceData = {
        ...createEmptyWorkspace(),
        currentRole: 'pyb_destek',
        currentPersonId: 'p23',
        activeProjectId: projects[0].id,
        projects,
        people: PEOPLE.map((x, i) => ({
            id: x.id,
            sicil: `S${String(40117 + i * 137)}`,
            firstName: x.first,
            lastName: x.last,
            emy: 'U300',
            departmentCode: x.dept,
            // Veri kalitesi denetimi için bilerek eksik bırakılanlar: Nazlı'nın ünvanı yok, Aslı yarı zamanlı
            ...(x.id === 'p24' ? {} : { titleCode: x.title }),
            // Projeye ayrılabilir kapasite (kalanı kurumsal görevler); Aslı yarı zamanlı (bilerek fazla tahsisli)
            availableAA: availableAAOf(x.id),
            roles: x.id === 'p21' ? ['Birim Yöneticisi'] : PROJECTS.some(w => w.pm === x.id) ? [x.role, 'Proje Yöneticisi'] : [x.role],
            email: `${ascii(x.first)}.${ascii(x.last)}@pilot.local`,
        })),
        departments: DEPARTMENTS.map(d => ({ code: d.code, name: d.name, leadPersonId: d.lead, leadName: fullName(personById(d.lead)) })),
        roleCatalog: [
            ...Object.entries(ROLE_NAMES).map(([code, name], i) => ({ id: `rol-${i + 1}`, departmentCode: code, name })),
            ...[...new Set(PROJECTS.map(w => personById(w.pm).dept))].map((code, i) => ({ id: `rol-py-${i + 1}`, departmentCode: code, name: 'Proje Yöneticisi' })),
        ],
        titles: TITLES.map(t => ({ ...t })),
        allocations,
        planLocks: PROJECTS.filter(w => w.planLock).map(w => ({
            projectId: w.id, year, status: w.planLock!, submittedAt: at(`${year}-01-15`, 10), submittedByRole: 'py' as const,
            ...(w.planLock === 'locked' ? { decidedAt: at(`${year}-01-20`, 15), decidedByRole: 'pyb_sorumlu' as const } : {}),
        })),
        leaves,
        expectations,
        weeklyReports: [],
        profiles: [
            ...PERSONAS.map(p => ({ id: `prf-${p.id}`, role: p.role, personId: p.personId })),
            { id: 'prf-zeynep', role: 'pyb_sorumlu' as const, personId: 'p22' },
        ],
    };
    return ws;
};

export const createState = (tohum: number, baslangic: string, ajanli: string = PILOT_BASLANGIC): SimState => ({
    surum: SIM_VERSION,
    tohum,
    baslangic,
    sonGun: null,
    jira: Object.fromEntries(PROJECTS.filter(w => w.rate > 0).map(w => [w.jiraKey, { no: 0, issues: [] }])),
    saat: {},
    worklog: [],
    sayac: 0,
    senaryolar: [],
    ajanli,
});

// ---------------------------------------------------------------------------
// Bir gün
// ---------------------------------------------------------------------------

const planAA = (ws: WorkspaceData, personId: string, projectId: string, day: string): number => {
    const year = Number(day.slice(0, 4)), month = Number(day.slice(5, 7));
    return ws.allocations.filter(a => a.personId === personId && a.projectId === projectId && a.year === year).reduce((s, a) => s + (a.plan[month] || 0), 0);
};

/** Aylık izin (uygulamadaki kayıt) çalışma saatini o ay boyunca orantılı düşürür; senaryo izinleri gün gün uygulanır (izinde()) */
const leaveAA = (ws: WorkspaceData, personId: string, day: string): number => {
    const year = Number(day.slice(0, 4)), month = Number(day.slice(5, 7));
    return (ws.leaves || []).filter(l => l.personId === personId && l.year === year && l.month === month && !l.id.startsWith(SCENARIO_LEAVE)).reduce((s, l) => s + l.aa, 0);
};

// ---------------------------------------------------------------------------
// Senaryolar
// ---------------------------------------------------------------------------

/** Senaryo izinlerinin uygulamadaki aylık kayıt öneki */
export const SCENARIO_LEAVE = 'izin-sen-';

type S<T extends Senaryo['tur']> = Extract<Senaryo, { tur: T }>;
const ofType = <T extends Senaryo['tur']>(state: SimState, tur: T): S<T>[] => (state.senaryolar || []).filter((x): x is S<T> => x.tur === tur);

/** Kişi bu gün senaryo izninde mi (worklog girmez, işleri bekler) */
const izinde = (state: SimState, personId: string, day: string): boolean =>
    ofType(state, 'izin').some(x => x.kisi === personId && day >= x.baslangic && day <= x.bitis);

/** Projenin bu günkü fazla mesai çarpanı (1 = yok) */
const mesaiCarpani = (state: SimState, jiraKey: string, day: string): number =>
    ofType(state, 'fazla-mesai').filter(x => x.proje === jiraKey && day >= x.baslangic && day <= x.bitis).reduce((m, x) => Math.max(m, x.carpan), 1);

/** Kritik hatadan önceki hazırlık günlerinde yeniden açılma olasılığı artar */
const hazirlikCarpani = (state: SimState, jiraKey: string, day: string): number =>
    ofType(state, 'kritik-hata').some(x => x.proje === jiraKey && x.hazirlikGun && day < x.tarih && day >= addDays(x.tarih, -x.hazirlikGun)) ? 3 : 1;

/** İzin aralığındaki iş günleri → uygulamanın aylık izin kayıtları (AA) */
export const scenarioLeaves = (x: S<'izin'>): Leave[] => {
    const byMonth = new Map<string, number>();
    for (let d = x.baslangic; d <= x.bitis; d = addDays(d, 1)) {
        if (!isWorkday(dateOf(d))) continue;
        byMonth.set(ym(d), (byMonth.get(ym(d)) || 0) + 1);
    }
    return [...byMonth.entries()].map(([m, days]) => {
        const [y, mo] = m.split('-').map(Number);
        return { id: `${SCENARIO_LEAVE}${x.id}-${m}`, personId: x.kisi, year: y, month: mo, aa: r2(days / workdaysInMonth(y, mo)), reason: x.neden || 'Yıllık izin' };
    });
};

const SCENARIO_TYPES: Senaryo['tur'][] = ['kritik-hata', 'izin', 'fazla-mesai', 'teklif-kazanildi'];

/**
 * Senaryoyu doğrulayıp ekler. Geçmişe (simülasyonun son gününe kadar) etki
 * eden senaryo eklenemez — üretilmiş gün yeniden yazılmaz. İzin, uygulamaya
 * hemen aylık izin kaydı olarak girer (planlı izin önceden bilinir).
 */
export const addScenario = (state: SimState, ws: WorkspaceData, x: Senaryo): WorkspaceData => {
    if (!SCENARIO_TYPES.includes(x.tur)) throw new Error(`Senaryo türü bilinmiyor: ${x.tur}`);
    const first = x.tur === 'izin' || x.tur === 'fazla-mesai' ? x.baslangic : x.tarih;
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const dates = x.tur === 'izin' || x.tur === 'fazla-mesai' ? [x.baslangic, x.bitis] : x.tur === 'teklif-kazanildi' ? [x.tarih, x.baslangic] : [x.tarih];
    dates.forEach(d => { if (!iso.test(d)) throw new Error(`Tarih YYYY-AA-GG olmalı: ${d}`); });
    if (state.sonGun && first <= state.sonGun) throw new Error(`Senaryo ${first} tarihinde başlıyor ama simülasyon ${state.sonGun} gününe kadar üretildi; geçmiş yeniden yazılmaz.`);
    if ((x.tur === 'izin' || x.tur === 'fazla-mesai') && x.bitis < x.baslangic) throw new Error('Bitiş başlangıçtan önce olamaz.');
    if ('proje' in x && !PROJECTS.some(w => w.jiraKey === x.proje)) throw new Error(`Proje bilinmiyor: ${x.proje} (Jira anahtarı: ${PROJECTS.map(w => w.jiraKey).join(', ')})`);
    if (x.tur === 'kritik-hata') {
        if (!isWorkday(dateOf(x.tarih))) throw new Error(`${x.tarih} iş günü değil.`);
        if (x.atanan) personById(x.atanan);
    }
    if (x.tur === 'izin') personById(x.kisi);
    if (x.tur === 'fazla-mesai' && !(x.carpan > 1 && x.carpan <= 2)) throw new Error('Fazla mesai çarpanı 1 ile 2 arasında olmalı (ör. 1.5).');
    if (x.tur === 'teklif-kazanildi') {
        const w = PROJECTS.find(p => p.jiraKey === x.proje)!;
        if (w.status !== 'teklif') throw new Error(`${w.name} teklif aşamasında değil.`);
        if (!x.ihtiyac.length || x.ihtiyac.some(n => !DEPARTMENTS.some(d => d.code === n.bolum) || !(n.kisi >= 1) || !(n.aa > 0 && n.aa <= 1))) throw new Error('İhtiyaç "BÖLÜM:kişi:AA" biçiminde olmalı (ör. U320:2:1.0).');
    }
    if ((state.senaryolar || []).some(s => s.id === x.id)) throw new Error(`Senaryo zaten var: ${x.id}`);
    state.senaryolar = [...(state.senaryolar || []), x];
    if (x.tur !== 'izin') return ws;
    return { ...ws, leaves: [...(ws.leaves || []).filter(l => !l.id.startsWith(`${SCENARIO_LEAVE}${x.id}-`)), ...scenarioLeaves(x)] };
};

/** Teklif kazanıldı: durum Devam, başlangıç tarihi ve rol bazında plan (bölümün en boş kişilerine) */
const applyProposalWon = (ws: WorkspaceData, x: S<'teklif-kazanildi'>, events: DayEvents): WorkspaceData => {
    const w = PROJECTS.find(p => p.jiraKey === x.proje)!;
    const year = Number(x.baslangic.slice(0, 4));
    const fromMonth = Number(x.baslangic.slice(5, 7));
    const load = (pid: string) => ws.allocations.filter(a => a.personId === pid && a.year === year).reduce((s, a) => s + (a.plan[fromMonth] || 0), 0);
    const allocations = ws.allocations.map(a => ({ ...a, plan: { ...a.plan } }));
    const added: string[] = [];
    x.ihtiyac.forEach(n => {
        // Bölüm sorumluları ve PY'ler dışındaki mühendisler; en boş olan önce
        const leads = new Set(DEPARTMENTS.map(d => d.lead));
        const pms = new Set(PROJECTS.map(w2 => w2.pm));
        const pool = PEOPLE.filter(p => p.dept === n.bolum && !leads.has(p.id) && !pms.has(p.id) && availableAAOf(p.id) >= 0.5).sort((a, b) => load(a.id) - load(b.id) || a.id.localeCompare(b.id)).slice(0, n.kisi);
        pool.forEach(person => {
            let row = allocations.find(a => a.personId === person.id && a.projectId === w.id && a.year === year);
            if (!row) {
                row = { id: `tah-${w.jiraKey}-${person.id}-${year}`, personId: person.id, projectId: w.id, year, role: person.role, plan: {}, actual: {} };
                allocations.push(row);
            }
            for (let m = fromMonth; m <= 12; m++) row.plan[m] = n.aa;
            added.push(`${fullName(person)} ${String(n.aa).replace('.', ',')} AA`);
        });
    });
    const projects = ws.projects.map(p => (p.id === w.id ? { ...p, status: 'devam' as const, updatedAt: at(x.tarih, 15), settings: { ...p.settings, projectStartDate: x.baslangic } } : p));
    const aylar = fromMonth === 12 ? 'Aralık' : `${AYLAR[fromMonth - 1]}–Aralık`;
    events.genel.push(`${w.name}: teklif kabul edildi; durum "Devam", başlangıç ${gunAy(x.baslangic)}. Plan (${aylar}): ${added.join(', ')}.`);
    return { ...ws, projects, allocations };
};

const transition = (rec: JiraIssueRecord, when: string, to: string, toCategory: JiraIssueRecord['statusCategory']) => {
    rec.transitions.push({ at: when, from: rec.status, to, fromCategory: rec.statusCategory, toCategory });
    rec.status = to;
    rec.statusCategory = toCategory;
};

const sprintNo = (project: Project, day: string): number => {
    const start = dateOf(project.settings.projectStartDate.slice(0, 10));
    const diff = Math.floor((dateOf(day).getTime() - start.getTime()) / 86_400_000);
    return Math.max(1, Math.floor(diff / (7 * (project.settings.sprintDuration || 3))) + 1);
};

const emptyDay = (name: string): ProjectDay => ({ ad: name, yeni: [], baslayan: [], kapanan: [], yenidenAcilan: [], saat: 0, genelSaat: 0, notlar: [], riskler: [], istekler: [] });

/**
 * Kaydın planı (kayıt anahtarından tohumlu, her çağrıda aynı): planlandığı
 * sürüm ve termin — sürüm sonu; tahmin daha uzunsa tahmine göre. Termin
 * Jira'ya (duedate) yazılır; sürüm ve iş paketi uygulama tarafının planıdır.
 */
const planOf = (project: Project, key: string, createdDay: string, estimateHours: number | null) => {
    const rng = mulberry32(hashStr(key));
    const sprint = sprintNo(project, createdDay) + (rng() < 0.3 ? 1 : 0);
    const sprintEnd = dateOf(project.settings.projectStartDate.slice(0, 10));
    sprintEnd.setDate(sprintEnd.getDate() + sprint * 7 * (project.settings.sprintDuration || 3) - 3);
    const estDays = estimateHours ? Math.max(1, Math.round(estimateHours / 8)) : 0;
    const byEstimate = addWorkdays(dateOf(createdDay), estDays > 0 ? Math.ceil(estDays * 2) + 5 : 12);
    return { sprint, due: dayOf(byEstimate > sprintEnd ? byEstimate : sprintEnd), rng };
};

/** Arka plandaki (persona olmayan) PY'nin aktarımı sonrası yeni görevlere uygulama planı: iş paketi, sürüm */
const decorateNewTask = (t: Task, project: Project, issue: SimIssue): Task => {
    const createdDay = issue.rec.created ? dayOf(new Date(issue.rec.created)) : project.settings.projectStartDate.slice(0, 10);
    const { sprint, rng } = planOf(project, issue.rec.key, createdDay, issue.rec.originalEstimateSeconds ? issue.rec.originalEstimateSeconds / 3600 : null);
    rng(); // termin seçimiyle aynı diziden devam
    const ip = wpIds(project.id);
    const type = issue.rec.issueType as SimIssueType;
    const workPackageId = type === 'Hata' ? ip.test : type === 'Görev' ? (rng() < 0.5 ? ip.analiz : ip.kurulum) : ip.gelistirme;
    return {
        ...t,
        workPackageId,
        version: sprint,
        ...(type === 'Hata' && rng() < 0.4 ? { keyResultId: `${project.id}-ks1` } : {}),
    };
};

/** Projesini pilot kullanıcısı (persona) yöneten PY: Jira aktarımını, RAG'i ve riskleri kendisi yapar */
export const personaOwned = (projectId: string): boolean => {
    const w = PROJECTS.find(x => x.id === projectId);
    return !!w && PERSONAS.some(p => p.personId === w.pm);
};

export interface StepOptions {
    /**
     * Tüm projelerde Jira kayıtlarını çalışma alanına aktar (kurulumda: PY'ler
     * uygulamaya başlarken geçmişi bir kez aktarmış sayılır). Kapalıyken
     * yalnız arka plandaki PY'lerin projeleri aktarılır; persona PY'leri
     * aktarımı 2. rutinde MCP'nin jira_aktar aracıyla kendileri yapar.
     */
    importAll?: boolean;
}

export const stepDay = (state: SimState, input: WorkspaceData, day: string, opts: StepOptions = {}): { ws: WorkspaceData; events: DayEvents } => {
    const rng = mulberry32(hashStr(`${state.tohum}:${day}`));
    const work = isWorkday(dateOf(day));
    const weekday = dateOf(day).getDay(); // 1 Pazartesi … 5 Cuma
    const events: DayEvents = { gun: day, isGunu: work, projeler: {}, genel: [], confluence: [] };
    let ws: WorkspaceData = { ...input, projects: input.projects.map(p => ({ ...p })) };
    const next = (prefix: string) => `${prefix}-${String(++state.sayac).padStart(5, '0')}`;

    // 1. Ay başı: geçen ayın worklog saatleri → gerçekleşen adam-ay
    if (day.endsWith('-01') && state.sonGun) {
        const prev = ym(addDays(day, -1));
        const [py, pm] = prev.split('-').map(Number);
        const days = workdaysInMonth(py, pm);
        const hours = state.saat[prev] || {};
        let rows = 0;
        const allocations = ws.allocations.map(a => ({ ...a, actual: { ...a.actual } }));
        Object.entries(hours).forEach(([pid, byProject]) => Object.entries(byProject).forEach(([prj, h]) => {
            let row = allocations.find(a => a.personId === pid && a.projectId === prj && a.year === py);
            if (!row) {
                row = { id: `tah-ek-${prj}-${pid}-${py}`, personId: pid, projectId: prj, year: py, role: personById(pid).role, plan: {}, actual: {} };
                allocations.push(row);
            }
            row.actual[pm] = r2(h / (8 * days));
            rows++;
        }));
        ws = { ...ws, allocations };
        events.genel.push(`${prev} ayının worklog saatleri gerçekleşen adam-aya çevrildi (${rows} kişi × proje hücresi).`);
        delete state.saat[prev];
    }

    // Senaryo: teklif kazanıldı
    ofType(state, 'teklif-kazanildi').filter(x => x.tarih === day).forEach(x => { ws = applyProposalWon(ws, x, events); });
    // Senaryo: izin başlangıcı / dönüşü (ekip takviminde görünür)
    ofType(state, 'izin').forEach(x => {
        const name = fullName(personById(x.kisi));
        if (x.baslangic === day) events.genel.push(`İzin başladı: ${name} (${gunAy(x.baslangic)}–${gunAy(x.bitis)}, ${x.neden || 'yıllık izin'}).`);
        if (addDays(x.bitis, 1) === day) events.genel.push(`İzinden döndü: ${name}.`);
    });
    /** Persona PY'nin projesi ajanlı dönemde mi (öncesini simülasyon "geçmişteki PY" olarak yazar) */
    const agentic = (projectId: string) => personaOwned(projectId) && day >= (state.ajanli || PILOT_BASLANGIC);

    PROJECTS.forEach((w, pi) => {
        if (w.rate === 0 || w.status !== 'devam') return;
        const project = ws.projects[pi];
        const pd = emptyDay(w.name);
        events.projeler[w.jiraKey] = pd;
        const jira = state.jira[w.jiraKey];
        const team = Object.keys(w.team).filter(pid => pid !== w.pm);

        if (work) {
            // Senaryo: kritik hata (yeni Jira kaydı)
            ofType(state, 'kritik-hata').filter(x => x.proje === w.jiraKey && x.tarih === day).forEach(x => {
                const type = x.tip || 'Hata';
                const assigneeId = x.atanan && w.team[x.atanan] !== undefined ? x.atanan : pick(rng, team);
                const estimate = x.tahminSaat || 16;
                const key = `${w.jiraKey}-${++jira.no}`;
                const plan = planOf(project, key, day, estimate);
                const rec: JiraIssueRecord = {
                    key, summary: x.baslik, description: [x.aciklama || 'Müşteri ortamında bildirildi; acil inceleme gerekiyor.', ...(x.bagli ? [`İlgili kayıt: ${x.bagli}.`] : [])].join(' '),
                    issueType: type, status: 'Yapılacak', statusCategory: 'new', priority: x.oncelik || 'Highest', created: at(day, 9, 40), resolved: null,
                    components: [personById(assigneeId).dept], labels: ['müşteri'], fixVersions: [`${w.jiraKey} v1.${sprintNo(project, day)}`],
                    originalEstimateSeconds: estimate * 3600, timeSpentSeconds: null, storyPoints: null,
                    assignee: fullName(personById(assigneeId)), blockedBy: [], transitions: [], due: addWorkdays(dateOf(day), 3) > dateOf(plan.due) ? plan.due : dayOf(addWorkdays(dateOf(day), 3)),
                };
                jira.issues.push({ rec, need: r1(estimate * w.overrun * 1.4), spent: 0, projectId: w.id, assigneeId, logs: [] });
                pd.yeni.push({ key, ozet: rec.summary, tur: type, oncelik: rec.priority });
            });

            // 2. Yeni kayıtlar
            const n = poisson(rng, w.rate);
            for (let i = 0; i < n; i++) {
                const type = weighted(rng, TYPES, w.mix);
                const { summary, description, ciddi } = issueText(rng, type, w.modules, w.domain);
                const testWork = type === 'Görev' && /test|kabul/i.test(summary);
                const pool = team.filter(pid => (testWork ? personById(pid).dept === 'U320' : personById(pid).dept !== 'U320' || type === 'Hata'));
                const external = rng() < 0.02;
                const assigneeId = external ? undefined : pick(rng, pool.length ? pool : team);
                const estimate = Math.max(1, Math.round(BASE_HOURS[type] * lognormal(rng, 0.5)));
                const need = r1(estimate * w.overrun * TYPE_BIAS[type] * lognormal(rng, 0.35));
                const priority = type === 'Hata'
                    ? ciddi ? weighted(rng, ['Highest', 'High'], [0.35, 0.65]) : weighted(rng, ['High', 'Medium', 'Low'], [0.3, 0.5, 0.2])
                    : weighted(rng, ['High', 'Medium', 'Low'], [0.2, 0.6, 0.2]);
                const open = jira.issues.filter(x => x.rec.statusCategory !== 'done');
                const blocker = open.length && rng() < 0.08 ? pick(rng, open).rec.key : undefined;
                const created = at(day, 9 + Math.floor(rng() * 8), Math.floor(rng() * 60));
                const key = `${w.jiraKey}-${++jira.no}`;
                const labels = rng() < 0.3 ? [pick(rng, ['müşteri', 'performans', 'güvenlik', 'arayüz'])] : [];
                const noEstimate = rng() < 0.08;
                const plan = planOf(project, key, day, noEstimate ? null : estimate);
                const rec: JiraIssueRecord = {
                    key, summary, description, issueType: type, status: 'Yapılacak', statusCategory: 'new', priority, created, resolved: null,
                    components: [assigneeId ? personById(assigneeId).dept : personById(w.pm).dept], labels,
                    fixVersions: [`${w.jiraKey} v1.${sprintNo(project, day)}`],
                    originalEstimateSeconds: noEstimate ? null : estimate * 3600, timeSpentSeconds: null,
                    storyPoints: type === 'Hikaye' ? [1, 2, 3, 5, 8, 13].find(sp => sp * 3 >= estimate) || 13 : null,
                    assignee: assigneeId ? fullName(personById(assigneeId)) : 'Harici Danışman',
                    blockedBy: blocker ? [blocker] : [],
                    transitions: [],
                    due: plan.due,
                };
                jira.issues.push({ rec, need, spent: 0, projectId: w.id, assigneeId, logs: [], ...(external ? { external: true } : {}) });
                pd.yeni.push({ key, ozet: summary, tur: type, oncelik: priority });
            }

            // 3. Çalışma: kişi o ayki tahsisi kadar saat yazar (izin düşer); PY proje yönetimine
            const pmAA = planAA(ws, w.pm, w.id, day);
            if (pmAA > 0 && !izinde(state, w.pm, day)) {
                const h = Math.round(HOURS_PER_DAY * pmAA * Math.max(0, 1 - leaveAA(ws, w.pm, day)) * 2) / 2;
                const month = (state.saat[ym(day)] ||= {});
                const person = (month[w.pm] ||= {});
                person[w.id] = r1((person[w.id] || 0) + h);
                state.worklog.push({ date: day, author: fullName(personById(w.pm)), summary: 'Proje yönetimi', hours: h, source: 'jira', projectId: w.id });
                pd.genelSaat += h;
            }
            // PYB (U300) proje desteği: Jira kaydı üstlenmez; genel gider olarak gerçekleşen adam-aya girer
            Object.keys(w.pmo || {}).forEach(pid => {
                const aa = planAA(ws, pid, w.id, day);
                if (aa <= 0 || izinde(state, pid, day)) return;
                const h = Math.round(HOURS_PER_DAY * aa * Math.max(0, 1 - leaveAA(ws, pid, day)) * (0.9 + rng() * 0.2) * 2) / 2;
                if (h <= 0) return;
                const month = (state.saat[ym(day)] ||= {});
                const person = (month[pid] ||= {});
                person[w.id] = r1((person[w.id] || 0) + h);
                state.worklog.push({ date: day, author: fullName(personById(pid)), summary: 'PYB proje desteği', hours: h, source: 'jira', projectId: w.id });
                pd.genelSaat += h;
            });
            const isDone = (k: string) => jira.issues.find(x => x.rec.key === k)?.rec.statusCategory === 'done';
            const mesai = mesaiCarpani(state, w.jiraKey, day);
            team.forEach(pid => {
                const aa = planAA(ws, pid, w.id, day);
                if (aa <= 0 || izinde(state, pid, day)) return;
                const factor = Math.max(0, 1 - leaveAA(ws, pid, day));
                let hours = Math.round(HOURS_PER_DAY * aa * factor * (0.8 + rng() * 0.4) * 2) / 2;
                if (hours <= 0) return;
                // Fazla mesai: ek saat yeniden çalışmaya (hata düzeltme, tekrar test) gider — iş daha hızlı kapanmaz
                let rework = mesai > 1 ? Math.round(hours * (mesai - 1) * 2) / 2 : 0;
                const name = fullName(personById(pid));
                const log = (h: number, summary: string, x?: SimIssue) => {
                    if (x) x.logs.push([day, h, pid]);
                    state.worklog.push({ date: day, author: name, ...(x ? { issueKey: x.rec.key } : {}), summary, hours: h, source: 'jira', projectId: w.id });
                    const month = (state.saat[ym(day)] ||= {});
                    const person = (month[pid] ||= {});
                    person[w.id] = r1((person[w.id] || 0) + h);
                    if (x) pd.saat += h; else pd.genelSaat += h;
                };
                // Toplantı ve kod inceleme payı
                const overhead = Math.round(hours * 0.12 * 2) / 2;
                if (overhead > 0) { log(overhead, 'Toplantı ve kod inceleme'); hours -= overhead; }
                const byPriority = (a: SimIssue, b: SimIssue) => (PRIORITY_RANK[a.rec.priority] ?? 2) - (PRIORITY_RANK[b.rec.priority] ?? 2) || String(a.rec.created).localeCompare(String(b.rec.created));
                // Bugün açılan kayıt en erken ertesi gün başlar (başlama anı açılıştan önce olmasın)
                const ready = (x: SimIssue) => x.rec.statusCategory === 'new' && !x.external && String(x.rec.created) < at(day, 9) && x.rec.blockedBy.every(isDone);
                const wip = jira.issues.filter(x => x.assigneeId === pid && x.rec.statusCategory === 'indeterminate');
                if (wip.length < 2) {
                    // Önce kendi kuyruğu; boşsa ekipte bekleyen bir işi üstlenir (Jira'da yeniden atama)
                    let pickNext = jira.issues.filter(x => x.assigneeId === pid && ready(x)).sort(byPriority)[0];
                    if (!pickNext && wip.length === 0) {
                        const dept = personById(pid).dept;
                        const queue = jira.issues.filter(x => ready(x) && x.assigneeId !== pid).sort(byPriority);
                        pickNext = queue.find(x => x.rec.components[0] === dept) || queue[0];
                        if (pickNext) { pickNext.assigneeId = pid; pickNext.rec.assignee = name; }
                    }
                    if (pickNext) {
                        transition(pickNext.rec, at(day, 9, 15 + Math.floor(rng() * 40)), 'Devam Ediyor', 'indeterminate');
                        wip.push(pickNext);
                        pd.baslayan.push(pickNext.rec.key);
                    }
                }
                if (wip.length === 0) { log(hours + rework, rework ? 'Hata düzeltme ve yeniden test' : 'Analiz ve dokümantasyon'); return; }
                if (rework > 0) {
                    const x = wip[0];
                    x.spent = r1(x.spent + rework);
                    x.need = r1(x.need + rework);
                    x.rec.timeSpentSeconds = Math.round(x.spent * 3600);
                    log(rework, x.rec.summary, x);
                    rework = 0;
                }
                wip.forEach((x, i) => {
                    if (hours <= 0) return;
                    const h = wip.length === 1 || i === wip.length - 1 ? hours : Math.round(hours * 0.7 * 2) / 2;
                    hours -= h;
                    x.spent = r1(x.spent + h);
                    x.rec.timeSpentSeconds = Math.round(x.spent * 3600);
                    log(h, x.rec.summary, x);
                    if (x.spent >= x.need) {
                        const when = at(day, 16, Math.floor(rng() * 59));
                        transition(x.rec, when, 'Tamamlandı', 'done');
                        x.rec.resolved = when;
                        pd.kapanan.push({ key: x.rec.key, ozet: x.rec.summary, saat: x.spent, tahmin: x.rec.originalEstimateSeconds ? x.rec.originalEstimateSeconds / 3600 : null });
                    }
                });
            });

            // Harici danışmanın işleri: worklog yazılmadan, birkaç gün sonra başlar ve kapanır
            jira.issues.filter(x => x.external && x.rec.statusCategory !== 'done').forEach(x => {
                const age = (dateOf(day).getTime() - new Date(x.rec.created || 0).getTime()) / 86_400_000;
                if (x.rec.statusCategory === 'new' && age >= 4 && rng() < 0.4) {
                    transition(x.rec, at(day, 10), 'Devam Ediyor', 'indeterminate');
                    pd.baslayan.push(x.rec.key);
                } else if (x.rec.statusCategory === 'indeterminate' && age >= 12 && rng() < 0.3) {
                    const when = at(day, 15);
                    transition(x.rec, when, 'Tamamlandı', 'done');
                    x.rec.resolved = when;
                    pd.kapanan.push({ key: x.rec.key, ozet: x.rec.summary, saat: 0, tahmin: x.rec.originalEstimateSeconds ? x.rec.originalEstimateSeconds / 3600 : null });
                }
            });

            // 4. Yeniden açılan kayıtlar (zor projede daha sık)
            const reopenP = (w.overrun > 1.4 ? 0.05 : 0.015) * hazirlikCarpani(state, w.jiraKey, day);
            jira.issues.forEach(x => {
                if (x.rec.statusCategory !== 'done' || !x.rec.resolved || !x.assigneeId) return;
                const age = (dateOf(day).getTime() - dateOf(dayOf(new Date(x.rec.resolved))).getTime()) / 86_400_000;
                if (age < 1 || age > 7 || rng() >= reopenP) return;
                transition(x.rec, at(day, 10, Math.floor(rng() * 59)), 'Yeniden Açıldı', 'indeterminate');
                x.rec.resolved = null;
                x.need = r1(x.need * 1.3);
                pd.yenidenAcilan.push(x.rec.key);
            });
        }
        pd.saat = r1(pd.saat);
        pd.genelSaat = r1(pd.genelSaat);

        // 5. Uygulamanın Jira aktarımıyla çalışma alanına (arka plandaki PY'ler; persona PY'ler kendisi aktarır)
        const before = new Set(project.tasks.map(t => t.id));
        if ((opts.importAll && day < (state.ajanli || PILOT_BASLANGIC)) || !personaOwned(w.id)) {
            const merged = mergeJiraIssues(project.tasks, jira.issues.map(x => x.rec), { importedAt: at(day, 7, 30), defaultUnit: personById(w.pm).dept });
            const byKey = new Map(jira.issues.map(x => [x.rec.key, x]));
            project.tasks = merged.tasks.map(t => (before.has(t.id) || !byKey.has(t.jiraId) ? t : decorateNewTask(t, project, byKey.get(t.jiraId)!)));
            if (merged.added || merged.updated) project.updatedAt = at(day, 18);
        }

        if (!work) return;
        const pm = personById(w.pm);
        const recent = jira.issues.filter(x => x.rec.resolved && dateOf(day).getTime() - new Date(x.rec.resolved).getTime() < 7 * 86_400_000);
        const openIssues = jira.issues.filter(x => x.rec.statusCategory !== 'done');

        // 6. Confluence: toplantı notu (Pazartesi koordinasyon, sürüm sonunda sprint değerlendirme, diğer günler ara sıra)
        let nextWork = addDays(day, 1);
        while (!isWorkday(dateOf(nextWork))) nextWork = addDays(nextWork, 1);
        const sprintEnd = sprintNo(project, nextWork) !== sprintNo(project, day);
        const extra = rng() < 0.12;
        if (weekday === 1 || sprintEnd || extra) {
            const meeting = sprintEnd ? 'Sprint değerlendirme toplantısı' : weekday === 1 ? 'Haftalık koordinasyon' : pick(rng, MEETINGS);
            const attendees = [fullName(pm), ...team.slice(0, 3).map(pid => fullName(personById(pid)))];
            const slow = openIssues.filter(x => x.rec.statusCategory === 'indeterminate' && x.rec.originalEstimateSeconds && x.spent > x.rec.originalEstimateSeconds / 3600)
                .sort((a, b) => b.spent / (b.rec.originalEstimateSeconds! / 3600) - a.spent / (a.rec.originalEstimateSeconds! / 3600))[0];
            const blocked = openIssues.find(x => x.rec.statusCategory === 'new' && x.rec.blockedBy.some(k => !isDoneIn(jira.issues, k)));
            const lines = [
                `**${meeting} — ${w.name}**`,
                `_Kaynak: Confluence › ${w.jiraKey} › Toplantı Notları › ${day}_`,
                `Katılımcılar: ${attendees.join(', ')}`,
                `- Son 7 günde ${recent.length} kayıt kapandı; açık kayıt ${openIssues.length} (${openIssues.filter(x => x.rec.issueType === 'Hata').length} hata).`,
                ...(slow ? [`- ${slow.rec.key} "${slow.rec.summary}" tahminin %${Math.round((slow.spent / (slow.rec.originalEstimateSeconds! / 3600) - 1) * 100)} üzerinde sürüyor.`] : []),
                ...(blocked ? [`- ${blocked.rec.key} kaydı ${blocked.rec.blockedBy.join(', ')} kapanmadan başlayamıyor.`] : []),
                `- Karar: ${pick(rng, DECISIONS)}`,
                `- Aksiyon: ${pick(rng, ACTIONS).replace('{a}', pick(rng, attendees)).replace('{t}', gunAy(dayOf(addWorkdays(dateOf(day), 3 + Math.floor(rng() * 5)))))}`,
            ];
            const { year, week } = isoWeekOf(dateOf(day));
            const note: Note = { id: next(`not-${w.jiraKey}`), content: lines.join('\n'), createdAt: at(day, 17), weekNumber: week, year, tags: ['toplantı', 'confluence'], mentions: attendees };
            project.notes = [...project.notes, note];
            pd.notlar.push(meeting);
            events.confluence.push({ dosya: `${day}-${w.jiraKey}-${state.sayac}.md`, icerik: lines.join('\n') });
        }

        // 7. Risk (ajanlı dönemde persona PY'nin projesinde yalnız sinyal: riski PY değerlendirip kendisi ekler), müşteri isteği
        const own = agentic(w.id);
        if (rng() < (w.overrun > 1.4 ? 0.07 : 0.04)) {
            const openTitles = new Set((project.risks || []).filter(r => r.status !== 'closed').map(r => r.title));
            const pool = [...DOMAIN_RISKS[w.domain], ...RISKS].filter(t => !openTitles.has(t.title));
            const t = pool.length ? pick(rng, pool) : pick(rng, RISKS);
            if (own) {
                pd.riskler.push(`ekipten sinyal: "${t.title}" (PY değerlendirmeli)`);
            } else {
                const risk: Risk = {
                    id: next(`risk-${w.jiraKey}`), title: t.title, mitigation: t.mitigation, status: 'open',
                    // Çoğu risk orta düzeydedir; yüksek (≥ 15) yalnız 4×4
                    probability: (1 + Math.floor(rng() * 4)) as RiskLevel, impact: (2 + Math.floor(rng() * 3)) as RiskLevel,
                    ownerPersonId: w.pm, owner: fullName(pm), createdAt: at(day, 15),
                };
                project.risks = [...(project.risks || []), risk];
                pd.riskler.push(`yeni: ${risk.title} (${risk.probability}×${risk.impact})`);
            }
        }
        const openRisks = (project.risks || []).filter(r => r.status !== 'closed');
        if (!own && openRisks.length > 2 && rng() < 0.05) {
            const r = pick(rng, openRisks);
            project.risks = (project.risks || []).map(x => (x.id === r.id ? { ...x, status: 'closed' as const } : x));
            pd.riskler.push(`kapandı: ${r.title}`);
        }
        // İstekler: geçmişte PY 5–15 iş gününde karara bağlamış (dönüştürüldü / reddedildi); ajanlı dönemde persona projelerinde PY karar verir
        if (!own) {
            project.customerRequests = project.customerRequests.map(r => {
                if (r.status !== 'New') return r;
                const age = (dateOf(day).getTime() - new Date(r.createdAt).getTime()) / 86_400_000;
                const wait = 7 + (hashStr(r.id) % 14);
                if (age < wait) return r;
                const converted = hashStr(`${r.id}:karar`) % 100 < 65;
                return { ...r, status: converted ? 'Converted' as const : 'Rejected' as const };
            });
        }
        const unusedRequests = DOMAIN_REQUESTS[w.domain].filter(t => !project.customerRequests.some(r => r.title === t.title));
        if (rng() < 0.03 && unusedRequests.length) {
            const t = pick(rng, unusedRequests);
            const req: CustomerRequest = { id: next(`istek-${w.jiraKey}`), title: t.title, description: t.description, customerName: pick(rng, w.customers), createdAt: at(day, 11), status: 'New' };
            project.customerRequests = [...project.customerRequests, req];
            pd.istekler.push(req.title);
        }

        // 8. Perşembe (tatilse bir önceki iş günü): haftalık rapor (bölüm sorumlusu onayına) ve RAG.
        //    Ajanlı dönemde persona projelerinin raporunu ve RAG'ını PY ajanı yazar (MCP rapor araçları)
        let thursday = addDays(day, 4 - weekday);
        while (!isWorkday(dateOf(thursday)) && thursday > addDays(day, -weekday)) thursday = addDays(thursday, -1);
        if (day === thursday && !own) {
            const { year, week } = isoWeekOf(dateOf(day));
            const busy = w.pm === 'p14'; // iki proje yürüten PY bazen geç kalır
            const openTasks = project.tasks.filter(t => t.status !== TaskStatus.Done);
            const overdue = openTasks.filter(t => t.dueDate && t.dueDate < day).length;
            const ratio = openTasks.length ? overdue / openTasks.length : 0;
            const highRisks = (project.risks || []).filter(r => r.status !== 'closed' && r.probability * r.impact >= 15).length;
            if (!(busy && rng() < 0.3)) {
                const strict = ratio > 0.45 || highRisks >= 3 ? 'red' : ratio > 0.2 || highRisks >= 1 ? 'amber' : 'green';
                // Yoğun PY (iki proje) RAG'ı çoğu hafta bir kademe iyimser girer: veriyle algı farkı geçmişte de görülür
                const rag = busy && strict !== 'green' && rng() < 0.6 ? (strict === 'red' ? 'amber' : 'green') : strict;
                project.rag = rag;
                project.ragNote = `Geciken açık kayıt oranı %${Math.round(ratio * 100)}; açık yüksek risk ${highRisks}.`;
                pd.rag = rag;
            }
            if (!(busy && rng() < 0.25)) {
                const weekStart = addDays(day, 1 - weekday);
                const closed = recent.filter(x => x.rec.resolved! >= at(weekStart, 0));
                const thisWeek: ReportItem[] = closed.slice(0, 5).map((x, i) => ({
                    id: `ri-${w.jiraKey}-${year}-${week}-b${i}`,
                    category: x.rec.issueType === 'Hikaye' ? 'delivery' : 'ongoing',
                    text: `${x.rec.key} ${x.rec.summary} tamamlandı.`,
                    source: 'task',
                }));
                if (thisWeek.length === 0) thisWeek.push({ id: `ri-${w.jiraKey}-${year}-${week}-b0`, category: 'ongoing', text: 'Geliştirme çalışmaları sürüyor.', source: 'manual' });
                const nextWeek: ReportItem[] = openIssues
                    .sort((a, b) => (a.rec.statusCategory === 'indeterminate' ? 0 : 1) - (b.rec.statusCategory === 'indeterminate' ? 0 : 1))
                    .slice(0, 3)
                    .map((x, i) => ({ id: `ri-${w.jiraKey}-${year}-${week}-p${i}`, category: 'plan', text: `${x.rec.key} ${x.rec.summary}`, source: 'task' }));
                const prev = (ws.weeklyReports || []).find(r => r.projectId === w.id && r.week === (week === 1 ? 52 : week - 1));
                const planReview = prev?.nextWeek.map(item => {
                    const key = item.text.split(' ')[0];
                    const x = jira.issues.find(i => i.rec.key === key);
                    return { itemId: item.id, text: item.text, status: (x?.rec.statusCategory === 'done' ? 'done' : x?.rec.statusCategory === 'indeterminate' ? 'partial' : 'slipped') as 'done' | 'partial' | 'slipped' };
                });
                const report: WeeklyReport = {
                    id: `rapor-${w.id}-${year}-${week}`, year, week, kind: 'project', projectId: w.id, departmentCode: pm.dept,
                    thisWeek, nextWeek, abbreviations: [], stage: 'bs_review',
                    worklog: state.worklog.filter(x => x.projectId === w.id && x.date >= weekStart).map(({ projectId: _p, ...rest }) => { void _p; return rest; }),
                    ...(busy && rng() < 0.4 ? {} : { pmScore: Math.max(3, Math.min(9, 9 - Math.round(ratio * 10) - highRisks)), pmScoreNote: 'Haftalık genel değerlendirme' }),
                    ...(planReview?.length ? { planReview } : {}),
                    authorPersonId: w.pm, authorName: fullName(pm), createdAt: at(day, 16), updatedAt: at(day, 17),
                    history: [
                        { at: at(day, 16), action: 'create', byRole: 'py', byName: fullName(pm) },
                        { at: at(day, 17), action: 'submit', byRole: 'py', byName: fullName(pm) },
                    ],
                };
                ws = { ...ws, weeklyReports: [...(ws.weeklyReports || []).filter(r => r.id !== report.id), report] };
                pd.rapor = `${year}-H${week} haftalık rapor bölüm sorumlusu onayına gönderildi`;
            } else {
                pd.rapor = `${year}-H${week} haftalık rapor GÖNDERİLMEDİ (gecikti)`;
            }
        }
    });

    // 9. Rapor akışı: Cuma bölüm onayı, Pazartesi PYB destek onayı ve haftanın yayını (müdür yayınlananı okur).
    //    Ajanlı dönemde persona projelerinin bölüm onayını Selin, tüm raporların biçim onayını ve yayını Mert (ajanlar) yapar.
    if (work && (weekday === 5 || weekday === 1)) {
        const bs = weekday === 5;
        const from = bs ? 'bs_review' : 'pyds_review';
        const to = bs ? 'pyds_review' : 'approved';
        const simDoes = (r: WeeklyReport) => (bs ? !(r.projectId && personaOwned(r.projectId) && day >= (state.ajanli || PILOT_BASLANGIC)) : day < (state.ajanli || PILOT_BASLANGIC));
        let moved = 0;
        const reports = (ws.weeklyReports || []).map(r => {
            if (r.stage !== from || !simDoes(r)) return r;
            moved++;
            const approver = bs
                ? fullName(personById(DEPARTMENTS.find(d => d.code === r.departmentCode)?.lead || 'p01'))
                : fullName(personById('p23'));
            return {
                ...r, stage: to as WeeklyReport['stage'], updatedAt: at(day, 11),
                history: [...r.history, { at: at(day, 11), action: (bs ? 'bs_approve' : 'pyds_approve') as 'bs_approve' | 'pyds_approve', byRole: (bs ? 'bolum_sorumlu' : 'pyb_destek') as 'bolum_sorumlu' | 'pyb_destek', byName: approver }],
            };
        });
        if (moved) {
            ws = { ...ws, weeklyReports: reports };
            events.genel.push(`${moved} haftalık rapor ${bs ? 'bölüm sorumlusunca onaylandı' : 'PYB destekçe onaylandı'}.`);
        }
        if (!bs && day < (state.ajanli || PILOT_BASLANGIC)) {
            const prev = isoWeekOf(dateOf(addDays(day, -7)));
            const pubs = ws.weeklyPublications || [];
            const ready = (ws.weeklyReports || []).some(r => r.year === prev.year && r.week === prev.week && r.stage === 'approved');
            if (ready && !pubs.some(x => x.year === prev.year && x.week === prev.week)) {
                ws = { ...ws, weeklyPublications: [...pubs, { year: prev.year, week: prev.week, publishedAt: at(day, 12), publishedByName: fullName(personById('p23')) }] };
                events.genel.push(`${prev.year}-H${prev.week} haftalık raporları yayınlandı (müdürlüğe sunuldu).`);
            }
        }
    }

    // 10. Yönetimden beklenti: ara sıra yeni talep; açık talepler zamanla yanıtlanır
    if (work) {
        let expectations = ws.expectations || [];
        if (rng() < 0.03) {
            const w = pick(rng, PROJECTS.filter(x => x.rate > 0));
            expectations = [...expectations, {
                id: next('bkl'), title: `${w.name.split(' ')[0]} için ${pick(rng, ['takvim onayı', 'ek bütçe', 'donanım alımı', 'müşteriyle üst düzey toplantı'])}`,
                category: pick(rng, ['schedule', 'budget', 'procurement', 'customer'] as const), urgency: pick(rng, ['critical', 'important', 'normal'] as const), status: 'open',
                projectId: w.id, createdAt: at(day, 13), updatedAt: at(day, 13), createdByRole: 'py', createdByPersonId: w.pm, createdByName: fullName(personById(w.pm)),
            }];
            events.genel.push(`Yönetimden yeni beklenti: ${expectations[expectations.length - 1].title}`);
        }
        expectations = expectations.map(e => {
            if (e.status !== 'open' || rng() >= 0.15) return e;
            return { ...e, status: 'acknowledged' as const, response: 'İnceleniyor; haftaya karar verilecek.', respondedAt: at(day, 15), respondedByName: fullName(personById('p21')), respondedByRole: 'mudur' as const, updatedAt: at(day, 15) };
        });
        ws = { ...ws, expectations };
    }

    state.worklog = state.worklog.filter(x => x.date > addDays(day, -21));
    state.sonGun = day;
    return { ws, events };
};

const isDoneIn = (issues: SimIssue[], key: string) => issues.find(x => x.rec.key === key)?.rec.statusCategory === 'done';

/** Simülasyonu `bitis` gününe kadar (dahil) ilerletir */
export const runUntil = (state: SimState, ws: WorkspaceData, bitis: string, onDay?: (e: DayEvents) => void, opts: StepOptions = {}): WorkspaceData => {
    let day = state.sonGun ? addDays(state.sonGun, 1) : state.baslangic;
    let out = ws;
    while (day <= bitis) {
        const r = stepDay(state, out, day, opts);
        out = r.ws;
        onDay?.(r.events);
        day = addDays(day, 1);
    }
    return { ...out, exportDate: at(bitis, 19) };
};

/** Sahte Jira'nın dışa aktarımları: proje anahtarı → Jira arama yanıtı biçimi (kayıtlar, changelog, worklog) */
export const jiraExports = (state: SimState): Record<string, SearchResponse> => {
    const out: Record<string, SearchResponse> = {};
    PROJECTS.forEach((w, pi) => {
        const jira = state.jira[w.jiraKey];
        if (!jira) return;
        out[w.jiraKey] = searchExport(jira.issues.map(x => toRawIssue(x.rec, {
            id: 10_000 * (pi + 1) + (Number(x.rec.key.split('-').pop()) || 0),
            project: { key: w.jiraKey, name: w.name },
            worklogs: x.logs.map(([day, hours, pid]) => ({ day, hours, author: fullName(personById(pid)) })),
        })));
    });
    return out;
};

/** Günün olaylarını okunur Markdown'a çevirir (2. rutindeki kullanıcılar bunu okur) */
export const eventsMarkdown = (e: DayEvents): string => {
    const lines = [`# ${e.gun} — günün akışı${e.isGunu ? '' : ' (iş günü değil)'}`, ''];
    e.genel.forEach(g => lines.push(`- ${g}`));
    if (e.genel.length) lines.push('');
    Object.entries(e.projeler).forEach(([key, p]) => {
        lines.push(`## ${key} · ${p.ad}`);
        if (p.yeni.length) lines.push(`- Jira yeni (${p.yeni.length}): ${p.yeni.map(x => `${x.key} [${x.tur}/${x.oncelik}] ${x.ozet}`).join('; ')}`);
        if (p.baslayan.length) lines.push(`- İşe başlanan: ${p.baslayan.join(', ')}`);
        if (p.kapanan.length) lines.push(`- Kapanan (${p.kapanan.length}): ${p.kapanan.map(x => `${x.key} ${x.saat} sa${x.tahmin ? ` / tahmin ${x.tahmin} sa` : ' / tahminsiz'}`).join('; ')}`);
        if (p.yenidenAcilan.length) lines.push(`- Yeniden açılan: ${p.yenidenAcilan.join(', ')}`);
        if (p.saat || p.genelSaat) lines.push(`- Worklog: Jira kayıtlarına ${p.saat} sa${p.genelSaat ? ` · Jira dışı genel gider ${p.genelSaat} sa (toplantı, proje yönetimi, analiz; gerçekleşen adam-aya girer)` : ''}`);
        if (p.notlar.length) lines.push(`- Confluence notu: ${p.notlar.join(', ')}`);
        if (p.riskler.length) lines.push(`- Risk: ${p.riskler.join('; ')}`);
        if (p.istekler.length) lines.push(`- Müşteri isteği: ${p.istekler.join('; ')}`);
        if (p.rag) lines.push(`- RAG: ${p.rag}`);
        if (p.rapor) lines.push(`- Haftalık rapor: ${p.rapor}`);
        lines.push('');
    });
    return lines.join('\n');
};
