import { Allocation, IssueType, PlanRules, Project, RagStatus, Resource, RiskLevel, RiskStatus, Task, TaskStatus, WorkspaceData } from '../../types';
import { createAllocation, getPlanLockStatus, inferAllocationRole, personMonthTotal, setAllocationCell } from '../allocations';
import { linkedSyncKeys, sourceLabel, sourceOf } from '../planning/jiraSync';
import { fieldPolicy, hasFieldPolicy, JIRA_SYNC_FIELDS } from '../planning/jiraFieldSync';
import { stampLifecycle } from '../planning/lifecycle';
import { appendAudit } from '../audit';
import { canEditActualCell, canEditPlanCell, canEditProjectContent, identityOf } from '../rbac';
import { markConverted, REQUEST_STATUS_LABELS, taskDraftFromRequest } from '../customerRequests';
import { createNote } from '../notes';
import { createRisk, RISK_STATUS_LABELS, riskScore } from '../risks';
import { effectiveScheme, missingRequiredFields, allowedIssueTypes } from '../projectScheme';
import { initialStatus, resolveTransition, taskStatusLabel, taskWorkflow } from '../workflow';
import { projectRolesOf } from '../projectRoles';
import { applyTransition, conditionProblem, inputProblems, ruleFor, TransitionActor, TransitionEffect } from '../transitions';
import { MAX_BULK_DELETE, removeTasks } from '../taskDelete';
import { applyPlanChanges, PlanChange, withoutFromMilestone } from '../planning/planOptimizer';
import { MAX_SPRINT_SPAN } from '../sprintSpan';
import { applyPoolAction, describePoolAction, isPoolAction, PoolAction, validatePoolAction } from './poolActions';

/** Sprint adı (arayüzdeki taskMeta.sprintLabel ile aynı kural; iş mantığı arayüze bağımlı olmasın) */
const sprintLabel = (v: number, names?: Record<number, string>): string => (v === 0 ? 'Havuz' : names?.[v]?.trim() || `Sprint ${v}`);

/** Öneriyi uygulayan kişi (aktif kimlik) — geçiş koşulları için */
const actorOf = (ws: WorkspaceData): TransitionActor => {
    const id = identityOf(ws);
    const p = ws.people.find(x => x.id === id.personId);
    return { role: id.role, personId: id.personId, name: p ? `${p.firstName} ${p.lastName}`.trim() : undefined };
};

/**
 * AI'nın önerdiği veri değişiklikleri — ASLA kendiliğinden uygulanmaz.
 * Asistan bir öneri kartı üretir; kullanıcı "Uygula" derse burada yeniden
 * doğrulanır (yetki, plan kilidi, kaydın hâlâ var olması) ve uygulanır.
 * Her uygulama denetim günlüğüne 'ai.apply' olarak yazılır; App geri-al sunar.
 */

export type AiAction =
    // Veri havuzu (ünvan/maliyet, kişi, bölüm) — projeye bağlı değil; bkz. poolActions.ts
    | PoolAction
    | { type: 'risk_ekle'; projectId: string; title: string; description?: string; probability: RiskLevel; impact: RiskLevel; mitigation?: string; ownerPersonId?: string }
    | { type: 'gorev_ekle'; projectId: string; name: string; priority: Task['priority']; resourceName?: string; dueDate?: string; time?: { best: number; avg: number; worst: number }; notes?: string; issueType?: IssueType; labels?: string[] }
    /** status: hedef kategori; workflowKey verilirse belirli iş akışı durumu (ör. TESTING) — geçiş kuralları uygulanır */
    | { type: 'gorev_durumu'; projectId: string; taskId: string; status: TaskStatus; workflowKey?: string; comment?: string; hours?: number }
    | { type: 'rag_guncelle'; projectId: string; rag: RagStatus; ragNote?: string }
    | { type: 'tahsis_ayarla'; personId: string; projectId: string; year: number; month: number; field: 'plan' | 'actual'; value: number }
    // Ay aralığı (yıl geçebilir: 2026-12 → 2027-03); her ayın değeri aynı
    | { type: 'tahsis_araligi'; personId: string; projectId: string; from: string; to: string; field: 'plan' | 'actual'; value: number }
    // Jira eşitlemesi: onaylanınca proje ayarındaki alan seçimiyle çalışır (Jira'ya yazan alan varsa Jira'ya da yazar)
    | { type: 'jira_esitle'; projectId: string }
    | { type: 'risk_guncelle'; projectId: string; riskId: string; status?: RiskStatus; probability?: RiskLevel; impact?: RiskLevel; mitigation?: string; ownerPersonId?: string; reason?: string }
    // Kabul: istekten görev açılır ve istek "göreve dönüştü" olur; ret: "reddedildi". Gerekçe projenin günlüğüne not olarak düşer.
    | { type: 'istek_karari'; projectId: string; requestId: string; decision: 'kabul' | 'ret'; reason: string; day?: string; task?: { name?: string; priority: Task['priority']; resourceName?: string; dueDate?: string; time?: { best: number; avg: number; worst: number } } }
    | { type: 'not_ekle'; projectId: string; content: string; day?: string }
    // Bir projedeki görevlerin alanlarını toplu günceller (termin, atanan, öncelik, tahmin, etiket)
    | { type: 'gorev_guncelle'; projectId: string; changes: TaskFieldChange[] }
    // Görevleri siler; ardıllarının öncül bağı kaldırılır. Kullanıcı onayı ve geri al ile.
    | { type: 'gorev_sil'; projectId: string; taskIds: string[]; reason?: string }
    // Plan optimizasyonu sonucu: görevlerin sprinti, sprint sayısı ve (aynı birimde) kişisi; isteğe bağlı
    // kapsam daraltma (görevler taştan çıkar) ya da taş hedef tarihi. Değişiklikleri motor hesaplar, model yazmaz.
    | { type: 'plan_uygula'; projectId: string; planId: string; label: string; changes: PlanChange[]; descope?: { milestoneId: string; taskIds: string[] }; retarget?: { milestoneId: string; date: string } }
    // Darboğaz planı ve otomatik planın proje kuralları (hedef tarih, test ekibi, bulgu sorumlusu, odak, mesai); verilen alanlar değişir
    | { type: 'plan_kurallari'; projectId: string; rules: PlanRules };

/** Görev alanı değişikliği; verilmeyen alan değişmez. resourceName '' → atama kaldırılır, dueDate '' → termin silinir */
export interface TaskFieldChange {
    taskId: string;
    dueDate?: string;
    resourceName?: string;
    priority?: Task['priority'];
    time?: { best: number; avg: number; worst: number };
    addLabels?: string[];
    removeLabels?: string[];
    /** Elle girilen ilerleme (0–100); null → kaldırılır (durumdan otomatik) */
    progressPct?: number | null;
    /** Ekip tahmini (serbest metin); '' → kaldırılır */
    estimateText?: string;
    /** Başladığı sprint (0 = Havuz) */
    version?: number;
    /** Sürdüğü sprint sayısı (1–4) */
    sprintSpan?: number;
    /** Süre değişikliğinin kaynağı (varsayılan 'ai'; dışarıdan aktarılan plan 'import') */
    estimateSource?: Task['estimateSource'];
}

/** Tek öneride en çok bu kadar görev */
export const MAX_TASK_CHANGES = 100;
const PRIORITIES: Task['priority'][] = ['Blocker', 'High', 'Medium', 'Low'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const fmtDay = (d?: string): string => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('tr-TR') === b.trim().toLocaleLowerCase('tr-TR');

/** Görevde gerçekten değişen alanların açıklaması (kart ve "değişen yok" denetimi) */
const taskChangeParts = (t: Task, c: TaskFieldChange): string[] => {
    const out: string[] = [];
    if (c.dueDate !== undefined && c.dueDate !== (t.dueDate || '')) out.push(`termin: ${fmtDay(t.dueDate)} → ${fmtDay(c.dueDate || undefined)}`);
    if (c.resourceName !== undefined && !sameName(c.resourceName, t.resourceName || '')) out.push(`atanan: ${t.resourceName || '—'} → ${c.resourceName || '—'}`);
    if (c.priority && c.priority !== t.priority) out.push(`öncelik: ${t.priority} → ${c.priority}`);
    if (c.time && (c.time.best !== t.time.best || c.time.avg !== t.time.avg || c.time.worst !== t.time.worst)) out.push(`süre: ${t.time.best}/${t.time.avg}/${t.time.worst} → ${c.time.best}/${c.time.avg}/${c.time.worst} gün`);
    const labels = t.labels || [];
    const add = (c.addLabels || []).filter(l => !labels.includes(l));
    const rm = (c.removeLabels || []).filter(l => labels.includes(l));
    if (add.length) out.push(`etiket +${add.join(', +')}`);
    if (rm.length) out.push(`etiket −${rm.join(', −')}`);
    if (c.progressPct !== undefined && (c.progressPct ?? undefined) !== t.progressPct) out.push(`ilerleme: ${t.progressPct !== undefined ? `%${t.progressPct}` : 'otomatik'} → ${c.progressPct === null ? 'otomatik' : `%${c.progressPct}`}`);
    if (c.estimateText !== undefined && c.estimateText !== (t.estimateText || '')) out.push(`ekip tahmini: ${t.estimateText || '—'} → ${c.estimateText || '—'}`);
    if (c.version !== undefined && c.version !== (t.version || 0)) out.push(`sprint: ${t.version || 'Havuz'} → ${c.version || 'Havuz'}`);
    if (c.sprintSpan !== undefined && c.sprintSpan !== (t.sprintSpan || 1)) out.push(`sprint sayısı: ${t.sprintSpan || 1} → ${c.sprintSpan}`);
    return out;
};

export type ProposalStatus = 'pending' | 'running' | 'applied' | 'rejected' | 'failed';

export interface AiProposal {
    id: string;
    action: AiAction;
    title: string;
    details: { label: string; value: string }[];
    status: ProposalStatus;
    message?: string;
}

const TASK_STATUS_TR: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'Backlog', [TaskStatus.ToDo]: 'Yapılacak', [TaskStatus.InProgress]: 'Devam Ediyor', [TaskStatus.Done]: 'Tamamlandı',
};
const RAG_TR: Record<RagStatus, string> = { green: 'Yolunda', amber: 'Riskli', red: 'Kritik' };
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const fullName = (ws: WorkspaceData, personId?: string): string | undefined => {
    const p = personId ? ws.people.find(x => x.id === personId) : undefined;
    return p ? `${p.firstName} ${p.lastName}`.trim() : undefined;
};

const projectOf = (ws: WorkspaceData, id: string): Project | undefined => ws.projects.find(p => p.id === id);

/** Bu tahsis için kullanılacak satır: aynı kişi+proje+yıl, tercihen iş paketsiz/rolsüz satır */
export const findAllocationRow = (ws: WorkspaceData, personId: string, projectId: string, year: number): Allocation | undefined => {
    const rows = ws.allocations.filter(a => a.personId === personId && a.projectId === projectId && a.year === year);
    return rows.find(a => !a.workPackageId && !a.role) || rows[0];
};

/** Aralık tahsisi en çok bu kadar ay */
export const MAX_RANGE_MONTHS = 24;
const YM_RE = /^(\d{4})-(\d{2})$/;

/** "2026-12" → "2027-03" arası aylar (dahil); geçersizse null */
export const monthsBetween = (from: string, to: string): { year: number; month: number }[] | null => {
    const a = YM_RE.exec(from), b = YM_RE.exec(to);
    if (!a || !b) return null;
    let y = +a[1], m = +a[2];
    const ey = +b[1], em = +b[2];
    if (m < 1 || m > 12 || em < 1 || em > 12 || y < 2000 || ey > 2100) return null;
    const out: { year: number; month: number }[] = [];
    while (y < ey || (y === ey && m <= em)) {
        out.push({ year: y, month: m });
        if (out.length > MAX_RANGE_MONTHS) return out;
        m++; if (m > 12) { m = 1; y++; }
    }
    return out;
};

const tahsisBlock = (ws: WorkspaceData, project: Project, personId: string, field: 'plan' | 'actual', year: number): string | null => {
    const id = identityOf(ws);
    if (field === 'plan') {
        if (!canEditPlanCell(ws, id, ws.planLocks, project.id, personId, year)) {
            return getPlanLockStatus(ws.planLocks, project.id, year) !== 'draft'
                ? `${project.name} · ${year} planı onayda/kilitli; plan değiştirilemez (gerçekleşen girilebilir).`
                : 'Bu kişinin bu projedeki planını düzenleme yetkiniz yok.';
        }
    } else if (!canEditActualCell(ws, id, project.id, personId)) {
        return 'Bu kişinin bu projedeki gerçekleşenini girme yetkiniz yok.';
    }
    return null;
};

const fmtAA = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const monthLabel = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;

/** Uygulamadan önce (ve öneri anında) doğrulama — sorun varsa Türkçe açıklama, yoksa null */
export const validateAction = (ws: WorkspaceData, action: AiAction): string | null => {
    if (isPoolAction(action)) return validatePoolAction(ws, action);
    const id = identityOf(ws);
    const project = projectOf(ws, action.projectId);
    if (!project) return 'Proje bulunamadı (silinmiş olabilir).';

    if (action.type === 'tahsis_araligi') {
        if (!ws.people.some(p => p.id === action.personId)) return 'Kişi veri havuzunda bulunamadı.';
        const months = monthsBetween(action.from, action.to);
        if (!months || !months.length) return 'Ay aralığı YYYY-AA biçiminde ve başlangıç bitişten önce olmalı.';
        if (months.length > MAX_RANGE_MONTHS) return `Aralık en çok ${MAX_RANGE_MONTHS} ay olabilir.`;
        if (!Number.isFinite(action.value) || action.value < 0 || action.value > 1.5) return 'Adam-ay değeri 0 ile 1,5 (%0–%150) arasında olmalı.';
        for (const y of [...new Set(months.map(x => x.year))]) {
            const b = tahsisBlock(ws, project, action.personId, action.field, y);
            if (b) return b;
        }
        return null;
    }

    if (action.type === 'jira_esitle') {
        if (!canEditProjectContent(ws, id, action.projectId)) return `"${project.name}" projesinde Jira eşitlemesi yalnız projenin PY'si tarafından yapılır.`;
        if (!linkedSyncKeys(project.tasks, project.jiraSync).length && !(project.jiraSync?.discover && sourceOf(project.jiraSync))) {
            return `"${project.name}" projesinde Jira anahtarlı kayıt ya da eşitleme kaynağı yok (Planlama › Jira eşitleme).`;
        }
        return null;
    }

    if (action.type === 'tahsis_ayarla') {
        if (!ws.people.some(p => p.id === action.personId)) return 'Kişi veri havuzunda bulunamadı.';
        if (!Number.isInteger(action.month) || action.month < 1 || action.month > 12) return 'Ay 1-12 arasında olmalı.';
        if (!Number.isInteger(action.year) || action.year < 2000 || action.year > 2100) return 'Geçersiz yıl.';
        if (!Number.isFinite(action.value) || action.value < 0 || action.value > 1.5) return 'Adam-ay değeri 0 ile 1,5 arasında olmalı.';
        if (action.field === 'plan') {
            if (!canEditPlanCell(ws, id, ws.planLocks, action.projectId, action.personId, action.year)) {
                return getPlanLockStatus(ws.planLocks, action.projectId, action.year) !== 'draft'
                    ? `${project.name} · ${action.year} planı onayda/kilitli; plan değiştirilemez (gerçekleşen girilebilir).`
                    : 'Bu kişinin bu projedeki planını düzenleme yetkiniz yok.';
            }
        } else if (!canEditActualCell(ws, id, action.projectId, action.personId)) {
            return 'Bu kişinin bu projedeki gerçekleşenini girme yetkiniz yok.';
        }
        return null;
    }

    if (!canEditProjectContent(ws, id, action.projectId)) return `"${project.name}" projesinde değişiklik yetkiniz yok (yalnızca proje sahibi Proje Yöneticisi).`;
    switch (action.type) {
        case 'risk_ekle':
            if (!action.title.trim()) return 'Risk başlığı boş olamaz.';
            if (![1, 2, 3, 4, 5].includes(action.probability) || ![1, 2, 3, 4, 5].includes(action.impact)) return 'Olasılık ve etki 1-5 arasında olmalı.';
            return null;
        case 'gorev_ekle': {
            if (!action.name.trim()) return 'Görev adı boş olamaz.';
            if (action.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(action.dueDate)) return 'Bitiş tarihi YYYY-AA-GG biçiminde olmalı.';
            // Proje yapılandırması: kayıt türü ve zorunlu alanlar (görev formuyla aynı kural)
            const scheme = effectiveScheme(ws, project);
            if (action.issueType && !allowedIssueTypes(scheme).includes(action.issueType)) return `Bu projede "${action.issueType}" kayıt türü kullanılamıyor (yapılandırma: ${scheme.name}).`;
            const missing = missingRequiredFields(scheme, { resourceName: action.resourceName, dueDate: action.dueDate, time: action.time, issueType: action.issueType, labels: action.labels });
            return missing.length ? `Projenin yapılandırmasında (${scheme.name}) zorunlu alan eksik: ${missing.join(', ')}.` : null;
        }
        case 'gorev_durumu': {
            const task = project.tasks.find(t => t.id === action.taskId);
            if (!task) return 'Görev bulunamadı (silinmiş olabilir).';
            // İş akışı geçiş kuralları (kullanıcının menüsü ve panosuyla aynı)
            const wf = effectiveScheme(ws, project).workflow;
            const r = resolveTransition(task, wf, { key: action.workflowKey, category: action.status });
            if ('error' in r) return r.error;
            // Geçiş kuralı: koşul (kim) ve doğrulayıcılar (not, süre, alanlar, alt görevler)
            const rule = ruleFor(wf, taskWorkflow(task, wf).key, r.target.key);
            const cond = conditionProblem(rule, task, actorOf(ws), ws.people, { roleMembers: project.roleMembers, roleDefs: projectRolesOf(ws) });
            if (cond) return cond;
            const problems = inputProblems(rule, task, { comment: action.comment, hours: action.hours });
            if (problems.length) return `${problems.join(' ')}${rule.requireComment || rule.requireHours ? ' (Öneride geçiş notu / harcanan süre verilebilir; ya da görev menüsünden yapın.)' : ''}`;
            return null;
        }
        case 'rag_guncelle':
            return null;
        case 'risk_guncelle': {
            const risk = (project.risks || []).find(r => r.id === action.riskId);
            if (!risk) return 'Risk bulunamadı (silinmiş olabilir).';
            if (action.probability !== undefined && ![1, 2, 3, 4, 5].includes(action.probability)) return 'Olasılık 1-5 arasında olmalı.';
            if (action.impact !== undefined && ![1, 2, 3, 4, 5].includes(action.impact)) return 'Etki 1-5 arasında olmalı.';
            const changes = riskChanges(risk, action);
            if (!changes.length) return 'Riskte değişen bir şey yok.';
            return null;
        }
        case 'istek_karari': {
            const req = (project.customerRequests || []).find(r => r.id === action.requestId);
            if (!req) return 'Müşteri isteği bulunamadı (silinmiş olabilir).';
            if (req.status !== 'New') return `İstek zaten karara bağlanmış (${REQUEST_STATUS_LABELS[req.status]}).`;
            if (!action.reason.trim()) return 'Kararın gerekçesi boş olamaz.';
            if (action.task?.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(action.task.dueDate)) return 'Bitiş tarihi YYYY-AA-GG biçiminde olmalı.';
            if (action.day && !/^\d{4}-\d{2}-\d{2}$/.test(action.day)) return 'Tarih YYYY-AA-GG biçiminde olmalı.';
            return null;
        }
        case 'gorev_guncelle': {
            if (!action.changes.length) return 'Güncellenecek görev yok.';
            if (action.changes.length > MAX_TASK_CHANGES) return `Tek öneride en çok ${MAX_TASK_CHANGES} görev olabilir.`;
            if (new Set(action.changes.map(c => c.taskId)).size !== action.changes.length) return 'Aynı görev birden fazla satırda; tek satırda birleştirin.';
            const known = new Set([...ws.people.map(p => `${p.firstName} ${p.lastName}`.trim().toLocaleLowerCase('tr-TR')), ...project.resources.map(r => r.name.trim().toLocaleLowerCase('tr-TR'))]);
            for (const c of action.changes) {
                const t = project.tasks.find(x => x.id === c.taskId);
                if (!t) return 'Görev bulunamadı (silinmiş olabilir).';
                if (c.dueDate && !DAY_RE.test(c.dueDate)) return `${t.name}: termin YYYY-AA-GG biçiminde olmalı.`;
                if (c.priority && !PRIORITIES.includes(c.priority)) return `${t.name}: öncelik Blocker, High, Medium ya da Low olmalı.`;
                if (c.resourceName && !known.has(c.resourceName.trim().toLocaleLowerCase('tr-TR'))) return `${t.name}: "${c.resourceName}" veri havuzunda ya da proje ekibinde yok.`;
                if (c.time && [c.time.best, c.time.avg, c.time.worst].some(v => !(v >= 0 && v <= 1000))) return `${t.name}: süre 0-1000 gün arasında olmalı.`;
                if (c.progressPct !== undefined && c.progressPct !== null && !(Number.isInteger(c.progressPct) && c.progressPct >= 0 && c.progressPct <= 100)) return `${t.name}: ilerleme 0-100 arasında tam sayı olmalı.`;
                if (c.estimateText !== undefined && c.estimateText.length > 60) return `${t.name}: ekip tahmini en çok 60 karakter.`;
                if (c.version !== undefined && !(Number.isInteger(c.version) && c.version >= 0 && c.version <= 200)) return `${t.name}: sprint 0-200 arasında tam sayı olmalı (0 = Havuz).`;
                if (c.sprintSpan !== undefined && !(Number.isInteger(c.sprintSpan) && c.sprintSpan >= 1 && c.sprintSpan <= MAX_SPRINT_SPAN)) return `${t.name}: sprint sayısı 1-${MAX_SPRINT_SPAN} olmalı.`;
            }
            if (!action.changes.some(c => taskChangeParts(project.tasks.find(x => x.id === c.taskId)!, c).length)) return 'Görevlerde değişen bir şey yok.';
            return null;
        }
        case 'plan_kurallari': {
            const r = action.rules;
            if (!Object.keys(r).length) return 'Değişecek kural verilmedi.';
            if (r.targetDate !== undefined && !DAY_RE.test(r.targetDate)) return 'Hedef tarih YYYY-AA-GG biçiminde olmalı.';
            if (r.testUnit && !project.resources.some(x => (x.unit || 'Genel') === r.testUnit)) return `"${r.testUnit}" biriminde proje ekibinden kimse yok.`;
            if (r.testRatio !== undefined && !(r.testRatio >= 0 && r.testRatio <= 1)) return 'Test oranı %0-100 olmalı.';
            if (r.focus !== undefined && !(r.focus >= 0.3 && r.focus <= 1)) return 'Odak %30-100 olmalı (fazlası için en yüksek yük kullanılır).';
            if (r.maxLoad !== undefined && !(r.maxLoad >= 50 && r.maxLoad <= 200)) return 'En yüksek yük %50-200 olmalı.';
            for (const [unit, name] of Object.entries(r.fixers || {})) {
                if (name && !project.resources.some(x => sameName(x.name, name) && (x.unit || 'Genel') === unit)) return `Bulgu sorumlusu "${name}" ${unit} biriminde proje ekibinde yok.`;
            }
            for (const [name, v] of Object.entries(r.personMaxLoad || {})) {
                if (!project.resources.some(x => sameName(x.name, name))) return `"${name}" proje ekibinde yok.`;
                if (!(v >= 50 && v <= 200)) return `${name}: en yüksek yük %50-200 olmalı.`;
            }
            return null;
        }
        case 'plan_uygula': {
            const plan = (project.releasePlans || []).find(p => p.id === action.planId);
            if (!plan) return 'Sürüm planı bulunamadı (silinmiş olabilir).';
            if (!action.changes.length && !action.descope && !action.retarget) return 'Uygulanacak değişiklik yok.';
            const ids = new Map(project.tasks.map(t => [t.id, t]));
            const people = new Set(project.resources.map(r => r.name));
            for (const c of action.changes) {
                const t = ids.get(c.taskId);
                if (!t) return 'Görevlerden biri bulunamadı (silinmiş olabilir).';
                if ((t.version || 0) !== c.from) return `${t.jiraId || t.name}: sprinti öneriden sonra değişmiş; planı yeniden hesaplayın.`;
                if (!Number.isSafeInteger(c.to) || c.to < 0) return 'Geçersiz sprint.';
                if (c.toSpan !== undefined && !(Number.isSafeInteger(c.toSpan) && c.toSpan >= 1 && c.toSpan <= MAX_SPRINT_SPAN)) return `Sprint sayısı 1-${MAX_SPRINT_SPAN} olmalı.`;
                if (c.toResource && !people.has(c.toResource)) return `"${c.toResource}" proje ekibinde yok.`;
            }
            if (action.retarget && !DAY_RE.test(action.retarget.date)) return 'Hedef tarih YYYY-AA-GG olmalı.';
            return null;
        }
        case 'gorev_sil': {
            if (!action.taskIds.length) return 'Silinecek görev yok.';
            if (action.taskIds.length > MAX_BULK_DELETE) return `Tek öneride en çok ${MAX_BULK_DELETE} görev silinebilir.`;
            const ids = new Set(project.tasks.map(t => t.id));
            if (action.taskIds.some(id => !ids.has(id))) return 'Görevlerden biri bulunamadı (silinmiş olabilir).';
            return null;
        }
        case 'not_ekle':
            if (!action.content.trim()) return 'Not boş olamaz.';
            if (action.day && !/^\d{4}-\d{2}-\d{2}$/.test(action.day)) return 'Tarih YYYY-AA-GG biçiminde olmalı.';
            return null;
    }
};

/** Risk güncellemesinin değiştirdiği alanlar (öneri kartı ve denetim için) */
const riskChanges = (risk: { status: RiskStatus; probability: RiskLevel; impact: RiskLevel; mitigation?: string; ownerPersonId?: string }, a: Extract<AiAction, { type: 'risk_guncelle' }>): string[] => [
    ...(a.status && a.status !== risk.status ? ['status'] : []),
    ...(a.probability !== undefined && a.probability !== risk.probability ? ['probability'] : []),
    ...(a.impact !== undefined && a.impact !== risk.impact ? ['impact'] : []),
    ...(a.mitigation !== undefined && a.mitigation.trim() !== (risk.mitigation || '') ? ['mitigation'] : []),
    ...(a.ownerPersonId && a.ownerPersonId !== risk.ownerPersonId ? ['owner'] : []),
];

const decisionNote = (title: string, a: Extract<AiAction, { type: 'istek_karari' }>, customer: string): string =>
    [`#müşteri-isteği #karar Müşteri isteği ${a.decision === 'kabul' ? 'kabul edildi' : 'reddedildi'}: ${title} (${customer})`, `Gerekçe: ${a.reason.trim()}`].join('\n');

/** Öneri kartında gösterilecek başlık ve ayrıntılar */
export const describeAction = (ws: WorkspaceData, action: AiAction): { title: string; details: { label: string; value: string }[] } => {
    if (isPoolAction(action)) return describePoolAction(ws, action);
    const project = projectOf(ws, action.projectId);
    const pName = project?.name || '?';
    switch (action.type) {
        case 'risk_ekle':
            return {
                title: `Risk ekle: ${action.title}`,
                details: [
                    { label: 'Proje', value: pName },
                    { label: 'Olasılık × Etki', value: `${action.probability} × ${action.impact} = ${action.probability * action.impact}` },
                    ...(action.ownerPersonId ? [{ label: 'Sahibi', value: fullName(ws, action.ownerPersonId) || '?' }] : []),
                    ...(action.mitigation ? [{ label: 'Aksiyon', value: action.mitigation }] : []),
                    ...(action.description ? [{ label: 'Açıklama', value: action.description }] : []),
                ],
            };
        case 'gorev_ekle':
            return {
                title: `Görev ekle: ${action.name}`,
                details: [
                    { label: 'Proje', value: pName },
                    { label: 'Öncelik', value: action.priority },
                    ...(action.resourceName ? [{ label: 'Atanan', value: action.resourceName }] : []),
                    ...(action.dueDate ? [{ label: 'Bitiş', value: action.dueDate }] : []),
                    ...(action.time ? [{ label: 'Süre (gün)', value: `${action.time.best} / ${action.time.avg} / ${action.time.worst}` }] : []),
                    ...(action.notes ? [{ label: 'Açıklama', value: action.notes }] : []),
                ],
            };
        case 'gorev_durumu': {
            const task = project?.tasks.find(t => t.id === action.taskId);
            const wf = effectiveScheme(ws, project).workflow;
            const r = task ? resolveTransition(task, wf, { key: action.workflowKey, category: action.status }) : null;
            const to = r && 'target' in r ? r.target.label : TASK_STATUS_TR[action.status];
            return {
                title: `Görev durumu: ${task?.name || '?'}`,
                details: [
                    { label: 'Proje', value: pName },
                    { label: 'Durum', value: `${task ? taskStatusLabel(task, wf) : '?'} → ${to}` },
                    ...(action.comment ? [{ label: 'Geçiş notu', value: action.comment }] : []),
                    ...(action.hours ? [{ label: 'Harcanan süre', value: `${action.hours} saat` }] : []),
                ],
            };
        }
        case 'rag_guncelle':
            return {
                title: `RAG durumu: ${pName}`,
                details: [
                    { label: 'RAG', value: `${project?.rag ? RAG_TR[project.rag] : 'Belirsiz'} → ${RAG_TR[action.rag]}` },
                    ...(action.ragNote ? [{ label: 'Durum notu', value: action.ragNote }] : []),
                ],
            };
        case 'risk_guncelle': {
            const risk = project?.risks?.find(r => r.id === action.riskId);
            const p = action.probability ?? risk?.probability;
            const i = action.impact ?? risk?.impact;
            return {
                title: `${action.status === 'closed' ? 'Risk kapat' : 'Risk güncelle'}: ${risk?.title || '?'}`,
                details: [
                    { label: 'Proje', value: pName },
                    ...(action.status && risk && action.status !== risk.status ? [{ label: 'Durum', value: `${RISK_STATUS_LABELS[risk.status]} → ${RISK_STATUS_LABELS[action.status]}` }] : []),
                    ...(risk && (p !== risk.probability || i !== risk.impact) ? [{ label: 'Olasılık × Etki', value: `${risk.probability} × ${risk.impact} → ${p} × ${i} = ${(p || 0) * (i || 0)}` }] : []),
                    ...(action.mitigation !== undefined ? [{ label: 'Aksiyon', value: action.mitigation }] : []),
                    ...(action.ownerPersonId ? [{ label: 'Sahibi', value: fullName(ws, action.ownerPersonId) || '?' }] : []),
                    ...(action.reason ? [{ label: 'Gerekçe', value: action.reason }] : []),
                ],
            };
        }
        case 'istek_karari': {
            const req = project?.customerRequests?.find(r => r.id === action.requestId);
            return {
                title: `Müşteri isteği ${action.decision === 'kabul' ? 'kabul' : 'ret'}: ${req?.title || '?'}`,
                details: [
                    { label: 'Proje', value: pName },
                    ...(req ? [{ label: 'Müşteri', value: req.customerName }] : []),
                    { label: 'Karar', value: action.decision === 'kabul' ? 'Kabul — görev açılır' : 'Ret' },
                    { label: 'Gerekçe', value: action.reason },
                    ...(action.decision === 'kabul' && action.task?.resourceName ? [{ label: 'Atanan', value: action.task.resourceName }] : []),
                    ...(action.decision === 'kabul' && action.task?.dueDate ? [{ label: 'Bitiş', value: action.task.dueDate }] : []),
                    ...(action.decision === 'kabul' && action.task?.time ? [{ label: 'Süre (gün)', value: `${action.task.time.best} / ${action.task.time.avg} / ${action.task.time.worst}` }] : []),
                ],
            };
        }
        case 'gorev_guncelle': {
            const rows = action.changes.map(c => ({ c, t: project?.tasks.find(x => x.id === c.taskId) })).filter(r => r.t && taskChangeParts(r.t, r.c).length);
            return {
                title: `Görev güncelle: ${rows.length} görev · ${pName}`,
                details: [
                    ...rows.slice(0, 30).map(({ c, t }) => ({ label: t!.jiraId ? `${t!.jiraId} ${t!.name}` : t!.name, value: taskChangeParts(t!, c).join(' · ') })),
                    ...(rows.length > 30 ? [{ label: '…', value: `ve ${rows.length - 30} görev daha` }] : []),
                ],
            };
        }
        case 'plan_kurallari': {
            const r = action.rules;
            const pct = (v: number) => `%${Math.round(v * 100)}`;
            return {
                title: `Plan kuralları · ${pName}`,
                details: [
                    ...(r.targetDate !== undefined ? [{ label: 'Hedef tarih', value: fmtDay(r.targetDate) }] : []),
                    ...(r.testUnit !== undefined ? [{ label: 'Test ekibi', value: r.testUnit || 'test adımı yok' }] : []),
                    ...(r.testRatio !== undefined ? [{ label: 'Test ve bulgu eforu', value: pct(r.testRatio) }] : []),
                    ...(r.focus !== undefined ? [{ label: 'Odak', value: pct(r.focus) }] : []),
                    ...(r.maxLoad !== undefined ? [{ label: 'Kişi başı en yüksek yük', value: `%${r.maxLoad}` }] : []),
                    ...Object.entries(r.fixers || {}).map(([u, n]) => ({ label: `${u} bulgu sorumlusu`, value: n || 'otomatik' })),
                    ...Object.entries(r.personMaxLoad || {}).map(([n, v]) => ({ label: `${n} en yüksek yük`, value: `%${v}` })),
                    ...(r.scopeMilestone !== undefined ? [{ label: 'Kapsam', value: `Milestone ${r.scopeMilestone} ve öncesi` }] : []),
                ],
            };
        }
        case 'plan_uygula': {
            const byId = new Map((project?.tasks || []).map(t => [t.id, t]));
            const names = project?.settings.sprintNames;
            const ms = (id: string) => (project?.releasePlans || []).find(p => p.id === action.planId)?.milestones.find(m => m.id === id)?.name || '?';
            return {
                title: `Plan: ${action.label} · ${pName}`,
                details: [
                    ...action.changes.slice(0, 30).map(c => {
                        const t = byId.get(c.taskId);
                        const parts = [`${sprintLabel(c.from, names)} → ${sprintLabel(c.to, names)}`, c.toSpan !== undefined ? `${c.toSpan} sprint` : '', c.toResource !== undefined ? `${c.fromResource || 'atanmamış'} → ${c.toResource || 'atanmamış'}` : '', c.reason || ''].filter(Boolean);
                        return { label: t ? (t.jiraId ? `${t.jiraId} ${t.name}` : t.name) : '?', value: parts.join(' · ') };
                    }),
                    ...(action.changes.length > 30 ? [{ label: '…', value: `ve ${action.changes.length - 30} görev daha` }] : []),
                    ...(action.descope ? [{ label: 'Kapsam daraltma', value: `${ms(action.descope.milestoneId)} taşından çıkar: ${action.descope.taskIds.map(id => byId.get(id)?.jiraId || byId.get(id)?.name).join(', ')}` }] : []),
                    ...(action.retarget ? [{ label: 'Yeni hedef', value: `${ms(action.retarget.milestoneId)} → ${action.retarget.date}` }] : []),
                ],
            };
        }
        case 'gorev_sil': {
            const want = new Set(action.taskIds);
            const tasks = (project?.tasks || []).filter(t => want.has(t.id));
            const unlinked = (project?.tasks || []).filter(t => !want.has(t.id) && t.predecessor && want.has(t.predecessor)).length;
            return {
                title: `Görev sil: ${tasks.length} görev · ${pName}`,
                details: [
                    ...tasks.slice(0, 30).map(t => ({ label: t.jiraId || 'Görev', value: t.name })),
                    ...(tasks.length > 30 ? [{ label: '…', value: `ve ${tasks.length - 30} görev daha` }] : []),
                    ...(unlinked ? [{ label: 'Öncül bağı', value: `${unlinked} görevin öncül bağı kaldırılacak` }] : []),
                    ...(action.reason ? [{ label: 'Gerekçe', value: action.reason }] : []),
                    { label: 'Not', value: 'Jira kayıtları silinmez; yalnız uygulamadaki kopya kaldırılır. Uygulandıktan sonra geri alınabilir.' },
                ],
            };
        }
        case 'not_ekle':
            return {
                title: `Not ekle: ${pName}`,
                details: [
                    ...(action.day ? [{ label: 'Tarih', value: action.day }] : []),
                    { label: 'Not', value: action.content.length > 400 ? `${action.content.slice(0, 400)}…` : action.content },
                ],
            };
        case 'tahsis_ayarla': {
            const row = findAllocationRow(ws, action.personId, action.projectId, action.year);
            const cur = row?.[action.field][action.month] || 0;
            return {
                title: `${action.field === 'plan' ? 'Plan' : 'Gerçekleşen'} tahsis: ${fullName(ws, action.personId) || '?'}`,
                details: [
                    { label: 'Proje', value: pName },
                    { label: 'Ay', value: `${MONTHS[action.month - 1]} ${action.year}` },
                    { label: 'Adam-ay', value: `${cur.toLocaleString('tr-TR')} → ${action.value.toLocaleString('tr-TR')}` },
                    ...(!row ? [{ label: 'Not', value: 'Bu kişi için projede yeni tahsis satırı açılacak' }] : []),
                ],
            };
        }
        case 'tahsis_araligi': {
            const months = monthsBetween(action.from, action.to) || [];
            const person = ws.people.find(p => p.id === action.personId);
            const changes = months.map(({ year, month }) => {
                const cur = findAllocationRow(ws, action.personId, action.projectId, year)?.[action.field][month] || 0;
                const total = personMonthTotal(ws.allocations, action.personId, year, month, action.field) - cur + action.value;
                return { year, month, cur, total };
            });
            const over = person && action.field === 'plan' ? changes.filter(c => c.total > (person.availableAA ?? 1) + 0.001) : [];
            const first = months[0], last = months[months.length - 1];
            const curList = [...new Set(changes.map(c => fmtAA(c.cur)))];
            return {
                title: `${action.field === 'plan' ? 'Plan' : 'Gerçekleşen'} tahsis: ${fullName(ws, action.personId) || '?'} · ${first ? monthLabel(first.year, first.month) : '?'} – ${last ? monthLabel(last.year, last.month) : '?'}`,
                details: [
                    { label: 'Proje', value: pName },
                    { label: 'Aylar', value: `${months.length} ay` },
                    { label: 'Her ay', value: `%${Math.round(action.value * 100)} (${fmtAA(action.value)} AA)` },
                    { label: 'Şu an', value: curList.length === 1 ? `${curList[0]} AA` : changes.map(c => `${MONTHS[c.month - 1].slice(0, 3)} ${fmtAA(c.cur)}`).join(' · ') },
                    ...(over.length ? [{ label: 'Kapasite aşımı', value: over.map(c => `${monthLabel(c.year, c.month)}: toplam ${fmtAA(c.total)} / ${fmtAA(person!.availableAA ?? 1)} AA`).join(' · ') }] : []),
                ],
            };
        }
        case 'jira_esitle': {
            const keys = project ? linkedSyncKeys(project.tasks, project.jiraSync).length : 0;
            const policy = fieldPolicy(project?.jiraSync);
            const by = (d: string[]) => JIRA_SYNC_FIELDS.filter(f => d.includes(policy[f.id])).map(f => f.label).join(', ');
            const pull = by(['pull', 'both']);
            const push = by(['push', 'both']);
            return {
                title: `Jira eşitle: ${pName}`,
                details: [
                    { label: 'Kayıt', value: `${keys} Jira anahtarlı kayıt${project?.jiraSync?.discover && sourceOf(project.jiraSync) ? ` + kaynaktaki yeni açık kayıtlar (${sourceLabel(project.jiraSync)})` : ''}` },
                    { label: 'Jira\'dan alınacak', value: hasFieldPolicy(project?.jiraSync) ? (pull || '—') : 'tüm alanlar (alan seçimi yapılmamış)' },
                    ...(push ? [{ label: 'Jira\'ya YAZILACAK', value: `${push} — Jira'ya yazılan değer uygulamadaki "Geri al" ile geri alınmaz` }] : []),
                    ...(project?.jiraSync?.autoPeople ? [{ label: 'Kişiler', value: 'Jira\'daki atananlar havuza ve ekibe eklenir' }] : []),
                ],
            };
        }
    }
};

const newTaskId = (): string => `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const touch = (ws: WorkspaceData, projectId: string, fn: (p: Project) => Project): WorkspaceData => ({
    ...ws,
    projects: ws.projects.map(p => {
        if (p.id !== projectId) return p;
        const next = fn(p);
        // Kayıt yaşam döngüsü (açılış, durum geçişi) uygulamadaki diğer değişikliklerle aynı biçimde damgalanır
        return { ...next, tasks: next.tasks !== p.tasks ? stampLifecycle(p.tasks, next.tasks) : next.tasks, updatedAt: new Date().toISOString() };
    }),
});

/**
 * Eylemi uygular (saf). Önce validateAction çağrılmalı; burada da yeniden
 * kontrol edilir ve sorun varsa hata fırlatılır.
 */
export const applyAction = (ws: WorkspaceData, action: AiAction): { ws: WorkspaceData; summary: string; effects?: TransitionEffect[] } => {
    if (isPoolAction(action)) return applyPoolAction(ws, action);
    const err = validateAction(ws, action);
    if (err) throw new Error(err);
    const project = projectOf(ws, action.projectId)!;
    let next: WorkspaceData;
    let summary: string;
    let effects: TransitionEffect[] = [];

    switch (action.type) {
        case 'risk_ekle': {
            const risk = createRisk({
                title: action.title.trim(),
                description: action.description?.trim() || undefined,
                probability: action.probability,
                impact: action.impact,
                mitigation: action.mitigation?.trim() || undefined,
                ownerPersonId: action.ownerPersonId,
                owner: fullName(ws, action.ownerPersonId),
            });
            next = touch(ws, project.id, p => ({ ...p, risks: [...(p.risks || []), risk] }));
            next = appendAudit(next, 'risk.add', `"${project.name}" · risk eklendi: ${risk.title} (skor ${riskScore(risk)})`, project.id);
            summary = `"${project.name}" projesine risk eklendi: ${risk.title}`;
            break;
        }
        case 'gorev_ekle': {
            const time = action.time || { best: 0, avg: 0, worst: 0 };
            const task: Task = {
                id: newTaskId(), name: action.name.trim(), availability: time.avg > 0, priority: action.priority, version: 1,
                predecessor: null, unit: '', resourceName: action.resourceName || '', time, jiraId: '', notes: action.notes?.trim() || '',
                ...initialStatus(effectiveScheme(ws, project).workflow), labels: action.labels || [], includeInSprints: true, ...(action.dueDate ? { dueDate: action.dueDate } : {}),
                ...(action.issueType ? { issueType: action.issueType } : {}),
                ...(time.avg > 0 ? { estimateSource: 'ai' as const } : {}),
            };
            next = touch(ws, project.id, p => {
                // Havuzdan atanan kişi proje kaynağı değilse eklenir (görev formuyla aynı davranış)
                let resources = p.resources;
                const assignee = task.resourceName.trim().toLocaleLowerCase('tr-TR');
                if (assignee && !resources.some(r => r.name.trim().toLocaleLowerCase('tr-TR') === assignee)) {
                    const person = ws.people.find(pp => `${pp.firstName} ${pp.lastName}`.trim().toLocaleLowerCase('tr-TR') === assignee);
                    if (person) {
                        const res: Resource = { id: `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: task.resourceName, participation: 100, unit: person.departmentCode || '', title: person.titleCode || 'Uzman' };
                        resources = [...resources, res];
                    }
                }
                return { ...p, tasks: [...p.tasks, task], resources };
            });
            summary = `"${project.name}" projesine görev eklendi: ${task.name}`;
            break;
        }
        case 'gorev_durumu': {
            const task = project.tasks.find(t => t.id === action.taskId)!;
            const wf = effectiveScheme(ws, project).workflow;
            const r = resolveTransition(task, wf, { key: action.workflowKey, category: action.status });
            if ('error' in r) throw new Error(r.error);
            const target = r.target;
            // Ayrıntılı durum: istenmişse, akış kısıtlıysa ya da görevde zaten varsa yazılır (menüyle aynı davranış)
            const setKey = !!action.workflowKey || !!wf.transitions || !!task.jiraStatus;
            const fromLabel = taskStatusLabel(task, wf);
            const rule = ruleFor(wf, taskWorkflow(task, wf).key, target.key);
            const done = applyTransition(task, target, rule, { comment: action.comment, hours: action.hours }, { actor: actorOf(ws), setKey, projectName: project.name, fromLabel, versions: project.versions });
            effects = done.effects;
            next = touch(ws, project.id, p => ({ ...p, tasks: p.tasks.map(t => (t.id === action.taskId ? done.task : t)) }));
            summary = `"${project.name}" · ${task.name}: ${fromLabel} → ${target.label}`;
            break;
        }
        case 'rag_guncelle': {
            const before = project.rag;
            next = touch(ws, project.id, p => ({ ...p, rag: action.rag, ragNote: action.ragNote ?? p.ragNote }));
            if (before !== action.rag) {
                next = appendAudit(next, 'project.rag', `"${project.name}" RAG: ${before ? RAG_TR[before] : 'Belirsiz'} → ${RAG_TR[action.rag]}`, project.id);
            }
            summary = `"${project.name}" RAG durumu: ${RAG_TR[action.rag]}`;
            break;
        }
        case 'tahsis_ayarla': {
            let base = ws;
            let row = findAllocationRow(ws, action.personId, action.projectId, action.year);
            if (!row) {
                // Rol boş kalırsa kapasite-talep sahte "Rol atanmamış" açığı gösterir (B-025)
                const role = inferAllocationRole(ws.allocations, ws.people.find(p => p.id === action.personId), action.projectId);
                const created = createAllocation(ws.allocations, action.personId, action.projectId, action.year, undefined, role);
                if (!created) throw new Error('Tahsis satırı oluşturulamadı.');
                base = { ...ws, allocations: [...ws.allocations, created] };
                row = created;
            }
            next = setAllocationCell(base, row.id, action.field, action.month, action.value || undefined);
            summary = `${fullName(ws, action.personId)} · ${project.name} · ${MONTHS[action.month - 1]} ${action.year} ${action.field === 'plan' ? 'plan' : 'gerçekleşen'}: ${action.value.toLocaleString('tr-TR')} AA`;
            break;
        }
        case 'tahsis_araligi': {
            let base = ws;
            const months = monthsBetween(action.from, action.to)!;
            for (const { year, month } of months) {
                let row = findAllocationRow(base, action.personId, action.projectId, year);
                if (!row) {
                    const created = createAllocation(base.allocations, action.personId, action.projectId, year);
                    if (!created) throw new Error('Tahsis satırı oluşturulamadı.');
                    base = { ...base, allocations: [...base.allocations, created] };
                    row = created;
                }
                base = setAllocationCell(base, row.id, action.field, month, action.value || undefined);
            }
            next = base;
            const f = months[0], l = months[months.length - 1];
            summary = `${fullName(ws, action.personId)} · ${project.name} · ${monthLabel(f.year, f.month)} – ${monthLabel(l.year, l.month)} ${action.field === 'plan' ? 'plan' : 'gerçekleşen'}: her ay %${Math.round(action.value * 100)} (${fmtAA(action.value)} AA)`;
            break;
        }
        case 'jira_esitle':
            // Ağ gerektirir: uygulama katmanı (App) eşitlemeyi çalıştırır
            throw new Error('Jira eşitlemesi uygulama içinde çalıştırılır.');
        case 'risk_guncelle': {
            const risk = project.risks!.find(r => r.id === action.riskId)!;
            const updated = {
                ...risk,
                ...(action.status ? { status: action.status } : {}),
                ...(action.probability !== undefined ? { probability: action.probability } : {}),
                ...(action.impact !== undefined ? { impact: action.impact } : {}),
                ...(action.mitigation !== undefined ? { mitigation: action.mitigation.trim() || undefined } : {}),
                ...(action.ownerPersonId ? { ownerPersonId: action.ownerPersonId, owner: fullName(ws, action.ownerPersonId) } : {}),
            };
            next = touch(ws, project.id, p => ({ ...p, risks: (p.risks || []).map(r => (r.id === risk.id ? updated : r)) }));
            const closed = risk.status !== 'closed' && updated.status === 'closed';
            if (closed) next = appendAudit(next, 'risk.close', `"${project.name}" · risk kapatıldı: ${risk.title}${action.reason ? ` — ${action.reason}` : ''}`, project.id);
            summary = closed
                ? `"${project.name}" · risk kapatıldı: ${risk.title}`
                : `"${project.name}" · risk güncellendi: ${risk.title} (${RISK_STATUS_LABELS[updated.status]}, skor ${riskScore(updated)})`;
            break;
        }
        case 'istek_karari': {
            const req = project.customerRequests.find(r => r.id === action.requestId)!;
            const note = createNote(decisionNote(req.title, action, req.customerName), action.day || '');
            if (action.decision === 'kabul') {
                const draft = taskDraftFromRequest(req, action.task?.resourceName || '');
                const time = action.task?.time;
                const task: Task = {
                    ...draft,
                    name: action.task?.name?.trim() || draft.name,
                    priority: action.task?.priority || draft.priority,
                    ...initialStatus(effectiveScheme(ws, project).workflow),
                    ...(action.task?.dueDate ? { dueDate: action.task.dueDate } : {}),
                    ...(time ? { time, availability: time.avg > 0 } : {}),
                };
                next = touch(ws, project.id, p => ({ ...p, tasks: [...p.tasks, task], customerRequests: markConverted(p.customerRequests, req.id, task.id), notes: [...p.notes, note] }));
                summary = `"${project.name}" · müşteri isteği kabul edildi, görev açıldı: ${task.name}`;
            } else {
                next = touch(ws, project.id, p => ({ ...p, customerRequests: p.customerRequests.map(r => (r.id === req.id ? { ...r, status: 'Rejected' as const } : r)), notes: [...p.notes, note] }));
                summary = `"${project.name}" · müşteri isteği reddedildi: ${req.title}`;
            }
            break;
        }
        case 'gorev_guncelle': {
            const byId = new Map(action.changes.map(c => [c.taskId, c]));
            let n = 0;
            const now = new Date().toISOString();
            next = touch(ws, project.id, p => {
                let resources = p.resources;
                const tasks = p.tasks.map(t => {
                    const c = byId.get(t.id);
                    if (!c || !taskChangeParts(t, c).length) return t;
                    n++;
                    const labels = [...new Set([...(t.labels || []).filter(l => !(c.removeLabels || []).includes(l)), ...(c.addLabels || [])])];
                    const assignee = c.resourceName !== undefined ? c.resourceName.trim() : t.resourceName;
                    // Havuzdan atanan kişi proje kaynağı değilse eklenir (görev formuyla aynı davranış)
                    if (assignee && !resources.some(r => sameName(r.name, assignee))) {
                        const person = ws.people.find(pp => sameName(`${pp.firstName} ${pp.lastName}`, assignee));
                        if (person) resources = [...resources, { id: `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: assignee, participation: 100, unit: person.departmentCode || '', title: person.titleCode || 'Uzman' }];
                    }
                    const { dueDate: _drop, ...rest } = t;
                    return {
                        ...(c.dueDate === '' ? rest : t),
                        ...(c.dueDate ? { dueDate: c.dueDate } : {}),
                        resourceName: assignee,
                        ...(c.priority ? { priority: c.priority } : {}),
                        ...(c.time ? { time: c.time, availability: c.time.avg > 0, estimateSource: c.estimateSource || ('ai' as const) } : {}),
                        labels,
                        ...(c.progressPct !== undefined ? { progressPct: c.progressPct === null ? undefined : c.progressPct } : {}),
                        ...(c.estimateText !== undefined ? { estimateText: c.estimateText || undefined } : {}),
                        ...(c.version !== undefined ? { version: c.version } : {}),
                        ...(c.sprintSpan !== undefined ? { sprintSpan: c.sprintSpan > 1 ? c.sprintSpan : undefined } : {}),
                        updatedAt: now,
                    };
                });
                return { ...p, tasks, resources };
            });
            summary = `"${project.name}" · ${n} görev güncellendi`;
            break;
        }
        case 'plan_kurallari': {
            next = touch(ws, project.id, p => {
                const cur = p.settings.planRules || {};
                const rules: PlanRules = {
                    ...cur, ...action.rules,
                    ...(action.rules.fixers ? { fixers: { ...(cur.fixers || {}), ...action.rules.fixers } } : {}),
                    ...(action.rules.personMaxLoad ? { personMaxLoad: { ...(cur.personMaxLoad || {}), ...action.rules.personMaxLoad } } : {}),
                };
                return { ...p, settings: { ...p.settings, planRules: rules } };
            });
            summary = `"${project.name}" · plan kuralları güncellendi`;
            break;
        }
        case 'plan_uygula': {
            const at = new Date();
            next = touch(ws, project.id, p => {
                let q = applyPlanChanges(p, action.changes, at);
                const plans = (q.releasePlans || []).map(rp => {
                    if (rp.id !== action.planId) return rp;
                    let np = action.descope ? withoutFromMilestone(rp, action.descope.milestoneId, action.descope.taskIds) : rp;
                    if (action.retarget) np = { ...np, milestones: np.milestones.map(m => (m.id === action.retarget!.milestoneId ? { ...m, targetDate: action.retarget!.date } : m)) };
                    return np === rp ? rp : { ...np, updatedAt: at.toISOString() };
                });
                q = { ...q, releasePlans: plans };
                return q;
            });
            next = appendAudit(next, 'task.bulkEdit', `${project.name} · plan: ${action.label} (${action.changes.length} görev)`, project.id);
            summary = `"${project.name}" planı uygulandı: ${action.label}`;
            break;
        }
        case 'gorev_sil': {
            const ids = new Set(action.taskIds);
            const names = project.tasks.filter(t => ids.has(t.id)).map(t => t.jiraId || t.name);
            next = touch(ws, project.id, p => ({ ...p, tasks: removeTasks(p.tasks, ids) }));
            next = appendAudit(next, 'task.delete', `${project.name} · ${names.length} görev: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ' …' : ''}`, project.id);
            summary = `"${project.name}" · ${names.length} görev silindi`;
            break;
        }
        case 'not_ekle': {
            const note = createNote(action.content.trim(), action.day || '');
            next = touch(ws, project.id, p => ({ ...p, notes: [...p.notes, note] }));
            summary = `"${project.name}" projesine not eklendi (${note.createdAt.slice(0, 10)})`;
            break;
        }
    }
    next = appendAudit(next, 'ai.apply', `AI önerisiyle: ${summary}`, project.id);
    return { ws: next, summary, ...(effects.length ? { effects } : {}) };
};
