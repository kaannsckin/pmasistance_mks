import { PlanLockStatus, ProjectStatus, RagStatus, TaskStatus, UserRole, WorkspaceData } from '../types';
import {
    EffortField, findOverAllocations, getPlanLockStatus, MONTH_INDEXES, MONTHS_TR,
    MonthlySummaryRow, OverAllocation, summarizeByDepartment, summarizeByPerson,
} from './allocations';
import { buildRoleAnalysis, EFFORT_TYPE_LABELS, RoleAnalysisRow } from './roleAnalysis';
import { buildCostReport, CostReport } from './costing';
import { PortfolioRisk, RISK_BAND_LABELS, RISK_STATUS_LABELS, summarizeRisks, topPortfolioRisks } from './risks';

declare const XLSX: any;

/** Üst yönetim ekranını görebilen ama girdi yapmayan roller */
export const isExecRole = (role: UserRole | undefined): boolean =>
    role === 'mudur' || role === 'pyb_sorumlu';

export interface ExecProjectRow {
    projectId: string;
    name: string;
    code?: string;
    status: ProjectStatus;
    rag?: RagStatus;
    ragNote?: string;
    taskCount: number;
    taskDone: number;
    progressPct: number;
    planAA: number;
    actualAA: number;
    varianceAA: number; // gerçekleşen - plan
    lockStatus: PlanLockStatus;
}

export interface ExecReport {
    year: number;
    generatedAt: string;
    kpi: {
        projectTotal: number;
        projectCounts: Record<ProjectStatus, number>;
        ragCounts: { green: number; amber: number; red: number; none: number };
        totalPlanAA: number;
        totalActualAA: number;
        totalVarianceAA: number;
        overAllocationCount: number;
        taskTotal: number;
        taskDone: number;
        taskProgressPct: number;
        peopleCount: number;
        departmentCount: number;
        monthlyCapacityAA: number; // Σ kullanılabilir AA (aylık)
    };
    projects: ExecProjectRow[];
    monthlyPlan: number[]; // 12
    monthlyActual: number[]; // 12
    departmentPlanRows: MonthlySummaryRow[];
    personPlanRows: MonthlySummaryRow[];
    overAllocations: OverAllocation[];
    roleAnalysis: RoleAnalysisRow[];
    cost: CostReport;
    risks: PortfolioRisk[];
    riskCounts: { high: number; medium: number; low: number; closed: number };
}

const sumField = (ws: WorkspaceData, projectId: string, year: number, field: EffortField): number =>
    ws.allocations
        .filter(a => a.projectId === projectId && a.year === year)
        .reduce((sum, a) => sum + MONTH_INDEXES.reduce((s, m) => s + (a[field][m] || 0), 0), 0);

const round2 = (v: number) => Math.round(v * 100) / 100;

export const buildExecReport = (ws: WorkspaceData, year: number): ExecReport => {
    const yearAllocations = ws.allocations.filter(a => a.year === year);

    const monthlyPlan = MONTH_INDEXES.map(m =>
        round2(yearAllocations.reduce((sum, a) => sum + (a.plan[m] || 0), 0)));
    const monthlyActual = MONTH_INDEXES.map(m =>
        round2(yearAllocations.reduce((sum, a) => sum + (a.actual[m] || 0), 0)));

    const projectCounts: Record<ProjectStatus, number> = { devam: 0, teklif: 0, beklemede: 0, tamamlandi: 0 };
    const ragCounts = { green: 0, amber: 0, red: 0, none: 0 };
    let taskTotal = 0;
    let taskDone = 0;

    const projects: ExecProjectRow[] = ws.projects.map(p => {
        projectCounts[p.status] = (projectCounts[p.status] || 0) + 1;
        if (p.rag) ragCounts[p.rag]++; else ragCounts.none++;
        const done = p.tasks.filter(t => t.status === TaskStatus.Done).length;
        taskTotal += p.tasks.length;
        taskDone += done;
        const planAA = round2(sumField(ws, p.id, year, 'plan'));
        const actualAA = round2(sumField(ws, p.id, year, 'actual'));
        return {
            projectId: p.id,
            name: p.name,
            code: p.code,
            status: p.status,
            rag: p.rag,
            ragNote: p.ragNote,
            taskCount: p.tasks.length,
            taskDone: done,
            progressPct: p.tasks.length > 0 ? Math.round((done / p.tasks.length) * 100) : 0,
            planAA,
            actualAA,
            varianceAA: round2(actualAA - planAA),
            lockStatus: getPlanLockStatus(ws.planLocks, p.id, year),
        };
    }).sort((a, b) => b.planAA - a.planAA);

    const overAllocations = findOverAllocations(yearAllocations, ws.people, year, 'plan');
    const totalPlanAA = round2(monthlyPlan.reduce((a, b) => a + b, 0));
    const totalActualAA = round2(monthlyActual.reduce((a, b) => a + b, 0));

    return {
        year,
        generatedAt: new Date().toISOString(),
        kpi: {
            projectTotal: ws.projects.length,
            projectCounts,
            ragCounts,
            totalPlanAA,
            totalActualAA,
            totalVarianceAA: round2(totalActualAA - totalPlanAA),
            overAllocationCount: overAllocations.length,
            taskTotal,
            taskDone,
            taskProgressPct: taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0,
            peopleCount: ws.people.length,
            departmentCount: new Set(ws.people.map(p => p.departmentCode).filter(Boolean)).size,
            monthlyCapacityAA: round2(ws.people.reduce((sum, p) => sum + (p.availableAA || 0), 0)),
        },
        projects,
        monthlyPlan,
        monthlyActual,
        departmentPlanRows: summarizeByDepartment(yearAllocations, ws.people, year, 'plan'),
        personPlanRows: summarizeByPerson(yearAllocations, ws.people, year, 'plan'),
        overAllocations,
        roleAnalysis: buildRoleAnalysis(ws.allocations, ws.people, ws.projects, year),
        cost: buildCostReport(ws, year),
        risks: topPortfolioRisks(ws),
        riskCounts: (() => { const s = summarizeRisks(ws); return { high: s.high, medium: s.medium, low: s.low, closed: s.closed }; })(),
    };
};

// ---------------------------------------------------------------------------
// Yönetici paketi Excel çıktısı
// ---------------------------------------------------------------------------

const STATUS_TR: Record<ProjectStatus, string> = {
    devam: 'Devam Eden', teklif: 'Teklif Aşaması', beklemede: 'Beklemede', tamamlandi: 'Tamamlandı',
};
const RAG_TR: Record<RagStatus, string> = { green: 'Yolunda', amber: 'Riskli', red: 'Kritik' };
const LOCK_TR: Record<PlanLockStatus, string> = { draft: 'Taslak', submitted: 'Onay Bekliyor', locked: 'Kilitli' };

/** Rapor sayfalarını AOA (array-of-arrays) matrisleri olarak üretir — test edilebilir çekirdek. */
export const buildExecWorkbookData = (report: ExecReport): Record<string, (string | number)[][]> => {
    const k = report.kpi;
    const ozet: (string | number)[][] = [
        [`PlanAsistan Yönetici Paketi — ${report.year}`],
        ['Oluşturma', new Date(report.generatedAt).toLocaleString('tr-TR')],
        [],
        ['Gösterge', 'Değer'],
        ['Toplam Proje', k.projectTotal],
        ['Devam Eden', k.projectCounts.devam],
        ['Teklif Aşaması', k.projectCounts.teklif],
        ['Beklemede', k.projectCounts.beklemede],
        ['Tamamlandı', k.projectCounts.tamamlandi],
        ['RAG Yolunda / Riskli / Kritik', `${k.ragCounts.green} / ${k.ragCounts.amber} / ${k.ragCounts.red}`],
        [`${report.year} Plan (AA)`, k.totalPlanAA],
        [`${report.year} Gerçekleşen (AA)`, k.totalActualAA],
        ['Sapma (AA)', k.totalVarianceAA],
        ['Aylık Kapasite (AA)', k.monthlyCapacityAA],
        ['Aşırı Tahsis (kişi-ay)', k.overAllocationCount],
        ['Görev İlerlemesi', `${k.taskDone}/${k.taskTotal} (%${k.taskProgressPct})`],
        ['Personel / Bölüm', `${k.peopleCount} / ${k.departmentCount}`],
        ['Riskler Yüksek / Orta / Düşük', `${report.riskCounts.high} / ${report.riskCounts.medium} / ${report.riskCounts.low}`],
    ];

    const projeler: (string | number)[][] = [
        ['Proje', 'Kod', 'Durum', 'RAG', 'Durum Notu', 'Görev', 'Tamamlanan', 'İlerleme %', `Plan AA (${report.year})`, 'Gerçekleşen AA', 'Sapma AA', 'Plan Kilidi'],
        ...report.projects.map(p => [
            p.name, p.code || '', STATUS_TR[p.status], p.rag ? RAG_TR[p.rag] : '—', p.ragNote || '',
            p.taskCount, p.taskDone, p.progressPct, p.planAA, p.actualAA, p.varianceAA, LOCK_TR[p.lockStatus],
        ]),
    ];

    const aylik: (string | number)[][] = [
        ['Ay', 'Plan AA', 'Gerçekleşen AA', 'Sapma AA', 'Kapasite AA'],
        ...MONTHS_TR.map((m, i) => [
            m, report.monthlyPlan[i], report.monthlyActual[i],
            round2(report.monthlyActual[i] - report.monthlyPlan[i]), report.kpi.monthlyCapacityAA,
        ]),
        ['TOPLAM', report.kpi.totalPlanAA, report.kpi.totalActualAA, report.kpi.totalVarianceAA, ''],
    ];

    const bolum: (string | number)[][] = [
        ['Bölüm', ...MONTHS_TR, 'Toplam', 'Aylık Kapasite'],
        ...report.departmentPlanRows.map(r => [
            r.label, ...r.months.map(round2), round2(r.total), r.capacity !== undefined ? round2(r.capacity) : '',
        ]),
    ];

    const kisi: (string | number)[][] = [
        ['Personel', ...MONTHS_TR, 'Toplam', 'Aylık Kapasite'],
        ...report.personPlanRows.map(r => [
            r.label, ...r.months.map(round2), round2(r.total), r.capacity !== undefined ? round2(r.capacity) : '',
        ]),
    ];

    const asiri: (string | number)[][] = [
        ['Personel', 'Ay', 'Toplam Plan AA', 'Kapasite AA', 'Aşım'],
        ...report.overAllocations.map(o => [
            o.personName, MONTHS_TR[o.month - 1], round2(o.total), round2(o.capacity), round2(o.total - o.capacity),
        ]),
    ];

    // Excel'deki "Plan, Kaynak, İhtiyaç (Rol)" düzeni: rol başına 4 efor satırı
    const rol: (string | number)[][] = [
        ['Bölüm', 'Rol', 'Efor Türü', ...MONTHS_TR, 'Toplam'],
        ...report.roleAnalysis.flatMap(r => ([
            [r.departmentCode, r.role, EFFORT_TYPE_LABELS.planned, ...r.planned, r.totals.planned],
            [r.departmentCode, r.role, EFFORT_TYPE_LABELS.capacity, ...r.capacity, r.totals.capacity],
            [r.departmentCode, r.role, EFFORT_TYPE_LABELS.proposal, ...r.proposal, r.totals.proposal],
            [r.departmentCode, r.role, EFFORT_TYPE_LABELS.gap, ...r.gap, r.totals.gap],
        ] as (string | number)[][])),
    ];

    // Maliyet katmanı: proje + bölüm kırılımı, aylık toplamlar, eksik uyarıları
    const c = report.cost;
    const maliyet: (string | number)[][] = [
        ['MALİYET RAPORU (₺)', `${report.year}`, c.costedTitleCount === 0 ? 'Ünvan maliyetleri girilmemiş — Veri Havuzu → Ünvanlar' : ''],
        [],
        ['Proje', 'Plan Maliyeti', 'Gerçekleşen', 'Sapma'],
        ...c.byProject.map(r => [r.label, r.planCost, r.actualCost, r.varianceCost]),
        ['TOPLAM', c.totalPlanCost, c.totalActualCost, c.totalVarianceCost],
        [],
        ['Bölüm', 'Plan Maliyeti', 'Gerçekleşen', 'Sapma'],
        ...c.byDepartment.map(r => [r.label, r.planCost, r.actualCost, r.varianceCost]),
        [],
        ['Ay', 'Plan Maliyeti', 'Gerçekleşen'],
        ...MONTHS_TR.map((m, i) => [m, c.monthlyPlanCost[i], c.monthlyActualCost[i]]),
        [],
        ...(c.uncostedPeople.length
            ? [[`Maliyetlenemeyen personel (ünvan/₺ eksik): ${c.uncostedPeople.join(', ')}`]]
            : []),
    ];

    const riskler: (string | number)[][] = [
        ['Risk', 'Proje', 'Olasılık', 'Etki', 'Skor', 'Önem', 'Sahibi', 'Aksiyon', 'Durum'],
        ...report.risks.map(r => [
            r.title, r.projectName, r.probability, r.impact, r.score, RISK_BAND_LABELS[r.band],
            r.owner || '', r.mitigation || '', RISK_STATUS_LABELS[r.status],
        ]),
    ];

    return {
        'Özet': ozet,
        'Projeler': projeler,
        'Aylık Plan-Gerçekleşen': aylik,
        'Bölüm AA (Plan)': bolum,
        'Kişi AA (Plan)': kisi,
        'Aşırı Tahsis': asiri,
        'Kapasite-Talep (Rol)': rol,
        'Maliyet (TL)': maliyet,
        'Riskler': riskler,
    };
};

/** Tarayıcıda XLSX ile .xlsx indirir. */
export const exportExecReportToExcel = (report: ExecReport): void => {
    if (typeof XLSX === 'undefined') {
        alert('Excel kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
        return;
    }
    const wb = XLSX.utils.book_new();
    Object.entries(buildExecWorkbookData(report)).forEach(([name, aoa]) => {
        const sheet = XLSX.utils.aoa_to_sheet(aoa);
        sheet['!cols'] = aoa[aoa.length - 1]?.map((_, idx) => ({ wch: idx === 0 ? 28 : 12 })) || [];
        XLSX.utils.book_append_sheet(wb, sheet, name);
    });
    XLSX.writeFile(wb, `yonetici-paketi-${report.year}-${new Date().toISOString().split('T')[0]}.xlsx`);
};
