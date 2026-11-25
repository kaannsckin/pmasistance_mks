import { Leave, Person, Project, ReleasePlan, Task, TaskStatus } from '../../types';
import { buildSprintWindows, SprintWindow } from '../taskToAllocation';
import { lastSprintOf, MAX_SPRINT_SPAN, requestedSprintSpan, sprintSpanOf } from '../sprintSpan';
import { capacityModel, EffortInput, remainingEffort, UNASSIGNED } from './capacity';
import { buildPlanBoard, milestoneOfTask, orderedMilestones, PlanBoard, planTasks, sprintWindowsUntil } from './planBoard';

/**
 * Sürüm planı optimizasyonu (sprint × kişi çizelgeleme).
 *
 * Amaç, sırasıyla:
 *   1. Kilometre taşlarını hedef tarihlerine yetiştirmek (toplam gecikmeyi en aza indirmek)
 *   2. Kişi kapasitesini aşmamak (hedef doluluk tamponuyla)
 *   3. Sürümü olabildiğince erken bitirmek
 *   4. Planı gereksiz yere değiştirmemek (kararlı kip)
 *
 * Yöntem: kaynak kısıtlı liste çizelgeleme (resource-constrained list scheduling).
 * Görevler öncül bağımlılıklarına göre hazır oldukça öncelik anahtarıyla seçilir:
 *   kilometre taşı sırası → Blocker → kritik zincir (görev + en uzun ardıl zinciri eforu)
 *   → öncelik → termin → plan sırası
 * ve her görev, öncülü bittikten sonra kapasitesi yeten en erken sprinte (gerekirse
 * aynı birimde boş olan başka kişiye ya da ardışık sprintlere bölünerek) yerleşir.
 * Sezgisel bir yöntemdir: en iyi çözümü garanti etmez, açıklanabilir ve hızlıdır;
 * sonuç önce/sonra metrikleriyle ve gerekçeleriyle gösterilir.
 *
 * Varsayımlar (arayüzde ve asistan yanıtında açıkça söylenir):
 *  - Sprint çözünürlüğü: öncül bittiği sprintten SONRAKİ sprintte ardıl başlar (bitiş-başlangıç).
 *  - Sürmekte olan sprintte yalnız kalan iş günleri sayılır.
 *  - Devam eden işler yerinde kalır (iş başlamış; kişiyi ya da sprinti değiştirmek önerilmez).
 *  - Sürüm dışı açık işler kapasiteden önce düşülür; biten sprintte kalmış sürüm dışı işler sayılmaz (uyarılır).
 */

export interface OptimizeOptions {
    /** stable: mevcut yeri uygunsa korur (yalnız gerekeni değiştirir); fresh: bütün açık işleri yeniden dağıtır */
    mode: 'stable' | 'fresh';
    /** Hedef doluluk (0,5–1): kapasitenin bu kadarı planlanır, kalanı tampon */
    targetLoad: number;
    /** Sprint kapasitesini aşan işi ardışık sprintlere böl (en çok 4) */
    split: boolean;
    /** Aynı birimde, daha erken bitirebilecek başka kişiye ata (atanmamış işlere de kişi önerir) */
    reassign: boolean;
    /** Başlamış işte Jira kalan süresini kullan */
    useRemaining: boolean;
    /** Görev başına geçmiş sapma çarpanı (yalnız başlamamış işe) */
    calibrate?: (t: Task) => number | undefined;
    people?: Person[];
    leaves?: Leave[];
    now?: Date;
}

export const DEFAULT_OPTIONS: OptimizeOptions = { mode: 'stable', targetLoad: 0.85, split: true, reassign: false, useRemaining: true };

/** Bir görevde önerilen değişiklik (yalnız değişen alanlar dolu) */
export interface PlanChange {
    taskId: string;
    from: number;
    to: number;
    fromSpan?: number;
    toSpan?: number;
    fromResource?: string;
    toResource?: string;
    /** Kısa gerekçe: "kapasite", "öncül", "kişi değişikliği: 1 sprint erken", "bölündü" */
    reason?: string;
}

export interface OptimizeWarning {
    taskId?: string;
    kind: 'oversized' | 'unassigned' | 'horizon' | 'late' | 'stale-outside' | 'velocity';
    message: string;
}

export interface PlanMetrics {
    lateMilestones: number;
    /** Hedefi kaçan taşların toplam gecikmesi (takvim günü) */
    latenessDays: number;
    /** Kapasitesi aşılan kişi × sprint sayısı (tampon hariç, tam kapasiteye göre) */
    overloads: number;
    unplanned: number;
    /** Sürümün tahmini bitişi (son görevin sprint sonu) */
    endDate?: string;
    milestones: { id: string; name: string; target?: string; forecast?: string; status: string }[];
}

/** Plan ile geçmiş hızın karşılaştırması: kâğıt üstü kapasite gerçekleşenden çok yüksekse plan tutmaz */
export interface VelocityCheck {
    /** Son biten sprintlerde ekibin bitirdiği efor (gün/sprint) */
    perSprint: number;
    sprints: number;
    /** Ekibin tam sprint kapasitesi (gün, tampon öncesi) */
    teamCapacity: number;
    /** Planın varsaydığı (kapasite × hedef doluluk) */
    planned: number;
    /** Hıza uyan hedef doluluk (yalnız plan hızı belirgin aşıyorsa) */
    recommendedLoad?: number;
}

/** Hız kontrolü için en az bu kadar biten sprint; plan hızı bu oranı aşarsa uyarılır */
export const VELOCITY_MIN_SPRINTS = 2;
export const VELOCITY_TOLERANCE = 1.25;

export interface OptimizeResult {
    velocity?: VelocityCheck;
    options: OptimizeOptions;
    changes: PlanChange[];
    warnings: OptimizeWarning[];
    before: PlanMetrics;
    after: PlanMetrics;
    preview: PlanBoard;
    /** Değişiklikler uygulanmış proje (önizleme ve senaryolar için) */
    project: Project;
}

const DAY = 86_400_000;
const HORIZON = 104;
const EPS = 1e-6;
const PRIORITY_RANK: Record<Task['priority'], number> = { Blocker: 0, High: 1, Medium: 2, Low: 3 };
const isOpen = (t: Task) => t.status !== TaskStatus.Done;
const r1 = (n: number) => Math.round(n * 10) / 10;
const tr = (n: number) => r1(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const keyOf = (t: Task) => t.jiraId || t.name;

/** Değişiklikleri görevlere uygular (değişmeyen görev aynı nesne kalır) */
export const applyPlanChanges = (project: Project, changes: PlanChange[], now?: Date): Project => {
    if (!changes.length) return project;
    const by = new Map(changes.map(c => [c.taskId, c]));
    const stamp = now?.toISOString();
    const unitOf = new Map(project.resources.map(r => [r.name, r.unit]));
    return {
        ...project,
        tasks: project.tasks.map(t => {
            const c = by.get(t.id);
            if (!c) return t;
            const next: Task = {
                ...t,
                version: c.to,
                includeInSprints: true,
                ...(c.toSpan !== undefined ? { sprintSpan: c.toSpan > 1 ? c.toSpan : undefined } : {}),
                ...(c.toResource !== undefined ? { resourceName: c.toResource, unit: unitOf.get(c.toResource) || t.unit } : {}),
                ...(stamp ? { updatedAt: stamp } : {}),
            };
            if (next.sprintSpan === undefined) delete next.sprintSpan;
            return next;
        }),
    };
};

/** Planın metrikleri (pano üzerinden; optimizasyon öncesi ve sonrası aynı hesap) */
export const planMetrics = (project: Project, plan: ReleasePlan, now: Date, people?: Person[], leaves?: Leave[]): PlanMetrics => {
    const board = buildPlanBoard(project, plan, now, { people, leaves });
    let lateness = 0;
    board.rows.forEach(r => {
        const target = r.milestone?.targetDate;
        if (r.status === 'late' && target && r.forecastEnd) lateness += Math.round((new Date(`${r.forecastEnd}T00:00:00`).getTime() - new Date(`${target}T00:00:00`).getTime()) / DAY);
    });
    const scope = planTasks(project, plan).filter(isOpen);
    const last = Math.max(0, ...scope.map(lastSprintOf));
    const end = last > 0 && !scope.some(t => !(t.version > 0)) ? buildSprintWindows(project, last).at(-1)?.end : undefined;
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
        lateMilestones: board.rows.filter(r => r.status === 'late').length,
        latenessDays: lateness,
        overloads: board.sprints.filter(s => !s.past).reduce((n, s) => n + s.overloaded.length, 0),
        unplanned: board.pool.length,
        ...(end ? { endDate: iso(end) } : {}),
        milestones: board.rows.filter(r => r.milestone).map(r => ({ id: r.milestone!.id, name: r.milestone!.name, target: r.milestone!.targetDate, forecast: r.forecastEnd, status: r.status })),
    };
};

export const optimizePlan = (project: Project, plan: ReleasePlan, input: Partial<OptimizeOptions> = {}): OptimizeResult => {
    const o: OptimizeOptions = { ...DEFAULT_OPTIONS, ...input };
    const now = o.now || new Date();
    const scope = planTasks(project, plan);
    const scopeIds = new Set(scope.map(t => t.id));
    const { current, windows: w0 } = sprintWindowsUntil(project, now, 1);
    const windows = buildSprintWindows(project, Math.max(w0.length, current + HORIZON + MAX_SPRINT_SPAN));
    const win = (v: number): SprintWindow => windows[v - 1];
    const cw = win(current);
    const fromToday = capacityModel({ project, people: o.people, leaves: o.leaves, targetLoad: o.targetLoad, fromDate: now });
    const whole = capacityModel({ project, people: o.people, leaves: o.leaves, targetLoad: o.targetLoad });
    const cap = (v: number, who: string) => (v === current ? fromToday : whole)(win(v), who).days;
    // Sürmekte olan sprintte kalan iş günü oranı (Jira kalanı olmayan devam eden işler için)
    const curFull = whole(cw, UNASSIGNED);
    const curLeft = fromToday(cw, UNASSIGNED);
    const remainingFraction = curFull.days > 0 ? curLeft.days / curFull.days : 1;
    const effortIn: EffortInput = { useRemaining: o.useRemaining, calibrate: o.calibrate, remainingFraction };
    const eff = (t: Task) => remainingEffort(t, effortIn);

    const warnings: OptimizeWarning[] = [];
    // Yerinde kalanlar: sürüm dışı açık işler, sürümde devam eden ve sprinti süren işler
    const keepInPlace = (t: Task) => t.status === TaskStatus.InProgress && (t.version || 0) > 0 && lastSprintOf(t) >= current;
    const movable = scope.filter(t => isOpen(t) && t.includeInSprints !== false && !keepInPlace(t));
    const movIds = new Set(movable.map(t => t.id));

    const usage = new Map<string, number>();
    const used = (v: number, who: string) => usage.get(`${v}|${who}`) || 0;
    const use = (v: number, who: string, d: number) => usage.set(`${v}|${who}`, used(v, who) + d);
    let staleOutside = 0;
    project.tasks.filter(t => isOpen(t) && !movIds.has(t.id) && t.includeInSprints !== false && (t.version || 0) > 0).forEach(t => {
        const last = lastSprintOf(t);
        if (last < current) { if (!scopeIds.has(t.id)) staleOutside++; return; }
        // Kalan efor, sprintin bugünden sonraki kısmına eşit bölünür
        const from = Math.max(t.version, current);
        const n = last - from + 1;
        for (let v = from; v <= last; v++) use(v, t.resourceName || UNASSIGNED, eff(t) / n);
    });
    if (staleOutside) warnings.push({ kind: 'stale-outside', message: `Sürüm dışında ${staleOutside} açık görev biten sprintlerde kalmış; kapasiteden düşülmedi. Gerçek yük daha yüksek olabilir.` });

    // Kişiler ve birimleri
    const unitOfRes = new Map<string, string>();
    project.resources.forEach(r => { if ((r.participation || 0) > 0) unitOfRes.set(r.name, r.unit || ''); });
    const sameUnit = (unit: string) => [...unitOfRes.entries()].filter(([, u]) => !unit || u === unit).map(([n]) => n);

    // Kritik zincir: görev + en uzun ardıl zinciri eforu (sürüm içinde)
    const succ = new Map<string, string[]>();
    movable.forEach(t => { if (t.predecessor && movIds.has(t.predecessor) && t.predecessor !== t.id) succ.set(t.predecessor, [...(succ.get(t.predecessor) || []), t.id]); });
    const byId = new Map(project.tasks.map(t => [t.id, t]));
    const chain = new Map<string, number>();
    const chainOf = (id: string, seen = new Set<string>()): number => {
        if (chain.has(id)) return chain.get(id)!;
        if (seen.has(id)) return 0;
        seen.add(id);
        const v = eff(byId.get(id)!) + Math.max(0, ...(succ.get(id) || []).map(s => chainOf(s, seen)));
        chain.set(id, v);
        return v;
    };
    movable.forEach(t => chainOf(t.id));
    const msRank = new Map(orderedMilestones(plan).map((m, i) => [m.id, i]));
    const rank = (t: Task) => msRank.get(milestoneOfTask(plan, t.id)?.id || '') ?? Number.MAX_SAFE_INTEGER;
    const order = new Map(scope.map((t, i) => [t.id, i]));
    const cmp = (a: Task, b: Task) => rank(a) - rank(b)
        || Number(b.priority === 'Blocker') - Number(a.priority === 'Blocker')
        || chain.get(b.id)! - chain.get(a.id)!
        || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
        || order.get(a.id)! - order.get(b.id)!;

    const placedEnd = new Map<string, number>();
    const result = new Map<string, { at: number; span: number; who: string; reason: string }>();

    const predMin = (t: Task): number => {
        const pred = t.predecessor && t.predecessor !== t.id ? byId.get(t.predecessor) : undefined;
        if (!pred || !isOpen(pred)) return current;
        const end = placedEnd.get(pred.id) ?? ((pred.version || 0) > 0 ? Math.max(lastSprintOf(pred), current) : current);
        return Math.max(current, end + 1);
    };
    const fitsAt = (s: number, who: string, span: number, share: number) => {
        for (let k = 0; k < span; k++) if (used(s + k, who) + share > cap(s + k, who) + EPS) return false;
        return true;
    };
    const firstFit = (from: number, who: string, span: number, share: number): number => {
        for (let s = from; s < current + HORIZON; s++) if (fitsAt(s, who, span, share)) return s;
        return 0;
    };
    /** Kişinin olağan (tam) sprint kapasitesi: önümüzdeki birkaç sprintin en büyüğü */
    const typicalCap = (who: string, from: number) => Math.max(0, ...Array.from({ length: 4 }, (_, k) => cap(from + 1 + k, who)));

    const place = (t: Task) => {
        const min = predMin(t);
        const effort = eff(t);
        const assigned = t.resourceName || UNASSIGNED;
        const unit = t.unit || unitOfRes.get(assigned) || '';
        const candidates = assigned === UNASSIGNED
            ? (o.reassign ? sameUnit(unit) : [])
            : [assigned, ...(o.reassign ? sameUnit(unit).filter(n => n !== assigned) : [])];
        if (!candidates.length) candidates.push(UNASSIGNED);
        type Option = { who: string; at: number; span: number; end: number };
        const options: Option[] = [];
        for (const who of candidates) {
            let span = requestedSprintSpan(t);
            const tc = typicalCap(who, min);
            if (o.split && tc > 0 && effort / span > tc + EPS) span = Math.min(MAX_SPRINT_SPAN, Math.ceil(effort / tc - EPS));
            const share = effort / span;
            // Kararlı kip: atanan kişide mevcut yeri hâlâ uygunsa korunur
            if (o.mode === 'stable' && who === assigned && (t.version || 0) >= min && span === sprintSpanOf(t) && fitsAt(t.version, who, span, share)) {
                options.push({ who, at: t.version, span, end: t.version + span - 1 });
                continue;
            }
            const at = firstFit(min, who, span, share);
            if (at) options.push({ who, at, span, end: at + span - 1 });
        }
        let pick: Option | undefined;
        let reason = '';
        if (options.length) {
            const own = options.find(x => x.who === assigned);
            const best = [...options].sort((a, b) => a.end - b.end || used(a.at, a.who) - used(b.at, b.who))[0];
            // Kişi değişikliği ancak en az bir sprint kazandırıyorsa (gereksiz el değiştirme yok)
            pick = own && (best.who === own.who || own.end <= best.end) ? own : best;
            if (pick.who !== assigned) reason = assigned === UNASSIGNED ? 'kişi önerildi' : `kişi değişikliği: ${own ? `${own.end - pick.end} sprint erken` : 'atanan kişide yer yok'}`;
        } else {
            // Hiçbir yere sığmıyor: atanan kişinin boş olduğu ilk sprinte taşma uyarısıyla
            const who = candidates[0];
            const span = requestedSprintSpan(t);
            let at = 0;
            for (let s = min; s < current + HORIZON && !at; s++) if (Array.from({ length: span }, (_, k) => used(s + k, who)).every(x => x === 0)) at = s;
            if (at) warnings.push({ taskId: t.id, kind: 'oversized', message: `${keyOf(t)}: ${tr(effort / span)} gün/sprint, ${who} kapasitesini (${tr(cap(at, who))} gün) aşıyor; Sprint ${at}'e taşarak kondu.${o.split ? '' : ' "Büyük işleri böl" açılabilir.'}` });
            else { at = min; warnings.push({ taskId: t.id, kind: 'horizon', message: `${keyOf(t)}: ${HORIZON} sprint içinde yer bulunamadı.` }); }
            pick = { who, at, span, end: at + span - 1 };
        }
        if (pick.who === UNASSIGNED && effort > 0) warnings.push({ taskId: t.id, kind: 'unassigned', message: `${keyOf(t)}: sorumlusu yok; tek kişilik kapasiteyle planlandı. "Kişi değişikliğine izin ver" ile aynı birimden kişi önerilir.` });
        const share = effort / pick.span;
        for (let k = 0; k < pick.span; k++) use(pick.at + k, pick.who, share);
        placedEnd.set(t.id, pick.end);
        if (pick.span !== sprintSpanOf(t) && pick.span > requestedSprintSpan(t)) reason = [reason, `${pick.span} sprinte bölündü`].filter(Boolean).join(', ');
        result.set(t.id, { at: pick.at, span: pick.span, who: pick.who, reason });
    };

    // Öncül sırasına uyan, öncelik anahtarıyla seçilen liste çizelgeleme (Kahn)
    const waiting = new Map(movable.map(t => [t.id, t.predecessor && movIds.has(t.predecessor) && t.predecessor !== t.id ? 1 : 0]));
    const ready = movable.filter(t => !waiting.get(t.id)).sort(cmp);
    const done = new Set<string>();
    while (ready.length) {
        const t = ready.shift()!;
        place(t);
        done.add(t.id);
        const next = (succ.get(t.id) || []).map(id => byId.get(id)!).filter(s => !done.has(s.id));
        if (next.length) { next.forEach(s => waiting.set(s.id, 0)); ready.push(...next); ready.sort(cmp); }
    }
    // Öncül döngüsü: kalanlar sırayla
    movable.filter(t => !done.has(t.id)).sort(cmp).forEach(t => { place(t); done.add(t.id); });

    const changes: PlanChange[] = movable.flatMap(t => {
        const r = result.get(t.id)!;
        const fromSpan = sprintSpanOf(t), toSpan = r.span;
        const fromWho = t.resourceName || '', toWho = r.who === UNASSIGNED ? '' : r.who;
        const moved = (t.version || 0) !== r.at, spanChanged = (t.version > 0 ? fromSpan : requestedSprintSpan(t)) !== toSpan, whoChanged = fromWho !== toWho;
        if (!moved && !spanChanged && !whoChanged) return [];
        const minP = predMin(t);
        return [{
            taskId: t.id, from: t.version || 0, to: r.at,
            ...(spanChanged ? { fromSpan: t.version > 0 ? fromSpan : requestedSprintSpan(t), toSpan } : {}),
            ...(whoChanged ? { fromResource: fromWho, toResource: toWho } : {}),
            reason: r.reason || (t.version > 0 && t.version < current ? 'devir: biten sprintte kalmıştı'
                : !(t.version > 0) ? 'planlanmamıştı'
                    : r.at > (t.version || 0) ? (minP > t.version ? 'öncül bitmeden başlayamaz' : 'kapasite') : 'boşalan kapasiteye öne alındı'),
        }];
    });
    const next = applyPlanChanges(project, changes);
    const before = planMetrics(project, plan, now, o.people, o.leaves);
    const after = planMetrics(next, plan, now, o.people, o.leaves);
    const preview = buildPlanBoard(next, plan, now, { people: o.people, leaves: o.leaves });
    preview.rows.filter(r => r.status === 'late').forEach(r => warnings.push({ kind: 'late', message: `${r.milestone?.name || 'Taşsız işler'}: ${r.note.toLocaleLowerCase('tr-TR')} (tahmini bitiş ${r.forecastEnd}).` }));
    // Hız kontrolü: ekip son sprintlerde planın varsaydığından belirgin az iş bitirdiyse
    let velocity: VelocityCheck | undefined;
    const v = preview.velocity;
    const ref = win(current + 1);
    const teamCapacity = r1([...unitOfRes.keys()].reduce((sum, n) => sum + whole(ref, n).full, 0));
    if (v.sprints >= VELOCITY_MIN_SPRINTS && v.perSprint > 0 && teamCapacity > 0) {
        const planned = r1(teamCapacity * o.targetLoad);
        velocity = { perSprint: v.perSprint, sprints: v.sprints, teamCapacity, planned };
        if (planned > v.perSprint * VELOCITY_TOLERANCE) {
            const rec = Math.max(0.3, Math.min(1, Math.round((v.perSprint / teamCapacity) * 20) / 20));
            velocity.recommendedLoad = rec;
            warnings.unshift({ kind: 'velocity', message: `Plan sprint başına ~${tr(planned)} gün iş varsayıyor; ekip son ${v.sprints} sprintte ortalama ${tr(v.perSprint)} gün bitirdi. Tarihler iyimser olabilir: hedef doluluğu %${Math.round(rec * 100)} yapmayı düşünün (destek, toplantı, tahmin sapması).` });
        }
    }
    return { options: o, changes, warnings, before, after, preview, project: next, ...(velocity ? { velocity } : {}) };
};

// ------------------------------------------------------------------ kurtarma senaryoları

export interface Scenario {
    id: string;
    label: string;
    /** Ne değişir, bedeli ne */
    detail: string;
    result: OptimizeResult;
    /** Kapsam daraltma: taştan çıkarılacak görevler */
    descope?: { milestoneId: string; taskIds: string[] };
    /** Hedef tarihi güncelleme önerisi */
    retarget?: { milestoneId: string; date: string };
}

const lateOf = (m: PlanMetrics) => m.milestones.filter(x => x.status === 'late');

/** Kapsam daraltma için taştan çıkarılmış plan (görevler taşsız kalır ve en sona sıralanır) */
export const withoutFromMilestone = (plan: ReleasePlan, milestoneId: string, taskIds: string[]): ReleasePlan => {
    const items = new Set(plan.items.filter(i => i.sourceTaskId && taskIds.includes(i.sourceTaskId)).map(i => i.id));
    return { ...plan, milestones: plan.milestones.map(m => (m.id === milestoneId ? { ...m, itemIds: m.itemIds.filter(x => !items.has(x)) } : m)) };
};

/**
 * Geciken taşlar için seçenekler: her biri ayrı bir optimizasyonla hesaplanır ve
 * gerçekten işe yarayanlar (gecikmeyi azaltanlar) döner. Kapsam daraltmada taşın
 * en düşük öncelikli, sonra en büyük işleri tek tek çıkarılır; hedef tutunca durulur.
 */
export const rescueScenarios = (project: Project, plan: ReleasePlan, base: OptimizeResult, maxDescope = 8): Scenario[] => {
    const late = lateOf(base.after);
    if (!late.length) return [];
    const o = base.options;
    const out: Scenario[] = [];
    const better = (r: OptimizeResult) => r.after.latenessDays < base.after.latenessDays || r.after.lateMilestones < base.after.lateMilestones;
    const tryOpt = (id: string, label: string, detail: string, patch: Partial<OptimizeOptions>) => {
        const r = optimizePlan(project, plan, { ...o, ...patch });
        if (better(r)) out.push({ id, label, detail, result: r });
    };
    if (!o.reassign) tryOpt('reassign', 'Aynı birimde iş dağılımı', 'Boş kapasitesi olan aynı birim çalışanlarına iş verilir; kişi değişikliği gerekir.', { reassign: true });
    if (!o.split) tryOpt('split', 'Büyük işleri böl', 'Sprinte sığmayan işler ardışık sprintlere yayılır.', { split: true });
    if (o.targetLoad < 1) tryOpt('full', 'Tamponsuz çalış (%100 doluluk)', 'Tampon kalkar; aksama olursa gecikme riski artar.', { targetLoad: 1 });
    if (!o.reassign || !o.split || o.targetLoad < 1) tryOpt('all', 'Hepsi birlikte', 'Kişi değişikliği, bölme ve %100 doluluk birlikte.', { reassign: true, split: true, targetLoad: 1 });
    if (o.mode === 'stable') tryOpt('fresh', 'Baştan dağıt', 'Mevcut yerleşimler korunmaz; daha çok görev yer değiştirir.', { mode: 'fresh' });

    // Kapsam daraltma: geciken her taş için, mevcut seçeneklerle
    for (const m of late) {
        const tasks = planTasks(project, plan).filter(t => isOpen(t) && milestoneOfTask(plan, t.id)?.id === m.id && !(t.status === TaskStatus.InProgress));
        const candidates = [...tasks].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || remainingEffort(b) - remainingEffort(a));
        const removed: string[] = [];
        let found: OptimizeResult | undefined;
        for (const t of candidates.slice(0, maxDescope)) {
            if (t.priority === 'Blocker') break;
            removed.push(t.id);
            const reduced = withoutFromMilestone(plan, m.id, removed);
            const r = optimizePlan(project, reduced, o);
            const row = r.after.milestones.find(x => x.id === m.id);
            if (row && row.status !== 'late') { found = r; break; }
        }
        if (found) {
            const names = removed.map(id => keyOf(byIdOf(project, id))).join(', ');
            out.push({ id: `descope-${m.id}`, label: `${m.name}: kapsamı daralt (${removed.length} görev)`, detail: `${names} taştan çıkarılır (sürümde kalır, taş sonrasına planlanır).`, result: found, descope: { milestoneId: m.id, taskIds: removed } });
        }
        if (m.forecast) out.push({ id: `retarget-${m.id}`, label: `${m.name}: hedefi ${m.forecast} yap`, detail: `Plan değişmez; hedef tarih tahmini bitişe çekilir (${m.target} → ${m.forecast}).`, result: base, retarget: { milestoneId: m.id, date: m.forecast } });
    }
    return out;
};

const byIdOf = (project: Project, id: string): Task => project.tasks.find(t => t.id === id)!;

/** Kısa özet (asistan ve önizleme başlığı) */
export const describeMetrics = (m: PlanMetrics): string => [
    m.lateMilestones ? `${m.lateMilestones} taş gecikiyor (toplam ${m.latenessDays} gün)` : 'tüm taşlar hedefe yetişiyor',
    m.overloads ? `${m.overloads} kişi-sprint kapasite aşımı` : 'kapasite aşımı yok',
    m.unplanned ? `${m.unplanned} görev planlanmamış` : '',
    m.endDate ? `sürüm bitişi ${m.endDate}` : '',
].filter(Boolean).join(' · ');

