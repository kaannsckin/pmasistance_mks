import { PlanLockStatus, ProjectStatus, RagStatus } from '../types';
import { MONTHS_TR } from './allocations';
import { EFFORT_TYPE_LABELS } from './roleAnalysis';
import { ExecReport } from './execReport';

/**
 * Yönetici Paketi — PowerPoint çıktısı (pptxgenjs, isteğe bağlı yüklenen chunk).
 * Excel paketiyle aynı ExecReport verisini kullanır; sunuma uygun özetler:
 * kapak, KPI panosu, aylık plan-gerçekleşen grafiği, portföy tablosu,
 * bölüm dağılımı, kapasite açıkları + aşırı tahsisler.
 */

const THEME_HEX: Record<string, string> = {
    classic: '2563EB',
    emerald: '059669',
    purple: '7C3AED',
    orange: 'EA580C',
};

const GRAY = '6B7280';
const DARK = '1F2937';
const RED = 'EF4444';
const AMBER = 'F59E0B';
const GREEN = '10B981';

const RAG_HEX: Record<RagStatus, string> = { green: GREEN, amber: AMBER, red: RED };
const RAG_TR: Record<RagStatus, string> = { green: 'Yolunda', amber: 'Riskli', red: 'Kritik' };
const STATUS_TR: Record<ProjectStatus, string> = {
    devam: 'Devam Eden', teklif: 'Teklif', beklemede: 'Beklemede', tamamlandi: 'Tamamlandı',
};
const LOCK_TR: Record<PlanLockStatus, string> = { draft: 'Taslak', submitted: 'Onayda', locked: 'Kilitli' };

const fmt = (v: number): string => (Math.round(v * 100) / 100).toString().replace('.', ',');

export const exportExecReportToPpt = async (report: ExecReport, theme: string): Promise<void> => {
    const PptxGenJS = (await import('pptxgenjs')).default;
    const accent = THEME_HEX[theme] || THEME_HEX.classic;
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inç
    pptx.author = 'PlanAsistan';
    pptx.title = `Yönetici Paketi ${report.year}`;

    const addTitle = (slide: ReturnType<typeof pptx.addSlide>, title: string) => {
        slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.18, fill: { color: accent } });
        slide.addText(title, { x: 0.5, y: 0.35, w: 12.3, h: 0.6, fontSize: 24, bold: true, color: DARK, fontFace: 'Calibri' });
    };

    // ---- 1) Kapak ----
    const cover = pptx.addSlide();
    cover.addShape('rect', { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: 'FFFFFF' } });
    cover.addShape('rect', { x: 0, y: 5.9, w: 13.33, h: 1.6, fill: { color: accent } });
    cover.addText('PlanAsistan', { x: 0.8, y: 2.0, w: 11.7, h: 0.6, fontSize: 20, color: GRAY, fontFace: 'Calibri' });
    cover.addText(`${report.year} Yönetici Paketi`, { x: 0.8, y: 2.5, w: 11.7, h: 1.1, fontSize: 44, bold: true, color: DARK, fontFace: 'Calibri' });
    cover.addText('Portföy Durumu · Plan-Gerçekleşme · Kaynak Sağlığı', { x: 0.8, y: 3.6, w: 11.7, h: 0.5, fontSize: 18, color: GRAY, fontFace: 'Calibri' });
    cover.addText(`Oluşturma: ${new Date(report.generatedAt).toLocaleString('tr-TR')}`, {
        x: 0.8, y: 6.35, w: 11.7, h: 0.5, fontSize: 14, color: 'FFFFFF', fontFace: 'Calibri',
    });

    // ---- 2) KPI panosu ----
    const k = report.kpi;
    const kpi = pptx.addSlide();
    addTitle(kpi, 'Portföy Göstergeleri');
    const cards: Array<[string, string, string, string?]> = [
        ['Toplam Proje', String(k.projectTotal), `${k.projectCounts.devam} devam · ${k.projectCounts.teklif} teklif`],
        ['RAG Durumu', `${k.ragCounts.green} / ${k.ragCounts.amber} / ${k.ragCounts.red}`, 'yolunda / riskli / kritik', k.ragCounts.red > 0 ? RED : GREEN],
        [`${report.year} Plan`, `${fmt(k.totalPlanAA)} AA`, `aylık kapasite ${fmt(k.monthlyCapacityAA)} AA`],
        ['Gerçekleşen', `${fmt(k.totalActualAA)} AA`, `sapma ${k.totalVarianceAA >= 0 ? '+' : ''}${fmt(k.totalVarianceAA)} AA`, k.totalVarianceAA > 0 ? RED : undefined],
        ['Aşırı Tahsis', String(k.overAllocationCount), 'kişi-ay', k.overAllocationCount > 0 ? RED : GREEN],
        ['Görev İlerlemesi', `%${k.taskProgressPct}`, `${k.taskDone}/${k.taskTotal} tamamlandı`],
    ];
    cards.forEach(([label, value, sub, tone], i) => {
        const x = 0.5 + (i % 3) * 4.3;
        const y = 1.4 + Math.floor(i / 3) * 2.7;
        kpi.addShape('roundRect', { x, w: 3.95, y, h: 2.3, fill: { color: 'F9FAFB' }, line: { color: 'E5E7EB', width: 1 }, rectRadius: 0.08 });
        kpi.addText(label, { x: x + 0.3, y: y + 0.25, w: 3.4, h: 0.4, fontSize: 14, color: GRAY, fontFace: 'Calibri' });
        kpi.addText(value, { x: x + 0.3, y: y + 0.7, w: 3.4, h: 0.9, fontSize: 34, bold: true, color: tone || accent, fontFace: 'Calibri' });
        kpi.addText(sub, { x: x + 0.3, y: y + 1.65, w: 3.4, h: 0.4, fontSize: 12, color: GRAY, fontFace: 'Calibri' });
    });

    // ---- 3) Aylık Plan vs Gerçekleşen grafiği ----
    const chart = pptx.addSlide();
    addTitle(chart, `Aylık Plan vs Gerçekleşen (${report.year}, AA)`);
    chart.addChart('bar', [
        { name: 'Plan', labels: MONTHS_TR, values: report.monthlyPlan },
        { name: 'Gerçekleşen', labels: MONTHS_TR, values: report.monthlyActual },
    ], {
        x: 0.5, y: 1.2, w: 12.3, h: 5.6,
        barDir: 'col', barGrouping: 'clustered',
        chartColors: [accent, GREEN],
        showLegend: true, legendPos: 'b', legendFontSize: 12,
        catAxisLabelFontSize: 11, valAxisLabelFontSize: 11,
        dataLabelFontSize: 9, showValue: false,
        valAxisTitle: 'AA', showValAxisTitle: false,
    });

    // ---- 4) Proje portföy tablosu ----
    const table = pptx.addSlide();
    addTitle(table, 'Proje Portföy Durumu');
    const headerRow = ['Proje', 'Durum', 'RAG', 'İlerleme', 'Plan AA', 'Gerç. AA', 'Sapma', 'Kilit'].map(t => ({
        text: t, options: { bold: true, color: 'FFFFFF', fill: { color: accent }, fontSize: 12 },
    }));
    const projectRows = report.projects.slice(0, 14).map(p => ([
        { text: p.name + (p.code ? ` (${p.code})` : ''), options: { fontSize: 11, color: DARK } },
        { text: STATUS_TR[p.status], options: { fontSize: 11, color: GRAY } },
        { text: p.rag ? RAG_TR[p.rag] : '—', options: { fontSize: 11, bold: true, color: p.rag ? RAG_HEX[p.rag] : GRAY } },
        { text: `%${p.progressPct}`, options: { fontSize: 11, color: DARK } },
        { text: fmt(p.planAA), options: { fontSize: 11, color: DARK } },
        { text: fmt(p.actualAA), options: { fontSize: 11, color: DARK } },
        { text: `${p.varianceAA > 0 ? '+' : ''}${fmt(p.varianceAA)}`, options: { fontSize: 11, bold: p.varianceAA !== 0, color: p.varianceAA > 0 ? RED : p.varianceAA < 0 ? AMBER : GRAY } },
        { text: LOCK_TR[p.lockStatus], options: { fontSize: 11, color: p.lockStatus === 'locked' ? GREEN : GRAY } },
    ]));
    table.addTable([headerRow, ...projectRows] as never, {
        x: 0.5, y: 1.2, w: 12.3,
        colW: [3.6, 1.5, 1.2, 1.2, 1.3, 1.3, 1.2, 1.0],
        border: { type: 'solid', color: 'E5E7EB', pt: 0.5 },
        rowH: 0.35, valign: 'middle',
    });
    if (report.projects.length > 14) {
        table.addText(`… ve ${report.projects.length - 14} proje daha (tam liste Excel paketinde)`, { x: 0.5, y: 6.9, w: 12.3, h: 0.4, fontSize: 11, italic: true, color: GRAY });
    }

    // ---- 5) Bölüm dağılımı ----
    if (report.departmentPlanRows.length > 0) {
        const dept = pptx.addSlide();
        addTitle(dept, `Bölüm Bazlı Yıllık Plan (${report.year}, AA)`);
        dept.addChart('bar', [{
            name: 'Plan AA',
            labels: report.departmentPlanRows.map(d => d.label),
            values: report.departmentPlanRows.map(d => Math.round(d.total * 100) / 100),
        }], {
            x: 0.5, y: 1.2, w: 12.3, h: 5.6,
            barDir: 'bar', chartColors: [accent],
            showLegend: false, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11,
            showValue: true, dataLabelFontSize: 11, dataLabelColor: DARK,
        });
    }

    // ---- 6) Kaynak sağlığı: kapasite açıkları + aşırı tahsisler ----
    const gaps = report.roleAnalysis.filter(r => r.totals.gap > 0).slice(0, 10);
    const risky = pptx.addSlide();
    addTitle(risky, 'Kaynak Sağlığı');
    risky.addText(`${EFFORT_TYPE_LABELS.gap} (rol bazında işe alım/görevlendirme ihtiyacı)`, { x: 0.5, y: 1.15, w: 6.0, h: 0.4, fontSize: 15, bold: true, color: DARK });
    if (gaps.length === 0) {
        risky.addText('✓ Tüm rollerde kapasite talebi karşılıyor.', { x: 0.5, y: 1.7, w: 6.0, h: 0.5, fontSize: 13, color: GREEN });
    } else {
        risky.addTable([
            ['Bölüm', 'Rol', 'Açık (AA/yıl)'].map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: accent }, fontSize: 11 } })),
            ...gaps.map(g => ([
                { text: g.departmentCode, options: { fontSize: 11, color: GRAY } },
                { text: g.role, options: { fontSize: 11, color: DARK } },
                { text: fmt(g.totals.gap), options: { fontSize: 11, bold: true, color: RED } },
            ])),
        ] as never, { x: 0.5, y: 1.7, w: 6.0, colW: [1.3, 3.4, 1.3], border: { type: 'solid', color: 'E5E7EB', pt: 0.5 }, rowH: 0.35 });
    }
    risky.addText('Aşırı Tahsisler (kişi-ay)', { x: 7.0, y: 1.15, w: 5.8, h: 0.4, fontSize: 15, bold: true, color: DARK });
    const overs = report.overAllocations.slice(0, 10);
    if (overs.length === 0) {
        risky.addText('✓ Aşırı tahsis yok.', { x: 7.0, y: 1.7, w: 5.8, h: 0.5, fontSize: 13, color: GREEN });
    } else {
        risky.addTable([
            ['Personel', 'Ay', 'Plan / Kapasite'].map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: accent }, fontSize: 11 } })),
            ...overs.map(o => ([
                { text: o.personName, options: { fontSize: 11, color: DARK } },
                { text: MONTHS_TR[o.month - 1], options: { fontSize: 11, color: GRAY } },
                { text: `${fmt(o.total)} / ${fmt(o.capacity)}`, options: { fontSize: 11, bold: true, color: RED } },
            ])),
        ] as never, { x: 7.0, y: 1.7, w: 5.8, colW: [2.8, 1.2, 1.8], border: { type: 'solid', color: 'E5E7EB', pt: 0.5 }, rowH: 0.35 });
    }

    await pptx.writeFile({ fileName: `yonetici-paketi-${report.year}-${new Date().toISOString().split('T')[0]}.pptx` });
};
