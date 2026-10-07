import { HealthFactorKey, HealthSnapshotEntry, HealthWeekSnapshot, PmoRating, Project, TaskStatus, UserRole, WeeklyReport, WorkspaceData } from '../types';
import { findOverAllocations } from './allocations';
import { canFor, PermissionHolder } from './permissions';
import { buildProjectEVM, defaultStatusMonth, ProjectEVM } from './evm';
import { daysUntilNeed, isActiveExpectation } from './expectations';
import { riskScore } from './risks';
import { isoWeekOf, weekStart } from './weeklyReport';

/**
 * Proje sağlık modeli — uzman ağırlıklı bileşik skor.
 *
 *  1. Özellik katmanı: her metrik 0–1 arasına normalize edilir (1 = sağlıklı).
 *     Verisi olmayan metrik null'dır ve skora girmez.
 *  2. Skor = 100 × Σ wᵢ·xᵢ / Σ wᵢ — yalnız verisi olan metrikler üzerinden.
 *     Kapsam = Σ wᵢ (0–1) skorun ne kadar veriye dayandığını (güveni) gösterir.
 *  3. Algı farkı: PY'nin öznel değerlendirmesi (RAG + puan) ile nesnel
 *     metrikler arasındaki fark; ≥ 0,3 ise "karpuz proje" uyarısı. AI metin
 *     puanı PY'nin kendi metninden türediği için iki tarafa da girmez.
 *  4. Her ISO haftası proje başına özellik vektörü ve skor saklanır. PMO'nun
 *     haftalık 1–10 puanı hedef değişkendir (Y); yeterli etiketli gözlem
 *     biriktiğinde ağırlıklar regresyonla kalibre edilir.
 *
 * Sürümler: uzman-1 (8 girdi) → uzman-2 (+ söz tutma oranı, AI metin puanı).
 *
 * Saf/test edilebilir; ekranlar executive.projectHealth üzerinden kullanır.
 */

export type HealthBand = 'good' | 'warn' | 'bad';
export type HealthConfidence = 'high' | 'medium' | 'low';

export const HEALTH_MODEL_VERSION = 'uzman-2';
export const BAND_GOOD = 75;
export const BAND_WARN = 50;

export interface HealthFactorDef {
    key: HealthFactorKey;
    label: string;
    weight: number; // uzman ağırlığı (β₀); toplam 1
    rule: string; // 0–1 normalizasyonu
    source: string; // verinin geldiği yer
}

export const HEALTH_FACTORS: HealthFactorDef[] = [
    { key: 'spi', label: 'Takvim (SPI)', weight: 0.18, rule: 'SPI ≤ 0,80 → 0 · SPI ≥ 1,00 → 1 · arası doğrusal', source: 'EVM: kazanılmış değer ÷ planlı değer' },
    { key: 'cpi', label: 'Bütçe (CPI)', weight: 0.13, rule: 'CPI ≤ 0,80 → 0 · CPI ≥ 1,00 → 1 · arası doğrusal', source: 'EVM: kazanılmış değer ÷ gerçek maliyet' },
    { key: 'overdue', label: 'Geciken görevler', weight: 0.13, rule: 'Açık görevlerde geciken oranı: %0 → 1 · %30 ve üstü → 0', source: 'Termini geçmiş, bitmemiş görevler' },
    { key: 'risk', label: 'Riskler', weight: 0.13, rule: 'Her yüksek risk (15+) −0,4 · her orta risk (8–14) −0,1', source: 'Risk kaydı (açık ve izlenen)' },
    { key: 'commitment', label: 'Söz tutma', weight: 0.08, rule: 'Gerçekleşen plan oranı (kısmen = yarım, iptal sayılmaz), son 4 hafta: %50 ve altı → 0 · %90 ve üstü → 1', source: 'Haftalık raporda geçen haftanın planı' },
    { key: 'rag', label: 'Haftalık durum', weight: 0.08, rule: 'Yolunda 1 · Riskli 0,5 · Kritik 0', source: "PY'nin haftalık durumu (RAG)" },
    { key: 'pm', label: 'PY puanı', weight: 0.08, rule: '(puan − 1) ÷ 9 · son 4 haftanın en yeni puanı', source: 'Haftalık rapordaki 1–10 puan' },
    { key: 'ai', label: 'AI metin puanı', weight: 0.08, rule: '(puan − 1) ÷ 9 · son 4 haftanın en yeni değerlendirmesi', source: 'Onaylı rapor metninin AI değerlendirmesi (hafta yayınlanırken)' },
    { key: 'resource', label: 'Kaynak', weight: 0.06, rule: 'Ekipte kapasite üstü kişi oranı: %0 → 1 · %50 ve üstü → 0 (bu ay ve sonraki 2 ay)', source: 'Plan tahsisi ve izinler' },
    { key: 'expectations', label: 'Yönetim beklentileri', weight: 0.05, rule: 'Kritik ya da süresi geçmiş her açık beklenti −0,5', source: 'Yönetimden beklentiler' },
];

const FACTOR_BY_KEY = new Map(HEALTH_FACTORS.map(f => [f.key, f]));
const SUBJECTIVE: HealthFactorKey[] = ['rag', 'pm'];
/** Algı farkında nesnel tarafa girmeyenler: öznel girdiler ve PY metninden türeyen AI puanı */
const NOT_OBJECTIVE: HealthFactorKey[] = [...SUBJECTIVE, 'ai'];
/** Algı farkı ancak nesnel metriklerin ağırlığı bu kadarsa hesaplanır */
const MIN_OBJECTIVE_COVERAGE = 0.3;
export const PERCEPTION_GAP_ALERT = 0.3;
/** Rapordan gelen girdiler (PY/AI puanı, söz tutma) bu kadar hafta geçerli: bu hafta + önceki 3 */
const REPORT_WEEKS = 4;
/** Regresyon için gereken etiketli gözlem: değişken başına ~10 */
export const MIN_LABELED_OBSERVATIONS = HEALTH_FACTORS.length * 10;
const MAX_HISTORY_WEEKS = 104;

export interface HealthFactor {
    key: HealthFactorKey;
    label: string;
    weight: number;
    value: number | null; // 0–1; null = veri yok
    detail: string; // ham değer, ör. "SPI 0,85"
    points: number; // skordan düşürdüğü puan (0–100 ölçeği)
    note?: string; // açıklama (ör. AI değerlendirmesinin gerekçesi)
}

export interface HealthEvaluation {
    score: number; // 0–100
    band: HealthBand;
    coverage: number; // 0–1
    confidence: HealthConfidence;
    factors: HealthFactor[];
    reasons: string[]; // skoru düşürenler, en etkilisi başta
    evm: ProjectEVM;
    highRisks: number;
    pmScore?: number; // ham 1–10
    perceptionGap: number | null; // öznel − nesnel (−1..1)
}

export const bandOf = (score: number): HealthBand => (score >= BAND_GOOD ? 'good' : score >= BAND_WARN ? 'warn' : 'bad');
export const confidenceOf = (coverage: number): HealthConfidence => (coverage >= 0.7 ? 'high' : coverage >= 0.45 ? 'medium' : 'low');
export const CONFIDENCE_LABELS: Record<HealthConfidence, string> = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round1 = (v: number): number => Math.round(v * 10) / 10;
const fmt = (v: number): string => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

// ---------------------------------------------------------------- bağlam

/** Portföy genelinde bir kez hesaplanan ara veriler (proje başına tekrarlanmasın) */
export interface HealthContext {
    now: Date;
    year: number;
    statusMonth: number;
    overPeopleByMonth: Map<number, Set<string>>; // ay → kapasite üstü kişi id'leri
}

export const buildHealthContext = (ws: WorkspaceData, year: number, statusMonth: number, now: Date = new Date()): HealthContext => {
    const over = findOverAllocations(ws.allocations.filter(a => a.year === year), ws.people, year, 'plan', ws.leaves || []);
    const overPeopleByMonth = new Map<number, Set<string>>();
    over.forEach(o => {
        if (!overPeopleByMonth.has(o.month)) overPeopleByMonth.set(o.month, new Set());
        overPeopleByMonth.get(o.month)!.add(o.personId);
    });
    return { now, year, statusMonth, overPeopleByMonth };
};

// ---------------------------------------------------------------- girdiler

const weeksBetween = (from: { year: number; week: number }, to: { year: number; week: number }): number =>
    Math.round((weekStart(to.year, to.week).getTime() - weekStart(from.year, from.week).getTime()) / (7 * 86_400_000));

/** Projenin son REPORT_WEEKS haftadaki raporları (gelecek haftalar hariç), en yenisi başta */
const recentReports = (reports: WeeklyReport[] | undefined, projectId: string, now: Date): WeeklyReport[] => {
    const cur = isoWeekOf(now);
    return (reports || [])
        .filter(r => {
            if (r.kind !== 'project' || r.projectId !== projectId) return false;
            const age = weeksBetween({ year: r.year, week: r.week }, cur);
            return age >= 0 && age < REPORT_WEEKS;
        })
        .sort((a, b) => b.year - a.year || b.week - a.week);
};

/** Projenin son 4 haftadaki en yeni PY puanı */
export const latestPmScore = (reports: WeeklyReport[] | undefined, projectId: string, now: Date = new Date()): { score: number; year: number; week: number; note?: string } | undefined => {
    const r = recentReports(reports, projectId, now).find(x => typeof x.pmScore === 'number');
    return r ? { score: r.pmScore!, year: r.year, week: r.week, note: r.pmScoreNote } : undefined;
};

/** Projenin son 4 haftadaki en yeni AI metin değerlendirmesi */
export const latestAiAssessment = (reports: WeeklyReport[] | undefined, projectId: string, now: Date = new Date()): { score: number; week: number; rationale: string } | undefined => {
    const r = recentReports(reports, projectId, now).find(x => x.aiAssessment);
    return r ? { score: r.aiAssessment!.score, week: r.week, rationale: r.aiAssessment!.rationale } : undefined;
};

/**
 * Söz tutma oranı: son 4 haftanın raporlarında değerlendirilen geçen hafta
 * planlarından gerçekleşenlerin payı (yapıldı 1, kısmen 0,5, ertelendi 0;
 * iptal edilenler paydan çıkar). Değerlendirilmiş plan yoksa undefined.
 */
export const commitmentRatio = (reports: WeeklyReport[] | undefined, projectId: string, now: Date = new Date()): { ratio: number; plans: number } | undefined => {
    let earned = 0;
    let plans = 0;
    recentReports(reports, projectId, now).forEach(r => (r.planReview || []).forEach(p => {
        if (p.status === 'dropped') return;
        plans++;
        earned += p.status === 'done' ? 1 : p.status === 'partial' ? 0.5 : 0;
    }));
    return plans ? { ratio: earned / plans, plans } : undefined;
};

const factor = (key: HealthFactorKey, value: number | null, detail: string, note?: string): HealthFactor => {
    const def = FACTOR_BY_KEY.get(key)!;
    return { key, label: def.label, weight: def.weight, value: value === null ? null : round2(clamp01(value)), detail, points: 0, ...(note ? { note } : {}) };
};

interface RawInputs {
    factors: HealthFactor[];
    evm: ProjectEVM;
    highRisks: number;
    mediumRisks: number;
    overdue: number;
    overPeople: number;
    blockingExpectations: number;
    pmScore?: number;
    aiScore?: number;
    commitment?: number; // 0–1 oran
}

const computeInputs = (ws: WorkspaceData, project: Project, ctx: HealthContext): RawInputs => {
    const evm = buildProjectEVM(ws, project.id, ctx.year, ctx.statusMonth);
    const out: HealthFactor[] = [];

    // Takvim ve bütçe — yalnız maliyetlenebiliyorsa
    const spi = evm.costed ? evm.spi : null;
    const cpi = evm.costed ? evm.cpi : null;
    out.push(factor('spi', spi === null ? null : (spi - 0.8) / 0.2, spi === null ? 'Maliyet verisi yok' : `SPI ${fmt(spi)}`));
    out.push(factor('cpi', cpi === null ? null : (cpi - 0.8) / 0.2, cpi === null ? 'Maliyet verisi yok' : `CPI ${fmt(cpi)}`));

    // Geciken görevler
    const today = ctx.now.toISOString().slice(0, 10);
    const tasks = project.tasks || [];
    const open = tasks.filter(t => t.status !== TaskStatus.Done);
    const overdue = open.filter(t => t.dueDate && t.dueDate.slice(0, 10) < today).length;
    const overdueRatio = open.length ? overdue / open.length : 0;
    out.push(factor('overdue', tasks.length ? 1 - overdueRatio / 0.3 : null,
        !tasks.length ? 'Görev yok' : !open.length ? 'Tüm görevler bitti' : `${overdue}/${open.length} açık görev gecikmiş`));

    // Riskler
    const active = (project.risks || []).filter(r => r.status !== 'closed').map(riskScore);
    const highRisks = active.filter(s => s >= 15).length;
    const mediumRisks = active.filter(s => s >= 8 && s < 15).length;
    out.push(factor('risk', 1 - 0.4 * highRisks - 0.1 * mediumRisks,
        highRisks || mediumRisks ? [highRisks ? `${highRisks} yüksek` : '', mediumRisks ? `${mediumRisks} orta` : ''].filter(Boolean).join(', ') + ' risk' : 'Yüksek/orta risk yok'));

    // Söz tutma: geçen haftaların planından gerçekleşenler
    const kept = commitmentRatio(ws.weeklyReports, project.id, ctx.now);
    out.push(factor('commitment', kept ? (kept.ratio - 0.5) / 0.4 : null,
        kept ? `%${Math.round(kept.ratio * 100)} gerçekleşti (${kept.plans} plan, son 4 hafta)` : 'Değerlendirilmiş plan yok'));

    // Haftalık durum (PY)
    const ragValue = project.rag === 'green' ? 1 : project.rag === 'amber' ? 0.5 : project.rag === 'red' ? 0 : null;
    out.push(factor('rag', ragValue, project.rag === 'green' ? 'Yolunda' : project.rag === 'amber' ? 'Riskli' : project.rag === 'red' ? 'Kritik' : 'Girilmedi'));

    // PY puanı
    const pm = latestPmScore(ws.weeklyReports, project.id, ctx.now);
    out.push(factor('pm', pm ? (pm.score - 1) / 9 : null, pm ? `${pm.score}/10 (${pm.week}. hafta)` : 'Son 4 haftada puan yok'));

    // AI metin puanı (onaylı rapor metninden)
    const ai = latestAiAssessment(ws.weeklyReports, project.id, ctx.now);
    out.push(factor('ai', ai ? (ai.score - 1) / 9 : null, ai ? `${ai.score}/10 (${ai.week}. hafta)` : 'Son 4 haftada değerlendirme yok', ai?.rationale));

    // Kaynak: projede planı olan kişilerden kapasite üstü olanların oranı (yakın dönem)
    const from = Math.max(1, ctx.statusMonth || 1);
    const months = [from, from + 1, from + 2].filter(m => m <= 12);
    const team = new Set<string>();
    const overTeam = new Set<string>();
    ws.allocations.forEach(a => {
        if (a.projectId !== project.id || a.year !== ctx.year) return;
        months.forEach(m => {
            if ((a.plan[m] || 0) <= 0) return;
            team.add(a.personId);
            if (ctx.overPeopleByMonth.get(m)?.has(a.personId)) overTeam.add(a.personId);
        });
    });
    out.push(factor('resource', team.size ? 1 - (overTeam.size / team.size) / 0.5 : null,
        team.size ? `${overTeam.size}/${team.size} kişi kapasite üstü` : 'Yakın dönemde tahsis yok'));

    // Yönetim beklentileri: kritik ya da süresi geçmiş açık beklentiler
    const blocking = (ws.expectations || []).filter(e => e.projectId === project.id && isActiveExpectation(e)
        && (e.urgency === 'critical' || (daysUntilNeed(e, ctx.now) ?? 0) < 0)).length;
    out.push(factor('expectations', 1 - 0.5 * blocking, blocking ? `${blocking} kritik / süresi geçmiş beklenti` : 'Bekleyen kritik karar yok'));

    return { factors: out, evm, highRisks, mediumRisks, overdue, overPeople: overTeam.size, blockingExpectations: blocking, pmScore: pm?.score, aiScore: ai?.score, commitment: kept?.ratio };
};

// ---------------------------------------------------------------- skor

const weightedMean = (factors: HealthFactor[]): { mean: number; coverage: number } => {
    const avail = factors.filter(f => f.value !== null);
    const coverage = avail.reduce((s, f) => s + f.weight, 0);
    const mean = coverage > 0 ? avail.reduce((s, f) => s + f.weight * (f.value as number), 0) / coverage : 1;
    return { mean, coverage };
};

const reasonFor = (f: HealthFactor, raw: RawInputs, project: Project): string => {
    switch (f.key) {
        case 'rag': return project.rag === 'red' ? 'Kritik RAG' : 'Riskli RAG';
        case 'spi': return (raw.evm.spi ?? 1) < 0.9 ? `Takvim gerisinde (SPI ${fmt(raw.evm.spi!)})` : `Takvim hafif geride (SPI ${fmt(raw.evm.spi!)})`;
        case 'cpi': return (raw.evm.cpi ?? 1) < 0.9 ? `Bütçe aşımı (CPI ${fmt(raw.evm.cpi!)})` : `Bütçe hafif aşımda (CPI ${fmt(raw.evm.cpi!)})`;
        case 'overdue': return `${raw.overdue} geciken görev`;
        case 'risk': return raw.highRisks ? `${raw.highRisks} yüksek risk` : `${raw.mediumRisks} orta risk`;
        case 'pm': return `PY puanı ${raw.pmScore}/10`;
        case 'ai': return `AI metin puanı ${raw.aiScore}/10`;
        case 'commitment': return `Söz tutma %${Math.round((raw.commitment ?? 0) * 100)}`;
        case 'resource': return `Ekipte ${raw.overPeople} kişi kapasite üstü`;
        case 'expectations': return `${raw.blockingExpectations} kritik yönetim beklentisi`;
    }
};

export const evaluateProjectHealth = (ws: WorkspaceData, project: Project, ctx: HealthContext): HealthEvaluation => {
    const raw = computeInputs(ws, project, ctx);
    const { mean, coverage } = weightedMean(raw.factors);
    const factors = raw.factors.map(f => ({
        ...f,
        points: f.value === null || coverage <= 0 ? 0 : round1((100 * f.weight * (1 - f.value)) / coverage),
    }));
    const score = Math.round(100 * mean);

    // Algı farkı: öznel (RAG, PY puanı) − nesnel metrikler
    const subj = factors.filter(f => SUBJECTIVE.includes(f.key) && f.value !== null);
    const obj = weightedMean(factors.filter(f => !NOT_OBJECTIVE.includes(f.key)));
    const perceptionGap = subj.length && obj.coverage >= MIN_OBJECTIVE_COVERAGE
        ? round2(subj.reduce((s, f) => s + (f.value as number), 0) / subj.length - obj.mean)
        : null;

    const reasons = factors
        .filter(f => f.value !== null && f.value < 0.9)
        .sort((a, b) => b.points - a.points)
        .map(f => reasonFor(f, raw, project));
    if (perceptionGap !== null && perceptionGap >= PERCEPTION_GAP_ALERT) reasons.push('Algı farkı: PY değerlendirmesi verilerden belirgin iyimser');

    return {
        score,
        band: bandOf(score),
        coverage: round2(coverage),
        confidence: confidenceOf(coverage),
        factors,
        reasons,
        evm: raw.evm,
        highRisks: raw.highRisks,
        pmScore: raw.pmScore,
        perceptionGap,
    };
};

// ---------------------------------------------------------------- PMO puanı

/** PMO puanı verebilir mi (varsayılan PYB sorumlusu ve PYB destek; admin değiştirebilir) */
export const isPmoRole = (who: UserRole | PermissionHolder | undefined): boolean => canFor(who, 'health.rate');

export const validScore = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10;

export const pmoRatingFor = (ratings: PmoRating[] | undefined, projectId: string, year: number, week: number): PmoRating | undefined =>
    (ratings || []).find(r => r.projectId === projectId && r.year === year && r.week === week);

/**
 * PMO puanını kaydeder ya da (score = null) kaldırır. Proje × hafta başına tek
 * kayıt; son yazan kalır. Yetkisiz rol ya da geçersiz puanda null döner.
 */
export const setPmoRating = (
    ratings: PmoRating[] | undefined,
    actor: PermissionHolder & { personId?: string; name?: string },
    input: { projectId: string; year: number; week: number; score: number | null; note?: string },
    now: Date = new Date(),
): PmoRating[] | null => {
    if (!isPmoRole(actor)) return null;
    if (input.score !== null && !validScore(input.score)) return null;
    const rest = (ratings || []).filter(r => !(r.projectId === input.projectId && r.year === input.year && r.week === input.week));
    if (input.score === null) return rest;
    const prev = pmoRatingFor(ratings, input.projectId, input.year, input.week);
    const note = input.note?.trim();
    return [...rest, {
        id: prev?.id || `pmo-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        projectId: input.projectId,
        year: input.year,
        week: input.week,
        score: input.score,
        ...(note ? { note } : {}),
        byRole: actor.role,
        byPersonId: actor.personId,
        byName: actor.name,
        at: now.toISOString(),
    }];
};

// ---------------------------------------------------------------- haftalık fotoğraf

export const buildHealthSnapshot = (ws: WorkspaceData, now: Date = new Date()): HealthWeekSnapshot => {
    const year = now.getFullYear();
    const ctx = buildHealthContext(ws, year, defaultStatusMonth(year, now), now);
    const wk = isoWeekOf(now);
    const projects: HealthSnapshotEntry[] = ws.projects.filter(p => p.status === 'devam').map(p => {
        const h = evaluateProjectHealth(ws, p, ctx);
        const x: HealthSnapshotEntry['x'] = {};
        h.factors.forEach(f => { if (f.value !== null) x[f.key] = f.value; });
        return { projectId: p.id, score: h.score, coverage: h.coverage, x };
    });
    return { year: wk.year, week: wk.week, takenAt: now.toISOString(), model: HEALTH_MODEL_VERSION, projects };
};

const sameDay = (iso: string, now: Date): boolean => {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

/**
 * Açılışta çağrılır: bu ISO haftasının sağlık fotoğrafı yoksa alır, varsa
 * günde en çok bir kez tazeler (fotoğraf haftanın son durumunu taşısın).
 * Aktif proje yoksa ya da bugün zaten alındıysa null döner.
 */
export const ensureWeeklyHealthSnapshot = (ws: WorkspaceData, now: Date = new Date()): WorkspaceData | null => {
    if (!ws.projects.some(p => p.status === 'devam')) return null;
    const wk = isoWeekOf(now);
    const history = ws.healthHistory || [];
    const existing = history.find(s => s.year === wk.year && s.week === wk.week);
    if (existing && sameDay(existing.takenAt, now)) return null;
    const snap = buildHealthSnapshot(ws, now);
    const next = [...history.filter(s => s !== existing), snap]
        .sort((a, b) => a.year - b.year || a.week - b.week)
        .slice(-MAX_HISTORY_WEEKS);
    return { ...ws, healthHistory: next };
};

// ---------------------------------------------------------------- kalibrasyon durumu

export interface CalibrationStatus {
    weeks: number; // alınmış haftalık fotoğraf
    ratings: number; // PMO puanı
    labeled: number; // fotoğrafla eşleşen PMO puanı (eğitim gözlemi)
    labeledProjects: number;
    needed: number; // regresyon için gereken etiketli gözlem
    mae: number | null; // |skor/10 − PMO puanı| ortalaması (10'luk ölçek)
    correlation: number | null; // Pearson r (en az 5 gözlem)
}

const pearson = (xs: number[], ys: number[]): number | null => {
    const n = xs.length;
    if (n < 5) return null;
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
        sxy += (xs[i] - mx) * (ys[i] - my);
        sxx += (xs[i] - mx) ** 2;
        syy += (ys[i] - my) ** 2;
    }
    return sxx > 0 && syy > 0 ? round2(sxy / Math.sqrt(sxx * syy)) : null;
};

/** Eğitim verisi: PMO puanı (Y) ile aynı haftanın fotoğrafındaki skor/girdiler (X) */
export const calibrationStatus = (ws: Pick<WorkspaceData, 'healthHistory' | 'pmoRatings'>): CalibrationStatus => {
    const history = ws.healthHistory || [];
    const ratings = ws.pmoRatings || [];
    const model: number[] = [];
    const pmo: number[] = [];
    const projects = new Set<string>();
    ratings.forEach(r => {
        const entry = history.find(s => s.year === r.year && s.week === r.week)?.projects.find(e => e.projectId === r.projectId);
        if (!entry) return;
        model.push(entry.score / 10);
        pmo.push(r.score);
        projects.add(r.projectId);
    });
    return {
        weeks: history.length,
        ratings: ratings.length,
        labeled: model.length,
        labeledProjects: projects.size,
        needed: MIN_LABELED_OBSERVATIONS,
        mae: model.length ? round1(model.reduce((s, v, i) => s + Math.abs(v - pmo[i]), 0) / model.length) : null,
        correlation: pearson(model, pmo),
    };
};
